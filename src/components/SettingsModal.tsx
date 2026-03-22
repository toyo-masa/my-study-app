import React, { useMemo } from 'react';
import { X, Moon, Sun, Globe, Monitor, LogOut, LogIn, User, Info, SlidersHorizontal, ChevronDown, Pencil, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReviewIntervalSettings } from '../utils/spacedRepetition';
import { normalizeReviewIntervalSettings } from '../utils/spacedRepetition';
import {
    WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY,
    WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET,
    WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS,
    WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS,
    WEB_LLM_QWEN_FIRST_PASS_THINKING_BUDGET_OPTIONS,
    WEB_LLM_QWEN_SECOND_PASS_DEFAULTS,
    WEB_LLM_QWEN_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS_OPTIONS,
    type HandwritingSettings,
    type LocalLlmSettings,
    type ThemeMode,
} from '../utils/settings';
import type { ReviewBoardSettings } from '../utils/quizSettings';
import { NumericStepper } from './NumericStepper';
import { getWebLlmModelOptions } from '../utils/localLlmEngine';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    onToggleDarkMode: () => void;
    themeMode: ThemeMode;
    onThemeModeChange: (theme: ThemeMode) => void;
    accentColor: string;
    onAccentColorChange: (color: string) => void;
    handwritingSettings: HandwritingSettings;
    localLlmSettings: LocalLlmSettings;
    reviewIntervalSettings: ReviewIntervalSettings;
    reviewBoardSettings: ReviewBoardSettings;
    onHandwritingSettingsChange: (settings: HandwritingSettings) => void;
    onLocalLlmSettingsChange: (settings: LocalLlmSettings) => void;
    onResetLocalLlmSettings: () => void;
    onResetHandwritingSettings: () => void;
    onReviewIntervalSettingsChange: (settings: ReviewIntervalSettings) => void;
    onResetReviewIntervalSettings: () => void;
    onReviewBoardSettingsChange: (settings: ReviewBoardSettings) => void;
    onResetReviewBoardSettings: () => void;
    currentUsername?: string | null;
    onLogout?: () => void;
    onLoginRequest?: () => void;
    showLocalLlmSettings?: boolean;
}

