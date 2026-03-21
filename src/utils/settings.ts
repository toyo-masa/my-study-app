export type ThemeMode = 'light' | 'dark' | 'monokai';
export type LocalLlmMode = 'webllm' | 'openai-local';
export interface HandwritingSettings {
    allowTouchDrawing: boolean;
}
export interface LocalLlmSettings {
    preferredMode: LocalLlmMode;
    baseUrl: string;
    defaultModelId: string;
    webllmSystemPrompt: string;
    webllmEnableThinking: boolean;
    webllmTemperature: number | null;
    webllmTopP: number | null;
    webllmMaxTokens: number | null;
    webllmPresencePenalty: number | null;
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
        webllmSystemPrompt: '',
        webllmEnableThinking: true,
        webllmTemperature: null,
        webllmTopP: null,
        webllmMaxTokens: null,
        webllmPresencePenalty: null,
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

export function normalizeLocalLlmSettings(raw: unknown): LocalLlmSettings {
    const source = raw && typeof raw === 'object'
        ? raw as Partial<LocalLlmSettings>
        : {};

    return {
        preferredMode: normalizeLocalLlmMode(source.preferredMode),
        baseUrl: normalizeLocalLlmBaseUrl(source.baseUrl),
        defaultModelId: normalizeLocalLlmModelId(source.defaultModelId),
        webllmSystemPrompt: normalizeLocalLlmSystemPrompt(source.webllmSystemPrompt),
        webllmEnableThinking: normalizeWebLlmEnableThinking(source.webllmEnableThinking),
        webllmTemperature: normalizeOptionalFiniteNumber(source.webllmTemperature, 0, 2),
        webllmTopP: normalizeOptionalFiniteNumber(source.webllmTopP, 0.01, 1),
        webllmMaxTokens: normalizeOptionalFiniteNumber(source.webllmMaxTokens, 1, 32768, true),
        webllmPresencePenalty: normalizeOptionalFiniteNumber(source.webllmPresencePenalty, -2, 2),
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
