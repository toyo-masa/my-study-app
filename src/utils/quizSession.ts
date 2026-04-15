import type {
    ConfidenceLevel,
    FeedbackTimingMode,
    HistoryMode,
    MemorizationLog,
    Question,
    SuspendedSession,
    SuspendedSessionSlotKey,
} from '../types';

type BuildQuizSessionKeyParams = {
    quizSetId: number | undefined;
    startNew: boolean | undefined;
    historyId: number | undefined;
    reviewQuestionIds?: number[];
    locationKey: string;
};

export const DEFAULT_SUSPENDED_SESSION_SLOT_KEY: SuspendedSessionSlotKey = 'default';
export const REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY: SuspendedSessionSlotKey = 'review_due';

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
    questionElapsedMsById?: Record<string, number>;
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
    confidences: Record<string, ConfidenceLevel>;
    memorizationAnswers: Record<string, string>;
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
    questionElapsedMsById,
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
    | 'questionElapsedMsById'
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
        questionElapsedMsById,
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
    confidences,
    memorizationAnswers,
    ...baseParams
}: BuildStudySuspendedSessionParams): SuspendedSession {
    return {
        ...buildSuspendedSessionBase(baseParams),
        answers,
        memos,
        confidences,
        memorizationAnswers,
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

function filterObjectByQuestionIds<T>(
    record: Record<string, T> | undefined,
    targetQuestionIdSet: Set<number>
): Record<string, T> {
    if (!record) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(record).filter(([questionId]) => targetQuestionIdSet.has(Number(questionId)))
    );
}

function omitObjectByQuestionIds<T>(
    record: Record<string, T> | undefined,
    omittedQuestionIdSet: Set<number>
): Record<string, T> {
    if (!record) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(record).filter(([questionId]) => !omittedQuestionIdSet.has(Number(questionId)))
    );
}

function filterMemorizationLogsByQuestionIds(
    logs: MemorizationLog[] | undefined,
    targetQuestionIdSet: Set<number>
): MemorizationLog[] {
    if (!logs) {
        return [];
    }

    return logs.filter((log) => targetQuestionIdSet.has(log.questionId));
}

function normalizeCompletedQuestionIds(questionIds: number[] | undefined): number[] {
    if (!questionIds) {
        return [];
    }

    return [...new Set(
        questionIds.filter((questionId): questionId is number => Number.isInteger(questionId) && questionId > 0)
    )];
}

function inferCompletedQuestionIdsFromSuspendedSession(session: SuspendedSession): number[] {
    if (session.type === 'memorization') {
        return [...new Set((session.memorizationLogs || []).map((log) => log.questionId))];
    }

    return session.questions
        .map((question) => question.id)
        .filter((questionId): questionId is number => typeof questionId === 'number')
        .filter((questionId) => {
            const questionKey = String(questionId);
            const question = session.questions.find((item) => item.id === questionId);
            if (!question) {
                return false;
            }

            if (question.questionType === 'memorization') {
                return session.showAnswerMap[questionKey] === true && Boolean(session.confidences?.[questionKey]);
            }

            return session.showAnswerMap[questionKey] === true;
        });
}

export function getCompletedQuestionIdsFromSuspendedSession(session: SuspendedSession): number[] {
    if (session.completedQuestionIds !== undefined) {
        return normalizeCompletedQuestionIds(session.completedQuestionIds);
    }

    return inferCompletedQuestionIdsFromSuspendedSession(session);
}

export function mergeCompletedQuestionIds(...questionIdLists: Array<number[] | undefined>): number[] {
    return normalizeCompletedQuestionIds(questionIdLists.flatMap((questionIds) => questionIds || []));
}

export function getIncompleteQuestionIdsFromSuspendedSession(session: SuspendedSession): number[] {
    const completedQuestionIdSet = new Set(getCompletedQuestionIdsFromSuspendedSession(session));

    return session.questions
        .map((question) => question.id)
        .filter((questionId): questionId is number => typeof questionId === 'number')
        .filter((questionId) => !completedQuestionIdSet.has(questionId));
}

