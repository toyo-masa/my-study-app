import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QuizDetail } from '../components/QuizDetail';
import { NotFoundView } from '../components/NotFoundView';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';
import { loadSessionFromStorage, loadQuizSetSettings, saveQuizSetSettings } from '../utils/quizSettings';
import type { QuizSetSettings } from '../utils/quizSettings';
import type { QuizHistory } from '../types';

const DEFAULT_QUIZ_SET_SETTINGS: QuizSetSettings = {
    shuffleQuestions: false,
    shuffleOptions: false,
    feedbackTimingMode: 'immediate',
    feedbackBlockSize: 5,
};

export const QuizDetailRoute: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const expectSuspendedSession = location.state?.expectSuspendedSession === true;
    const { quizSetId, activeQuizSet } = useActiveQuizSetFromRoute();
    const [hasSuspendedSession, setHasSuspendedSession] = useState(expectSuspendedSession);
    const [showStartConfirmation, setShowStartConfirmation] = useState(false);
    const [, setSettingsRevision] = useState(0);
    const quizSetSettings = activeQuizSet?.id ? loadQuizSetSettings(activeQuizSet.id) : DEFAULT_QUIZ_SET_SETTINGS;
    const effectiveHasSuspendedSession = hasSuspendedSession || expectSuspendedSession;

    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const maxAttempts = expectSuspendedSession ? 8 : 1;

        const checkSuspendedSession = async (attempt: number) => {
            if (!quizSetId) {
                if (active) setHasSuspendedSession(false);
                return;
            }
            const session = await loadSessionFromStorage(quizSetId);
            if (!active) {
                return;
            }

            if (session) {
                setHasSuspendedSession(true);
                return;
            }

            if (expectSuspendedSession && attempt < maxAttempts) {
                timer = setTimeout(() => {
                    void checkSuspendedSession(attempt + 1);
                }, 250);
                return;
            }

            setHasSuspendedSession(false);
        };

        void checkSuspendedSession(1);

        return () => {
            active = false;
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [expectSuspendedSession, quizSetId]);

    const startNewStudy = () => {
        if (!activeQuizSet) return;
        if (activeQuizSet.type === 'memorization') {
            navigate(`/quiz/${activeQuizSet.id}/memorization`, { state: { startNew: true } });
        } else {
            navigate(`/quiz/${activeQuizSet.id}/study`, { state: { startNew: true } });
        }
    };

    const handleStartStudy = () => {
        if (!activeQuizSet) return;
        if (effectiveHasSuspendedSession) {
            setShowStartConfirmation(true);
            return;
        }
        startNewStudy();
    };

    const handleResumeStudy = () => {
        if (!activeQuizSet) return;
        if (activeQuizSet.type === 'memorization') {
            navigate(`/quiz/${activeQuizSet.id}/memorization`);
        } else {
            navigate(`/quiz/${activeQuizSet.id}/study`);
        }
    };

    const handleSelectHistory = (history: QuizHistory) => {
        if (!activeQuizSet) return;
        if (history.memorizationDetail && history.memorizationDetail.length > 0) {
            navigate(`/quiz/${activeQuizSet.id}/memorization`, { state: { history } });
        } else {
            navigate(`/quiz/${activeQuizSet.id}/study`, { state: { history } });
        }
    };

    const handleOpenHistoryTable = () => {
        if (quizSetId === undefined) return;
        navigate(`/quiz/${quizSetId}/history-table`);
    };

    if (!activeQuizSet) {
        return <NotFoundView message="問題集が見つかりませんでした。または読み込み中です..." />;
    }

    return (
        <main className="content-area" style={{ padding: '1.5rem' }}>
            <QuizDetail
                quizSet={activeQuizSet}
                onBack={() => navigate('/')}
                onStart={handleStartStudy}
                onSelectHistory={handleSelectHistory}
                onOpenHistoryTable={handleOpenHistoryTable}
                hasSuspendedSession={effectiveHasSuspendedSession}
                onResume={handleResumeStudy}
                settings={quizSetSettings}
                onSettingsChange={(s) => {
                    saveQuizSetSettings(activeQuizSet.id!, s);
                    setSettingsRevision((prev) => prev + 1);
                }}
            />
            <ConfirmationModal
                isOpen={showStartConfirmation}
                title="新しく始める"
                message="中断中の解答があります。新しく始めると中断データは削除されます。新しく始めますか？"
                confirmLabel="新しく始める"
                cancelLabel="キャンセル"
                onConfirm={() => {
                    setShowStartConfirmation(false);
                    startNewStudy();
                }}
                onCancel={() => setShowStartConfirmation(false)}
            />
        </main>
    );
};
