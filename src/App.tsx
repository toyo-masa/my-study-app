import { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { cloudApi } from './cloudApi';
import { AppAuthModals } from './components/AppAuthModals';
import { useAppContext } from './contexts/AppContext';
import { LoadingView } from './components/LoadingView';
import { AnimatePresence } from 'framer-motion';
import { useAppShellSettings } from './hooks/useAppShellSettings';

// Routes
import { HomeRoute } from './pages/HomeRoute';
import { QuizDetailRoute } from './pages/QuizDetailRoute';
import { StudyRoute } from './pages/StudyRoute';
import { MemorizationRoute } from './pages/MemorizationRoute';
import { ManageRoute } from './pages/ManageRoute';
import { DistributionRoute } from './pages/DistributionRoute';
import { ReleaseNotesRoute } from './pages/ReleaseNotesRoute';
import { ReviewBoardRoute } from './pages/ReviewBoardRoute';
import { AdminRoute } from './pages/AdminRoute';
import { NotFoundRoute } from './pages/NotFoundRoute';
import { HistoryTableRoute } from './pages/HistoryTableRoute';
import { TutorialHubRoute } from './pages/TutorialHubRoute';

function App() {
  const {
    currentUser, setCurrentUser,
    isLoginModalOpen, setIsLoginModalOpen,
    isRegisterModalOpen, setIsRegisterModalOpen,
    isInitialized,
    quizSets,
    setUseCloudSync,
    loadQuizSets,
    globalNotice
  } = useAppContext();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const location = useLocation();
  const isReleaseNotesRoute = location.pathname.startsWith('/release-notes');
  const {
    themeMode,
    setThemeMode,
    isDarkMode,
    accentColor,
    setAccentColor,
    reviewIntervalSettings,
    toggleDarkMode,
    handleReviewIntervalSettingsChange,
    handleResetReviewIntervalSettings,
  } = useAppShellSettings(location.pathname, quizSets);

  // Logout
  const handleLogout = async () => {
    try {
      await cloudApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setCurrentUser(null);
    setUseCloudSync(false);
    await loadQuizSets();
  };

  if (!isInitialized && !isReleaseNotesRoute) {
    return <LoadingView fullPage message="データを読み込み中..." />;
  }

  const isStudyOrMemRoute = location.pathname.includes('/study') || location.pathname.includes('/memorization');

  return (
    <div className={`app-container ${isStudyOrMemRoute ? 'study-mode-active' : ''}`}>
      {globalNotice && (
        <div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}>
          <div className={`session-inline-notice home-inline-notice ${globalNotice.type === 'success' ? 'is-success' : 'is-error'}`}>
            {globalNotice.text}
          </div>
        </div>
      )}

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

      <AppAuthModals
        currentUser={currentUser}
        isLoginModalOpen={isLoginModalOpen}
        setIsLoginModalOpen={setIsLoginModalOpen}
        isRegisterModalOpen={isRegisterModalOpen}
        setIsRegisterModalOpen={setIsRegisterModalOpen}
        setCurrentUser={setCurrentUser}
        setUseCloudSync={setUseCloudSync}
        loadQuizSets={loadQuizSets}
      />

      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/distribution-sim" element={<DistributionRoute />} />
          <Route path="/review-board" element={<ReviewBoardRoute />} />
          <Route path="/tutorial" element={<TutorialHubRoute />} />
          {currentUser?.isAdmin && <Route path="/admin" element={<AdminRoute />} />}
          <Route path="/quiz/:id/manage" element={<ManageRoute />} />
          <Route path="/quiz/:id/study" element={<StudyRoute />} />
          <Route path="/quiz/:id/memorization" element={<MemorizationRoute />} />
          <Route path="/quiz/:id/history-table" element={<HistoryTableRoute />} />
          <Route path="/quiz/:id" element={<QuizDetailRoute />} />
          <Route path="/release-notes" element={<ReleaseNotesRoute />} />
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}

export default App;
