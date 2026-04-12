export type LoanRepaymentType = 'equal-payment' | 'equal-principal';

export interface LoanSimInputs {
    propertyPrice: number;
    downPayment: number;
    loanAmount: number;
    isLoanAmountManual: boolean;
    annualRate: number;
    repaymentYears: number;
    repaymentType: LoanRepaymentType;
    monthlySavings: number;
    savingsAnnualRate: number;
    bonusRepayment: number;
    monthlyFixedCost: number;
    startYearMonth: string;
}

export interface LoanSimSanitizedInputs extends LoanSimInputs {
    autoCalculatedLoanAmount: number;
    effectiveLoanAmount: number;
    repaymentMonths: number;
    monthlyRate: number;
    savingsMonthlyRate: number;
}

export interface LoanSimValidationIssue {
    field: keyof LoanSimInputs | 'general';
    message: string;
}

export interface LoanScheduleRow {
    monthIndex: number;
    monthKey: string;
    monthLabel: string;
    periodStartBalance: number;
    monthlyPayment: number;
    principalPayment: number;
    interestPayment: number;
    bonusPayment: number;
    periodEndBalance: number;
    savingsContribution: number;
    savingsInterest: number;
    savingsBalance: number;
    fixedCost: number;
    monthlyTotalOutflow: number;
    cumulativeInterest: number;
    isBonusMonth: boolean;
    isPayoffMonth: boolean;
}

export interface LoanChartPoint {
    key: string;
    monthOffset: number;
    shortLabel: string;
    monthLabel: string;
    loanBalance: number;
    savingsBalance: number;
    cumulativeInterest: number;
    regularPayment: number;
    principalPayment: number;
    interestPayment: number;
    totalOutflow: number;
}

export interface LoanSimSummary {
    regularMonthlyPayment: number;
    firstMonthlyPayment: number;
    lastMonthlyPayment: number;
    bonusRepayment: number;
    firstMonthlyOutflow: number;
    firstMonthNetHousingCost: number;
    averageMonthlyNetHousingCost: number;
    totalRepayment: number;
    totalInterest: number;
    totalHousingOutflow: number;
    plannedFinishMonthLabel: string;
    payoffMonthLabel: string;
    payoffMonthCount: number;
    isEarlyPayoff: boolean;
    finalSavingsBalance: number;
    savingsBalanceAtPayoff: number;
}

export interface LoanSimulationResult {
    sanitizedInputs: LoanSimSanitizedInputs;
    summary: LoanSimSummary;
    schedule: LoanScheduleRow[];
    chartPoints: LoanChartPoint[];
    validationIssues: LoanSimValidationIssue[];
    infoMessages: string[];
}
