import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuestionManager } from '../components/QuestionManager';
import { useAppContext } from '../contexts/AppContext';
import { LoadingView } from '../components/LoadingView';
import { NotFoundView } from '../components/NotFoundView';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';
import { AnimatePresence } from 'framer-motion';

export const ManageRoute: React.FC = () => {
    const navigate = useNavigate();
    const { loadQuizSets, handleCloudError } = useAppContext();
    const { activeQuizSet, quizSetsCount } = useActiveQuizSetFromRoute();
    const [isLoading, setIsLoading] = useState(() => quizSetsCount === 0);

    useEffect(() => {
        if (!isLoading) return;
        if (quizSetsCount > 0) return;
        loadQuizSets().finally(() => setIsLoading(false));
    }, [isLoading, quizSetsCount, loadQuizSets]);

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
