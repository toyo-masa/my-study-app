/**
 * 間隔反復（Spaced Repetition）ロジック
 *
 * 正誤 × 自信度 → 次回出題日を計算する
 */
import type { ConfidenceLevel } from '../types';

export interface ReviewIntervalSettings {
    retryIntervalDays: number;
    correctIntervalDays: number;
}

export const DEFAULT_REVIEW_INTERVAL_SETTINGS: ReviewIntervalSettings = {
    retryIntervalDays: 1,
    correctIntervalDays: 2,
};

const REVIEW_INTERVAL_SETTINGS_STORAGE_KEY = 'reviewIntervalSettings';
const DAY_MIN = 1;
const DAY_MAX = 365;
function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function parseNumber(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }
    return value;
}

export function normalizeReviewIntervalSettings(
    value?: Partial<ReviewIntervalSettings> | null
): ReviewIntervalSettings {
    const source = value as (Partial<ReviewIntervalSettings> & {
        incorrectIntervalDays?: number;
        correctDays?: number;
        highConfidenceMultiplier?: number;
    }) | null | undefined;
    const defaults = DEFAULT_REVIEW_INTERVAL_SETTINGS;

    return {
        retryIntervalDays: clamp(
            Math.round(parseNumber(source?.retryIntervalDays) ?? parseNumber(source?.incorrectIntervalDays) ?? defaults.retryIntervalDays),
            DAY_MIN,
            DAY_MAX
        ),
        correctIntervalDays: clamp(
            Math.round(
                parseNumber(source?.correctIntervalDays)
                ?? parseNumber(source?.correctDays)
                ?? parseNumber(source?.highConfidenceMultiplier)
                ?? defaults.correctIntervalDays
            ),
            DAY_MIN,
            DAY_MAX
        ),
    };
}

export function loadReviewIntervalSettings(): ReviewIntervalSettings {
    try {
        const stored = localStorage.getItem(REVIEW_INTERVAL_SETTINGS_STORAGE_KEY);
        if (!stored) {
            return { ...DEFAULT_REVIEW_INTERVAL_SETTINGS };
        }
        const parsed = JSON.parse(stored) as Partial<ReviewIntervalSettings>;
        return normalizeReviewIntervalSettings(parsed);
    } catch (error) {
        console.error('Failed to load review interval settings', error);
        return { ...DEFAULT_REVIEW_INTERVAL_SETTINGS };
    }
}

export function saveReviewIntervalSettings(settings: ReviewIntervalSettings): void {
    const normalized = normalizeReviewIntervalSettings(settings);
    localStorage.setItem(REVIEW_INTERVAL_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
}

/**
 * 次回の間隔（日数）を計算する
 *
 * ルール（初期値）:
 *   不正解 or 自信なし → 1日
 *   正解 → 正解時の基準日数 × 連続正解数
 * ※ ユーザー設定できるのは「不正解 or 自信なし」の日数と「正解時の基準日数」
 */
export function calculateNextInterval(
    isCorrect: boolean,
    confidence: ConfidenceLevel,
    currentConsecutiveCorrect: number,
    settings: ReviewIntervalSettings = DEFAULT_REVIEW_INTERVAL_SETTINGS
): number {
    const effectiveSettings = normalizeReviewIntervalSettings(settings);
    const normalizedCurrentConsecutiveCorrect = Number.isFinite(currentConsecutiveCorrect)
        ? Math.max(0, Math.round(currentConsecutiveCorrect))
        : 0;

    if (!isCorrect || confidence === 'low') {
        return effectiveSettings.retryIntervalDays;
    }

    const nextCorrectCount = normalizedCurrentConsecutiveCorrect + 1;
    return Math.max(
        DAY_MIN,
        Math.round(effectiveSettings.correctIntervalDays * nextCorrectCount)
    );
}

/**
 * 今日から intervalDays 日後の日付を 'YYYY-MM-DD' 形式で返す
 */
export function calculateNextDue(intervalDays: number, baseDate?: Date): string {
    const date = baseDate ? new Date(baseDate) : new Date();
    date.setDate(date.getDate() + intervalDays);
    return toLocalDateString(date);
}

/**
 * 連続正解数を更新する
 */
export function updateConsecutiveCorrect(
    isCorrect: boolean,
    currentConsecutive: number
): number {
    return isCorrect ? currentConsecutive + 1 : 0;
}
