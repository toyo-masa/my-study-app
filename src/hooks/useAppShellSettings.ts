import { useEffect, useState } from 'react';
import {
    DEFAULT_REVIEW_INTERVAL_SETTINGS,
    loadReviewIntervalSettings,
    normalizeReviewIntervalSettings,
    saveReviewIntervalSettings,
    type ReviewIntervalSettings,
} from '../utils/spacedRepetition';
import {
    DEFAULT_HANDWRITING_SETTINGS,
    DEFAULT_LOCAL_LLM_SETTINGS,
    getStoredAccentColor,
    getStoredThemeMode,
    loadHandwritingSettings,
    loadLocalLlmSettings,
    normalizeHandwritingSettings,
    normalizeLocalLlmSettings,
    saveHandwritingSettings,
    saveLocalLlmSettings,
    setStoredAccentColor,
    setStoredThemeMode,
    type HandwritingSettings,
    type LocalLlmSettings,
    type ThemeMode,
} from '../utils/settings';
import {
    DEFAULT_REVIEW_BOARD_SETTINGS,
    loadReviewBoardSettings,
    normalizeReviewBoardSettings,
    saveReviewBoardSettings,
    type ReviewBoardSettings,
} from '../utils/quizSettings';
import type { QuizSetWithMeta } from '../types';

const APP_TITLE_PREFIX = 'qa';
const APP_TITLE_SEPARATOR = ' - ';
type LocalLlmSettingsUpdater = LocalLlmSettings | ((previous: LocalLlmSettings) => LocalLlmSettings);

const buildPageTitle = (...segments: string[]): string => {
    return segments.filter(Boolean).join(APP_TITLE_SEPARATOR);
};

function resolvePageTitle(pathname: string, quizSets: QuizSetWithMeta[]): string {
    if (pathname === '/') return buildPageTitle(APP_TITLE_PREFIX, 'ホーム');
    if (pathname === '/distribution-sim') return buildPageTitle(APP_TITLE_PREFIX, '分布シミュレーター');
    if (pathname === '/distribution-tables') return buildPageTitle(APP_TITLE_PREFIX, '統計分布表');
    if (pathname === '/local-llm-chat') return buildPageTitle(APP_TITLE_PREFIX, 'ローカルLLMチャット');
    if (pathname === '/review-board') return buildPageTitle(APP_TITLE_PREFIX, '復習ボード');
    if (pathname === '/tutorial') return buildPageTitle(APP_TITLE_PREFIX, 'チュートリアル');
    if (pathname === '/release-notes') return buildPageTitle(APP_TITLE_PREFIX, 'リリースノート');

    const quizRouteMatch = pathname.match(/^\/quiz\/(\d+)(?:\/([a-z-]+))?$/);
    if (quizRouteMatch) {
        const quizSetId = Number.parseInt(quizRouteMatch[1], 10);
        const section = quizRouteMatch[2] ?? 'detail';
        const quizSetName = quizSets.find((quizSet) => quizSet.id === quizSetId)?.name;
        const pageLabel = section === 'detail'
            ? '問題集詳細'
            : section === 'manage'
                ? '問題設定'
                : section === 'study'
                    ? '問題演習'
                    : section === 'memorization'
                        ? '暗記学習'
                        : section === 'history-table'
                            ? '回答履歴テーブル'
                            : '問題集';

        if (quizSetName) {
            return buildPageTitle(APP_TITLE_PREFIX, quizSetName, pageLabel);
        }
        return buildPageTitle(APP_TITLE_PREFIX, pageLabel);
    }

    return APP_TITLE_PREFIX;
}

const hexToRgbString = (hex: string): string | null => {
    const match = hex.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!match) return null;
    let value = match[1];
    if (value.length === 3) {
        value = value.split('').map((ch) => ch + ch).join('');
    }
    const intValue = Number.parseInt(value, 16);
    if (Number.isNaN(intValue)) return null;
    const r = (intValue >> 16) & 255;
    const g = (intValue >> 8) & 255;
    const b = intValue & 255;
    return `${r}, ${g}, ${b}`;
};

const adjustColor = (hex: string, amount: number): string => {
    const match = hex.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!match) return hex;
    let value = match[1];
    if (value.length === 3) {
        value = value.split('').map((ch) => ch + ch).join('');
    }
    const intValue = Number.parseInt(value, 16);
    let r = (intValue >> 16) & 255;
    let g = (intValue >> 8) & 255;
    let b = intValue & 255;

    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));

    const rr = r.toString(16).padStart(2, '0');
    const gg = g.toString(16).padStart(2, '0');
    const bb = b.toString(16).padStart(2, '0');

    return `#${rr}${gg}${bb}`;
};

