import type { StoredLocalLlmChatMessage } from './localLlmChatHistory';
import type { LocalLlmMode } from './settings';

export type StoredStudyQuestionChatSession = {
    quizSetId: number;
    questionId: number;
    mode: LocalLlmMode;
    modelId: string;
    messages: StoredLocalLlmChatMessage[];
    createdAt: string;
    updatedAt: string;
};

const STORAGE_KEY = 'studyQuestionChatSessions';

const normalizeMode = (value: unknown): LocalLlmMode => {
    return value === 'openai-local' ? 'openai-local' : 'webllm';
};

const normalizeDateString = (value: unknown) => {
    return typeof value === 'string' && value.trim().length > 0
        ? value
        : new Date().toISOString();
};

const normalizeMessages = (value: unknown): StoredLocalLlmChatMessage[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((item): StoredLocalLlmChatMessage => {
        const source = item && typeof item === 'object'
            ? item as Partial<StoredLocalLlmChatMessage>
            : {};

        return {
            id: typeof source.id === 'string' && source.id.trim().length > 0
                ? source.id
                : crypto.randomUUID(),
            role: source.role === 'assistant' ? 'assistant' : 'user',
            content: typeof source.content === 'string' ? source.content : '',
        };
    }).filter((item) => item.content.trim().length > 0);
};

const normalizeSession = (value: unknown): StoredStudyQuestionChatSession | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Partial<StoredStudyQuestionChatSession>;
    const quizSetId = typeof source.quizSetId === 'number' && Number.isFinite(source.quizSetId)
        ? Math.trunc(source.quizSetId)
        : Number.NaN;
    const questionId = typeof source.questionId === 'number' && Number.isFinite(source.questionId)
        ? Math.trunc(source.questionId)
        : Number.NaN;

    if (!Number.isFinite(quizSetId) || !Number.isFinite(questionId)) {
        return null;
    }

    return {
        quizSetId,
        questionId,
        mode: normalizeMode(source.mode),
        modelId: typeof source.modelId === 'string' ? source.modelId.trim() : '',
        messages: normalizeMessages(source.messages),
        createdAt: normalizeDateString(source.createdAt),
        updatedAt: normalizeDateString(source.updatedAt),
    };
};

const sortStudyQuestionChatSessions = (sessions: StoredStudyQuestionChatSession[]) => {
    return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const loadStudyQuestionChatSessions = (): StoredStudyQuestionChatSession[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return sortStudyQuestionChatSessions(
            parsed
                .map((item) => normalizeSession(item))
                .filter((item): item is StoredStudyQuestionChatSession => item !== null)
        );
    } catch {
        return [];
    }
};

export const saveStudyQuestionChatSessions = (sessions: StoredStudyQuestionChatSession[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sortStudyQuestionChatSessions(sessions)));
};

export const findStudyQuestionChatSession = (
    sessions: StoredStudyQuestionChatSession[],
    quizSetId: number,
    questionId: number
) => {
    return sessions.find((session) => session.quizSetId === quizSetId && session.questionId === questionId) ?? null;
};
