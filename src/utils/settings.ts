export type ThemeMode = 'light' | 'dark' | 'monokai';
export interface HandwritingSettings {
    allowTouchDrawing: boolean;
}

const SETTINGS_KEYS = {
    theme: 'theme',
    accentColor: 'accentColor',
    useCloudSync: 'useCloudSync',
    handwritingSettings: 'handwritingSettings',
} as const;

const DEFAULT_SETTINGS = {
    theme: 'dark' as ThemeMode,
    accentColor: '#3b82f6',
    useCloudSync: true,
    handwritingSettings: {
        allowTouchDrawing: false,
    } as HandwritingSettings,
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

export function normalizeHandwritingSettings(raw: unknown): HandwritingSettings {
    const source = raw && typeof raw === 'object'
        ? raw as Partial<HandwritingSettings>
        : {};

    return {
        allowTouchDrawing: source.allowTouchDrawing === true,
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

export function isCloudSyncEnabledInStorage(): boolean {
    return localStorage.getItem(SETTINGS_KEYS.useCloudSync) === 'true';
}

export function setCloudSyncEnabledInStorage(enabled: boolean): void {
    localStorage.setItem(SETTINGS_KEYS.useCloudSync, String(enabled));
}
