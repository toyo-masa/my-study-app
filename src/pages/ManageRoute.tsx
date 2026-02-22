import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QuestionManager } from '../components/QuestionManager';
import { useAppContext } from '../contexts/AppContext';
import { LoadingView } from '../components/LoadingView';
import { NotFoundView } from '../components/NotFoundView';
import { AnimatePresence } from 'framer-motion';

export const ManageRoute: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { quizSets, loadQuizSets, handleCloudError } = useAppContext();
    const [isLoading, setIsLoading] = useState(() => quizSets.length === 0);

    const quizSetId = id ? parseInt(id, 10) : undefined;
    const activeQuizSet = quizSets.find(s => s.id === quizSetId);

    useEffect(() => {
        if (!isLoading) return;
        loadQuizSets().finally(() => setIsLoading(false));
    }, [isLoading, loadQuizSets]);

    return (
        <AnimatePresence mode="wait">
            {isLoading ? (
                <LoadingView key="loading" />
            ) : !activeQuizSet ? (
                <NotFoundView key="not-found" />
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
