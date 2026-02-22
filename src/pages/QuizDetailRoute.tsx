import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QuizDetail } from '../components/QuizDetail';
import { NotFoundView } from '../components/NotFoundView';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';
import { loadSessionFromStorage, loadQuizSetSettings, saveQuizSetSettings } from '../utils/quizSettings';
import type { QuizHistory } from '../types';

export const QuizDetailRoute: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const expectSuspendedSession = location.state?.expectSuspendedSession === true;
    const { quizSetId, activeQuizSet } = useActiveQuizSetFromRoute();
    const [hasSuspendedSession, setHasSuspendedSession] = useState(expectSuspendedSession);

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

    const handleStartStudy = () => {
        if (!activeQuizSet) return;
        if (activeQuizSet.type === 'memorization') {
            navigate(`/quiz/${activeQuizSet.id}/memorization`, { state: { startNew: true } });
        } else {
            navigate(`/quiz/${activeQuizSet.id}/study`, { state: { startNew: true } });
        }
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
        // In react router, we can pass state via navigate
        if (history.memorizationDetail && history.memorizationDetail.length > 0) {
            navigate(`/quiz/${activeQuizSet.id}/memorization`, { state: { history } });
        } else {
            navigate(`/quiz/${activeQuizSet.id}/study`, { state: { history } });
        }
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
                hasSuspendedSession={hasSuspendedSession}
                onResume={handleResumeStudy}
                settings={loadQuizSetSettings(activeQuizSet.id!)}
                onSettingsChange={(s) => saveQuizSetSettings(activeQuizSet.id!, s)}
            />
        </main>
    );
};
