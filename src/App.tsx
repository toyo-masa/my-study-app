import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { cloudApi } from './cloudApi';
import { AppAuthModals } from './components/AppAuthModals';
import { useAppContext } from './contexts/AppContext';
import { LoadingView } from './components/LoadingView';
import { useAppShellSettings } from './hooks/useAppShellSettings';

// Routes
import { HomeRoute } from './pages/HomeRoute';
import { QuizDetailRoute } from './pages/QuizDetailRoute';
import { StudyRoute } from './pages/StudyRoute';
import { MemorizationRoute } from './pages/MemorizationRoute';
import { ManageRoute } from './pages/ManageRoute';
import { DistributionRoute } from './pages/DistributionRoute';
import { DistributionTablesRoute } from './pages/DistributionTablesRoute';
import { LinearAlgebraLabRoute } from './pages/LinearAlgebraLabRoute';
import { LoanSimRoute } from './pages/LoanSimRoute';
import { LocalLlmChatRoute } from './pages/LocalLlmChatRoute';
import { ReleaseNotesRoute } from './pages/ReleaseNotesRoute';
import { ReviewBoardRoute } from './pages/ReviewBoardRoute';
import { AdminRoute } from './pages/AdminRoute';
import { NotFoundRoute } from './pages/NotFoundRoute';
import { HistoryTableRoute } from './pages/HistoryTableRoute';
import { TutorialHubRoute } from './pages/TutorialHubRoute';
import { StudyInsightsRoute } from './pages/StudyInsightsRoute';

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
  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
  const isReleaseNotesRoute = location.pathname.startsWith('/release-notes');
  const isLoanSimRoute = location.pathname.startsWith('/loan-sim');
  const {
    themeMode,
    setThemeMode,
    isDarkMode,
    accentColor,
    setAccentColor,
    handwritingSettings,
    studyEffectSettings,
    localLlmSettings,
    reviewIntervalSettings,
    reviewBoardSettings,
    toggleDarkMode,
    handleHandwritingSettingsChange,
    handleStudyEffectSettingsChange,
    handleLocalLlmSettingsChange,
    handleResetHandwritingSettings,
    handleResetStudyEffectSettings,
    handleReviewIntervalSettingsChange,
    handleResetReviewIntervalSettings,
    handleReviewBoardSettingsChange,
    handleResetReviewBoardSettings,
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

  const isStudyOrMemRoute = location.pathname.includes('/study') || location.pathname.includes('/memorization');
  const shouldShowGlobalSettingsButton = !isStudyOrMemRoute && !(isEmbedded && isLoanSimRoute);

  useEffect(() => {
    document.body.classList.toggle('study-mode-active', isStudyOrMemRoute);
    document.documentElement.classList.toggle('study-mode-active', isStudyOrMemRoute);

    return () => {
      document.body.classList.remove('study-mode-active');
      document.documentElement.classList.remove('study-mode-active');
    };
  }, [isStudyOrMemRoute]);

  const handleLocalLlmModeChange = useCallback((preferredMode: 'webllm' | 'openai-local') => {
    handleLocalLlmSettingsChange((previous) => (
      previous.preferredMode === preferredMode
        ? previous
        : {
          ...previous,
          preferredMode,
        }
    ));
  }, [handleLocalLlmSettingsChange]);

  const handleWebLlmModelChange = useCallback((webllmModelId: string) => {
    handleLocalLlmSettingsChange((previous) => (
      previous.webllmModelId === webllmModelId
        ? previous
        : {
          ...previous,
          webllmModelId,
        }
    ));
  }, [handleLocalLlmSettingsChange]);

  if (!isInitialized && !isReleaseNotesRoute) {
    return <LoadingView fullPage message="データを読み込み中..." />;
  }

  return (
    <div className={`app-container ${isStudyOrMemRoute ? 'study-mode-active' : ''}`}>
      {globalNotice && (
        <div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}>
          <div className={`session-inline-notice home-inline-notice ${globalNotice.type === 'success' ? 'is-success' : 'is-error'}`}>
            {globalNotice.text}
          </div>
        </div>
      )}

      {shouldShowGlobalSettingsButton && (
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
        handwritingSettings={handwritingSettings}
        studyEffectSettings={studyEffectSettings}
        localLlmSettings={localLlmSettings}
        reviewIntervalSettings={reviewIntervalSettings}
        reviewBoardSettings={reviewBoardSettings}
        onHandwritingSettingsChange={handleHandwritingSettingsChange}
        onStudyEffectSettingsChange={handleStudyEffectSettingsChange}
        onLocalLlmSettingsChange={handleLocalLlmSettingsChange}
        onResetHandwritingSettings={handleResetHandwritingSettings}
        onResetStudyEffectSettings={handleResetStudyEffectSettings}
        onReviewIntervalSettingsChange={handleReviewIntervalSettingsChange}
        onResetReviewIntervalSettings={handleResetReviewIntervalSettings}
        onReviewBoardSettingsChange={handleReviewBoardSettingsChange}
        onResetReviewBoardSettings={handleResetReviewBoardSettings}
        showLocalLlmSettings
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

      <Routes location={location}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/distribution-sim" element={<DistributionRoute />} />
        <Route path="/distribution-tables" element={<DistributionTablesRoute />} />
        <Route path="/linear-algebra-lab" element={<LinearAlgebraLabRoute />} />
        <Route path="/loan-sim" element={<LoanSimRoute />} />
        <Route
          path="/local-llm-chat"
          element={(
            <LocalLlmChatRoute
              localLlmSettings={localLlmSettings}
              onLocalLlmSettingsChange={handleLocalLlmSettingsChange}
              onLocalLlmModeChange={handleLocalLlmModeChange}
              onWebLlmModelChange={handleWebLlmModelChange}
            />
          )}
        />
        <Route
          path="/review-board"
          element={<ReviewBoardRoute masteryThreshold={reviewBoardSettings.masteryThreshold} />}
        />
        <Route path="/study-insights" element={<StudyInsightsRoute />} />
        <Route path="/tutorial" element={<TutorialHubRoute />} />
        {currentUser?.isAdmin && <Route path="/admin" element={<AdminRoute />} />}
        <Route path="/quiz/:id/manage" element={<ManageRoute />} />
        <Route
          path="/quiz/:id/study"
          element={(
            <StudyRoute
              allowTouchDrawing={handwritingSettings.allowTouchDrawing}
              reviewBoardFeedbackBlockSize={reviewBoardSettings.feedbackBlockSize}
              studyEffectSettings={studyEffectSettings}
              localLlmSettings={localLlmSettings}
              onLocalLlmSettingsChange={handleLocalLlmSettingsChange}
              onLocalLlmModeChange={handleLocalLlmModeChange}
              onWebLlmModelChange={handleWebLlmModelChange}
            />
          )}
        />
        <Route
          path="/quiz/:id/memorization"
          element={(
            <MemorizationRoute
              allowTouchDrawing={handwritingSettings.allowTouchDrawing}
              reviewBoardFeedbackBlockSize={reviewBoardSettings.feedbackBlockSize}
              localLlmSettings={localLlmSettings}
              onLocalLlmSettingsChange={handleLocalLlmSettingsChange}
              onLocalLlmModeChange={handleLocalLlmModeChange}
              onWebLlmModelChange={handleWebLlmModelChange}
            />
          )}
        />
        <Route path="/quiz/:id/history-table" element={<HistoryTableRoute />} />
        <Route path="/quiz/:id" element={<QuizDetailRoute />} />
        <Route path="/release-notes" element={<ReleaseNotesRoute />} />
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </div>
  );
}

export default App;
