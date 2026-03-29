import { DEFAULT_WEB_LLM_MODEL_ID } from './localLlmEngine';
import { DEFAULT_LOCAL_API_BASE_URL, findLocalApiProviderByBaseUrl } from './localApiProviders';
export type ThemeMode = 'light' | 'dark' | 'monokai';
export type LocalLlmMode = 'webllm' | 'openai-local';
export type LocalLlmStreamingRenderMode = 'live' | 'lightweight';
export type LocalApiReasoningEffort = 'default' | 'none' | 'low' | 'medium' | 'high';

export const LOCAL_API_REASONING_EFFORT_OPTIONS = ['default', 'none', 'low', 'medium', 'high'] as const;

export const WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS = {
    temperature: 0.6,
    topP: 0.95,
} as const;

export const WEB_LLM_QWEN_SECOND_PASS_DEFAULTS = {
    temperature: 0.7,
    topP: 0.8,
    presencePenalty: 0.0,
} as const;

export const WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET = 1024;
export const WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY = 0.3;
export const WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS = 512;
export const WEB_LLM_QWEN_FIRST_PASS_THINKING_BUDGET_OPTIONS = [1024, 2048, 4096, 8192, 16384] as const;
export const WEB_LLM_QWEN_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS_OPTIONS = [256, 384, 512, 768, 1024, 1280, 1536, 1792, 2048, 4096] as const;

export interface HandwritingSettings {
    allowTouchDrawing: boolean;
}
export type LocalApiModelParameterSettings = {
    temperature: number | null;
    topP: number | null;
    maxTokens: number | null;
    reasoningEffort: LocalApiReasoningEffort;
};

export type WebLlmModelParameterSettings = {
    firstPassTemperature: number | null;
    firstPassTopP: number | null;
    firstPassThinkingBudget: number;
    firstPassPresencePenalty: number | null;
    secondPassTemperature: number | null;
    secondPassTopP: number | null;
    secondPassFinalAnswerMaxTokens: number;
    secondPassPresencePenalty: number | null;
};

export interface LocalLlmSettings {
    preferredMode: LocalLlmMode;
    baseUrl: string;
    defaultModelId: string;
    localApiTemperature: number | null;
    localApiTopP: number | null;
    localApiMaxTokens: number | null;
    localApiReasoningEffort: LocalApiReasoningEffort;
    localApiModelOverrides: Record<string, LocalApiModelParameterSettings>;
    webllmModelId: string;
    webllmStreamingRenderMode: LocalLlmStreamingRenderMode;
    webllmSystemPrompt: string;
    webllmEnableThinking: boolean;
    webllmFirstPassTemperature: number | null;
    webllmFirstPassTopP: number | null;
    webllmFirstPassThinkingBudget: number | null;
    webllmFirstPassPresencePenalty: number | null;
    webllmSecondPassTemperature: number | null;
    webllmSecondPassTopP: number | null;
    webllmSecondPassFinalAnswerMaxTokens: number | null;
    webllmSecondPassPresencePenalty: number | null;
    webllmModelOverrides: Record<string, WebLlmModelParameterSettings>;
}
export type LocalLlmSettingsUpdater = LocalLlmSettings | ((previous: LocalLlmSettings) => LocalLlmSettings);

const SETTINGS_KEYS = {
    theme: 'theme',
    accentColor: 'accentColor',
    useCloudSync: 'useCloudSync',
    handwritingSettings: 'handwritingSettings',
    localLlmSettings: 'localLlmSettings',
    lastLocalApiModelIdPrefix: 'lastLocalApiModelId::',
} as const;