const PRESET_COLORS = [
    { name: 'Purple', value: '#6366f1' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#10b981' },
    { name: 'Orange', value: '#f59e0b' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Slate', value: '#64748b' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    isDarkMode,
    onToggleDarkMode,
    themeMode,
    onThemeModeChange,
    accentColor,
    onAccentColorChange,
    handwritingSettings,
    localLlmSettings,
    reviewIntervalSettings,
    reviewBoardSettings,
    onHandwritingSettingsChange,
    onLocalLlmSettingsChange,
    onResetLocalLlmSettings,
    onResetHandwritingSettings,
    onReviewIntervalSettingsChange,
    onResetReviewIntervalSettings,
    onReviewBoardSettingsChange,
    onResetReviewBoardSettings,
    currentUsername,
    onLogout,
    onLoginRequest,
    showLocalLlmSettings = false,
}) => {
    const exampleCorrectCount = 3;
    const exampleCorrectDays = Math.max(1, reviewIntervalSettings.correctIntervalDays * exampleCorrectCount);
    const webLlmModelOptions = useMemo(
        () => getWebLlmModelOptions(localLlmSettings.webllmModelId),
        [localLlmSettings.webllmModelId]
    );

    const parseOptionalNumberInput = (value: string): number | null => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            return null;
        }

        const parsed = Number.parseFloat(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const handleReviewSettingChange = (field: keyof ReviewIntervalSettings, nextValue: number) => {
        const nextSettings = normalizeReviewIntervalSettings({
            ...reviewIntervalSettings,
            [field]: nextValue,
        });
        onReviewIntervalSettingsChange(nextSettings);
    };

    const handleReviewBoardBlockSizeChange = (nextValue: number) => {
        onReviewBoardSettingsChange({
            ...reviewBoardSettings,
            feedbackBlockSize: nextValue,
        });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="settings-overlay" onClick={onClose}>
                    <motion.div
                        className="settings-panel"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="settings-header">
                            <h3>ページ設定</h3>
                            <button className="icon-btn" onClick={onClose}><X size={20} /></button>
                        </div>

                        <div className="settings-body">
                            {/* Account section */}
                            <section className="settings-section">
                                <div className="section-title">
                                    <User size={18} />
                                    <span>アカウント</span>
                                </div>
                                {currentUsername ? (
                                    <>
                                        <div className="setting-control">
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    width: 28, height: 28, borderRadius: '50%',
                                                    background: 'var(--primary-color)', color: '#fff',
                                                    fontSize: '0.8rem', fontWeight: 600
                                                }}>
                                                    {currentUsername.charAt(0).toUpperCase()}
                                                </span>
                                                {currentUsername}
                                            </span>
                                            {onLogout && (
                                                <button
                                                    className="nav-btn"
                                                    onClick={onLogout}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', padding: '0.3rem 0.7rem' }}
                                                >
                                                    <LogOut size={14} />
                                                    ログアウト
                                                </button>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '0' }}>
                                            クラウド同期が有効です
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div className="setting-control">
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ローカルモード（オフライン）</span>
                                            {onLoginRequest && (
                                                <button
                                                    className="nav-btn action-btn"
                                                    onClick={() => { onLoginRequest(); onClose(); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', padding: '0.3rem 0.7rem' }}
                                                >
                                                    <LogIn size={14} />
                                                    ログイン
                                                </button>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '0' }}>
                                            ログインするとクラウド同期が有効になります
                                        </p>
                                    </>
                                )}
                            </section>

                            <section className="settings-section">
                                <div className="section-title">
                                    <Globe size={18} />
                                    <span>地域 & 言語</span>
                                </div>
                                <div className="setting-item">
                                    <select className="setting-select" defaultValue="jp">
                                        <option value="jp">日本 (日本語)</option>
                                        <option value="en">English (US)</option>
                                    </select>
                                </div>
                            </section>

                            <section className="settings-section">
                                <details className="settings-collapsible">
                                    <summary className="section-title settings-collapsible-summary">
                                        <span className="settings-collapsible-title">
                                            <Monitor size={18} />
                                            <span>表示設定</span>
                                        </span>
                                        <ChevronDown size={16} className="settings-collapsible-chevron" />
                                    </summary>
                                    <div className="settings-collapsible-body">
                                        <div className="review-settings-card">
                                            <h4 className="review-settings-card-title">コンテンツの表示</h4>
                                            <div className="setting-control">
                                                <span>ダークモード</span>
                                                <label className="toggle-switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={isDarkMode}
                                                        onChange={onToggleDarkMode}
                                                    />
                                                    <span className="slider">
                                                        {isDarkMode ? <Moon size={12} /> : <Sun size={12} />}
                                                    </span>
                                                </label>
                                            </div>
                                            <div className="setting-control disabled">
                                                <span>ウィジェットを表示する</span>
                                                <label className="toggle-switch">
                                                    <input type="checkbox" disabled />
                                                    <span className="slider"></span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="review-settings-card">
                                            <h4 className="review-settings-card-title">外観</h4>
                                            <div className="appearance-grid">
                                                <div className={`appearance-option ${themeMode === 'light' ? 'active' : ''}`} onClick={() => onThemeModeChange('light')}>
                                                    <div className="appearance-preview light"></div>
                                                    <span>ライト</span>
                                                </div>
                                                <div className={`appearance-option ${themeMode === 'dark' ? 'active' : ''}`} onClick={() => onThemeModeChange('dark')}>
                                                    <div className="appearance-preview dark"></div>
                                                    <span>ダーク</span>
                                                </div>
                                                <div className={`appearance-option ${themeMode === 'monokai' ? 'active' : ''}`} onClick={() => onThemeModeChange('monokai')}>
                                                    <div className="appearance-preview monokai"></div>
                                                    <span>Monokai</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="review-settings-card">
                                            <h4 className="review-settings-card-title">アクセントカラー</h4>
                                            <div className="color-presets">
                                                {PRESET_COLORS.map(color => (
                                                    <button
                                                        key={color.value}
                                                        className={`color-preset-btn ${accentColor === color.value ? 'active' : ''}`}
                                                        style={{ backgroundColor: color.value }}
                                                        onClick={() => onAccentColorChange(color.value)}
                                                        title={color.name}
                                                    />
                                                ))}
                                                <div className="custom-color-picker">
                                                    <input
                                                        type="color"
                                                        value={accentColor}
                                                        onChange={(e) => onAccentColorChange(e.target.value)}
                                                        className="color-input"
                                                        title="カスタムカラーを選択"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </details>
                            </section>

                            {showLocalLlmSettings && (
                                <section className="settings-section">
                                    <details className="settings-collapsible">
                                        <summary className="section-title settings-collapsible-summary">
                                            <span className="settings-collapsible-title">
                                                <Bot size={18} />
                                                <span>ローカルLLM設定</span>
                                            </span>
                                            <ChevronDown size={16} className="settings-collapsible-chevron" />
                                        </summary>
                                        <div className="settings-collapsible-body">
                                            <div className="review-settings-card">
                                                <h4 className="review-settings-card-title">既定モード</h4>
                                                <p className="review-settings-note">
                                                    外出先では WebLLM、PC で高品質モデルを使うときは OpenAI互換ローカルAPI を既定にできます。
                                                </p>
                                                <div className="appearance-grid local-llm-settings-mode-grid">
                                                    <button
                                                        type="button"
                                                        className={`appearance-option ${localLlmSettings.preferredMode === 'webllm' ? 'active' : ''}`}
                                                        onClick={() => onLocalLlmSettingsChange({
                                                            ...localLlmSettings,
                                                            preferredMode: 'webllm',
                                                        })}
                                                    >
                                                        <div className="appearance-preview light"></div>
                                                        <span>WebLLM</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`appearance-option ${localLlmSettings.preferredMode === 'openai-local' ? 'active' : ''}`}
                                                        onClick={() => onLocalLlmSettingsChange({
                                                            ...localLlmSettings,
                                                            preferredMode: 'openai-local',
                                                        })}
                                                    >
                                                        <div className="appearance-preview dark"></div>
                                                        <span>ローカルAPI</span>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="review-settings-card">
                                                <h4 className="review-settings-card-title">ローカルAPI接続先</h4>
                                                <p className="review-settings-note">
                                                    LM Studio は通常 `http://localhost:1234/v1`、vLLM / SGLang は `http://localhost:8000/v1` を使います。
                                                </p>
                                                <div className="review-settings-grid">
                                                    <label className="review-setting-item">
                                                        <span className="review-setting-label">Base URL</span>
                                                        <input
                                                            type="text"
                                                            className="setting-select"
                                                            value={localLlmSettings.baseUrl}
                                                            onChange={(event) => onLocalLlmSettingsChange({
                                                                ...localLlmSettings,
                                                                baseUrl: event.target.value,
                                                            })}
                                                            placeholder="http://localhost:1234/v1"
                                                            spellCheck={false}
                                                        />
                                                    </label>
                                                    <label className="review-setting-item">
                                                        <span className="review-setting-label">既定モデル名</span>
                                                        <input
                                                            type="text"
                                                            className="setting-select"
                                                            value={localLlmSettings.defaultModelId}
                                                            onChange={(event) => onLocalLlmSettingsChange({
                                                                ...localLlmSettings,
                                                                defaultModelId: event.target.value,
                                                            })}
                                                            placeholder="Qwen/Qwen3.5-0.8B など"
                                                            spellCheck={false}
                                                        />
                                                    </label>
                                                </div>

                                                <p className="review-settings-note" style={{ marginTop: '0.9rem', marginBottom: 0 }}>
                                                    APIキーはここには保存せず、チャット画面を開いている間だけ入力します。
                                                </p>

                                                <button
                                                    type="button"
                                                    className="nav-btn"
                                                    onClick={onResetLocalLlmSettings}
                                                    style={{ marginTop: '0.9rem' }}
                                                >
                                                    ローカルLLM設定を初期値に戻す
                                                </button>
                                            </div>

                                            <div className="review-settings-card">
                                                <h4 className="review-settings-card-title">WebLLM モデル</h4>
                                                <p className="review-settings-note">
                                                    利用可能な候補から選択できます。保存済みの候補外 modelId がある場合は、その値も `(カスタム)` として表示します。
                                                </p>
                                                <div className="review-settings-grid">
                                                    <label className="review-setting-item">
                                                        <span className="review-setting-label">WebLLM モデル</span>
                                                        <select
                                                            className="setting-select"
                                                            value={localLlmSettings.webllmModelId}
                                                            onChange={(event) => onLocalLlmSettingsChange({
                                                                ...localLlmSettings,
                                                                webllmModelId: event.target.value,
                                                            })}
                                                        >
                                                            {webLlmModelOptions.map((option) => (
                                                                <option key={option.value} value={option.value}>
                                                                    {option.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="review-settings-card">
                                                <h4 className="review-settings-card-title">WebLLM システムプロンプト</h4>
                                                <p className="review-settings-note">
                                                    WebLLM モードで送信するときだけ、各会話の先頭に `system` メッセージとして追加します。ローカルAPIモードには適用しません。
                                                </p>
                                                <label className="review-setting-item">
                                                    <span className="review-setting-label">システムプロンプト</span>
                                                    <textarea
                                                        className="setting-select"
                                                        value={localLlmSettings.webllmSystemPrompt}
                                                        onChange={(event) => onLocalLlmSettingsChange({
                                                            ...localLlmSettings,
                                                            webllmSystemPrompt: event.target.value,
                                                        })}
                                                        placeholder="例: 数式は必要に応じて示し、ユーザーが求めた詳しさと形式に合わせて日本語で回答してください。"
                                                        rows={5}
                                                        style={{ resize: 'vertical', minHeight: 120 }}
                                                    />
                                                </label>
                                            </div>

                                            <div className="review-settings-card">
                                                <h4 className="review-settings-card-title">生成中の表示</h4>
                                                <p className="review-settings-note">
                                                    長文生成中の体感速度を優先したい場合は、更新頻度を落とす軽量表示へ切り替えられます。WebLLM とローカルAPI の両方に適用します。
                                                </p>
                                                <div className="appearance-grid local-llm-settings-mode-grid">
                                                    <button
                                                        type="button"
                                                        className={`appearance-option ${localLlmSettings.webllmStreamingRenderMode === 'live' ? 'active' : ''}`}
                                                        onClick={() => onLocalLlmSettingsChange({
                                                            ...localLlmSettings,
                                                            webllmStreamingRenderMode: 'live',
                                                        })}
                                                    >
                                                        <div className="appearance-preview light"></div>
                                                        <span>現行表示</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`appearance-option ${localLlmSettings.webllmStreamingRenderMode === 'lightweight' ? 'active' : ''}`}
                                                        onClick={() => onLocalLlmSettingsChange({
                                                            ...localLlmSettings,
                                                            webllmStreamingRenderMode: 'lightweight',
                                                        })}
                                                    >
                                                        <div className="appearance-preview dark"></div>
                                                        <span>軽量表示</span>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="review-settings-card">
                                                <h4 className="review-settings-card-title">WebLLM 生成パラメータ</h4>
                                                <p className="review-settings-note">
                                                    1回目は `temperature 0.6 / top_p 0.95 / thinking_budget 1024` から始め、2回目は `/no_think` を付けて最終回答へ移ります。
                                                </p>

                                                <div className="setting-control">
                                                    <span>Thinking モードを使う</span>
                                                    <label className="toggle-switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={localLlmSettings.webllmEnableThinking}
                                                            onChange={(event) => onLocalLlmSettingsChange({
                                                                ...localLlmSettings,
                                                                webllmEnableThinking: event.target.checked,
                                                            })}
                                                        />
                                                        <span className="slider"></span>
                                                    </label>
                                                </div>

                                                <div style={{ display: 'grid', gap: '1rem' }}>
                                                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '18px', padding: '1rem' }}>
                                                        <h5 className="review-settings-card-title" style={{ marginBottom: '0.35rem', fontSize: '0.98rem' }}>
                                                            1回目
                                                        </h5>
                                                        <p className="review-settings-note" style={{ marginBottom: '0.9rem' }}>
                                                            ここで調整しない場合は `temperature {WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature} / top_p {WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP}` を使います。
                                                        </p>
                                                        <div className="review-settings-grid">
                                                            <label className="review-setting-item">
                                                                <span className="review-setting-label">temperature</span>
                                                                <input
                                                                    type="number"
                                                                    className="setting-select"
                                                                    value={localLlmSettings.webllmFirstPassTemperature ?? ''}
                                                                    onChange={(event) => onLocalLlmSettingsChange({
                                                                        ...localLlmSettings,
                                                                        webllmFirstPassTemperature: parseOptionalNumberInput(event.target.value),
                                                                    })}
                                                                    placeholder={String(WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature)}
                                                                    min={0}
                                                                    max={2}
                                                                    step={0.05}
                                                                    inputMode="decimal"
                                                                />
                                                            </label>
                                                            <label className="review-setting-item">
                                                                <span className="review-setting-label">top_p</span>
                                                                <input
                                                                    type="number"
                                                                    className="setting-select"
                                                                    value={localLlmSettings.webllmFirstPassTopP ?? ''}
                                                                    onChange={(event) => onLocalLlmSettingsChange({
                                                                        ...localLlmSettings,
                                                                        webllmFirstPassTopP: parseOptionalNumberInput(event.target.value),
                                                                    })}
                                                                    placeholder={String(WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP)}
                                                                    min={0.01}
                                                                    max={1}
                                                                    step={0.01}
                                                                    inputMode="decimal"
                                                                />
                                                            </label>
                                                            <label className="review-setting-item">
                                                                <span className="review-setting-label">thinking_budget</span>
                                                                <select
                                                                    className="setting-select"
                                                                    value={String(localLlmSettings.webllmFirstPassThinkingBudget ?? WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET)}
                                                                    onChange={(event) => onLocalLlmSettingsChange({
                                                                        ...localLlmSettings,
                                                                        webllmFirstPassThinkingBudget: Number.parseInt(event.target.value, 10),
                                                                    })}
                                                                >
                                                                    {WEB_LLM_QWEN_FIRST_PASS_THINKING_BUDGET_OPTIONS.map((budget) => (
                                                                        <option key={budget} value={budget}>
                                                                            {budget}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                            <label className="review-setting-item">
                                                                <span className="review-setting-label">presence_penalty</span>
                                                                <input
                                                                    type="number"
                                                                    className="setting-select"
                                                                    value={localLlmSettings.webllmFirstPassPresencePenalty ?? ''}
                                                                    onChange={(event) => onLocalLlmSettingsChange({
                                                                        ...localLlmSettings,
                                                                        webllmFirstPassPresencePenalty: parseOptionalNumberInput(event.target.value),
                                                                    })}
                                                                    placeholder={String(WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY)}
                                                                    min={0.3}
                                                                    max={0.6}
                                                                    step={0.05}
                                                                    inputMode="decimal"
                                                                />
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '18px', padding: '1rem' }}>
                                                        <h5 className="review-settings-card-title" style={{ marginBottom: '0.35rem', fontSize: '0.98rem' }}>
                                                            2回目
                                                        </h5>
                                                        <p className="review-settings-note" style={{ marginBottom: '0.9rem' }}>
                                                            `/no_think` を付けて最終回答を生成します。
                                                        </p>
                                                        <div className="review-settings-grid">
                                                            <label className="review-setting-item">
                                                                <span className="review-setting-label">temperature</span>
                                                                <input
                                                                    type="number"
                                                                    className="setting-select"
                                                                    value={localLlmSettings.webllmSecondPassTemperature ?? ''}
                                                                    onChange={(event) => onLocalLlmSettingsChange({
                                                                        ...localLlmSettings,
                                                                        webllmSecondPassTemperature: parseOptionalNumberInput(event.target.value),
                                                                    })}
                                                                    placeholder={String(WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.temperature)}
                                                                    min={0.5}
                                                                    max={0.7}
                                                                    step={0.05}
                                                                    inputMode="decimal"
                                                                />
                                                            </label>
                                                            <label className="review-setting-item">
                                                                <span className="review-setting-label">top_p</span>
                                                                <input
                                                                    type="number"
                                                                    className="setting-select"
                                                                    value={localLlmSettings.webllmSecondPassTopP ?? ''}
                                                                    onChange={(event) => onLocalLlmSettingsChange({
                                                                        ...localLlmSettings,
                                                                        webllmSecondPassTopP: parseOptionalNumberInput(event.target.value),
                                                                    })}
                                                                    placeholder={String(WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.topP)}
                                                                    min={0.8}
                                                                    max={0.9}
                                                                    step={0.01}
                                                                    inputMode="decimal"
                                                                />
                                                            </label>
                                                            <label className="review-setting-item">
                                                                <span className="review-setting-label">final_answer_max_tokens</span>
                                                                <select
                                                                    className="setting-select"
                                                                    value={String(localLlmSettings.webllmSecondPassFinalAnswerMaxTokens ?? WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS)}
                                                                    onChange={(event) => onLocalLlmSettingsChange({
                                                                        ...localLlmSettings,
                                                                        webllmSecondPassFinalAnswerMaxTokens: Number.parseInt(event.target.value, 10),
                                                                    })}
                                                                >
                                                                    {WEB_LLM_QWEN_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS_OPTIONS.map((maxTokens) => (
                                                                        <option key={maxTokens} value={maxTokens}>
                                                                            {maxTokens}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                            <label className="review-setting-item">
                                                                <span className="review-setting-label">presence_penalty</span>
                                                                <input
                                                                    type="number"
                                                                    className="setting-select"
                                                                    value={localLlmSettings.webllmSecondPassPresencePenalty ?? ''}
                                                                    onChange={(event) => onLocalLlmSettingsChange({
                                                                        ...localLlmSettings,
                                                                        webllmSecondPassPresencePenalty: parseOptionalNumberInput(event.target.value),
                                                                    })}
                                                                    placeholder={String(WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.presencePenalty)}
                                                                    min={0}
                                                                    max={0.3}
                                                                    step={0.05}
                                                                    inputMode="decimal"
                                                                />
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </details>
                                </section>
                            )}

                            <section className="settings-section">
                                <details className="settings-collapsible">
                                    <summary className="section-title settings-collapsible-summary">
                                        <span className="settings-collapsible-title">
                                            <Pencil size={18} />
                                            <span>手書き設定</span>
                                        </span>
                                        <ChevronDown size={16} className="settings-collapsible-chevron" />
                                    </summary>
                                    <div className="settings-collapsible-body">
                                        <div className="review-settings-card">
                                            <h4 className="review-settings-card-title">入力方法</h4>
                                            <div className="setting-control">
                                                <span>指でも描く</span>
                                                <label className="toggle-switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={handwritingSettings.allowTouchDrawing}
                                                        onChange={(event) => onHandwritingSettingsChange({
                                                            ...handwritingSettings,
                                                            allowTouchDrawing: event.target.checked,
                                                        })}
                                                    />
                                                    <span className="slider"></span>
                                                </label>
                                            </div>
                                            <p className="review-settings-note" style={{ margin: 0 }}>
                                                オフのときは Apple Pencil とマウスを優先し、指では描画しません。必要なときだけオンにできます。
                                            </p>
                                            <button
                                                type="button"
                                                className="nav-btn"
                                                onClick={onResetHandwritingSettings}
                                                style={{ marginTop: '0.9rem' }}
                                            >
                                                手書き設定を初期値に戻す
                                            </button>
                                        </div>
                                    </div>
                                </details>
                            </section>

                            <section className="settings-section">
                                <details className="settings-collapsible">
                                    <summary className="section-title settings-collapsible-summary">
                                        <span className="settings-collapsible-title">
                                            <SlidersHorizontal size={18} />
                                            <span>復習設定</span>
                                        </span>
                                        <ChevronDown size={16} className="settings-collapsible-chevron" />
                                    </summary>
                                    <div className="settings-collapsible-body">
                                        <div className="review-settings-card">
                                            <h4 className="review-settings-card-title">復習日程</h4>
                                            <p className="review-settings-note">
                                                復習間隔の計算に使う値を調整できます。変更内容は次回の復習判定から反映されます。
                                            </p>
                                            <div className="review-settings-grid">
                                                <label className="review-setting-item">
                                                    <span className="review-setting-label">不正解・自信なし時の次回間隔</span>
                                                    <NumericStepper
                                                        value={reviewIntervalSettings.retryIntervalDays}
                                                        min={1}
                                                        max={365}
                                                        step={1}
                                                        onChange={(value) => handleReviewSettingChange('retryIntervalDays', value)}
                                                        trailingLabel="日"
                                                        decreaseAriaLabel="不正解時の次回間隔を減らす"
                                                        increaseAriaLabel="不正解時の次回間隔を増やす"
                                                    />
                                                </label>
                                                <label className="review-setting-item">
                                                    <span className="review-setting-label">正解時の基準日数</span>
                                                    <NumericStepper
                                                        value={reviewIntervalSettings.correctIntervalDays}
                                                        min={1}
                                                        max={365}
                                                        step={1}
                                                        onChange={(value) => handleReviewSettingChange('correctIntervalDays', value)}
                                                        trailingLabel="日"
                                                        decreaseAriaLabel="正解時の基準日数を減らす"
                                                        increaseAriaLabel="正解時の基準日数を増やす"
                                                    />
                                                </label>
                                            </div>

                                            <div className="review-settings-formula">
                                                <p className="review-settings-formula-title">次回日数の決まり方</p>
                                                <ul className="review-settings-formula-list">
                                                    <li>正解したときは、その問題の連続正解数に応じて次回日数を増やします。</li>
                                                    <li>正解したとき: {reviewIntervalSettings.correctIntervalDays} 日 × 連続正解数 を次回日数にします。</li>
                                                    <li>不正解・自信なしのとき: 常に {reviewIntervalSettings.retryIntervalDays} 日を採用します。</li>
                                                    <li>不正解になると連続正解数は 0 に戻り、次の正解時は 1 回目として数え直します。</li>
                                                    <li>例: 連続正解数が {exampleCorrectCount} 回なら、正解時は {reviewIntervalSettings.correctIntervalDays} × {exampleCorrectCount} = {exampleCorrectDays} 日、不正解・自信なし時は {reviewIntervalSettings.retryIntervalDays} 日です。</li>
                                                </ul>
                                            </div>

                                            <button
                                                type="button"
                                                className="nav-btn"
                                                onClick={onResetReviewIntervalSettings}
                                            >
                                                復習日程を初期値に戻す
                                            </button>
                                        </div>

                                        <div className="review-settings-card">
                                            <h4 className="review-settings-card-title">復習ボードの回答確認間隔</h4>
                                            <p className="review-settings-note">
                                                復習ボードから新しく開始した学習で、何問ごとに正解と解説をまとめて確認するかを指定します。
                                            </p>
                                            <div className="review-settings-grid">
                                                <label className="review-setting-item">
                                                    <span className="review-setting-label">まとめて確認する問題数</span>
                                                    <NumericStepper
                                                        value={reviewBoardSettings.feedbackBlockSize}
                                                        min={1}
                                                        max={1000}
                                                        step={1}
                                                        onChange={handleReviewBoardBlockSizeChange}
                                                        trailingLabel="問"
                                                        decreaseAriaLabel="復習ボードの回答確認間隔を減らす"
                                                        increaseAriaLabel="復習ボードの回答確認間隔を増やす"
                                                    />
                                                </label>
                                            </div>

                                            <div className="review-settings-formula">
                                                <p className="review-settings-formula-title">使われ方</p>
                                                <ul className="review-settings-formula-list">
                                                    <li>1問なら、1問回答するたびに正解と解説を確認できます。</li>
                                                    <li>2問以上なら、その問数を回答したあとにまとめて確認できます。</li>
                                                    <li>実際の復習問題数を超える値を入れていても、その回の問題数まで自動で調整します。</li>
                                                </ul>
                                            </div>

                                            <button
                                                type="button"
                                                className="nav-btn"
                                                onClick={onResetReviewBoardSettings}
                                            >
                                                復習ボード設定を初期値に戻す
                                            </button>
                                        </div>
                                    </div>
                                </details>
                            </section>

                            <section className="settings-section">
                                <div className="section-title">
                                    <Info size={18} />
                                    <span>アプリ情報</span>
                                </div>
                                <div className="setting-control">
                                    <span>バージョン</span>
                                    <span style={{ fontSize: '0.9rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>v{__APP_VERSION__}</span>
                                </div>
                                <div className="setting-control">
                                    <a href="/release-notes" onClick={() => onClose()} style={{ color: 'var(--primary-color)', textDecoration: 'none', fontSize: '0.9rem' }}>更新履歴（リリースノート）を見る</a>
                                </div>
                            </section>
                        </div>

                        <div className="settings-footer">
                            <p className="settings-hint">設定は自動的に保存されます</p>
                        </div>
                    </motion.div>
                </div >
            )}
        </AnimatePresence >
    );
};
