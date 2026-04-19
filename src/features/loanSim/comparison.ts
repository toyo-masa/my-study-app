import type {
    LoanAfterPayoffMode,
    LoanCompareCommonInputs,
    LoanCompareInputs,
    LoanComparisonResult,
    LoanComparePoint,
    LoanCompareScenarioInputs,
    LoanCompareScenarioSummary,
    LoanCompareSummary,
    LoanCompareValidationIssue,
    LoanInterestType,
    LoanInvestmentAccountType,
    LoanRepaymentType,
    LoanVariableRateMode,
} from './types';

const MAX_MONEY = 300_000_000;
const MAX_RATE = 20;
const MIN_REPAYMENT_YEARS = 1;
const MAX_REPAYMENT_YEARS = 50;
const BONUS_INTERVAL_MONTHS = 6;

type YearMonthParts = {
    year: number;
    month: number;
};

type SanitizedCompareCommonInputs = LoanCompareCommonInputs & {
    effectiveComparisonMonths: number;
    investmentMonthlyRate: number;
    housingMonthlyGrowthRate: number;
};

type SanitizedCompareScenarioInputs = LoanCompareScenarioInputs & {
    repaymentMonths: number;
    monthlyRate: number;
    loanAmount: number;
    initialInvestmentBalance: number;
};

type ScenarioMonthData = {
    key: string;
    monthOffset: number;
    shortLabel: string;
    monthLabel: string;
    annualRate: number;
    monthlyLoanOutflow: number;
    monthlyPayment: number;
    bonusPayment: number;
    afterPayoffContribution: number;
    loanBalance: number;
    cumulativeInterest: number;
};

type ScenarioBaseResult = {
    timeline: ScenarioMonthData[];
    payoffMonthCount: number;
    payoffMonthLabel: string;
    firstMonthlyPayment: number;
    lastActiveMonthlyPayment: number;
    totalInterest: number;
    isPaidOffWithinComparison: boolean;
};

type ScenarioInvestmentResult = {
    balances: number[];
    cumulativeGains: number[];
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function roundCurrency(value: number): number {
    return Math.round(value);
}

function normalizeMoney(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return roundCurrency(clamp(value, 0, MAX_MONEY));
}

function normalizeRate(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return clamp(value, 0, MAX_RATE);
}

function normalizeSignedRate(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return clamp(value, -MAX_RATE, MAX_RATE);
}

function normalizeYears(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_REPAYMENT_YEARS;
    }
    return clamp(Math.round(value), MIN_REPAYMENT_YEARS, MAX_REPAYMENT_YEARS);
}

function parseYearMonth(value: string): YearMonthParts | null {
    const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
    if (!match) {
        return null;
    }

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
    }

    return { year, month };
}

