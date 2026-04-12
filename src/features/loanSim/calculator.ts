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

type YearMonthParts = {
    year: number;
    month: number;
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

function normalizeYears(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_REPAYMENT_YEARS;
    }
    return clamp(Math.round(value), MIN_REPAYMENT_YEARS, MAX_REPAYMENT_YEARS);
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
    if (inputs.savingsAnnualRate < 0 || inputs.savingsAnnualRate > MAX_RATE) {
        validationIssues.push({ field: 'savingsAnnualRate', message: `積立年利は 0〜${MAX_RATE}% の範囲で計算しています。` });
    }
    if (inputs.repaymentYears < MIN_REPAYMENT_YEARS || inputs.repaymentYears > MAX_REPAYMENT_YEARS) {
        validationIssues.push({
            field: 'repaymentYears',
            message: `返済年数は ${MIN_REPAYMENT_YEARS}〜${MAX_REPAYMENT_YEARS} 年の範囲で計算しています。`,
        });
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
    const annualRate = normalizeRate(inputs.annualRate);
    const savingsAnnualRate = normalizeRate(inputs.savingsAnnualRate);
    const repaymentYears = normalizeYears(inputs.repaymentYears);
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
            annualRate,
            repaymentYears,
            repaymentType: inputs.repaymentType,
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

    const schedule: LoanScheduleRow[] = [];
    let remainingBalance = sanitizedInputs.effectiveLoanAmount;
    let savingsBalance = 0;
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
    const totalMonthlySavings = sanitizedInputs.monthlySavings * sanitizedInputs.repaymentMonths;
    const averageMonthlyNetHousingCost = sanitizedInputs.repaymentMonths > 0
        ? roundCurrency((totalHousingOutflow - totalMonthlySavings) / sanitizedInputs.repaymentMonths)
        : 0;

    const chartPoints: LoanChartPoint[] = [
        {
            key: 'start',
            monthOffset: 0,
            shortLabel: '開始',
            monthLabel: formatMonthLabel(startParts),
            loanBalance: sanitizedInputs.effectiveLoanAmount,
            savingsBalance: 0,
            cumulativeInterest: 0,
            regularPayment: 0,
            principalPayment: 0,
            interestPayment: 0,
            totalOutflow: 0,
        },
        ...schedule.map((row) => ({
            key: row.monthKey,
            monthOffset: row.monthIndex,
            shortLabel: formatShortMonthLabel(parseYearMonth(row.monthKey) ?? startParts),
            monthLabel: row.monthLabel,
            loanBalance: row.periodEndBalance,
            savingsBalance: row.savingsBalance,
            cumulativeInterest: row.cumulativeInterest,
            regularPayment: row.monthlyPayment,
            principalPayment: row.principalPayment,
            interestPayment: row.interestPayment,
            totalOutflow: row.monthlyTotalOutflow,
        })),
    ];

    const infoMessages = [
        'ボーナス返済は開始から6か月ごとの月末に、元本へ追加返済として反映しています。',
        '積立は前月残高に月利を反映したあと、月末に当月積立額を加えています。',
    ];

    if (sanitizedInputs.isLoanAmountManual) {
        infoMessages.push('借入額を直接入力しているため、物件価格と頭金の差額とは独立して計算しています。');
    } else {
        infoMessages.push('借入額は「物件価格 - 頭金」で自動計算しています。');
    }

    return {
        sanitizedInputs,
        summary: {
            regularMonthlyPayment,
            firstMonthlyPayment: firstRow?.monthlyPayment ?? 0,
            lastMonthlyPayment: lastLoanRow?.monthlyPayment ?? 0,
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