const DEFAULT_SETTINGS = {
    theme: 'dark' as ThemeMode,
    accentColor: '#3b82f6',
    useCloudSync: true,
    handwritingSettings: {
        allowTouchDrawing: false,
    } as HandwritingSettings,
    localLlmSettings: {
        preferredMode: 'webllm' as LocalLlmMode,
        baseUrl: DEFAULT_LOCAL_API_BASE_URL,
        defaultModelId: '',
        localApiTemperature: null,
        localApiTopP: null,
        localApiMaxTokens: null,
        localApiReasoningEffort: 'default' as LocalApiReasoningEffort,
        localApiModelOverrides: {} as Record<string, LocalApiModelParameterSettings>,
        webllmModelId: DEFAULT_WEB_LLM_MODEL_ID,
        webllmStreamingRenderMode: 'live' as LocalLlmStreamingRenderMode,
        webllmSystemPrompt: '',
        webllmEnableThinking: true,
        webllmFirstPassTemperature: WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature,
        webllmFirstPassTopP: WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP,
        webllmFirstPassThinkingBudget: WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET,
        webllmFirstPassPresencePenalty: WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY,
        webllmSecondPassTemperature: WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.temperature,
        webllmSecondPassTopP: WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.topP,
        webllmSecondPassFinalAnswerMaxTokens: WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS,
        webllmSecondPassPresencePenalty: WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.presencePenalty,
        webllmModelOverrides: {} as Record<string, WebLlmModelParameterSettings>,
    } as LocalLlmSettings,
} as const;

export function ensureLocalSettingsInitialized(): void {
    if (localStorage.getItem(SETTINGS_KEYS.theme) === null) {
        localStorage.setItem(SETTINGS_KEYS.theme, DEFAULT_SETTINGS.theme);
    }

    if (localStorage.getItem(SETTINGS_KEYS.useCloudSync) === null) {
        localStorage.setItem(SETTINGS_KEYS.useCloudSync, String(DEFAULT_SETTINGS.useCloudSync));
    }

    if (localStorage.getItem(SETTINGS_KEYS.handwritingSettings) === null) {
        localStorage.setItem(SETTINGS_KEYS.handwritingSettings, JSON.stringify(DEFAULT_SETTINGS.handwritingSettings));
    }

    if (localStorage.getItem(SETTINGS_KEYS.localLlmSettings) === null) {
        localStorage.setItem(SETTINGS_KEYS.localLlmSettings, JSON.stringify(DEFAULT_SETTINGS.localLlmSettings));
    }
}

export function getStoredThemeMode(): string {
    return localStorage.getItem(SETTINGS_KEYS.theme) ?? DEFAULT_SETTINGS.theme;
}

export function setStoredThemeMode(theme: ThemeMode): void {
    localStorage.setItem(SETTINGS_KEYS.theme, theme);
}

export function getStoredAccentColor(): string {
    return localStorage.getItem(SETTINGS_KEYS.accentColor) ?? DEFAULT_SETTINGS.accentColor;
}

export function setStoredAccentColor(color: string): void {
    localStorage.setItem(SETTINGS_KEYS.accentColor, color);
}

export const DEFAULT_HANDWRITING_SETTINGS: HandwritingSettings = {
    ...DEFAULT_SETTINGS.handwritingSettings,
};
export const DEFAULT_LOCAL_LLM_SETTINGS: LocalLlmSettings = {
    ...DEFAULT_SETTINGS.localLlmSettings,
};

export function normalizeHandwritingSettings(raw: unknown): HandwritingSettings {
    const source = raw && typeof raw === 'object'
        ? raw as Partial<HandwritingSettings>
        : {};

    return {
        allowTouchDrawing: source.allowTouchDrawing === true,
    };
}

const normalizeLocalLlmMode = (value: unknown): LocalLlmMode => {
    return value === 'openai-local' ? 'openai-local' : 'webllm';
};

const normalizeLocalLlmBaseUrl = (value: unknown): string => {
    if (typeof value !== 'string') {
        return DEFAULT_LOCAL_LLM_SETTINGS.baseUrl;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return DEFAULT_LOCAL_LLM_SETTINGS.baseUrl;
    }

    return trimmed.replace(/\/+$/, '');
};

const normalizeLocalLlmModelId = (value: unknown): string => {
    return typeof value === 'string' ? value.trim() : '';
};

const normalizeLocalLlmStreamingRenderMode = (value: unknown): LocalLlmStreamingRenderMode => {
    return value === 'lightweight' ? 'lightweight' : 'live';
};

const normalizeWebLlmModelId = (value: unknown): string => {
    const modelId = typeof value === 'string' ? value.trim() : '';
    if (modelId.length > 0) {
        return modelId;
    }
    return DEFAULT_WEB_LLM_MODEL_ID;
};