function formatMonthKey(parts: YearMonthParts): string {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

function formatMonthLabel(parts: YearMonthParts): string {
    return `${parts.year}年${parts.month}月`;
}

function formatShortMonthLabel(parts: YearMonthParts): string {
    return `${String(parts.year).slice(-2)}/${parts.month}`;
}

function getCurrentYearMonth(): string {
    const now = new Date();
    return formatMonthKey({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
    });
}

function addMonths(parts: YearMonthParts, offset: number): YearMonthParts {
    const total = parts.year * 12 + (parts.month - 1) + offset;
    return {
        year: Math.floor(total / 12),
        month: (total % 12) + 1,
    };
}

function isBonusMonth(monthIndex: number): boolean {
    return (monthIndex + 1) % BONUS_INTERVAL_MONTHS === 0;
}

function calculateEqualPayment(principal: number, monthlyRate: number, months: number): number {
    if (principal <= 0 || months <= 0) {
        return 0;
    }
    if (monthlyRate === 0) {
        return roundCurrency(principal / months);
    }

    const growth = Math.pow(1 + monthlyRate, months);
    return roundCurrency(principal * ((monthlyRate * growth) / (growth - 1)));
}

function sanitizeInterestType(value: LoanInterestType): LoanInterestType {
    return value === 'fixed' || value === 'variable' ? value : 'fixed';
}

function sanitizeAccountType(value: LoanInvestmentAccountType): LoanInvestmentAccountType {
    return value === 'taxable' ? 'taxable' : 'nisa';
}

function sanitizeAfterPayoffMode(value: LoanAfterPayoffMode): LoanAfterPayoffMode {
    return value === 'invest-equivalent-payment' ? value : 'none';
}

function sanitizeVariableRateMode(value: LoanVariableRateMode): LoanVariableRateMode {
    return value === 'step-up' ? 'step-up' : 'constant';
}

function sanitizeRepaymentType(value: LoanRepaymentType): LoanRepaymentType {
    return value === 'equal-principal' ? value : 'equal-payment';
}

function resolveScenarioAnnualRate(
    scenario: SanitizedCompareScenarioInputs,
    monthIndex: number,
): number {
    if (scenario.interestType !== 'variable' || scenario.variableRateMode === 'constant') {
        return scenario.annualRate;
    }

    const stepMonths = Math.max(scenario.variableRateStepYears * 12, 1);
    const stepCount = Math.floor(monthIndex / stepMonths);
    return clamp(
        scenario.annualRate + (scenario.variableRateStepAmount * stepCount),
        0,
        MAX_RATE,
    );
}

function buildVariableRateMessage(
    label: 'A' | 'B',
    scenario: SanitizedCompareScenarioInputs,
): string | null {
    if (scenario.interestType !== 'variable') {
        return null;
    }

    if (scenario.variableRateMode === 'constant') {
        return `シナリオ${label}の変動金利は、開始時の ${scenario.annualRate}% を全期間一定金利で近似し、その前提で返済額・利息・残高を計算しています。`;
    }

    return `シナリオ${label}の変動金利は、開始時 ${scenario.annualRate}% から ${scenario.variableRateStepYears} 年ごとに +${scenario.variableRateStepAmount}% で上昇する前提とし、見直し月ごとに返済額・利息・残高を再計算しています。`;
}

function sanitizeCommonInputs(
    common: LoanCompareCommonInputs,
    scenarioA: LoanCompareScenarioInputs,
    scenarioB: LoanCompareScenarioInputs,
): {
    sanitized: SanitizedCompareCommonInputs;
    validationIssues: LoanCompareValidationIssue[];
} {
    const validationIssues: LoanCompareValidationIssue[] = [];

    if (common.propertyPrice < 0) {
        validationIssues.push({ field: 'common.propertyPrice', message: '物件価格が 0 円未満だったため、0 円で計算しています。' });
    }
    if (common.purchaseFees < 0) {
        validationIssues.push({ field: 'common.purchaseFees', message: '諸費用が 0 円未満だったため、0 円で計算しています。' });
    }
    if (common.initialFinancialAssets < 0) {
        validationIssues.push({ field: 'common.initialFinancialAssets', message: '初期金融資産が 0 円未満だったため、0 円で計算しています。' });
    }
    if (common.annualInvestmentRate < -MAX_RATE || common.annualInvestmentRate > MAX_RATE) {
        validationIssues.push({ field: 'common.annualInvestmentRate', message: `想定運用利回りは -${MAX_RATE}〜${MAX_RATE}% の範囲で計算しています。` });
    }
    if (common.housingAnnualGrowthRate < -MAX_RATE || common.housingAnnualGrowthRate > MAX_RATE) {
        validationIssues.push({ field: 'common.housingAnnualGrowthRate', message: `住宅価値の変動率は -${MAX_RATE}〜${MAX_RATE}% の範囲で計算しています。` });
    }
    if (common.comparisonYears < MIN_REPAYMENT_YEARS || common.comparisonYears > MAX_REPAYMENT_YEARS) {
        validationIssues.push({
            field: 'common.comparisonYears',
            message: `比較期間は ${MIN_REPAYMENT_YEARS}〜${MAX_REPAYMENT_YEARS} 年の範囲で計算しています。`,
        });
    }

    const propertyPrice = normalizeMoney(common.propertyPrice);
    const purchaseFees = normalizeMoney(common.purchaseFees);
    const initialFinancialAssets = normalizeMoney(common.initialFinancialAssets);

    const comparisonYears = normalizeYears(common.comparisonYears);
    const longestRepaymentYears = Math.max(
        normalizeYears(scenarioA.repaymentYears),
        normalizeYears(scenarioB.repaymentYears),
    );
    const effectiveComparisonYears = Math.max(comparisonYears, longestRepaymentYears);
    if (comparisonYears < longestRepaymentYears) {
        validationIssues.push({
            field: 'common.comparisonYears',
            message: `比較期間が返済年数より短かったため、${effectiveComparisonYears} 年まで広げて比較します。`,
        });
    }

    const parsedStartYearMonth = parseYearMonth(common.startYearMonth);
    const startYearMonth = parsedStartYearMonth ? formatMonthKey(parsedStartYearMonth) : getCurrentYearMonth();
    if (!parsedStartYearMonth) {
        validationIssues.push({
            field: 'common.startYearMonth',
            message: '開始年月の形式が不正だったため、今月を開始年月として計算しています。',
        });
    }

    return {
        sanitized: {
            propertyPrice,
            purchaseFees,
            initialFinancialAssets,
            annualInvestmentRate: normalizeSignedRate(common.annualInvestmentRate),
            investmentAccountType: sanitizeAccountType(common.investmentAccountType),
            comparisonYears,
            housingAnnualGrowthRate: normalizeSignedRate(common.housingAnnualGrowthRate),
            startYearMonth,
            effectiveComparisonMonths: effectiveComparisonYears * 12,
            investmentMonthlyRate: normalizeSignedRate(common.annualInvestmentRate) / 100 / 12,
            housingMonthlyGrowthRate: normalizeSignedRate(common.housingAnnualGrowthRate) / 100 / 12,
        },
        validationIssues,
    };
}

function sanitizeScenarioInputs(
    label: 'A' | 'B',
    inputs: LoanCompareScenarioInputs,
    common: SanitizedCompareCommonInputs,
): {
    sanitized: SanitizedCompareScenarioInputs;
    validationIssues: LoanCompareValidationIssue[];
} {
    const validationIssues: LoanCompareValidationIssue[] = [];
    const totalAcquisitionCost = common.propertyPrice + common.purchaseFees;

    if (inputs.annualRate < 0 || inputs.annualRate > MAX_RATE) {
        validationIssues.push({ field: `scenario${label}.annualRate`, message: `シナリオ${label}の想定金利は 0〜${MAX_RATE}% の範囲で計算しています。` });
    }
    if (inputs.repaymentYears < MIN_REPAYMENT_YEARS || inputs.repaymentYears > MAX_REPAYMENT_YEARS) {
        validationIssues.push({
            field: `scenario${label}.repaymentYears`,
            message: `シナリオ${label}の返済年数は ${MIN_REPAYMENT_YEARS}〜${MAX_REPAYMENT_YEARS} 年の範囲で計算しています。`,
        });
    }
    if (inputs.monthlyInvestment < 0) {
        validationIssues.push({ field: `scenario${label}.monthlyInvestment`, message: `シナリオ${label}の毎月積立額が 0 円未満だったため、0 円で計算しています。` });
    }
    if (inputs.downPayment < 0) {
        validationIssues.push({ field: `scenario${label}.downPayment`, message: `シナリオ${label}の頭金が 0 円未満だったため、0 円で計算しています。` });
    }
    if (inputs.cashReserve < 0) {
        validationIssues.push({ field: `scenario${label}.cashReserve`, message: `シナリオ${label}の手元現金確保額が 0 円未満だったため、0 円で計算しています。` });
    }
    if (inputs.variableRateStepYears < MIN_REPAYMENT_YEARS || inputs.variableRateStepYears > MAX_REPAYMENT_YEARS) {
        validationIssues.push({
            field: `scenario${label}.variableRateStepYears`,
            message: `シナリオ${label}の変動金利見直し間隔は ${MIN_REPAYMENT_YEARS}〜${MAX_REPAYMENT_YEARS} 年の範囲で計算しています。`,
        });
    }
    if (inputs.variableRateStepAmount < 0 || inputs.variableRateStepAmount > MAX_RATE) {
        validationIssues.push({
            field: `scenario${label}.variableRateStepAmount`,
            message: `シナリオ${label}の変動金利上昇幅は 0〜${MAX_RATE}% の範囲で計算しています。`,
        });
    }
    if (inputs.bonusRepayment < 0) {
        validationIssues.push({ field: `scenario${label}.bonusRepayment`, message: `シナリオ${label}のボーナス返済額が 0 円未満だったため、0 円で計算しています。` });
    }
    if (inputs.monthlyPrepayment < 0) {
        validationIssues.push({ field: `scenario${label}.monthlyPrepayment`, message: `シナリオ${label}の繰上返済額が 0 円未満だったため、0 円で計算しています。` });
    }

    const repaymentYears = normalizeYears(inputs.repaymentYears);
    const annualRate = normalizeRate(inputs.annualRate);
    const rawDownPayment = normalizeMoney(inputs.downPayment);
    const downPayment = Math.min(rawDownPayment, totalAcquisitionCost);
    if (rawDownPayment > totalAcquisitionCost) {
        validationIssues.push({
            field: `scenario${label}.downPayment`,
            message: `シナリオ${label}の頭金が物件価格と諸費用の合計を上回ったため、借入額は 0 円になるよう補正しています。`,
        });
    }
    const cashReserve = normalizeMoney(inputs.cashReserve);
    const initialInvestmentBalance = Math.max(0, common.initialFinancialAssets - downPayment - cashReserve);
    if (common.initialFinancialAssets < downPayment + cashReserve) {
        validationIssues.push({
            field: `scenario${label}.cashReserve`,
            message: `シナリオ${label}では初期保有金融資産が頭金と手元現金確保額を下回るため、初期投資元本は 0 円として扱います。`,
        });
    }

    return {
        sanitized: {
            downPayment,
            cashReserve,
            repaymentType: sanitizeRepaymentType(inputs.repaymentType),
            repaymentYears,
            interestType: sanitizeInterestType(inputs.interestType),
            annualRate,
            variableRateMode: sanitizeVariableRateMode(inputs.variableRateMode),
            variableRateStepYears: normalizeYears(inputs.variableRateStepYears),
            variableRateStepAmount: normalizeRate(inputs.variableRateStepAmount),
            monthlyInvestment: normalizeMoney(inputs.monthlyInvestment),
            bonusRepayment: normalizeMoney(inputs.bonusRepayment),
            monthlyPrepayment: normalizeMoney(inputs.monthlyPrepayment),
            autoInvestPaymentDifference: Boolean(inputs.autoInvestPaymentDifference),
            afterPayoffMode: sanitizeAfterPayoffMode(inputs.afterPayoffMode),
            repaymentMonths: repaymentYears * 12,
            monthlyRate: annualRate / 100 / 12,
            loanAmount: Math.max(totalAcquisitionCost - downPayment, 0),
            initialInvestmentBalance,
        },
        validationIssues,
    };
}

function sanitizeCompareInputs(inputs: LoanCompareInputs): {
    common: SanitizedCompareCommonInputs;
    scenarioA: SanitizedCompareScenarioInputs;
    scenarioB: SanitizedCompareScenarioInputs;
    validationIssues: LoanCompareValidationIssue[];
} {
    const commonSanitized = sanitizeCommonInputs(inputs.common, inputs.scenarioA, inputs.scenarioB);
    const scenarioASanitized = sanitizeScenarioInputs('A', inputs.scenarioA, commonSanitized.sanitized);
    const scenarioBSanitized = sanitizeScenarioInputs('B', inputs.scenarioB, commonSanitized.sanitized);
    const validationIssues = [...commonSanitized.validationIssues, ...scenarioASanitized.validationIssues, ...scenarioBSanitized.validationIssues];

    if (scenarioASanitized.sanitized.autoInvestPaymentDifference && scenarioBSanitized.sanitized.autoInvestPaymentDifference) {
        scenarioBSanitized.sanitized.autoInvestPaymentDifference = false;
        validationIssues.push({
            field: 'scenarioB.autoInvestPaymentDifference',
            message: '差額自動積立は循環参照を避けるため片方だけ有効にできます。両方 ON の場合は B を OFF にして計算しています。',
        });
    }

    return {
        common: commonSanitized.sanitized,
        scenarioA: scenarioASanitized.sanitized,
        scenarioB: scenarioBSanitized.sanitized,
        validationIssues,
    };
}

function simulateScenarioBase(
    common: SanitizedCompareCommonInputs,
    scenario: SanitizedCompareScenarioInputs,
    loanAmount: number,
    startParts: YearMonthParts,
): ScenarioBaseResult {
    const timeline: ScenarioMonthData[] = [];
    const equalPrincipalBase = scenario.repaymentType === 'equal-principal'
        ? roundCurrency(loanAmount / scenario.repaymentMonths)
        : 0;

    let remainingBalance = loanAmount;
    let cumulativeInterest = 0;
    let payoffMonthCount = 0;
    let payoffMonthLabel = '比較期間内未完済';
    let payoffRecorded = remainingBalance <= 0;
    let lastActiveMonthlyPayment = 0;
    let currentEqualPayment = 0;
    let currentAnnualRate = scenario.annualRate;

    for (let monthIndex = 0; monthIndex < common.effectiveComparisonMonths; monthIndex += 1) {
        const monthParts = addMonths(startParts, monthIndex);
        const periodStartBalance = remainingBalance;
        const isFinalPlannedMonth = monthIndex === scenario.repaymentMonths - 1;
        const isWithinRepaymentPeriod = monthIndex < scenario.repaymentMonths;
        let interestPayment = 0;
        let principalPayment = 0;
        let monthlyPayment = 0;
        let bonusPayment = 0;
        let prepayment = 0;
        const annualRate = resolveScenarioAnnualRate(scenario, monthIndex);
        const monthlyRate = annualRate / 100 / 12;

        if (periodStartBalance > 0 && isWithinRepaymentPeriod) {
            interestPayment = roundCurrency(periodStartBalance * monthlyRate);

            if (scenario.repaymentType === 'equal-payment') {
                if (monthIndex === 0 || annualRate !== currentAnnualRate) {
                    currentEqualPayment = calculateEqualPayment(
                        periodStartBalance,
                        monthlyRate,
                        Math.max(scenario.repaymentMonths - monthIndex, 1),
                    );
                }
                monthlyPayment = currentEqualPayment;
                principalPayment = Math.max(0, monthlyPayment - interestPayment);
                if (principalPayment >= periodStartBalance || isFinalPlannedMonth) {
                    principalPayment = periodStartBalance;
                    monthlyPayment = principalPayment + interestPayment;
                }
            } else {
                principalPayment = Math.min(isFinalPlannedMonth ? periodStartBalance : equalPrincipalBase, periodStartBalance);
                monthlyPayment = principalPayment + interestPayment;
            }
            currentAnnualRate = annualRate;

            remainingBalance = Math.max(0, periodStartBalance - principalPayment);

            if (remainingBalance > 0 && scenario.monthlyPrepayment > 0) {
                prepayment = Math.min(scenario.monthlyPrepayment, remainingBalance);
                remainingBalance = Math.max(0, remainingBalance - prepayment);
            }

            if (remainingBalance > 0 && scenario.bonusRepayment > 0 && isBonusMonth(monthIndex)) {
                bonusPayment = Math.min(scenario.bonusRepayment, remainingBalance);
                remainingBalance = Math.max(0, remainingBalance - bonusPayment);
            }

            cumulativeInterest += interestPayment;
            lastActiveMonthlyPayment = monthlyPayment + prepayment;
        }

        if (!payoffRecorded && remainingBalance === 0) {
            payoffMonthCount = monthIndex + 1;
            payoffMonthLabel = formatMonthLabel(monthParts);
            payoffRecorded = true;
        }

        const afterPayoffContribution = payoffRecorded && payoffMonthCount > 0 && monthIndex + 1 > payoffMonthCount
            ? (scenario.afterPayoffMode === 'invest-equivalent-payment' ? lastActiveMonthlyPayment : 0)
            : 0;

        timeline.push({
            key: formatMonthKey(monthParts),
            monthOffset: monthIndex + 1,
            shortLabel: formatShortMonthLabel(monthParts),
            monthLabel: formatMonthLabel(monthParts),
            annualRate,
            monthlyLoanOutflow: monthlyPayment + prepayment,
            monthlyPayment,
            bonusPayment,
            afterPayoffContribution,
            loanBalance: remainingBalance,
            cumulativeInterest,
        });
    }

    return {
        timeline,
        payoffMonthCount,
        payoffMonthLabel,
        firstMonthlyPayment: timeline[0]?.monthlyLoanOutflow ?? 0,
        lastActiveMonthlyPayment,
        totalInterest: cumulativeInterest,
        isPaidOffWithinComparison: payoffMonthCount > 0,
    };
}

function simulateScenarioInvestments(
    common: SanitizedCompareCommonInputs,
    scenario: SanitizedCompareScenarioInputs,
    ownBase: ScenarioBaseResult,
    otherBase: ScenarioBaseResult,
    initialInvestmentBalance: number,
): ScenarioInvestmentResult {
    const balances = [initialInvestmentBalance];
    const cumulativeGains = [0];
    let balance = initialInvestmentBalance;
    let cumulativeGain = 0;

    for (let monthIndex = 0; monthIndex < common.effectiveComparisonMonths; monthIndex += 1) {
        const autoDifferenceContribution = scenario.autoInvestPaymentDifference
            ? Math.max(0, (otherBase.timeline[monthIndex]?.monthlyLoanOutflow ?? 0) - (ownBase.timeline[monthIndex]?.monthlyLoanOutflow ?? 0))
            : 0;
        const monthlyContribution =
            scenario.monthlyInvestment +
            (ownBase.timeline[monthIndex]?.afterPayoffContribution ?? 0) +
            autoDifferenceContribution;
        const monthlyGain = roundCurrency(balance * common.investmentMonthlyRate);
        cumulativeGain += monthlyGain;
        balance += monthlyGain + monthlyContribution;
        balances.push(balance);
        cumulativeGains.push(cumulativeGain);
    }

    return { balances, cumulativeGains };
}

function buildScenarioSummary(
    label: 'A' | 'B',
    scenario: SanitizedCompareScenarioInputs,
    chartPoints: LoanComparePoint[],
    base: ScenarioBaseResult,
    investmentBalances: number[],
): LoanCompareScenarioSummary {
    const finalPoint = chartPoints[chartPoints.length - 1];
    return {
        label,
        downPayment: scenario.downPayment,
        cashReserve: scenario.cashReserve,
        loanAmount: scenario.loanAmount,
        initialInvestmentBalance: scenario.initialInvestmentBalance,
        firstMonthlyPayment: base.firstMonthlyPayment,
        lastActiveMonthlyPayment: base.lastActiveMonthlyPayment,
        totalInterest: base.totalInterest,
        finalInvestmentBalance: investmentBalances[investmentBalances.length - 1] ?? 0,
        finalNetWorth: label === 'A' ? finalPoint?.netWorthA ?? 0 : finalPoint?.netWorthB ?? 0,
        payoffMonthLabel: base.isPaidOffWithinComparison ? base.payoffMonthLabel : '比較期間内未完済',
        payoffMonthCount: base.payoffMonthCount,
        isPaidOffWithinComparison: base.isPaidOffWithinComparison,
    };
}

function findCrossoverMonthLabel(points: LoanComparePoint[]): string | null {
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]?.netWorthDiff ?? 0;
        const current = points[index]?.netWorthDiff ?? 0;
        const crossed =
            (previous < 0 && current >= 0) ||
            (previous > 0 && current <= 0);
        if (crossed) {
            return points[index]?.monthLabel ?? null;
        }
    }
    return null;
}

