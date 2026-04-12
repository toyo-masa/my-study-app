import type { LoanRepaymentType, LoanSimInputs, LoanSimSavedPreset, LoanSimSavedPropertyLink } from './types';

const PRESET_STORAGE_KEY = 'loan-sim.saved-presets';
const PROPERTY_LINK_STORAGE_KEY = 'loan-sim.saved-property-links';

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
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

function buildPresetId(): string {
    return `loan-sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadLoanSimSavedPresets(fallbackInputs: LoanSimInputs): LoanSimSavedPreset[] {
    if (typeof window === 'undefined') {
        return [];
    }

    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
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

function persistPropertyLinks(links: LoanSimSavedPropertyLink[]) {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(PROPERTY_LINK_STORAGE_KEY, JSON.stringify(links));
}

function normalizePropertyLinkUrl(value: string): string | null {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return null;
    }

    try {
        const parsed = new URL(trimmedValue);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
}

function restorePropertyLink(value: unknown): LoanSimSavedPropertyLink | null {
    if (!isRecord(value)) {
        return null;
    }

    const id = readString(value.id, '');
    const title = readString(value.title, '').trim();
    const updatedAt = readNumber(value.updatedAt, 0);
    const normalizedUrl = normalizePropertyLinkUrl(readString(value.url, ''));

    if (!id || !title || updatedAt <= 0 || !normalizedUrl) {
        return null;
    }

    return {
        id,
        title,
        url: normalizedUrl,
        updatedAt,
    };
}

export function loadLoanSimSavedPropertyLinks(): LoanSimSavedPropertyLink[] {
    if (typeof window === 'undefined') {
        return [];
    }

    const raw = window.localStorage.getItem(PROPERTY_LINK_STORAGE_KEY);
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((item) => restorePropertyLink(item))
            .filter((link): link is LoanSimSavedPropertyLink => link !== null)
            .sort((left, right) => right.updatedAt - left.updatedAt);
    } catch {
        return [];
    }
}

export function upsertLoanSimSavedPropertyLink(
    links: LoanSimSavedPropertyLink[],
    title: string,
    url: string,
): LoanSimSavedPropertyLink[] {
    const trimmedTitle = title.trim();
    const normalizedUrl = normalizePropertyLinkUrl(url);
    if (!trimmedTitle || !normalizedUrl) {
        return links;
    }

    const existing = links.find((link) => link.url === normalizedUrl);
    const nextLink: LoanSimSavedPropertyLink = {
        id: existing?.id ?? buildPresetId(),
        title: trimmedTitle,
        url: normalizedUrl,
        updatedAt: Date.now(),
    };

    const nextLinks = [
        nextLink,
        ...links.filter((link) => link.url !== normalizedUrl),
    ].sort((left, right) => right.updatedAt - left.updatedAt);

    persistPropertyLinks(nextLinks);
    return nextLinks;
}

export function deleteLoanSimSavedPropertyLink(
    links: LoanSimSavedPropertyLink[],
    id: string,
): LoanSimSavedPropertyLink[] {
    const nextLinks = links.filter((link) => link.id !== id);
    persistPropertyLinks(nextLinks);
    return nextLinks;
}

export function isLoanSimPropertyLinkUrlValid(value: string): boolean {
    return normalizePropertyLinkUrl(value) !== null;
}
