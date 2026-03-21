import type { LocalLlmMode } from './settings';

export type StoredLocalLlmChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
};

export type StoredLocalLlmChatSession = {
    id: string;
    title: string;
    mode: LocalLlmMode;
    modelId: string;
    messages: StoredLocalLlmChatMessage[];
    createdAt: string;
    updatedAt: string;
};

const STORAGE_KEY = 'localLlmChatSessions';

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

const normalizeSession = (value: unknown): StoredLocalLlmChatSession | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Partial<StoredLocalLlmChatSession>;
    const messages = normalizeMessages(source.messages);

    return {
        id: typeof source.id === 'string' && source.id.trim().length > 0
            ? source.id
            : crypto.randomUUID(),
        title: typeof source.title === 'string' && source.title.trim().length > 0
            ? source.title.trim()
            : '新しいチャット',
        mode: normalizeMode(source.mode),
        modelId: typeof source.modelId === 'string' ? source.modelId.trim() : '',
        messages,
        createdAt: normalizeDateString(source.createdAt),
        updatedAt: normalizeDateString(source.updatedAt),
    };
};

export const sortLocalLlmChatSessions = (sessions: StoredLocalLlmChatSession[]) => {
    return [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const loadLocalLlmChatSessions = (): StoredLocalLlmChatSession[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return sortLocalLlmChatSessions(
            parsed
                .map((item) => normalizeSession(item))
                .filter((item): item is StoredLocalLlmChatSession => item !== null)
        );
    } catch {
        return [];
    }
};

export const saveLocalLlmChatSessions = (sessions: StoredLocalLlmChatSession[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sortLocalLlmChatSessions(sessions)));
};
