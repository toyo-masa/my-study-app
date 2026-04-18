import type {
    LoanChartPoint,
    LoanScheduleRow,
    LoanSimInputs,
    LoanSimulationResult,
    LoanSimSanitizedInputs,
    LoanSimValidationIssue,
} from './types';

const MAX_MONEY = 300_000_000;
const MAX_RATE = 20;
const MIN_REPAYMENT_YEARS = 1;
const MAX_REPAYMENT_YEARS = 50;
const BONUS_INTERVAL_MONTHS = 6;
const TOKYO_HEALTH_INSURANCE_RATE_EMPLOYEE = 0.0985 / 2;
const EMPLOYEES_PENSION_RATE_EMPLOYEE = 0.183 / 2;
const EMPLOYMENT_INSURANCE_RATE_EMPLOYEE = 0.005;
const RESIDENT_TAX_RATE = 0.1;
const RESIDENT_TAX_BASIC_DEDUCTION = 430_000;
const RECONSTRUCTION_SURTAX_RATE = 0.021;

const INCOME_TAX_BRACKETS = [
    { upTo: 1_949_000, rate: 0.05, deduction: 0 },
    { upTo: 3_299_000, rate: 0.1, deduction: 97_500 },
    { upTo: 6_949_000, rate: 0.2, deduction: 427_500 },
    { upTo: 8_999_000, rate: 0.23, deduction: 636_000 },
    { upTo: 17_999_000, rate: 0.33, deduction: 1_536_000 },
    { upTo: 39_999_000, rate: 0.4, deduction: 2_796_000 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.45, deduction: 4_796_000 },
] as const;

type YearMonthParts = {
    year: number;
    month: number;
};

type EstimatedTakeHome = {
    grossMonthlyIncome: number;
    estimatedAnnualTakeHome: number;
    estimatedMonthlyTakeHome: number;
    paymentToGrossIncomeRatio: number | null;
    paymentToTakeHomeRatio: number | null;
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

function floorToThousand(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
        return 0;
    }
    return Math.floor(value / 1000) * 1000;
}

function normalizeRate(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return clamp(value, 0, MAX_RATE);
}

function normalizeYears(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_REPAYMENT_YEARS;
    }
    return clamp(Math.round(value), MIN_REPAYMENT_YEARS, MAX_REPAYMENT_YEARS);
}

function normalizeAge(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.round(value));
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

function calculateSalaryIncomeDeduction(annualIncome: number): number {
    if (annualIncome <= 0) {
        return 0;
    }
    if (annualIncome <= 1_900_000) {
        return 650_000;
    }
    if (annualIncome <= 3_600_000) {
        return roundCurrency((annualIncome * 0.3) + 80_000);
    }
    if (annualIncome <= 6_600_000) {
        return roundCurrency((annualIncome * 0.2) + 440_000);
    }
    if (annualIncome <= 8_500_000) {
        return roundCurrency((annualIncome * 0.1) + 1_100_000);
    }
    return 1_950_000;
}

function calculateIncomeTaxBasicDeduction(totalIncome: number): number {
    if (totalIncome <= 0) {
        return 950_000;
    }
    if (totalIncome <= 1_320_000) {
        return 950_000;
    }
    if (totalIncome <= 3_360_000) {
        return 880_000;
    }
    if (totalIncome <= 4_890_000) {
        return 680_000;
    }
    if (totalIncome <= 6_550_000) {
        return 630_000;
    }
    if (totalIncome <= 23_500_000) {
        return 580_000;
    }
    if (totalIncome <= 24_000_000) {
        return 480_000;
    }
    if (totalIncome <= 24_500_000) {
        return 320_000;
    }
    if (totalIncome <= 25_000_000) {
        return 160_000;
    }
    return 0;
}

