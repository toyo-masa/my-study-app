import React from 'react';
import { X, Moon, Sun, Globe, Monitor, Type, LogOut, LogIn, User, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    onToggleDarkMode: () => void;
    accentColor: string;
    onAccentColorChange: (color: string) => void;
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
    accentColor,
    onAccentColorChange,
    currentUsername,
    onLogout,
    onLoginRequest
}) => {
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
                                    <div className={`appearance-option ${!isDarkMode ? 'active' : ''}`} onClick={() => isDarkMode && onToggleDarkMode()}>
                                        <div className="appearance-preview light"></div>
                                        <span>ライト</span>
                                    </div>
                                    <div className={`appearance-option ${isDarkMode ? 'active' : ''}`} onClick={() => !isDarkMode && onToggleDarkMode()}>
                                        <div className="appearance-preview dark"></div>
                                        <span>ダーク</span>
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
