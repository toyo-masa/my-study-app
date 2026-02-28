export function hasValue(value: unknown): boolean {
    return value !== undefined && value !== null && value !== '';
}

export function parsePositiveInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return null;
}

export function parseNonNegativeInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed >= 0) {
            return parsed;
        }
    }
    return null;
}

export function parseQueryPositiveInt(value: string | string[] | undefined): { exists: boolean; value: number | null } {
    if (value === undefined) {
        return { exists: false, value: null };
    }
    const normalized = Array.isArray(value) ? value[0] : value;
    return { exists: true, value: parsePositiveInt(normalized) };
}

export function isValidLocalDateString(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [yearText, monthText, dayText] = value.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return false;
    }

    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidDateTime(value: string): boolean {
    return !Number.isNaN(Date.parse(value));
}

