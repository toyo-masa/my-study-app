import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QuizDetail } from '../components/QuizDetail';
import { useAppContext } from '../contexts/AppContext';
import { updateQuizSet } from '../db';
import { loadSessionFromStorage, loadQuizSetSettings, saveQuizSetSettings } from '../utils/quizSettings';
import type { QuizHistory } from '../types';

export const QuizDetailRoute: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { quizSets, handleCloudError, loadQuizSets } = useAppContext();
    const [hasSuspendedSession, setHasSuspendedSession] = useState(false);

    const quizSetId = id ? parseInt(id, 10) : undefined;
    const activeQuizSet = quizSets.find(s => s.id === quizSetId);

    useEffect(() => {
        if (!quizSetId) return;
        setHasSuspendedSession(!!loadSessionFromStorage(quizSetId));
    }, [quizSetId]);

    const handleUpdateQuizSet = async (quizSetId: number, changes: Partial<import('../types').QuizSet>) => {
        try {
            await updateQuizSet(quizSetId, changes);
            await loadQuizSets();
        } catch (error) {
            handleCloudError(error, '問題集の更新に失敗しました。');
        }
    };

    const handleStartStudy = () => {
        if (!activeQuizSet) return;
        if (activeQuizSet.type === 'memorization') {
            navigate(`/quiz/${activeQuizSet.id}/memorization`);
        } else {
            navigate(`/quiz/${activeQuizSet.id}/study`);
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
        return <div style={{ padding: '2rem', textAlign: 'center' }}>問題集が見つかりませんでした。または読み込み中です...</div>;
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
                onUpdateQuizSet={handleUpdateQuizSet}
            />
        </main>
    );
};
