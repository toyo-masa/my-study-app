import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuizDetail } from '../components/QuizDetail';
import { NotFoundView } from '../components/NotFoundView';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';
import { loadSessionFromStorage, loadQuizSetSettings, saveQuizSetSettings } from '../utils/quizSettings';
import type { QuizHistory } from '../types';

export const QuizDetailRoute: React.FC = () => {
    const navigate = useNavigate();
    const { quizSetId, activeQuizSet } = useActiveQuizSetFromRoute();
    const [hasSuspendedSession, setHasSuspendedSession] = useState(false);

    useEffect(() => {
        let active = true;

        const checkSuspendedSession = async () => {
            if (!quizSetId) {
                if (active) setHasSuspendedSession(false);
                return;
            }
            const session = await loadSessionFromStorage(quizSetId);
            if (active) {
                setHasSuspendedSession(!!session);
            }
        };

        checkSuspendedSession();
        return () => {
            active = false;
        };
    }, [quizSetId]);

    const handleStartStudy = async () => {
        if (!activeQuizSet) return;
        const suspendedSession = await loadSessionFromStorage(activeQuizSet.id!);
        if (suspendedSession) {
            const shouldStartNew = window.confirm('中断中の解答があります。新しく始めると中断データは削除されます。新しく始めますか？');
            if (!shouldStartNew) return;
        }
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
