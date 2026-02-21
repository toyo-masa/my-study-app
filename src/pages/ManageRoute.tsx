import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QuestionManager } from '../components/QuestionManager';
import { useAppContext } from '../contexts/AppContext';

export const ManageRoute: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { quizSets, loadQuizSets, handleCloudError } = useAppContext();
    const [isLoading, setIsLoading] = useState(true);

    const quizSetId = id ? parseInt(id, 10) : undefined;
    const activeQuizSet = quizSets.find(s => s.id === quizSetId);

    useEffect(() => {
        // Ensure data is loaded
        if (quizSets.length === 0) {
            loadQuizSets().finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [quizSets.length, loadQuizSets]);

    if (isLoading) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</div>;
    }

    if (!activeQuizSet) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>問題集が見つかりませんでした。</div>;
    }

    return (
        <main className="content-area" style={{ padding: '1.5rem' }}>
            <QuestionManager
                quizSet={activeQuizSet}
                onBack={() => navigate('/')}
                onCloudError={handleCloudError}
            />
        </main>
    );
};