const LEGACY_WEB_LLM_SYSTEM_PROMPT_PATTERNS = [
    /^最終出力は簡潔にまとめる$/u,
    /^[-*•]\s*最終出力は簡潔にまとめる$/u,
    /^・\s*最終出力は簡潔にまとめる$/u,
    /^\d+[.)．]\s*最終出力は簡潔にまとめる$/u,
] as const;

const isLegacyWebLlmSystemPromptLine = (line: string): boolean => {
    return LEGACY_WEB_LLM_SYSTEM_PROMPT_PATTERNS.some((pattern) => pattern.test(line));
};

const normalizeLocalLlmSystemPrompt = (value: unknown): string => {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !isLegacyWebLlmSystemPromptLine(line))
        .join('\n');
};

const normalizeOptionalFiniteNumber = (
    value: unknown,
    min: number,
    max: number,
    integer = false
): number | null => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string'
            ? Number.parseFloat(value.trim())
            : Number.NaN;

    if (!Number.isFinite(parsed)) {
        return null;
    }

    const clamped = Math.min(max, Math.max(min, parsed));
    if (integer) {
        return Math.round(clamped);
    }
    return Math.round(clamped * 100) / 100;
};

const normalizeWebLlmEnableThinking = (value: unknown): boolean => {
    return value !== false;
};

const normalizeLocalApiReasoningEffort = (value: unknown): LocalApiReasoningEffort => {
    return LOCAL_API_REASONING_EFFORT_OPTIONS.includes(value as typeof LOCAL_API_REASONING_EFFORT_OPTIONS[number])
        ? value as LocalApiReasoningEffort
        : 'default';
};

const normalizeWebLlmFirstPassThinkingBudget = (value: unknown): number => {
    const parsed = normalizeOptionalFiniteNumber(value, 1, 32768, true);
    if (parsed !== null && WEB_LLM_QWEN_FIRST_PASS_THINKING_BUDGET_OPTIONS.includes(parsed as typeof WEB_LLM_QWEN_FIRST_PASS_THINKING_BUDGET_OPTIONS[number])) {
        return parsed;
    }
    return WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET;
};

const normalizeWebLlmSecondPassFinalAnswerMaxTokens = (value: unknown): number => {
    const parsed = normalizeOptionalFiniteNumber(value, 1, 32768, true);
    if (parsed !== null && WEB_LLM_QWEN_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS_OPTIONS.includes(parsed as typeof WEB_LLM_QWEN_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS_OPTIONS[number])) {
        return parsed;
    }
    return WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS;
};

const normalizeLocalApiModelParameterSettings = (value: unknown): LocalApiModelParameterSettings | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Partial<LocalApiModelParameterSettings>;
    return {
        temperature: normalizeOptionalFiniteNumber(source.temperature, 0, 2),
        topP: normalizeOptionalFiniteNumber(source.topP, 0.01, 1),
        maxTokens: normalizeOptionalFiniteNumber(source.maxTokens, 1, 32768, true),
        reasoningEffort: normalizeLocalApiReasoningEffort(source.reasoningEffort),
    };
};

const normalizeWebLlmModelParameterSettings = (value: unknown): WebLlmModelParameterSettings | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Partial<WebLlmModelParameterSettings>;
    return {
        firstPassTemperature: normalizeOptionalFiniteNumber(source.firstPassTemperature, 0, 2)
            ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature,
        firstPassTopP: normalizeOptionalFiniteNumber(source.firstPassTopP, 0.01, 1)
            ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP,
        firstPassThinkingBudget: normalizeWebLlmFirstPassThinkingBudget(source.firstPassThinkingBudget),
        firstPassPresencePenalty: normalizeOptionalFiniteNumber(source.firstPassPresencePenalty, 0.3, 0.6)
            ?? WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY,
        secondPassTemperature: normalizeOptionalFiniteNumber(source.secondPassTemperature, 0.5, 0.7)
            ?? WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.temperature,
        secondPassTopP: normalizeOptionalFiniteNumber(source.secondPassTopP, 0.8, 0.9)
            ?? WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.topP,
        secondPassFinalAnswerMaxTokens: normalizeWebLlmSecondPassFinalAnswerMaxTokens(source.secondPassFinalAnswerMaxTokens),
        secondPassPresencePenalty: normalizeOptionalFiniteNumber(source.secondPassPresencePenalty, 0, 0.3)
            ?? WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.presencePenalty,
    };
};

