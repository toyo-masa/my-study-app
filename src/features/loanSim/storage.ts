import type { LoanRepaymentType, LoanSimInputs, LoanSimSavedPreset } from './types';

const STORAGE_KEY = 'loan-sim.saved-presets';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function readNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
}

function readRepaymentType(value: unknown, fallback: LoanRepaymentType): LoanRepaymentType {
    return value === 'equal-payment' || value === 'equal-principal' ? value : fallback;
}

function restoreInputs(value: unknown, fallback: LoanSimInputs): LoanSimInputs | null {
    if (!isRecord(value)) {
        return null;
    }

    return {
        propertyPrice: readNumber(value.propertyPrice, fallback.propertyPrice),
        downPayment: readNumber(value.downPayment, fallback.downPayment),
        loanAmount: readNumber(value.loanAmount, fallback.loanAmount),
        isLoanAmountManual: readBoolean(value.isLoanAmountManual, fallback.isLoanAmountManual),
        annualIncome: readNumber(value.annualIncome, fallback.annualIncome),
        annualRate: readNumber(value.annualRate, fallback.annualRate),
        repaymentYears: readNumber(value.repaymentYears, fallback.repaymentYears),
        repaymentType: readRepaymentType(value.repaymentType, fallback.repaymentType),
        monthlySavings: readNumber(value.monthlySavings, fallback.monthlySavings),
        savingsAnnualRate: readNumber(value.savingsAnnualRate, fallback.savingsAnnualRate),
        bonusRepayment: readNumber(value.bonusRepayment, fallback.bonusRepayment),
        monthlyFixedCost: readNumber(value.monthlyFixedCost, fallback.monthlyFixedCost),
        startYearMonth: readString(value.startYearMonth, fallback.startYearMonth),
    };
}

function persistPresets(presets: LoanSimSavedPreset[]) {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function buildPresetId(): string {
    return `loan-sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadLoanSimSavedPresets(fallbackInputs: LoanSimInputs): LoanSimSavedPreset[] {
    if (typeof window === 'undefined') {
        return [];
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((item) => {
                if (!isRecord(item)) {
                    return null;
                }

                const id = readString(item.id, '');
                const name = readString(item.name, '').trim();
                const inputs = restoreInputs(item.inputs, fallbackInputs);
                const updatedAt = readNumber(item.updatedAt, 0);

                if (!id || !name || !inputs || updatedAt <= 0) {
                    return null;
                }

                return {
                    id,
                    name,
                    inputs,
                    updatedAt,
                } satisfies LoanSimSavedPreset;
            })
            .filter((preset): preset is LoanSimSavedPreset => preset !== null)
            .sort((left, right) => right.updatedAt - left.updatedAt);
    } catch {
        return [];
    }
}

export function upsertLoanSimSavedPreset(
    presets: LoanSimSavedPreset[],
    name: string,
    inputs: LoanSimInputs,
): LoanSimSavedPreset[] {
    const trimmedName = name.trim();
    const existing = presets.find((preset) => preset.name === trimmedName);
    const nextPreset: LoanSimSavedPreset = {
        id: existing?.id ?? buildPresetId(),
        name: trimmedName,
        inputs: { ...inputs },
        updatedAt: Date.now(),
    };

    const nextPresets = [
        nextPreset,
        ...presets.filter((preset) => preset.name !== trimmedName),
    ].sort((left, right) => right.updatedAt - left.updatedAt);

    persistPresets(nextPresets);
    return nextPresets;
}

export function deleteLoanSimSavedPreset(
    presets: LoanSimSavedPreset[],
    id: string,
): LoanSimSavedPreset[] {
    const nextPresets = presets.filter((preset) => preset.id !== id);
    persistPresets(nextPresets);
    return nextPresets;
}
