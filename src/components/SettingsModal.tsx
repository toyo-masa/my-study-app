import React, { useMemo, useRef, useState } from 'react';
import { X, Moon, Sun, Globe, Monitor, LogOut, LogIn, User, Info, SlidersHorizontal, ChevronDown, Pencil, Bot, LoaderCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReviewIntervalSettings } from '../utils/spacedRepetition';
import { normalizeReviewIntervalSettings } from '../utils/spacedRepetition';
import {
    type HandwritingSettings,
    type LocalLlmSettings,
    type StudyEffectSettings,
    type ThemeMode,
} from '../utils/settings';
import {
    DEFAULT_LOCAL_API_BASE_URL,
    findLocalApiProviderByBaseUrl,
    LOCAL_API_PROVIDER_PRESETS,
} from '../utils/localApiProviders';
import type { ReviewBoardSettings } from '../utils/quizSettings';
import { NumericStepper } from './NumericStepper';
import { getGroupedWebLlmModelOptions } from '../utils/localLlmEngine';
import { fetchOpenAiCompatibleModelIds } from '../utils/openAiCompatibleLocalApi';

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
    studyEffectSettings: StudyEffectSettings;
    localLlmSettings: LocalLlmSettings;
    reviewIntervalSettings: ReviewIntervalSettings;
    reviewBoardSettings: ReviewBoardSettings;
    onHandwritingSettingsChange: (settings: HandwritingSettings) => void;
    onStudyEffectSettingsChange: (settings: StudyEffectSettings) => void;
    onLocalLlmSettingsChange: (settings: LocalLlmSettings) => void;
    onResetHandwritingSettings: () => void;
    onResetStudyEffectSettings: () => void;
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
    studyEffectSettings,
    localLlmSettings,
    reviewIntervalSettings,
    reviewBoardSettings,
    onHandwritingSettingsChange,
    onStudyEffectSettingsChange,
    onLocalLlmSettingsChange,
    onResetHandwritingSettings,
    onResetStudyEffectSettings,
    onReviewIntervalSettingsChange,
    onResetReviewIntervalSettings,
    onReviewBoardSettingsChange,
    onResetReviewBoardSettings,
    currentUsername,
    onLogout,
    onLoginRequest,
    showLocalLlmSettings = false,
}) => {
    const [localApiConnectionCheck, setLocalApiConnectionCheck] = useState<{
        baseUrl: string;
        status: 'idle' | 'loading' | 'success' | 'error';
        message: string;
    }>({
        baseUrl: '',
        status: 'idle',
        message: '',
    });
    const exampleCorrectCount = 3;
    const exampleCorrectDays = Math.max(1, reviewIntervalSettings.correctIntervalDays * exampleCorrectCount);
    const webLlmModelOptionGroups = useMemo(
        () => getGroupedWebLlmModelOptions(localLlmSettings.webllmModelId),
        [localLlmSettings.webllmModelId]
    );
    const matchedLocalApiProvider = useMemo(
        () => findLocalApiProviderByBaseUrl(localLlmSettings.baseUrl),
        [localLlmSettings.baseUrl]
    );
    const localApiConnectionCheckRequestIdRef = useRef(0);
    const trimmedBaseUrl = localLlmSettings.baseUrl.trim();
    const activeLocalApiConnectionCheck = localApiConnectionCheck.baseUrl === trimmedBaseUrl
        ? localApiConnectionCheck
        : { baseUrl: trimmedBaseUrl, status: 'idle' as const, message: '' };

    const handleCheckLocalApiConnection = async () => {
        const baseUrl = trimmedBaseUrl;
        if (baseUrl.length === 0) {
            setLocalApiConnectionCheck({
                baseUrl: '',
                status: 'error',
                message: 'Base URL を入力してください。',
            });
            return;
        }

        const requestId = localApiConnectionCheckRequestIdRef.current + 1;
        localApiConnectionCheckRequestIdRef.current = requestId;
        setLocalApiConnectionCheck({
            baseUrl,
            status: 'loading',
            message: '接続確認中...',
        });

        try {
            const modelIds = await fetchOpenAiCompatibleModelIds(baseUrl, undefined, undefined, { force: true });
            if (localApiConnectionCheckRequestIdRef.current !== requestId) {
                return;
            }
            setLocalApiConnectionCheck({
                baseUrl,
                status: 'success',
                message: `接続できました（${modelIds.length}件）。`,
            });
        } catch (error) {
            if (localApiConnectionCheckRequestIdRef.current !== requestId) {
                return;
            }
            setLocalApiConnectionCheck({
                baseUrl,
                status: 'error',
                message: error instanceof Error ? error.message : 'ローカルAPIへ接続できませんでした。',
            });
        }
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

    const handleReviewBoardMasteryThresholdChange = (nextValue: number) => {
        onReviewBoardSettingsChange({
            ...reviewBoardSettings,
            masteryThreshold: nextValue,
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
                                            <div className="setting-control">
                                                <span>正解時のエフェクト</span>
                                                <label className="toggle-switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={studyEffectSettings.enableCorrectRevealEffect}
                                                        onChange={(event) => onStudyEffectSettingsChange({
                                                            ...studyEffectSettings,
                                                            enableCorrectRevealEffect: event.target.checked,
                                                        })}
                                                    />
                                                    <span className="slider"></span>
                                                </label>
                                            </div>
                                            <p className="review-settings-note" style={{ marginTop: '0.75rem' }}>
                                                回答確認で正解だったときに、操作を邪魔しない短い演出を表示します。
                                            </p>
                                            <div className="setting-control disabled">
                                                <span>ウィジェットを表示する</span>
                                                <label className="toggle-switch">
                                                    <input type="checkbox" disabled />
                                                    <span className="slider"></span>
                                                </label>
                                            </div>
                                            <button
                                                type="button"
                                                className="reset-settings-btn"
                                                style={{ marginTop: '0.9rem' }}
                                                onClick={onResetStudyEffectSettings}
                                            >
                                                正解エフェクト設定を初期値に戻す
                                            </button>
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
                                                <h4 className="review-settings-card-title">ローカルAPI接続先</h4>
                                                <p className="review-settings-note">
                                                    学習アプリから単体PCのローカルAPIを叩く用途では Ollama をおすすめします。vLLM は Linux + 対応GPU を使う常設環境向けです。
                                                </p>
                                                <div className="local-llm-provider-pill-row">
                                                    {LOCAL_API_PROVIDER_PRESETS.map((preset) => (
                                                        <button
                                                            key={preset.id}
                                                            type="button"
                                                            className={`local-llm-provider-pill ${matchedLocalApiProvider?.id === preset.id ? 'active' : ''}`}
                                                            onClick={() => onLocalLlmSettingsChange({
                                                                ...localLlmSettings,
                                                                baseUrl: preset.baseUrl,
                                                            })}
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="review-settings-note" style={{ marginTop: '0.9rem' }}>
                                                    上の候補を選ぶと Base URL だけ自動で入ります。独自の接続先を使う場合だけ、下を直接編集してください。
                                                </p>
                                                <label className="review-setting-item" style={{ marginTop: '0.9rem' }}>
                                                    <span className="review-setting-label">Base URL</span>
                                                    <input
                                                        type="text"
                                                        className="setting-select"
                                                        value={localLlmSettings.baseUrl}
                                                        onChange={(event) => onLocalLlmSettingsChange({
                                                            ...localLlmSettings,
                                                            baseUrl: event.target.value,
                                                        })}
                                                        placeholder={DEFAULT_LOCAL_API_BASE_URL}
                                                        spellCheck={false}
                                                    />
                                                </label>
                                                <div className="local-llm-connection-check-row">
                                                    <button
                                                        type="button"
                                                        className="local-llm-connection-check-btn"
                                                        onClick={() => { void handleCheckLocalApiConnection(); }}
                                                        disabled={activeLocalApiConnectionCheck.status === 'loading'}
                                                    >
                                                        {activeLocalApiConnectionCheck.status === 'loading' && (
                                                            <LoaderCircle size={14} className="spin" />
                                                        )}
                                                        <span>接続確認</span>
                                                    </button>
                                                    {activeLocalApiConnectionCheck.status !== 'idle' && (
                                                        <span
                                                            className={`local-llm-connection-check-status ${activeLocalApiConnectionCheck.status === 'error' ? 'is-error' : 'is-success'}`}
                                                        >
                                                            {activeLocalApiConnectionCheck.message}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="review-settings-card">
                                                <h4 className="review-settings-card-title">生成パラメータの設定場所</h4>
                                                <p className="review-settings-note">
                                                    `temperature`、`top_p`、`max_tokens`、`reasoning_effort`、WebLLM の生成パラメータは、設定画面ではなくチャット欄のスライダーからモデルごとに調整してください。
                                                </p>
                                                <p className="review-settings-note">
                                                    設定場所が分かれると紛らわしいため、この画面からは変更できないようにしました。
                                                </p>
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
                                                            {webLlmModelOptionGroups.map((group) => (
                                                                <optgroup key={group.label} label={group.label}>
                                                                    {group.options.map((option) => (
                                                                        <option key={option.value} value={option.value}>
                                                                            {option.label}
                                                                        </option>
                                                                    ))}
                                                                </optgroup>
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
                                            <h4 className="review-settings-card-title">復習ボード設定</h4>
                                            <p className="review-settings-note">
                                                復習ボードから始める学習で、何問ごとにまとめて回答確認するかと、何回連続で安定した問題を習得済みとして外すかを指定します。
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
                                                <label className="review-setting-item">
                                                    <span className="review-setting-label">習得済みとみなす連続回数</span>
                                                    <NumericStepper
                                                        value={reviewBoardSettings.masteryThreshold}
                                                        min={1}
                                                        max={1000}
                                                        step={1}
                                                        onChange={handleReviewBoardMasteryThresholdChange}
                                                        trailingLabel="回"
                                                        decreaseAriaLabel="習得済み判定の連続回数を減らす"
                                                        increaseAriaLabel="習得済み判定の連続回数を増やす"
                                                    />
                                                </label>
                                            </div>

                                            <div className="review-settings-formula">
                                                <p className="review-settings-formula-title">使われ方</p>
                                                <ul className="review-settings-formula-list">
                                                    <li>1問なら、1問回答するたびに正解と解説を確認できます。</li>
                                                    <li>2問以上なら、その問数を回答したあとにまとめて確認できます。</li>
                                                    <li>実際の復習問題数を超える値を入れていても、その回の問題数まで自動で調整します。</li>
                                                    <li>問題集は、「正解かつ復習に回さない」が {reviewBoardSettings.masteryThreshold} 回続くと習得済みとして復習ボードから外れます。</li>
                                                    <li>暗記カードは、「完全に覚えた」が {reviewBoardSettings.masteryThreshold} 回続くと習得済みとして復習ボードから外れます。</li>
                                                    <li>その後に不正解や「復習に回す」「覚えていない」が入ると、条件を満たさなくなった時点で復習対象に戻ります。</li>
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
