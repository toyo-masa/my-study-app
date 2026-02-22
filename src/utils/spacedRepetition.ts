/**
 * 間隔反復（Spaced Repetition）ロジック
 *
 * 正誤 × 自信度 → 次回出題日を計算する
 */
import type { ConfidenceLevel } from '../types';

export interface ReviewIntervalSettings {
    retryIntervalDays: number;
    correctMultiplier: number;
}

export const DEFAULT_REVIEW_INTERVAL_SETTINGS: ReviewIntervalSettings = {
    retryIntervalDays: 1,
    correctMultiplier: 2,
};

const REVIEW_INTERVAL_SETTINGS_STORAGE_KEY = 'reviewIntervalSettings';
const DAY_MIN = 1;
const DAY_MAX = 365;
const MULTIPLIER_MIN = 0.2;
const MULTIPLIER_MAX = 10;

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

function roundToTwo(value: number): number {
    return Math.round(value * 100) / 100;
}

export function normalizeReviewIntervalSettings(
    value?: Partial<ReviewIntervalSettings> | null
): ReviewIntervalSettings {
    const source = value as (Partial<ReviewIntervalSettings> & {
        incorrectIntervalDays?: number;
        highConfidenceMultiplier?: number;
    }) | null | undefined;
    const defaults = DEFAULT_REVIEW_INTERVAL_SETTINGS;

    return {
        retryIntervalDays: clamp(
            Math.round(parseNumber(source?.retryIntervalDays) ?? parseNumber(source?.incorrectIntervalDays) ?? defaults.retryIntervalDays),
            DAY_MIN,
            DAY_MAX
        ),
        correctMultiplier: clamp(
            roundToTwo(parseNumber(source?.correctMultiplier) ?? parseNumber(source?.highConfidenceMultiplier) ?? defaults.correctMultiplier),
            MULTIPLIER_MIN,
            MULTIPLIER_MAX
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
 *   正解 → round(current * 2)
 * ※ ユーザー設定できるのは「不正解 or 自信なし」の日数と「正解時の倍率」
 */
export function calculateNextInterval(
    isCorrect: boolean,
    confidence: ConfidenceLevel,
    currentInterval: number,
    settings: ReviewIntervalSettings = DEFAULT_REVIEW_INTERVAL_SETTINGS
): number {
    const effectiveSettings = normalizeReviewIntervalSettings(settings);
    const normalizedCurrentInterval = Number.isFinite(currentInterval)
        ? Math.max(DAY_MIN, Math.round(currentInterval))
        : DAY_MIN;

    if (!isCorrect || confidence === 'low') {
        return effectiveSettings.retryIntervalDays;
    }

    return Math.max(
        DAY_MIN,
        Math.round(normalizedCurrentInterval * effectiveSettings.correctMultiplier)
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

/**
 * 目安時間（秒）を計算する
 * 1問あたり約30秒として計算
 */
export function estimateDuration(questionCount: number, secondsPerQuestion: number = 30): number {
    return questionCount * secondsPerQuestion;
}

/**
 * 目安時間を人間が読める形式にフォーマットする
 */
export function formatEstimatedTime(totalSeconds: number): string {
    if (totalSeconds < 60) {
        return `${totalSeconds}秒`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (seconds === 0) {
        return `約${minutes}分`;
    }
    return `約${minutes}分${seconds}秒`;
}
