import React from 'react';
import { X, Moon, Sun, Globe, Monitor, Type, LogOut, LogIn, User, Info, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReviewIntervalSettings } from '../utils/spacedRepetition';
import { normalizeReviewIntervalSettings } from '../utils/spacedRepetition';
import type { ThemeMode } from '../utils/settings';
import type { ReviewBoardSettings } from '../utils/quizSettings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    onToggleDarkMode: () => void;
    themeMode: ThemeMode;
    onThemeModeChange: (theme: ThemeMode) => void;
    accentColor: string;
    onAccentColorChange: (color: string) => void;
    reviewIntervalSettings: ReviewIntervalSettings;
    reviewBoardSettings: ReviewBoardSettings;
    onReviewIntervalSettingsChange: (settings: ReviewIntervalSettings) => void;
    onResetReviewIntervalSettings: () => void;
    onReviewBoardSettingsChange: (settings: ReviewBoardSettings) => void;
    onResetReviewBoardSettings: () => void;
    currentUsername?: string | null;
    onLogout?: () => void;
    onLoginRequest?: () => void;
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
    reviewIntervalSettings,
    reviewBoardSettings,
    onReviewIntervalSettingsChange,
    onResetReviewIntervalSettings,
    onReviewBoardSettingsChange,
    onResetReviewBoardSettings,
    currentUsername,
    onLogout,
    onLoginRequest
}) => {
    const exampleBaseDays = 4;
    const exampleCorrectDays = Math.max(1, Math.round(exampleBaseDays * reviewIntervalSettings.correctMultiplier));

    const handleReviewSettingChange = (field: keyof ReviewIntervalSettings, rawValue: string) => {
        const parsedValue = Number(rawValue);
        if (!Number.isFinite(parsedValue)) {
            return;
        }

        const nextSettings = normalizeReviewIntervalSettings({
            ...reviewIntervalSettings,
            [field]: parsedValue,
        });
        onReviewIntervalSettingsChange(nextSettings);
    };

    const handleReviewBoardBlockSizeChange = (rawValue: string) => {
        const parsedValue = Number(rawValue);
        if (!Number.isFinite(parsedValue)) {
            return;
        }

        onReviewBoardSettingsChange({
            ...reviewBoardSettings,
            feedbackBlockSize: parsedValue,
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
                                <div className="section-title">
                                    <Monitor size={18} />
                                    <span>コンテンツの表示</span>
                                </div>
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
                            </section>

                            <section className="settings-section">
                                <div className="section-title">
                                    <Type size={18} />
                                    <span>外観</span>
                                </div>
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
                            </section>

                            <section className="settings-section">
                                <div className="section-title">
                                    <div className="color-icon" style={{ backgroundColor: accentColor, width: 14, height: 14, borderRadius: '50%' }}></div>
                                    <span>アクセントカラー</span>
                                </div>
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
                            </section>

                            <section className="settings-section">
                                <details className="settings-collapsible" open>
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
                                                    <div className="review-setting-input-wrap">
                                                        <input
                                                            type="number"
                                                            className="field-input review-setting-input"
                                                            min={1}
                                                            max={365}
                                                            step={1}
                                                            value={reviewIntervalSettings.retryIntervalDays}
                                                            onChange={(e) => handleReviewSettingChange('retryIntervalDays', e.target.value)}
                                                        />
                                                        <span className="review-setting-unit">日</span>
                                                    </div>
                                                </label>
                                                <label className="review-setting-item">
                                                    <span className="review-setting-label">正解時の倍率</span>
                                                    <div className="review-setting-input-wrap">
                                                        <input
                                                            type="number"
                                                            className="field-input review-setting-input"
                                                            min={0.2}
                                                            max={10}
                                                            step={0.1}
                                                            value={reviewIntervalSettings.correctMultiplier}
                                                            onChange={(e) => handleReviewSettingChange('correctMultiplier', e.target.value)}
                                                        />
                                                        <span className="review-setting-unit">倍</span>
                                                    </div>
                                                </label>
                                            </div>

                                            <div className="review-settings-formula">
                                                <p className="review-settings-formula-title">次回日数の決まり方</p>
                                                <ul className="review-settings-formula-list">
                                                    <li>この問題を初めて解くときは、基準日数を1日として開始します。</li>
                                                    <li>正解したとき: 基準日数に {reviewIntervalSettings.correctMultiplier} を掛けて四捨五入します。</li>
                                                    <li>不正解・自信なしのとき: 常に {reviewIntervalSettings.retryIntervalDays} 日を採用します。</li>
                                                    <li>採用された日数が、次に解いたときの基準日数になります。</li>
                                                    <li>例: 基準日数が {exampleBaseDays} 日なら、正解時は {exampleCorrectDays} 日、不正解・自信なし時は {reviewIntervalSettings.retryIntervalDays} 日です。</li>
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
                                                    <div className="review-setting-input-wrap">
                                                        <input
                                                            type="number"
                                                            className="field-input review-setting-input"
                                                            min={1}
                                                            max={1000}
                                                            step={1}
                                                            value={reviewBoardSettings.feedbackBlockSize}
                                                            onChange={(e) => handleReviewBoardBlockSizeChange(e.target.value)}
                                                        />
                                                        <span className="review-setting-unit">問</span>
                                                    </div>
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