function calculateIncomeTax(taxableIncome: number): number {
    if (taxableIncome <= 0) {
        return 0;
    }

    const bracket = INCOME_TAX_BRACKETS.find((item) => taxableIncome <= item.upTo) ?? INCOME_TAX_BRACKETS[INCOME_TAX_BRACKETS.length - 1];
    const baseTax = Math.max(0, Math.floor((taxableIncome * bracket.rate) - bracket.deduction));
    const reconstructionSurtax = Math.floor(baseTax * RECONSTRUCTION_SURTAX_RATE);
    return baseTax + reconstructionSurtax;
}

// 手取りは「独身会社員・40歳未満・東京都の協会けんぽ・一般事業・扶養や他控除なし」の概算として扱う。
function estimateAnnualTakeHome(annualIncome: number, monthlyPaymentBase: number): EstimatedTakeHome {
    const grossAnnualIncome = normalizeMoney(annualIncome);
    const grossMonthlyIncome = grossAnnualIncome > 0 ? roundCurrency(grossAnnualIncome / 12) : 0;

    if (grossAnnualIncome <= 0) {
        return {
            grossMonthlyIncome,
            estimatedAnnualTakeHome: 0,
            estimatedMonthlyTakeHome: 0,
            paymentToGrossIncomeRatio: null,
            paymentToTakeHomeRatio: null,
        };
    }

    const salaryIncomeDeduction = calculateSalaryIncomeDeduction(grossAnnualIncome);
    const salaryIncome = Math.max(0, grossAnnualIncome - salaryIncomeDeduction);
    const socialInsurance = roundCurrency(
        grossAnnualIncome *
        (
            TOKYO_HEALTH_INSURANCE_RATE_EMPLOYEE +
            EMPLOYEES_PENSION_RATE_EMPLOYEE +
            EMPLOYMENT_INSURANCE_RATE_EMPLOYEE
        ),
    );
    const incomeTaxBasicDeduction = calculateIncomeTaxBasicDeduction(salaryIncome);
    const incomeTaxableIncome = floorToThousand(salaryIncome - socialInsurance - incomeTaxBasicDeduction);
    const incomeTax = calculateIncomeTax(incomeTaxableIncome);
    const residentTaxableIncome = floorToThousand(salaryIncome - socialInsurance - RESIDENT_TAX_BASIC_DEDUCTION);
    const residentTax = Math.max(0, Math.floor(residentTaxableIncome * RESIDENT_TAX_RATE));
    const estimatedAnnualTakeHome = Math.max(0, grossAnnualIncome - socialInsurance - incomeTax - residentTax);
    const estimatedMonthlyTakeHome = roundCurrency(estimatedAnnualTakeHome / 12);

    return {
        grossMonthlyIncome,
        estimatedAnnualTakeHome,
        estimatedMonthlyTakeHome,
        paymentToGrossIncomeRatio: grossMonthlyIncome > 0 ? monthlyPaymentBase / grossMonthlyIncome : null,
        paymentToTakeHomeRatio: estimatedMonthlyTakeHome > 0 ? monthlyPaymentBase / estimatedMonthlyTakeHome : null,
    };
}

