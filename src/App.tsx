import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { cloudApi } from './cloudApi';
import { useAppContext } from './contexts/AppContext';
import { LoadingView } from './components/LoadingView';
import { AnimatePresence } from 'framer-motion';
import {
  DEFAULT_REVIEW_INTERVAL_SETTINGS,
  loadReviewIntervalSettings,
  normalizeReviewIntervalSettings,
  saveReviewIntervalSettings,
  type ReviewIntervalSettings,
} from './utils/spacedRepetition';

// Routes
import { HomeRoute } from './pages/HomeRoute';
import { QuizDetailRoute } from './pages/QuizDetailRoute';
import { StudyRoute } from './pages/StudyRoute';
import { MemorizationRoute } from './pages/MemorizationRoute';
import { ManageRoute } from './pages/ManageRoute';
import { DistributionRoute } from './pages/DistributionRoute';
import { ReleaseNotesRoute } from './pages/ReleaseNotesRoute';
import { ReviewBoardRoute } from './pages/ReviewBoardRoute';
import { HistoryTableRoute } from './pages/HistoryTableRoute';

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

type ThemeMode = 'light' | 'dark' | 'monokai';

const normalizeThemeMode = (value: string | null): ThemeMode => {
  if (value === 'light' || value === 'dark' || value === 'monokai') {
    return value;
  }
  return 'dark';
};