export function filterSuspendedSessionByQuestionIds(
    session: SuspendedSession,
    targetQuestions: Question[],
    currentQuestionId?: number
): SuspendedSession {
    const targetQuestionIds = targetQuestions
        .map((question) => question.id)
        .filter((questionId): questionId is number => typeof questionId === 'number');
    const targetQuestionIdSet = new Set(targetQuestionIds);

    const nextCurrentQuestionIndex = currentQuestionId !== undefined
        ? targetQuestionIds.indexOf(currentQuestionId)
        : -1;

    return {
        ...session,
        questions: targetQuestions,
        currentQuestionIndex: nextCurrentQuestionIndex >= 0 ? nextCurrentQuestionIndex : 0,
        answers: filterObjectByQuestionIds(session.answers, targetQuestionIdSet),
        memos: filterObjectByQuestionIds(session.memos, targetQuestionIdSet),
        confidences: filterObjectByQuestionIds(session.confidences, targetQuestionIdSet),
        memorizationAnswers: filterObjectByQuestionIds(session.memorizationAnswers, targetQuestionIdSet),
        answeredMap: filterObjectByQuestionIds(session.answeredMap, targetQuestionIdSet),
        showAnswerMap: filterObjectByQuestionIds(session.showAnswerMap, targetQuestionIdSet),
        questionElapsedMsById: filterObjectByQuestionIds(session.questionElapsedMsById, targetQuestionIdSet),
        pendingRevealQuestionIds: (session.pendingRevealQuestionIds || []).filter((questionId) => targetQuestionIdSet.has(questionId)),
        markedQuestions: (session.markedQuestions || []).filter((questionId) => targetQuestionIdSet.has(questionId)),
        memorizationLogs: filterMemorizationLogsByQuestionIds(session.memorizationLogs, targetQuestionIdSet),
        memorizationInputsMap: filterObjectByQuestionIds(session.memorizationInputsMap, targetQuestionIdSet),
    };
}