const normalizeThemeMode = (value: string | null): ThemeMode => {
    if (value === 'light' || value === 'dark' || value === 'monokai') {
        return value;
    }
    return 'dark';
};

export function useAppShellSettings(pathname: string, quizSets: QuizSetWithMeta[]) {
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
        return normalizeThemeMode(getStoredThemeMode());
    });
    const isDarkMode = themeMode !== 'light';
    const [accentColor, setAccentColor] = useState(() => {
        return getStoredAccentColor();
    });
    const [reviewIntervalSettings, setReviewIntervalSettings] = useState<ReviewIntervalSettings>(() => {
        return loadReviewIntervalSettings();
    });
    const [reviewBoardSettings, setReviewBoardSettings] = useState<ReviewBoardSettings>(() => {
        return loadReviewBoardSettings();
    });
    const [handwritingSettings, setHandwritingSettings] = useState<HandwritingSettings>(() => {
        return loadHandwritingSettings();
    });
    const [localLlmSettings, setLocalLlmSettings] = useState<LocalLlmSettings>(() => {
        return loadLocalLlmSettings();
    });

    useEffect(() => {
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.body.classList.toggle('theme-monokai', themeMode === 'monokai');
        setStoredThemeMode(themeMode);
    }, [isDarkMode, themeMode]);

    useEffect(() => {
        document.documentElement.style.setProperty('--primary-color', accentColor);
        const primaryColorRgb = hexToRgbString(accentColor);
        if (primaryColorRgb) {
            document.documentElement.style.setProperty('--primary-color-rgb', primaryColorRgb);
        }

        const secondaryColor = adjustColor(accentColor, isDarkMode ? 30 : -30);
        document.documentElement.style.setProperty('--secondary-color', secondaryColor);

        setStoredAccentColor(accentColor);
    }, [accentColor, isDarkMode]);

    useEffect(() => {
        saveReviewIntervalSettings(reviewIntervalSettings);
    }, [reviewIntervalSettings]);

    useEffect(() => {
        saveReviewBoardSettings(reviewBoardSettings);
    }, [reviewBoardSettings]);

    useEffect(() => {
        saveHandwritingSettings(handwritingSettings);
    }, [handwritingSettings]);

    useEffect(() => {
        saveLocalLlmSettings(localLlmSettings);
    }, [localLlmSettings]);

    useEffect(() => {
        document.title = resolvePageTitle(pathname, quizSets);
    }, [pathname, quizSets]);

    const toggleDarkMode = () => setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
    const handleReviewIntervalSettingsChange = (settings: ReviewIntervalSettings) => {
        setReviewIntervalSettings(normalizeReviewIntervalSettings(settings));
    };
    const handleResetReviewIntervalSettings = () => {
        setReviewIntervalSettings({ ...DEFAULT_REVIEW_INTERVAL_SETTINGS });
    };
    const handleReviewBoardSettingsChange = (settings: ReviewBoardSettings) => {
        setReviewBoardSettings(normalizeReviewBoardSettings(settings));
    };
    const handleResetReviewBoardSettings = () => {
        setReviewBoardSettings({ ...DEFAULT_REVIEW_BOARD_SETTINGS });
    };
    const handleHandwritingSettingsChange = (settings: HandwritingSettings) => {
        setHandwritingSettings(normalizeHandwritingSettings(settings));
    };
    const handleResetHandwritingSettings = () => {
        setHandwritingSettings({ ...DEFAULT_HANDWRITING_SETTINGS });
    };
    const handleLocalLlmSettingsChange = (settings: LocalLlmSettingsUpdater) => {
        setLocalLlmSettings((previous) => normalizeLocalLlmSettings(
            typeof settings === 'function' ? settings(previous) : settings
        ));
    };
    const handleResetLocalLlmSettings = () => {
        setLocalLlmSettings({ ...DEFAULT_LOCAL_LLM_SETTINGS });
    };

    return {
        themeMode,
        setThemeMode,
        isDarkMode,
        accentColor,
        setAccentColor,
        reviewIntervalSettings,
        reviewBoardSettings,
        handwritingSettings,
        localLlmSettings,
        toggleDarkMode,
        handleReviewIntervalSettingsChange,
        handleResetReviewIntervalSettings,
        handleReviewBoardSettingsChange,
        handleResetReviewBoardSettings,
        handleHandwritingSettingsChange,
        handleResetHandwritingSettings,
        handleLocalLlmSettingsChange,
        handleResetLocalLlmSettings,
    };
}
