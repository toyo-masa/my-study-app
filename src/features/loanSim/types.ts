export type LoanRepaymentType = 'equal-payment' | 'equal-principal';
export type LoanInterestType = 'fixed' | 'variable';
export type LoanInvestmentAccountType = 'nisa' | 'taxable';
export type LoanAfterPayoffMode = 'none' | 'invest-equivalent-payment';
export type LoanVariableRateMode = 'constant' | 'step-up';

export interface LoanSimInputs {
    propertyPrice: number;
    downPayment: number;
    loanAmount: number;
    isLoanAmountManual: boolean;
    annualIncome: number;
    currentAge: number;
    retirementAge: number;
    annualRate: number;
    repaymentYears: number;
    repaymentType: LoanRepaymentType;
    initialSavingsBalance: number;
    monthlySavings: number;
    savingsAnnualRate: number;
    bonusRepayment: number;
    monthlyFixedCost: number;
    startYearMonth: string;
}

export interface LoanSimSavedPreset {
    id: string;
    name: string;
    inputs: LoanSimInputs;
    updatedAt: number;
}

export interface LoanSimSavedPropertyLink {
    id: string;
    title: string;
    url: string;
    updatedAt: number;
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
    totalAssets: number;
    loanBalance: number;
    savingsBalance: number;
    cumulativeSavingsInterest: number;
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
    grossMonthlyIncome: number;
    estimatedAnnualTakeHome: number;
    estimatedMonthlyTakeHome: number;
    paymentToGrossIncomeRatio: number | null;
    paymentToTakeHomeRatio: number | null;
    retirementMonthLabel: string;
    remainingBalanceAtRetirement: number;
    isRetirementAfterPayoff: boolean;
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

export interface LoanCompareCommonInputs {
    propertyPrice: number;
    purchaseFees: number;
    initialFinancialAssets: number;
    annualInvestmentRate: number;
    investmentAccountType: LoanInvestmentAccountType;
    comparisonYears: number;
    housingAnnualGrowthRate: number;
    startYearMonth: string;
}

export interface LoanCompareScenarioInputs {
    downPayment: number;
    cashReserve: number;
    repaymentType: LoanRepaymentType;
    repaymentYears: number;
    interestType: LoanInterestType;
    annualRate: number;
    variableRateMode: LoanVariableRateMode;
    variableRateStepYears: number;
    variableRateStepAmount: number;
    monthlyInvestment: number;
    bonusRepayment: number;
    monthlyPrepayment: number;
    autoInvestPaymentDifference: boolean;
    afterPayoffMode: LoanAfterPayoffMode;
}

export interface LoanCompareInputs {
    common: LoanCompareCommonInputs;
    scenarioA: LoanCompareScenarioInputs;
    scenarioB: LoanCompareScenarioInputs;
}

export interface LoanCompareValidationIssue {
    field: string;
    message: string;
}

export interface LoanComparePoint {
    key: string;
    monthOffset: number;
    shortLabel: string;
    monthLabel: string;
    houseValue: number;
    investmentBalanceA: number;
    investmentBalanceB: number;
    loanBalanceA: number;
    loanBalanceB: number;
    netWorthA: number;
    netWorthB: number;
    netWorthDiff: number;
    cumulativeInvestmentGainA: number;
    cumulativeInvestmentGainB: number;
    cumulativeInterestA: number;
    cumulativeInterestB: number;
}

export interface LoanCompareScenarioSummary {
    label: 'A' | 'B';
    downPayment: number;
    cashReserve: number;
    loanAmount: number;
    initialInvestmentBalance: number;
    firstMonthlyPayment: number;
    lastActiveMonthlyPayment: number;
    totalInterest: number;
    finalInvestmentBalance: number;
    finalNetWorth: number;
    payoffMonthLabel: string;
    payoffMonthCount: number;
    isPaidOffWithinComparison: boolean;
}

export interface LoanCompareSummary {
    finalNetWorthA: number;
    finalNetWorthB: number;
    finalDiff: number;
    crossoverMonthLabel: string | null;
    effectiveComparisonMonths: number;
    effectiveComparisonYears: number;
    scenarioA: LoanCompareScenarioSummary;
    scenarioB: LoanCompareScenarioSummary;
}

export interface LoanComparisonResult {
    inputs: LoanCompareInputs;
    chartPoints: LoanComparePoint[];
    summary: LoanCompareSummary;
    validationIssues: LoanCompareValidationIssue[];
    infoMessages: string[];
}