export function calculateLoanComparison(inputs: LoanCompareInputs): LoanComparisonResult {
    const { common, scenarioA, scenarioB, validationIssues } = sanitizeCompareInputs(inputs);
    const startParts = parseYearMonth(common.startYearMonth) ?? parseYearMonth(getCurrentYearMonth())!;

    const baseA = simulateScenarioBase(common, scenarioA, scenarioA.loanAmount, startParts);
    const baseB = simulateScenarioBase(common, scenarioB, scenarioB.loanAmount, startParts);
    const investmentA = simulateScenarioInvestments(common, scenarioA, baseA, baseB, scenarioA.initialInvestmentBalance);
    const investmentB = simulateScenarioInvestments(common, scenarioB, baseB, baseA, scenarioB.initialInvestmentBalance);

    const chartPoints: LoanComparePoint[] = [
        {
            key: 'start',
            monthOffset: 0,
            shortLabel: '開始',
            monthLabel: formatMonthLabel(startParts),
            houseValue: common.propertyPrice,
            investmentBalanceA: scenarioA.initialInvestmentBalance,
            investmentBalanceB: scenarioB.initialInvestmentBalance,
            loanBalanceA: scenarioA.loanAmount,
            loanBalanceB: scenarioB.loanAmount,
            netWorthA: common.propertyPrice + scenarioA.initialInvestmentBalance - scenarioA.loanAmount,
            netWorthB: common.propertyPrice + scenarioB.initialInvestmentBalance - scenarioB.loanAmount,
            netWorthDiff: (common.propertyPrice + scenarioB.initialInvestmentBalance - scenarioB.loanAmount) - (common.propertyPrice + scenarioA.initialInvestmentBalance - scenarioA.loanAmount),
            cumulativeInvestmentGainA: 0,
            cumulativeInvestmentGainB: 0,
            cumulativeInterestA: 0,
            cumulativeInterestB: 0,
        },
    ];

    for (let monthIndex = 0; monthIndex < common.effectiveComparisonMonths; monthIndex += 1) {
        const monthParts = addMonths(startParts, monthIndex);
        const houseValue = roundCurrency(common.propertyPrice * Math.pow(1 + common.housingMonthlyGrowthRate, monthIndex + 1));
        const investmentBalanceA = investmentA.balances[monthIndex + 1] ?? scenarioA.initialInvestmentBalance;
        const investmentBalanceB = investmentB.balances[monthIndex + 1] ?? scenarioB.initialInvestmentBalance;
        const loanBalanceA = baseA.timeline[monthIndex]?.loanBalance ?? 0;
        const loanBalanceB = baseB.timeline[monthIndex]?.loanBalance ?? 0;
        const netWorthA = houseValue + investmentBalanceA - loanBalanceA;
        const netWorthB = houseValue + investmentBalanceB - loanBalanceB;

        chartPoints.push({
            key: baseA.timeline[monthIndex]?.key ?? formatMonthKey(monthParts),
            monthOffset: monthIndex + 1,
            shortLabel: formatShortMonthLabel(monthParts),
            monthLabel: formatMonthLabel(monthParts),
            houseValue,
            investmentBalanceA,
            investmentBalanceB,
            loanBalanceA,
            loanBalanceB,
            netWorthA,
            netWorthB,
            netWorthDiff: netWorthB - netWorthA,
            cumulativeInvestmentGainA: investmentA.cumulativeGains[monthIndex + 1] ?? 0,
            cumulativeInvestmentGainB: investmentB.cumulativeGains[monthIndex + 1] ?? 0,
            cumulativeInterestA: baseA.timeline[monthIndex]?.cumulativeInterest ?? 0,
            cumulativeInterestB: baseB.timeline[monthIndex]?.cumulativeInterest ?? 0,
        });
    }

    const summary: LoanCompareSummary = {
        finalNetWorthA: chartPoints[chartPoints.length - 1]?.netWorthA ?? 0,
        finalNetWorthB: chartPoints[chartPoints.length - 1]?.netWorthB ?? 0,
        finalDiff: chartPoints[chartPoints.length - 1]?.netWorthDiff ?? 0,
        crossoverMonthLabel: findCrossoverMonthLabel(chartPoints),
        effectiveComparisonMonths: common.effectiveComparisonMonths,
        effectiveComparisonYears: common.effectiveComparisonMonths / 12,
        scenarioA: buildScenarioSummary('A', scenarioA, chartPoints, baseA, investmentA.balances),
        scenarioB: buildScenarioSummary('B', scenarioB, chartPoints, baseB, investmentB.balances),
    };

    const infoMessages = [
        '各シナリオの借入額は「物件価格 + 諸費用 - 頭金」で計算しています。諸費用は住宅価値には含めず、ローン残高側にだけ反映します。',
        '各シナリオの初期投資元本は「初期保有金融資産 - 頭金 - 手元現金確保額」を下限 0 円で計算しています。',
        '投資残高は、開始時点の投資原資へ月利を反映したあと、毎月積立額と自動差額積立を加えています。',
        '差額自動積立は「他方シナリオの毎月返済相当額 - 自シナリオの毎月返済相当額」を毎月積立へ上乗せし、負の値は 0 円で止めています。',
        '完済後の自動積立は、そのシナリオの最後の毎月返済相当額を比較期間終了まで積み立てる前提です。',
    ];

    if (common.investmentAccountType === 'taxable') {
        infoMessages.push('課税口座を選んだ場合も、現時点では税引前の運用利回りで比較しています。');
    }
    const scenarioAVariableMessage = buildVariableRateMessage('A', scenarioA);
    const scenarioBVariableMessage = buildVariableRateMessage('B', scenarioB);
    if (scenarioAVariableMessage) {
        infoMessages.push(scenarioAVariableMessage);
    }
    if (scenarioBVariableMessage) {
        infoMessages.push(scenarioBVariableMessage);
    }
    if (common.housingAnnualGrowthRate === 0) {
        infoMessages.push('住宅価値は比較期間を通して現状維持で見ています。');
    }

    return {
        inputs: {
            common,
            scenarioA,
            scenarioB,
        },
        chartPoints,
        summary,
        validationIssues,
        infoMessages,
    };
}
