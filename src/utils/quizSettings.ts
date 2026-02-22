import type { Question, HistoryMode } from '../types';
import type { MemorizationLog } from '../components/MemorizationView';

export interface QuizSetSettings {
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
}

export interface SuspendedSession {
    questions: Question[];
    currentQuestionIndex: number;
    answers: Record<string, number[]>;
    memos: Record<string, string>;
    showAnswerMap: Record<string, boolean>;
    markedQuestions: number[];
    startTime: Date;
    elapsedSeconds: number; // The amount of time already spent in the session before this suspension
    historyMode: HistoryMode;
    type: 'study' | 'memorization';
    memorizationLogs?: MemorizationLog[];
}

export const loadSessionFromStorage = (quizSetId: number): SuspendedSession | null => {
    try {
        const stored = localStorage.getItem(`suspendedSession_${quizSetId}`);
        if (stored) {
            const session = JSON.parse(stored);
            // Date strings need to be converted back to Date objects
            return {
                ...session,
                startTime: new Date(session.startTime),
            };
        }
    } catch (e) {
        console.error('Failed to load suspended session', e);
    }
    return null;
};

export const saveSessionToStorage = (quizSetId: number, session: SuspendedSession) => {
    localStorage.setItem(`suspendedSession_${quizSetId}`, JSON.stringify(session));
};

export const clearSessionFromStorage = (quizSetId: number) => {
    localStorage.removeItem(`suspendedSession_${quizSetId}`);
};

// Quiz set settings helpers (localStorage)
export const loadQuizSetSettings = (quizSetId: number): QuizSetSettings => {
    try {
        const stored = localStorage.getItem(`quizSetSettings_${quizSetId}`);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('Failed to load quiz set settings', e);
    }
    return { shuffleQuestions: false, shuffleOptions: false };
};

export const saveQuizSetSettings = (quizSetId: number, settings: QuizSetSettings) => {
    localStorage.setItem(`quizSetSettings_${quizSetId}`, JSON.stringify(settings));
};

// Fisher-Yates shuffle (immutable)
export const shuffleArray = <T,>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

export const shuffleQuestionOptions = (q: Question): Question => {
    // We need to shuffle options and correctly map correctAnswers to new indices
    const optionsWithIndices = q.options.map((opt, index) => ({ opt, index }));
    const shuffledOptionsObjs = shuffleArray(optionsWithIndices);

    const newOptions = shuffledOptionsObjs.map(o => o.opt);
    const oldIndexToNewIndexMap: Record<number, number> = {};
    shuffledOptionsObjs.forEach((o, newIndex) => {
        oldIndexToNewIndexMap[o.index] = newIndex;
    });

    const newCorrectAnswers = q.correctAnswers.map(oldIdx => oldIndexToNewIndexMap[oldIdx]);

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
