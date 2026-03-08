import type { Question } from '../types';

type BuildQuizSessionKeyParams = {
    quizSetId: number | undefined;
    startNew: boolean | undefined;
    historyId: number | undefined;
    reviewQuestionIds?: number[];
    locationKey: string;
};

export function isMobileViewport(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches;
}

export function buildReviewQuestionIdsKey(reviewQuestionIds?: number[]): string {
    return reviewQuestionIds && reviewQuestionIds.length > 0
        ? reviewQuestionIds.join(',')
        : 'all';
}

export function buildQuizSessionKey({
    quizSetId,
    startNew,
    historyId,
    reviewQuestionIds,
    locationKey,
}: BuildQuizSessionKeyParams): string {
    const reviewQuestionIdsKey = buildReviewQuestionIdsKey(reviewQuestionIds);
    return `${quizSetId}-${startNew}-${historyId || 'new'}-${reviewQuestionIdsKey}-${locationKey}`;
}

export function calculateElapsedSeconds(startTime: Date): number {
    return Math.floor((Date.now() - startTime.getTime()) / 1000);
}

export function buildResumedStartTime(elapsedSeconds?: number): Date {
    const safeElapsedSeconds = typeof elapsedSeconds === 'number' && elapsedSeconds > 0
        ? elapsedSeconds
        : 0;
    return new Date(Date.now() - safeElapsedSeconds * 1000);
}

export function filterExistingSessionQuestions<T extends { id?: number }>(
    sessionQuestions: T[],
    availableQuestions: Question[]
): T[] {
    const validQuestionIds = new Set(
        availableQuestions
            .map((question) => question.id)
            .filter((id): id is number => typeof id === 'number')
    );

    return sessionQuestions.filter(
        (question): question is T & { id: number } =>
            question.id !== undefined && validQuestionIds.has(question.id)
    );
}

export function clearWindowTimeout(timeoutRef: { current: number | null }): void {
    if (timeoutRef.current === null) {
        return;
    }
    if (typeof window !== 'undefined') {
        window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = null;
}