const normalizeModelOverrideMap = <T>(
    value: unknown,
    normalizeItem: (item: unknown) => T | null
): Record<string, T> => {
    if (!value || typeof value !== 'object') {
        return {};
    }

    const entries = Object.entries(value);
    if (entries.length === 0) {
        return {};
    }

    const normalized: Record<string, T> = {};
    entries.forEach(([rawModelId, rawItem]) => {
        const modelId = normalizeLocalLlmModelId(rawModelId);
        if (modelId.length === 0) {
            return;
        }

        const item = normalizeItem(rawItem);
        if (!item) {
            return;
        }

        normalized[modelId] = item;
    });

    return normalized;
};

export function normalizeLocalLlmSettings(raw: unknown): LocalLlmSettings {
    const source = raw && typeof raw === 'object'
        ? raw as Partial<LocalLlmSettings> & {
            webllmThinkingBudget?: unknown;
            webllmFinalAnswerMaxTokens?: unknown;
            webllmPresencePenalty?: unknown;
            webllmTemperature?: unknown;
            webllmTopP?: unknown;
        }
        : {};

    const webllmEnableThinking = normalizeWebLlmEnableThinking(source.webllmEnableThinking);

    return {
        preferredMode: normalizeLocalLlmMode(source.preferredMode),
        baseUrl: normalizeLocalLlmBaseUrl(source.baseUrl),
        defaultModelId: normalizeLocalLlmModelId(source.defaultModelId),
        localApiTemperature: normalizeOptionalFiniteNumber(source.localApiTemperature, 0, 2),
        localApiTopP: normalizeOptionalFiniteNumber(source.localApiTopP, 0.01, 1),
        localApiMaxTokens: normalizeOptionalFiniteNumber(source.localApiMaxTokens, 1, 32768, true),
        localApiReasoningEffort: normalizeLocalApiReasoningEffort(source.localApiReasoningEffort),
        localApiModelOverrides: normalizeModelOverrideMap(source.localApiModelOverrides, normalizeLocalApiModelParameterSettings),
        webllmModelId: normalizeWebLlmModelId(source.webllmModelId),
        webllmStreamingRenderMode: normalizeLocalLlmStreamingRenderMode(source.webllmStreamingRenderMode),
        webllmSystemPrompt: normalizeLocalLlmSystemPrompt(source.webllmSystemPrompt),
        webllmEnableThinking,
        webllmFirstPassTemperature: normalizeOptionalFiniteNumber(
            source.webllmFirstPassTemperature ?? source.webllmTemperature,
            0,
            2
        ) ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature,
        webllmFirstPassTopP: normalizeOptionalFiniteNumber(
            source.webllmFirstPassTopP ?? source.webllmTopP,
            0.01,
            1
        ) ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP,
        webllmFirstPassThinkingBudget: normalizeWebLlmFirstPassThinkingBudget(
            source.webllmFirstPassThinkingBudget ?? source.webllmThinkingBudget
        ),
        webllmFirstPassPresencePenalty: normalizeOptionalFiniteNumber(
            source.webllmFirstPassPresencePenalty ?? source.webllmPresencePenalty,
            0.3,
            0.6
        ) ?? WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY,
        webllmSecondPassTemperature: normalizeOptionalFiniteNumber(
            source.webllmSecondPassTemperature ?? source.webllmTemperature,
            0.5,
            0.7
        ) ?? WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.temperature,
        webllmSecondPassTopP: normalizeOptionalFiniteNumber(
            source.webllmSecondPassTopP ?? source.webllmTopP,
            0.8,
            0.9
        ) ?? WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.topP,
        webllmSecondPassFinalAnswerMaxTokens: normalizeWebLlmSecondPassFinalAnswerMaxTokens(
            source.webllmSecondPassFinalAnswerMaxTokens ?? source.webllmFinalAnswerMaxTokens
        ),
        webllmSecondPassPresencePenalty: normalizeOptionalFiniteNumber(
            source.webllmSecondPassPresencePenalty,
            0,
            0.3
        ) ?? WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.presencePenalty,
        webllmModelOverrides: normalizeModelOverrideMap(source.webllmModelOverrides, normalizeWebLlmModelParameterSettings),
    };
}

