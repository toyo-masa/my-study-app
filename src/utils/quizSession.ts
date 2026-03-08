import type { FeedbackTimingMode, HistoryMode, MemorizationLog, Question, SuspendedSession } from '../types';

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

type BuildSuspendedSessionBaseParams = {
    questions: Question[];
    currentQuestionIndex: number;
    answeredMap: Record<string, boolean>;
    showAnswerMap: Record<string, boolean>;
    pendingRevealQuestionIds: number[];
    feedbackPhase: 'answering' | 'revealing';
    feedbackTimingMode: FeedbackTimingMode;
    feedbackBlockSize: number;
    markedQuestions: number[];
    startTime: Date;
    historyMode: HistoryMode;
};

type BuildStudySuspendedSessionParams = BuildSuspendedSessionBaseParams & {
    answers: Record<string, number[]>;
    memos: Record<string, string>;
};

type BuildMemorizationSuspendedSessionParams = BuildSuspendedSessionBaseParams & {
    memorizationLogs: MemorizationLog[];
    memorizationInputsMap: Record<string, string[]>;
};

function buildSuspendedSessionBase({
    questions,
    currentQuestionIndex,
    answeredMap,
    showAnswerMap,
    pendingRevealQuestionIds,
    feedbackPhase,
    feedbackTimingMode,
    feedbackBlockSize,
    markedQuestions,
    startTime,
    historyMode,
}: BuildSuspendedSessionBaseParams): Pick<
    SuspendedSession,
    | 'questions'
    | 'currentQuestionIndex'
    | 'answeredMap'
    | 'showAnswerMap'
    | 'pendingRevealQuestionIds'
    | 'feedbackPhase'
    | 'feedbackTimingMode'
    | 'feedbackBlockSize'
    | 'markedQuestions'
    | 'startTime'
    | 'elapsedSeconds'
    | 'historyMode'
> {
    return {
        questions,
        currentQuestionIndex,
        answeredMap,
        showAnswerMap,
        pendingRevealQuestionIds,
        feedbackPhase,
        feedbackTimingMode,
        feedbackBlockSize,
        markedQuestions,
        startTime,
        elapsedSeconds: calculateElapsedSeconds(startTime),
        historyMode,
    };
}

export function buildStudySuspendedSession({
    answers,
    memos,
    ...baseParams
}: BuildStudySuspendedSessionParams): SuspendedSession {
    return {
        ...buildSuspendedSessionBase(baseParams),
        answers,
        memos,
        type: 'study',
    };
}

export function buildMemorizationSuspendedSession({
    memorizationLogs,
    memorizationInputsMap,
    ...baseParams
}: BuildMemorizationSuspendedSessionParams): SuspendedSession {
    return {
        ...buildSuspendedSessionBase(baseParams),
        answers: {},
        memos: {},
        type: 'memorization',
        memorizationLogs,
        memorizationInputsMap,
    };
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
