import type { Question, FeedbackTimingMode, SuspendedSession, SuspendedSessionSlotKey } from '../types';
import { isCloudSyncEnabled } from '../db';
import { cloudApi } from '../cloudApi';

export interface QuizSetSettings {
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    feedbackTimingMode: FeedbackTimingMode;
    feedbackBlockSize: number;
}

function getSuspendedSessionStorageKey(quizSetId: number, slotKey: SuspendedSessionSlotKey): string {
    if (slotKey === 'default') {
        return `suspendedSession_${quizSetId}`;
    }
    return `suspendedSession_${slotKey}_${quizSetId}`;
}

function hydrateSuspendedSession(raw: SuspendedSession): SuspendedSession {
    return {
        ...raw,
        startTime: new Date(raw.startTime),
        updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    };
}

export const loadSessionFromStorage = async (
    quizSetId: number,
    slotKey: SuspendedSessionSlotKey = 'default'
): Promise<SuspendedSession | null> => {
    if (!isCloudSyncEnabled()) {
        try {
            const stored = localStorage.getItem(getSuspendedSessionStorageKey(quizSetId, slotKey));
            if (!stored) {
                return null;
            }
            return hydrateSuspendedSession(JSON.parse(stored));
        } catch (e) {
            console.error('Failed to load local suspended session', e);
            return null;
        }
    }

    try {
        const rawCloudSession = await cloudApi.getSuspendedSession(quizSetId, slotKey);
        return rawCloudSession ? hydrateSuspendedSession(rawCloudSession) : null;
    } catch (e) {
        console.error('Failed to load cloud suspended session', e);
        return null;
    }
};

export const saveSessionToStorage = async (
    quizSetId: number,
    session: SuspendedSession,
    slotKey: SuspendedSessionSlotKey = 'default'
) => {
    const sessionToSave = { ...session, updatedAt: new Date() };
    if (isCloudSyncEnabled()) {
        await cloudApi.upsertSuspendedSession(quizSetId, sessionToSave, slotKey);
        return;
    }
    localStorage.setItem(getSuspendedSessionStorageKey(quizSetId, slotKey), JSON.stringify(sessionToSave));
};

export const clearSessionFromStorage = async (
    quizSetId: number,
    slotKey: SuspendedSessionSlotKey = 'default'
) => {
    if (isCloudSyncEnabled()) {
        await cloudApi.clearSuspendedSession(quizSetId, slotKey);
        return;
    }
    localStorage.removeItem(getSuspendedSessionStorageKey(quizSetId, slotKey));
};

// Quiz set settings helpers (localStorage)
const DEFAULT_QUIZ_SET_SETTINGS: QuizSetSettings = {
    shuffleQuestions: false,
    shuffleOptions: false,
    feedbackTimingMode: 'immediate',
    feedbackBlockSize: 5,
};

const FEEDBACK_BLOCK_SIZE_MIN = 1;
const FEEDBACK_BLOCK_SIZE_MAX = 1000;

const normalizeFeedbackBlockSize = (value: unknown): number => {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return DEFAULT_QUIZ_SET_SETTINGS.feedbackBlockSize;
    }
    const rounded = Math.round(num);
    return Math.min(FEEDBACK_BLOCK_SIZE_MAX, Math.max(FEEDBACK_BLOCK_SIZE_MIN, rounded));
};

const normalizeFeedbackTimingMode = (value: unknown): FeedbackTimingMode => {
    return value === 'delayed_block' || value === 'delayed_end' ? value : 'immediate';
};

const normalizeQuizSetSettings = (raw: unknown): QuizSetSettings => {
    const source = (raw && typeof raw === 'object') ? raw as Partial<QuizSetSettings> : {};
    return {
        shuffleQuestions: source.shuffleQuestions === true,
        shuffleOptions: source.shuffleOptions === true,
        feedbackTimingMode: normalizeFeedbackTimingMode(source.feedbackTimingMode),
        feedbackBlockSize: normalizeFeedbackBlockSize(source.feedbackBlockSize),
    };
};

export const loadQuizSetSettings = (quizSetId: number): QuizSetSettings => {
    try {
        const stored = localStorage.getItem(`quizSetSettings_${quizSetId}`);
        if (stored) return normalizeQuizSetSettings(JSON.parse(stored));
    } catch (e) {
        console.error('Failed to load quiz set settings', e);
    }
    return { ...DEFAULT_QUIZ_SET_SETTINGS };
};

export const saveQuizSetSettings = (quizSetId: number, settings: QuizSetSettings) => {
    localStorage.setItem(`quizSetSettings_${quizSetId}`, JSON.stringify(normalizeQuizSetSettings(settings)));
};

// Fisher-Yates shuffle (immutable)
const shuffleArray = <T,>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

const shuffleQuestionOptions = (q: Question): Question => {
    // We need to shuffle options and correctly map correctAnswers to new indices
    const optionsWithIndices = q.options.map((opt, index) => ({ opt, index }));
    const shuffledOptionsObjs = shuffleArray(optionsWithIndices);

    const newOptions = shuffledOptionsObjs.map(o => o.opt);
    const oldIndexToNewIndexMap: Record<number, number> = {};
    shuffledOptionsObjs.forEach((o, newIndex) => {
        oldIndexToNewIndexMap[o.index] = newIndex;
    });

    const newCorrectAnswers = (q.correctAnswers as number[]).map(oldIdx => oldIndexToNewIndexMap[oldIdx]);

    return {
        ...q,
        options: newOptions,
        correctAnswers: newCorrectAnswers,
    };
};

export const applyShuffleSettings = (qs: Question[], settings: QuizSetSettings): Question[] => {
    let result = [...qs];
    if (settings.shuffleQuestions) {
        result = shuffleArray(result);
    }
    if (settings.shuffleOptions) {
        result = result.map(q => shuffleQuestionOptions(q));
    }
    return result;
};
