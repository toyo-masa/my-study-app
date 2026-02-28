export type ThemeMode = 'light' | 'dark' | 'monokai';

const SETTINGS_KEYS = {
    theme: 'theme',
    accentColor: 'accentColor',
    useCloudSync: 'useCloudSync',
} as const;

const DEFAULT_SETTINGS = {
    theme: 'dark' as ThemeMode,
    accentColor: '#3b82f6',
    useCloudSync: true,
} as const;

export function ensureLocalSettingsInitialized(): void {
    if (localStorage.getItem(SETTINGS_KEYS.theme) === null) {
        localStorage.setItem(SETTINGS_KEYS.theme, DEFAULT_SETTINGS.theme);
    }

    if (localStorage.getItem(SETTINGS_KEYS.useCloudSync) === null) {
        localStorage.setItem(SETTINGS_KEYS.useCloudSync, String(DEFAULT_SETTINGS.useCloudSync));
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

export function isCloudSyncEnabledInStorage(): boolean {
    return localStorage.getItem(SETTINGS_KEYS.useCloudSync) === 'true';
}

export function setCloudSyncEnabledInStorage(enabled: boolean): void {
    localStorage.setItem(SETTINGS_KEYS.useCloudSync, String(enabled));
}