function App() {
  const {
    currentUser, setCurrentUser,
    isLoginModalOpen, setIsLoginModalOpen,
    isRegisterModalOpen, setIsRegisterModalOpen,
    isInitialized
  } = useAppContext();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const location = useLocation();
  const isReleaseNotesRoute = location.pathname.startsWith('/release-notes');

  // Theme and Accent color
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return normalizeThemeMode(localStorage.getItem('theme'));
  });
  const isDarkMode = themeMode !== 'light';
  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem('accentColor') || '#3b82f6';
  });
  const [reviewIntervalSettings, setReviewIntervalSettings] = useState<ReviewIntervalSettings>(() => {
    return loadReviewIntervalSettings();
  });

  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.body.classList.toggle('theme-monokai', themeMode === 'monokai');
    localStorage.setItem('theme', themeMode);
  }, [isDarkMode, themeMode]);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', accentColor);
    const primaryColorRgb = hexToRgbString(accentColor);
    if (primaryColorRgb) {
      document.documentElement.style.setProperty('--primary-color-rgb', primaryColorRgb);
    }

    // グラデーション用のセカンダリカラー（少し暗く/明るくする）を動的に計算
    const secondaryColor = adjustColor(accentColor, isDarkMode ? 30 : -30);
    document.documentElement.style.setProperty('--secondary-color', secondaryColor);

    localStorage.setItem('accentColor', accentColor);
  }, [accentColor, isDarkMode]);

  useEffect(() => {
    saveReviewIntervalSettings(reviewIntervalSettings);
  }, [reviewIntervalSettings]);

  const toggleDarkMode = () => setThemeMode(prev => (prev === 'light' ? 'dark' : 'light'));
  const handleReviewIntervalSettingsChange = (settings: ReviewIntervalSettings) => {
    setReviewIntervalSettings(normalizeReviewIntervalSettings(settings));
  };
  const handleResetReviewIntervalSettings = () => {
    setReviewIntervalSettings({ ...DEFAULT_REVIEW_INTERVAL_SETTINGS });
  };

  // Auth Modal States
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Submit login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const result = await cloudApi.login(loginUsername, loginPassword);
      setCurrentUser(result.user);
      setIsLoginModalOpen(false);
      setLoginUsername('');
      setLoginPassword('');
      localStorage.setItem('useCloudSync', 'true');
      window.location.reload();
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Submit register
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    if (registerPassword !== registerPasswordConfirm) {
      setRegisterError('パスワードが一致しません');
      return;
    }
    setIsRegistering(true);
    try {
      const result = await cloudApi.register(registerUsername, registerPassword);
      setCurrentUser(result.user);
      setIsRegisterModalOpen(false);
      setRegisterUsername('');
      setRegisterPassword('');
      setRegisterPasswordConfirm('');
      localStorage.setItem('useCloudSync', 'true');
      window.location.reload();
    } catch (err: unknown) {
      setRegisterError(err instanceof Error ? err.message : '登録に失敗しました');
    } finally {
      setIsRegistering(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await cloudApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.setItem('useCloudSync', 'false');
    window.location.reload();
  };

  const continueOfflineMode = () => {
    localStorage.setItem('useCloudSync', 'false');
    setIsLoginModalOpen(false);
    setIsRegisterModalOpen(false);
    window.location.reload();
  };

  if (!isInitialized && !isReleaseNotesRoute) {
    return <LoadingView fullPage message="データを読み込み中..." />;
  }

  // Study/Mem route hides the sidebar / margins if needed, but styling is handled by CSS mostly 
  // Determine if we should show settings button (hide on study/mem routes maybe, or keep globally? previously it was global)
  const isStudyOrMemRoute = location.pathname.includes('/study') || location.pathname.includes('/memorization');

  // Previously global-settings-btn was always rendered.
  // We keep the old layout logic for App
  return (
    <div className={`app-container ${isStudyOrMemRoute ? 'study-mode-active' : ''}`}>
      {!isStudyOrMemRoute && (
        <button className="global-settings-btn" onClick={() => setIsSettingsOpen(true)} data-tooltip="ページ設定">
          <Settings size={20} />
        </button>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        accentColor={accentColor}
        onAccentColorChange={setAccentColor}
        reviewIntervalSettings={reviewIntervalSettings}
        onReviewIntervalSettingsChange={handleReviewIntervalSettingsChange}
        onResetReviewIntervalSettings={handleResetReviewIntervalSettings}
        currentUsername={currentUser?.username}
        onLogout={handleLogout}
        onLoginRequest={() => { setIsSettingsOpen(false); setIsLoginModalOpen(true); }}
      />

      {/* Login Modal */}
      {isLoginModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content login-modal">
            <div className="modal-header">
              <h3>ログイン</h3>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>アカウントにログインしてください。</p>
              <form onSubmit={handleLoginSubmit}>
                <input
                  type="text"
                  className="field-input"
                  placeholder="ユーザー名"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoFocus
                  style={{ marginBottom: '0.75rem' }}
                />
                <input
                  type="password"
                  className="field-input"
                  placeholder="パスワード"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
                {loginError && <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{loginError}</p>}
                <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                  {currentUser && <button type="button" className="nav-btn" onClick={() => setIsLoginModalOpen(false)} disabled={isLoggingIn}>キャンセル</button>}
                  <button type="submit" className="nav-btn action-btn" disabled={isLoggingIn}>
                    {isLoggingIn ? '認証中...' : 'ログイン'}
                  </button>
                </div>
              </form>
              <div style={{ textAlign: 'center', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>アカウントをお持ちでない方は </span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline' }}
                  onClick={() => { setIsLoginModalOpen(false); setIsRegisterModalOpen(true); setLoginError(''); }}
                >新規登録</button>
              </div>
              {!currentUser && (
                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
                    onClick={continueOfflineMode}
                  >オフラインで続ける</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Register Modal */}
      {isRegisterModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content login-modal">
            <div className="modal-header">
              <h3>新規登録</h3>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>アカウントを作成してください。</p>
              <form onSubmit={handleRegisterSubmit}>
                <input
                  type="text"
                  className="field-input"
                  placeholder="ユーザー名（3文字以上）"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  autoFocus
                  style={{ marginBottom: '0.75rem' }}
                />
                <input
                  type="password"
                  className="field-input"
                  placeholder="パスワード（6文字以上）"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  style={{ marginBottom: '0.75rem' }}
                />
                <input
                  type="password"
                  className="field-input"
                  placeholder="パスワード（確認）"
                  value={registerPasswordConfirm}
                  onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                />
                {registerError && <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{registerError}</p>}
                <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                  {currentUser && <button type="button" className="nav-btn" onClick={() => setIsRegisterModalOpen(false)} disabled={isRegistering}>キャンセル</button>}
                  <button type="submit" className="nav-btn action-btn" disabled={isRegistering}>
                    {isRegistering ? '登録中...' : '登録する'}
                  </button>
                </div>
              </form>
              <div style={{ textAlign: 'center', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>既にアカウントをお持ちの方は </span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline' }}
                  onClick={() => { setIsRegisterModalOpen(false); setIsLoginModalOpen(true); setRegisterError(''); }}
                >ログイン</button>
              </div>
              {!currentUser && (
                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
                    onClick={continueOfflineMode}
                  >オフラインで続ける</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Routes */}
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/distribution-sim" element={<DistributionRoute />} />
          <Route path="/review-board" element={<ReviewBoardRoute />} />
          <Route path="/quiz/:id/manage" element={<ManageRoute />} />
          <Route path="/quiz/:id/study" element={<StudyRoute />} />
          <Route path="/quiz/:id/memorization" element={<MemorizationRoute />} />
          <Route path="/quiz/:id/history-table" element={<HistoryTableRoute />} />
          <Route path="/quiz/:id" element={<QuizDetailRoute />} />
          <Route path="/release-notes" element={<ReleaseNotesRoute />} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}

export default App;