export function loadHandwritingSettings(): HandwritingSettings {
    try {
        const stored = localStorage.getItem(SETTINGS_KEYS.handwritingSettings);
        if (!stored) {
            return { ...DEFAULT_HANDWRITING_SETTINGS };
        }
        return normalizeHandwritingSettings(JSON.parse(stored));
    } catch {
        return { ...DEFAULT_HANDWRITING_SETTINGS };
    }
}

export function saveHandwritingSettings(settings: HandwritingSettings): void {
    localStorage.setItem(
        SETTINGS_KEYS.handwritingSettings,
        JSON.stringify(normalizeHandwritingSettings(settings))
    );
}

export function loadLocalLlmSettings(): LocalLlmSettings {
    try {
        const stored = localStorage.getItem(SETTINGS_KEYS.localLlmSettings);
        if (!stored) {
            return { ...DEFAULT_LOCAL_LLM_SETTINGS };
        }
        return normalizeLocalLlmSettings(JSON.parse(stored));
    } catch {
        return { ...DEFAULT_LOCAL_LLM_SETTINGS };
    }
}

export function saveLocalLlmSettings(settings: LocalLlmSettings): void {
    localStorage.setItem(
        SETTINGS_KEYS.localLlmSettings,
        JSON.stringify(normalizeLocalLlmSettings(settings))
    );
}

const buildLastLocalApiModelIdStorageKey = (baseUrl: string): string => {
    return `${SETTINGS_KEYS.lastLocalApiModelIdPrefix}${encodeURIComponent(normalizeLocalLlmBaseUrl(baseUrl))}`;
};

export function loadLastLocalApiModelId(baseUrl: string): string {
    if (typeof window === 'undefined') {
        return '';
    }

    try {
        return normalizeLocalLlmModelId(localStorage.getItem(buildLastLocalApiModelIdStorageKey(baseUrl)));
    } catch {
        return '';
    }
}

export function saveLastLocalApiModelId(baseUrl: string, modelId: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    const normalizedModelId = normalizeLocalLlmModelId(modelId);
    const storageKey = buildLastLocalApiModelIdStorageKey(baseUrl);

    try {
        if (normalizedModelId.length === 0) {
            localStorage.removeItem(storageKey);
            return;
        }

        localStorage.setItem(storageKey, normalizedModelId);
    } catch {
        // localStorage へ書けない場合は現在の state をそのまま使う
    }
}

export type ResolvedLocalApiRequestOptions = {
    temperature: number | null;
    topP: number | null;
    maxTokens: number | null;
    extraBody: Record<string, unknown> | null;
    ollamaThink: boolean | 'low' | 'medium' | 'high' | null;
};

const buildDefaultLocalApiModelParameterSettings = (settings: LocalLlmSettings): LocalApiModelParameterSettings => ({
    temperature: settings.localApiTemperature,
    topP: settings.localApiTopP,
    maxTokens: settings.localApiMaxTokens,
    reasoningEffort: settings.localApiReasoningEffort,
});

const buildDefaultWebLlmModelParameterSettings = (settings: LocalLlmSettings): WebLlmModelParameterSettings => ({
    firstPassTemperature: settings.webllmFirstPassTemperature,
    firstPassTopP: settings.webllmFirstPassTopP,
    firstPassThinkingBudget: settings.webllmFirstPassThinkingBudget ?? WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET,
    firstPassPresencePenalty: settings.webllmFirstPassPresencePenalty,
    secondPassTemperature: settings.webllmSecondPassTemperature,
    secondPassTopP: settings.webllmSecondPassTopP,
    secondPassFinalAnswerMaxTokens: settings.webllmSecondPassFinalAnswerMaxTokens ?? WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS,
    secondPassPresencePenalty: settings.webllmSecondPassPresencePenalty,
});

export function resolveLocalApiModelParameterSettings(settings: LocalLlmSettings, modelId: string): LocalApiModelParameterSettings {
    const normalizedModelId = normalizeLocalLlmModelId(modelId);
    if (normalizedModelId.length === 0) {
        return buildDefaultLocalApiModelParameterSettings(settings);
    }

    return settings.localApiModelOverrides[normalizedModelId]
        ?? buildDefaultLocalApiModelParameterSettings(settings);
}