function sanitizeInputs(inputs: LoanSimInputs): {
    sanitized: LoanSimSanitizedInputs;
    validationIssues: LoanSimValidationIssue[];
} {
    const validationIssues: LoanSimValidationIssue[] = [];

    if (inputs.propertyPrice < 0) {
        validationIssues.push({ field: 'propertyPrice', message: '物件価格が 0 円未満だったため、0 円で計算しています。' });
    }
    if (inputs.downPayment < 0) {
        validationIssues.push({ field: 'downPayment', message: '頭金が 0 円未満だったため、0 円で計算しています。' });
    }
    if (inputs.annualRate < 0 || inputs.annualRate > MAX_RATE) {
        validationIssues.push({ field: 'annualRate', message: `年利は 0〜${MAX_RATE}% の範囲で計算しています。` });
    }
    if (inputs.annualIncome < 0) {
        validationIssues.push({ field: 'annualIncome', message: '年収が 0 円未満だったため、0 円で計算しています。' });
    }
    if (inputs.currentAge < 0) {
        validationIssues.push({ field: 'currentAge', message: '開始時点の年齢が 0 歳未満だったため、0 歳で計算しています。' });
    }
    if (inputs.retirementAge < 0) {
        validationIssues.push({ field: 'retirementAge', message: '定年年齢が 0 歳未満だったため、0 歳で計算しています。' });
    }
    if (inputs.savingsAnnualRate < 0 || inputs.savingsAnnualRate > MAX_RATE) {
        validationIssues.push({ field: 'savingsAnnualRate', message: `積立年利は 0〜${MAX_RATE}% の範囲で計算しています。` });
    }
    if (inputs.repaymentYears < MIN_REPAYMENT_YEARS || inputs.repaymentYears > MAX_REPAYMENT_YEARS) {
        validationIssues.push({
            field: 'repaymentYears',
            message: `返済年数は ${MIN_REPAYMENT_YEARS}〜${MAX_REPAYMENT_YEARS} 年の範囲で計算しています。`,
        });
    }
    if (inputs.initialSavingsBalance < 0) {
        validationIssues.push({ field: 'initialSavingsBalance', message: '運用の元手が 0 円未満だったため、0 円で計算しています。' });
    }
    if (inputs.monthlySavings < 0) {
        validationIssues.push({ field: 'monthlySavings', message: '毎月積立額が 0 円未満だったため、0 円で計算しています。' });
    }
    if (inputs.bonusRepayment < 0) {
        validationIssues.push({ field: 'bonusRepayment', message: 'ボーナス返済額が 0 円未満だったため、0 円で計算しています。' });
    }
    if (inputs.monthlyFixedCost < 0) {
        validationIssues.push({ field: 'monthlyFixedCost', message: '毎月固定費が 0 円未満だったため、0 円で計算しています。' });
    }

    const propertyPrice = normalizeMoney(inputs.propertyPrice);
    const rawDownPayment = normalizeMoney(inputs.downPayment);
    const downPayment = Math.min(rawDownPayment, propertyPrice);
    if (rawDownPayment > propertyPrice) {
        validationIssues.push({
            field: 'downPayment',
            message: '頭金が物件価格を上回ったため、借入額は 0 円になるよう補正しています。',
        });
    }

    const autoCalculatedLoanAmount = Math.max(propertyPrice - downPayment, 0);
    const loanAmount = normalizeMoney(inputs.loanAmount);
    const effectiveLoanAmount = inputs.isLoanAmountManual ? loanAmount : autoCalculatedLoanAmount;
    const annualIncome = normalizeMoney(inputs.annualIncome);
    const currentAge = normalizeAge(inputs.currentAge);
    const rawRetirementAge = normalizeAge(inputs.retirementAge);
    const retirementAge = Math.max(rawRetirementAge, currentAge);
    if (rawRetirementAge < currentAge) {
        validationIssues.push({
            field: 'retirementAge',
            message: '定年年齢が開始時点の年齢を下回ったため、開始時点と同じ年齢として計算しています。',
        });
    }
    const annualRate = normalizeRate(inputs.annualRate);
    const savingsAnnualRate = normalizeRate(inputs.savingsAnnualRate);
    const repaymentYears = normalizeYears(inputs.repaymentYears);
    const initialSavingsBalance = normalizeMoney(inputs.initialSavingsBalance);
    const monthlySavings = normalizeMoney(inputs.monthlySavings);
    const bonusRepayment = normalizeMoney(inputs.bonusRepayment);
    const monthlyFixedCost = normalizeMoney(inputs.monthlyFixedCost);

    const parsedStartYearMonth = parseYearMonth(inputs.startYearMonth);
    const startYearMonth = parsedStartYearMonth ? formatMonthKey(parsedStartYearMonth) : getCurrentYearMonth();
    if (!parsedStartYearMonth) {
        validationIssues.push({
            field: 'startYearMonth',
            message: '開始年月の形式が不正だったため、今月を開始年月として計算しています。',
        });
    }

    return {
        sanitized: {
            propertyPrice,
            downPayment,
            loanAmount,
            isLoanAmountManual: inputs.isLoanAmountManual,
            annualIncome,
            currentAge,
            retirementAge,
            annualRate,
            repaymentYears,
            repaymentType: inputs.repaymentType,
            initialSavingsBalance,
            monthlySavings,
            savingsAnnualRate,
            bonusRepayment,
            monthlyFixedCost,
            startYearMonth,
            autoCalculatedLoanAmount,
            effectiveLoanAmount,
            repaymentMonths: repaymentYears * 12,
            monthlyRate: annualRate / 100 / 12,
            savingsMonthlyRate: savingsAnnualRate / 100 / 12,
        },
        validationIssues,
    };
}