export function buildReviewDueResumeSession(
    session: SuspendedSession,
    availableQuestions: Question[],
    currentReviewQuestionIds: number[]
): SuspendedSession {
    const availableQuestionById = new Map(
        availableQuestions
            .filter((question): question is Question & { id: number } => typeof question.id === 'number')
            .map((question) => [question.id, question])
    );
    const savedQuestions = filterExistingSessionQuestions(session.questions, availableQuestions);
    const savedQuestionById = new Map(savedQuestions.map((question) => [question.id!, question]));
    const completedQuestionIdSet = new Set(
        getCompletedQuestionIdsFromSuspendedSession(session).filter((questionId) => availableQuestionById.has(questionId))
    );
    const persistedCompletedQuestionIdSet = new Set(
        normalizeCompletedQuestionIds(session.persistedCompletedQuestionIds)
            .filter((questionId) => availableQuestionById.has(questionId))
    );
    const pendingPersistQuestionIdSet = new Set(
        [...completedQuestionIdSet].filter((questionId) => !persistedCompletedQuestionIdSet.has(questionId))
    );
    const resetQuestionIdSet = new Set(
        currentReviewQuestionIds.filter((questionId) => persistedCompletedQuestionIdSet.has(questionId))
    );
    const effectiveCompletedQuestionIdSet = new Set(
        [...completedQuestionIdSet].filter((questionId) => !resetQuestionIdSet.has(questionId))
    );

    const mergedQuestionIds: number[] = [];
    const mergedQuestionIdSet = new Set<number>();
    const appendQuestionId = (questionId: number) => {
        if (!availableQuestionById.has(questionId) || mergedQuestionIdSet.has(questionId)) {
            return;
        }
        mergedQuestionIds.push(questionId);
        mergedQuestionIdSet.add(questionId);
    };

    currentReviewQuestionIds.forEach(appendQuestionId);

    const mergedQuestions = mergedQuestionIds
        .map((questionId) => savedQuestionById.get(questionId) || availableQuestionById.get(questionId))
        .filter((question): question is Question => Boolean(question));

    const savedCurrentQuestionId = savedQuestions[Math.min(session.currentQuestionIndex, Math.max(savedQuestions.length - 1, 0))]?.id;
    const firstIncompleteQuestionId = mergedQuestionIds.find((questionId) => !effectiveCompletedQuestionIdSet.has(questionId));
    const currentQuestionId = savedCurrentQuestionId !== undefined
        && mergedQuestionIdSet.has(savedCurrentQuestionId)
        && !effectiveCompletedQuestionIdSet.has(savedCurrentQuestionId)
        ? savedCurrentQuestionId
        : firstIncompleteQuestionId ?? mergedQuestionIds[0];

    const retainedSessionQuestionIdSet = new Set([
        ...mergedQuestionIds,
        ...pendingPersistQuestionIdSet,
    ]);
    const filteredSessionBase = filterSuspendedSessionByQuestionIds(session, mergedQuestions, currentQuestionId);
    const filteredSession: SuspendedSession = {
        ...filteredSessionBase,
        answers: filterObjectByQuestionIds(session.answers, retainedSessionQuestionIdSet),
        memos: filterObjectByQuestionIds(session.memos, retainedSessionQuestionIdSet),
        confidences: filterObjectByQuestionIds(session.confidences, retainedSessionQuestionIdSet),
        memorizationAnswers: filterObjectByQuestionIds(session.memorizationAnswers, retainedSessionQuestionIdSet),
        answeredMap: filterObjectByQuestionIds(session.answeredMap, retainedSessionQuestionIdSet),
        showAnswerMap: filterObjectByQuestionIds(session.showAnswerMap, retainedSessionQuestionIdSet),
        questionElapsedMsById: filterObjectByQuestionIds(session.questionElapsedMsById, retainedSessionQuestionIdSet),
        memorizationLogs: filterMemorizationLogsByQuestionIds(session.memorizationLogs, retainedSessionQuestionIdSet),
        memorizationInputsMap: filterObjectByQuestionIds(session.memorizationInputsMap, retainedSessionQuestionIdSet),
        completedQuestionIds: normalizeCompletedQuestionIds(session.completedQuestionIds)
            .filter((questionId) => retainedSessionQuestionIdSet.has(questionId)),
        persistedCompletedQuestionIds: normalizeCompletedQuestionIds(session.persistedCompletedQuestionIds)
            .filter((questionId) => retainedSessionQuestionIdSet.has(questionId)),
    };

    if (resetQuestionIdSet.size === 0) {
        return filteredSession;
    }

    return {
        ...filteredSession,
        answers: omitObjectByQuestionIds(filteredSession.answers, resetQuestionIdSet),
        memos: filteredSession.memos,
        confidences: omitObjectByQuestionIds(filteredSession.confidences, resetQuestionIdSet),
        memorizationAnswers: omitObjectByQuestionIds(filteredSession.memorizationAnswers, resetQuestionIdSet),
        answeredMap: omitObjectByQuestionIds(filteredSession.answeredMap, resetQuestionIdSet),
        showAnswerMap: omitObjectByQuestionIds(filteredSession.showAnswerMap, resetQuestionIdSet),
        questionElapsedMsById: omitObjectByQuestionIds(filteredSession.questionElapsedMsById, resetQuestionIdSet),
        pendingRevealQuestionIds: (filteredSession.pendingRevealQuestionIds || []).filter((questionId) => !resetQuestionIdSet.has(questionId)),
        markedQuestions: (filteredSession.markedQuestions || []).filter((questionId) => !resetQuestionIdSet.has(questionId)),
        memorizationLogs: (filteredSession.memorizationLogs || []).filter((log) => !resetQuestionIdSet.has(log.questionId)),
        memorizationInputsMap: omitObjectByQuestionIds(filteredSession.memorizationInputsMap, resetQuestionIdSet),
        completedQuestionIds: normalizeCompletedQuestionIds(filteredSession.completedQuestionIds)
            .filter((questionId) => !resetQuestionIdSet.has(questionId)),
        persistedCompletedQuestionIds: normalizeCompletedQuestionIds(filteredSession.persistedCompletedQuestionIds)
            .filter((questionId) => !resetQuestionIdSet.has(questionId)),
    };
}
