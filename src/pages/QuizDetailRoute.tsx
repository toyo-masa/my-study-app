import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QuizDetail } from '../components/QuizDetail';
import { NotFoundView } from '../components/NotFoundView';
import { useAppContext } from '../contexts/AppContext';
import { loadSessionFromStorage, loadQuizSetSettings, saveQuizSetSettings } from '../utils/quizSettings';
import type { QuizHistory } from '../types';

export const QuizDetailRoute: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { quizSets } = useAppContext();
    const quizSetId = id ? parseInt(id, 10) : undefined;
    const activeQuizSet = quizSets.find(s => s.id === quizSetId);

    // Derived state instead of useEffect to avoid cascading renders
    const hasSuspendedSession = quizSetId ? !!loadSessionFromStorage(quizSetId) : false;


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
