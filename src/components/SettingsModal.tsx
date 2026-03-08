import React from 'react';
import { X, Moon, Sun, Globe, Monitor, Type, LogOut, LogIn, User, Info, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReviewIntervalSettings } from '../utils/spacedRepetition';
import { normalizeReviewIntervalSettings } from '../utils/spacedRepetition';
import type { ThemeMode } from '../utils/settings';

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
    onReviewIntervalSettingsChange: (settings: ReviewIntervalSettings) => void;
    onResetReviewIntervalSettings: () => void;
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
    onReviewIntervalSettingsChange,
    onResetReviewIntervalSettings,
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
                                <div className="section-title">
                                    <SlidersHorizontal size={18} />
                                    <span>復習設定</span>
                                </div>
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
                                    初期値に戻す
                                </button>
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
