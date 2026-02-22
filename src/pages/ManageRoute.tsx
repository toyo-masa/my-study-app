import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QuestionManager } from '../components/QuestionManager';
import { useAppContext } from '../contexts/AppContext';
import { LoadingView } from '../components/LoadingView';
import { AnimatePresence } from 'framer-motion';

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

    return (
        <AnimatePresence mode="wait">
            {isLoading ? (
                <LoadingView key="loading" />
            ) : !activeQuizSet ? (
                <div key="not-found" style={{ padding: '2rem', textAlign: 'center' }}>問題集が見つかりませんでした。</div>
            ) : (
                <main key="content" className="content-area" style={{ padding: '1.5rem' }}>
                    <QuestionManager
                        quizSet={activeQuizSet}
                        onBack={() => navigate('/')}
                        onCloudError={handleCloudError}
                        onQuizSetUpdated={loadQuizSets}
                    />
                </main>
            )}
        </AnimatePresence>
    );
};
