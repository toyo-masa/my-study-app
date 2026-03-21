import { DEFAULT_WEB_LLM_MODEL_ID, WEB_LLM_QWEN_MODEL_OPTIONS } from './localLlmEngine';
export type ThemeMode = 'light' | 'dark' | 'monokai';
export type LocalLlmMode = 'webllm' | 'openai-local';

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
export const WEB_LLM_QWEN_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS_OPTIONS = [256, 384, 512, 768, 1024, 1280, 1536, 1792, 2048] as const;

export interface HandwritingSettings {
    allowTouchDrawing: boolean;
}
export interface LocalLlmSettings {
    preferredMode: LocalLlmMode;
    baseUrl: string;
    defaultModelId: string;
    webllmModelId: string;
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
}

const SETTINGS_KEYS = {
    theme: 'theme',
    accentColor: 'accentColor',
    useCloudSync: 'useCloudSync',
    handwritingSettings: 'handwritingSettings',
    localLlmSettings: 'localLlmSettings',
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
        baseUrl: 'http://localhost:1234/v1',
        defaultModelId: '',
        webllmModelId: DEFAULT_WEB_LLM_MODEL_ID,
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

const normalizeWebLlmModelId = (value: unknown): string => {
    const modelId = typeof value === 'string' ? value.trim() : '';
    if (WEB_LLM_QWEN_MODEL_OPTIONS.some((option) => option.value === modelId)) {
        return modelId;
    }
    return DEFAULT_WEB_LLM_MODEL_ID;
};

const normalizeLocalLlmSystemPrompt = (value: unknown): string => {
    return typeof value === 'string' ? value.trim() : '';
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
        webllmModelId: normalizeWebLlmModelId(source.webllmModelId),
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

export function isCloudSyncEnabledInStorage(): boolean {
    return localStorage.getItem(SETTINGS_KEYS.useCloudSync) === 'true';
}

export function setCloudSyncEnabledInStorage(enabled: boolean): void {
    localStorage.setItem(SETTINGS_KEYS.useCloudSync, String(enabled));
}