export function resolveWebLlmModelParameterSettings(settings: LocalLlmSettings, modelId: string): WebLlmModelParameterSettings {
    const normalizedModelId = normalizeLocalLlmModelId(modelId);
    if (normalizedModelId.length === 0) {
        return buildDefaultWebLlmModelParameterSettings(settings);
    }

    return settings.webllmModelOverrides[normalizedModelId]
        ?? buildDefaultWebLlmModelParameterSettings(settings);
}

export function hasLocalApiModelParameterOverrides(settings: LocalLlmSettings, modelId: string): boolean {
    const normalizedModelId = normalizeLocalLlmModelId(modelId);
    return normalizedModelId.length > 0 && normalizedModelId in settings.localApiModelOverrides;
}

export function hasWebLlmModelParameterOverrides(settings: LocalLlmSettings, modelId: string): boolean {
    const normalizedModelId = normalizeLocalLlmModelId(modelId);
    return normalizedModelId.length > 0 && normalizedModelId in settings.webllmModelOverrides;
}

export function upsertLocalApiModelParameterSettings(
    settings: LocalLlmSettings,
    modelId: string,
    nextSettings: LocalApiModelParameterSettings
): LocalLlmSettings {
    const normalizedModelId = normalizeLocalLlmModelId(modelId);
    if (normalizedModelId.length === 0) {
        return settings;
    }

    return {
        ...settings,
        localApiModelOverrides: {
            ...settings.localApiModelOverrides,
            [normalizedModelId]: nextSettings,
        },
    };
}

export function clearLocalApiModelParameterSettings(settings: LocalLlmSettings, modelId: string): LocalLlmSettings {
    const normalizedModelId = normalizeLocalLlmModelId(modelId);
    if (normalizedModelId.length === 0 || !(normalizedModelId in settings.localApiModelOverrides)) {
        return settings;
    }

    const nextOverrides = { ...settings.localApiModelOverrides };
    delete nextOverrides[normalizedModelId];

    return {
        ...settings,
        localApiModelOverrides: nextOverrides,
    };
}

export function upsertWebLlmModelParameterSettings(
    settings: LocalLlmSettings,
    modelId: string,
    nextSettings: WebLlmModelParameterSettings
): LocalLlmSettings {
    const normalizedModelId = normalizeLocalLlmModelId(modelId);
    if (normalizedModelId.length === 0) {
        return settings;
    }

    return {
        ...settings,
        webllmModelOverrides: {
            ...settings.webllmModelOverrides,
            [normalizedModelId]: nextSettings,
        },
    };
}

export function clearWebLlmModelParameterSettings(settings: LocalLlmSettings, modelId: string): LocalLlmSettings {
    const normalizedModelId = normalizeLocalLlmModelId(modelId);
    if (normalizedModelId.length === 0 || !(normalizedModelId in settings.webllmModelOverrides)) {
        return settings;
    }

    const nextOverrides = { ...settings.webllmModelOverrides };
    delete nextOverrides[normalizedModelId];

    return {
        ...settings,
        webllmModelOverrides: nextOverrides,
    };
}

export function resolveLocalApiRequestOptions(settings: LocalLlmSettings, modelId: string): ResolvedLocalApiRequestOptions {
    const matchedProvider = findLocalApiProviderByBaseUrl(settings.baseUrl);
    const resolvedSettings = resolveLocalApiModelParameterSettings(settings, modelId);
    const extraBody: Record<string, unknown> = {};

    if (matchedProvider?.id === 'ollama' && resolvedSettings.reasoningEffort !== 'default') {
        extraBody.reasoning_effort = resolvedSettings.reasoningEffort;
    }

    return {
        temperature: resolvedSettings.temperature,
        topP: resolvedSettings.topP,
        maxTokens: resolvedSettings.maxTokens,
        extraBody: Object.keys(extraBody).length > 0 ? extraBody : null,
        ollamaThink: resolvedSettings.reasoningEffort === 'default'
            ? null
            : resolvedSettings.reasoningEffort === 'none'
                ? false
                : resolvedSettings.reasoningEffort,
    };
}

export function isCloudSyncEnabledInStorage(): boolean {
    return localStorage.getItem(SETTINGS_KEYS.useCloudSync) === 'true';
}

export function setCloudSyncEnabledInStorage(enabled: boolean): void {
    localStorage.setItem(SETTINGS_KEYS.useCloudSync, String(enabled));
}
