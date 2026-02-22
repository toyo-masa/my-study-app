/**
 * 間隔反復（Spaced Repetition）ロジック
 *
 * 正誤 × 自信度 → 次回出題日を計算する
 */
import type { ConfidenceLevel } from '../types';

function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 次回の間隔（日数）を計算する
 *
 * ルール:
 *   不正解 → 1日
 *   正解 + 自信なし → max(1, round(current * 1.3))
 *   正解 + 確信 → max(3, round(current * 2.5))
 */
export function calculateNextInterval(
    isCorrect: boolean,
    confidence: ConfidenceLevel,
    currentInterval: number
): number {
    if (!isCorrect) {
        return 1;
    }

    switch (confidence) {
        case 'low':
            return Math.max(1, Math.round(currentInterval * 1.3));
        case 'high':
            return Math.max(3, Math.round(currentInterval * 2.5));
        default:
            return Math.max(3, Math.round(currentInterval * 2.5));
    }
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