export function calculateLoanSimulation(inputs: LoanSimInputs): LoanSimulationResult {
    const { sanitized: sanitizedInputs, validationIssues } = sanitizeInputs(inputs);
    const startParts = parseYearMonth(sanitizedInputs.startYearMonth) ?? parseYearMonth(getCurrentYearMonth())!;
    const plannedFinishParts = addMonths(startParts, sanitizedInputs.repaymentMonths - 1);
    const retirementMonthCount = Math.max(0, (sanitizedInputs.retirementAge - sanitizedInputs.currentAge) * 12);
    const retirementParts = retirementMonthCount > 0
        ? addMonths(startParts, retirementMonthCount - 1)
        : startParts;

    const schedule: LoanScheduleRow[] = [];
    let remainingBalance = sanitizedInputs.effectiveLoanAmount;
    let savingsBalance = sanitizedInputs.initialSavingsBalance;
    let cumulativeInterest = 0;
    let totalRepayment = 0;
    let totalHousingOutflow = 0;
    let payoffMonthCount = remainingBalance > 0 ? sanitizedInputs.repaymentMonths : 0;
    let payoffMonthLabel = remainingBalance > 0 ? formatMonthLabel(plannedFinishParts) : formatMonthLabel(startParts);
    let payoffRecorded = remainingBalance <= 0;
    let savingsBalanceAtPayoff = 0;
    let hasCapturedPayoffSavings = remainingBalance <= 0;

    const regularMonthlyPayment = sanitizedInputs.repaymentType === 'equal-payment'
        ? calculateEqualPayment(sanitizedInputs.effectiveLoanAmount, sanitizedInputs.monthlyRate, sanitizedInputs.repaymentMonths)
        : 0;
    const equalPrincipalBase = sanitizedInputs.repaymentType === 'equal-principal'
        ? roundCurrency(sanitizedInputs.effectiveLoanAmount / sanitizedInputs.repaymentMonths)
        : 0;

    for (let monthIndex = 0; monthIndex < sanitizedInputs.repaymentMonths; monthIndex += 1) {
        const monthParts = addMonths(startParts, monthIndex);
        const periodStartBalance = remainingBalance;
        const bonusMonth = isBonusMonth(monthIndex);
        const isFinalPlannedMonth = monthIndex === sanitizedInputs.repaymentMonths - 1;
        let interestPayment = 0;
        let principalPayment = 0;
        let monthlyPayment = 0;
        let bonusPayment = 0;

        if (periodStartBalance > 0) {
            interestPayment = roundCurrency(periodStartBalance * sanitizedInputs.monthlyRate);

            if (sanitizedInputs.repaymentType === 'equal-payment') {
                monthlyPayment = regularMonthlyPayment;
                principalPayment = Math.max(0, monthlyPayment - interestPayment);
                if (principalPayment >= periodStartBalance || isFinalPlannedMonth) {
                    principalPayment = periodStartBalance;
                    monthlyPayment = principalPayment + interestPayment;
                }
            } else {
                principalPayment = Math.min(isFinalPlannedMonth ? periodStartBalance : equalPrincipalBase, periodStartBalance);
                monthlyPayment = principalPayment + interestPayment;
            }

            remainingBalance = Math.max(0, periodStartBalance - principalPayment);

            if (remainingBalance > 0 && sanitizedInputs.bonusRepayment > 0 && bonusMonth) {
                bonusPayment = Math.min(sanitizedInputs.bonusRepayment, remainingBalance);
                remainingBalance = Math.max(0, remainingBalance - bonusPayment);
            }

            cumulativeInterest += interestPayment;
            totalRepayment += monthlyPayment + bonusPayment;
        }

        // 金額は円単位で四捨五入し、積立は「前月残高へ利息反映 → 月末積立」の順で処理する。
        const savingsInterest = roundCurrency(savingsBalance * sanitizedInputs.savingsMonthlyRate);
        savingsBalance += savingsInterest + sanitizedInputs.monthlySavings;
        const monthlyTotalOutflow =
            monthlyPayment +
            bonusPayment +
            sanitizedInputs.monthlyFixedCost +
            sanitizedInputs.monthlySavings;
        totalHousingOutflow += monthlyTotalOutflow;

        if (!payoffRecorded && remainingBalance === 0) {
            payoffMonthCount = monthIndex + 1;
            payoffMonthLabel = formatMonthLabel(monthParts);
            payoffRecorded = true;
        }

        const isPayoffMonth = payoffRecorded && payoffMonthCount === monthIndex + 1;
        if (isPayoffMonth && !hasCapturedPayoffSavings) {
            savingsBalanceAtPayoff = savingsBalance;
            hasCapturedPayoffSavings = true;
        }

        schedule.push({
            monthIndex: monthIndex + 1,
            monthKey: formatMonthKey(monthParts),
            monthLabel: formatMonthLabel(monthParts),
            periodStartBalance,
            monthlyPayment,
            principalPayment,
            interestPayment,
            bonusPayment,
            periodEndBalance: remainingBalance,
            savingsContribution: sanitizedInputs.monthlySavings,
            savingsInterest,
            savingsBalance,
            fixedCost: sanitizedInputs.monthlyFixedCost,
            monthlyTotalOutflow,
            cumulativeInterest,
            isBonusMonth: bonusMonth,
            isPayoffMonth,
        });
    }

    const firstRow = schedule[0];
    const lastLoanRow = [...schedule].reverse().find((row) => row.monthlyPayment > 0 || row.bonusPayment > 0) ?? null;
    const remainingBalanceAtRetirement = retirementMonthCount === 0
        ? sanitizedInputs.effectiveLoanAmount
        : retirementMonthCount <= schedule.length
            ? (schedule[retirementMonthCount - 1]?.periodEndBalance ?? 0)
            : 0;
    const isRetirementAfterPayoff = retirementMonthCount > payoffMonthCount;
    const totalMonthlySavings = sanitizedInputs.monthlySavings * sanitizedInputs.repaymentMonths;
    const averageMonthlyNetHousingCost = sanitizedInputs.repaymentMonths > 0
        ? roundCurrency((totalHousingOutflow - totalMonthlySavings) / sanitizedInputs.repaymentMonths)
        : 0;
    const paymentBase = firstRow?.monthlyPayment ?? 0;
    const estimatedTakeHome = estimateAnnualTakeHome(sanitizedInputs.annualIncome, paymentBase);

    let chartCumulativeSavingsInterest = 0;
    const chartPoints: LoanChartPoint[] = [
        {
            key: 'start',
            monthOffset: 0,
            shortLabel: '開始',
            monthLabel: formatMonthLabel(startParts),
            totalAssets: sanitizedInputs.propertyPrice + sanitizedInputs.initialSavingsBalance,
            loanBalance: sanitizedInputs.effectiveLoanAmount,
            savingsBalance: sanitizedInputs.initialSavingsBalance,
            cumulativeSavingsInterest: 0,
            cumulativeInterest: 0,
            regularPayment: 0,
            principalPayment: 0,
            interestPayment: 0,
            totalOutflow: 0,
        },
        ...schedule.map((row) => {
            chartCumulativeSavingsInterest += row.savingsInterest;
            return {
            key: row.monthKey,
            monthOffset: row.monthIndex,
            shortLabel: formatShortMonthLabel(parseYearMonth(row.monthKey) ?? startParts),
            monthLabel: row.monthLabel,
            totalAssets: sanitizedInputs.propertyPrice + row.savingsBalance,
            loanBalance: row.periodEndBalance,
            savingsBalance: row.savingsBalance,
            cumulativeSavingsInterest: chartCumulativeSavingsInterest,
            cumulativeInterest: row.cumulativeInterest,
            regularPayment: row.monthlyPayment,
            principalPayment: row.principalPayment,
            interestPayment: row.interestPayment,
            totalOutflow: row.monthlyTotalOutflow,
            };
        }),
    ];

    const infoMessages = [
        'ボーナス返済は開始から6か月ごとの月末に、元本へ追加返済として反映しています。',
        '積立は開始時点の残高に月利を反映したあと、月末に当月積立額を加えています。',
    ];

    infoMessages.push('借入額は「物件価格 - 頭金」で自動計算しています。');
    infoMessages.push('年収に対する手取りは、独身会社員・40歳未満・東京都の協会けんぽ・一般事業・扶養や賞与なし前提の概算です。住民税の均等割や介護保険は含めていません。');
    infoMessages.push('定年時の残り残高は、開始年月時点の年齢から定年年齢までの月数を進めた時点のローン残高で見ています。');

    return {
        sanitizedInputs,
        summary: {
            regularMonthlyPayment,
            firstMonthlyPayment: firstRow?.monthlyPayment ?? 0,
            lastMonthlyPayment: lastLoanRow?.monthlyPayment ?? 0,
            grossMonthlyIncome: estimatedTakeHome.grossMonthlyIncome,
            estimatedAnnualTakeHome: estimatedTakeHome.estimatedAnnualTakeHome,
            estimatedMonthlyTakeHome: estimatedTakeHome.estimatedMonthlyTakeHome,
            paymentToGrossIncomeRatio: estimatedTakeHome.paymentToGrossIncomeRatio,
            paymentToTakeHomeRatio: estimatedTakeHome.paymentToTakeHomeRatio,
            retirementMonthLabel: formatMonthLabel(retirementParts),
            remainingBalanceAtRetirement,
            isRetirementAfterPayoff,
            bonusRepayment: sanitizedInputs.bonusRepayment,
            firstMonthlyOutflow: firstRow?.monthlyTotalOutflow ?? 0,
            firstMonthNetHousingCost: Math.max(0, (firstRow?.monthlyTotalOutflow ?? 0) - sanitizedInputs.monthlySavings),
            averageMonthlyNetHousingCost,
            totalRepayment,
            totalInterest: cumulativeInterest,
            totalHousingOutflow,
            plannedFinishMonthLabel: formatMonthLabel(plannedFinishParts),
            payoffMonthLabel,
            payoffMonthCount,
            isEarlyPayoff: sanitizedInputs.effectiveLoanAmount > 0 && payoffMonthCount > 0 && payoffMonthCount < sanitizedInputs.repaymentMonths,
            finalSavingsBalance: schedule.length > 0 ? schedule[schedule.length - 1].savingsBalance : 0,
            savingsBalanceAtPayoff,
        },
        schedule,
        chartPoints,
        validationIssues,
        infoMessages,
    };
}
