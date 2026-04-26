import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { ApiError, cloudApi, type AuthUser } from '../cloudApi';
import { addQuizSetWithQuestions, getHomeOnboardingState } from '../db';
import { parseQuestions } from '../utils/csvParser';
import type { HomeOnboardingState, QuizSetWithMeta } from '../types';

type UseAppBootstrapParams = {
    useCloudSync: boolean;
    skipBootstrap: boolean;
    loadQuizSets: () => Promise<QuizSetWithMeta[]>;
    setCurrentUser: (user: AuthUser | null) => void;
    setIsLoginModalOpen: (open: boolean) => void;
    setHomeOnboardingState: Dispatch<SetStateAction<HomeOnboardingState | null>>;
    setIsInitialized: (initialized: boolean) => void;
};

async function seedSampleQuizSet(loadQuizSets: () => Promise<QuizSetWithMeta[]>): Promise<void> {
    const response = await fetch('/sample_questions.csv');
    const blob = await response.blob();
    const file = new File([blob], 'sample_questions.csv', { type: 'text/csv' });
    const parsed = await parseQuestions(file);
    const questionsForDB = parsed.map((question) => ({
        category: question.category,
        text: question.text,
        options: question.options,
        correctAnswers: question.correctAnswers,
        explanation: question.explanation,
    }));
    await addQuizSetWithQuestions('sample_questions', questionsForDB);
    await loadQuizSets();
}

export function useAppBootstrap({
    useCloudSync,
    skipBootstrap,
    loadQuizSets,
    setCurrentUser,
    setIsLoginModalOpen,
    setHomeOnboardingState,
    setIsInitialized,
}: UseAppBootstrapParams): void {
    useEffect(() => {
        if (skipBootstrap) {
            setIsInitialized(true);
            return;
        }

        const init = async () => {
            setIsInitialized(false);
            try {
                if (useCloudSync) {
                    const user = await cloudApi.getCurrentUser();
                    if (user) {
                        setCurrentUser(user);
                    } else {
                        setIsLoginModalOpen(true);
                        setIsInitialized(true);
                        return;
                    }
                }

                const allLoadedSets = await loadQuizSets();

                try {
                    const onboardingState = await getHomeOnboardingState();
                    setHomeOnboardingState(onboardingState);
                } catch (err) {
                    console.error('Failed to load onboarding state:', err);
                }

                if (allLoadedSets.length === 0) {
                    try {
                        await seedSampleQuizSet(loadQuizSets);
                    } catch (err) {
                        if (err instanceof ApiError && err.status === 401) {
                            throw err;
                        }
                        console.error('Failed to seed DB:', err);
                    }
                }

                setIsInitialized(true);
            } catch (err) {
                if (err instanceof ApiError && err.status === 401) {
                    setIsLoginModalOpen(true);
                } else {
                    console.error('Failed to initialize app:', err);
                }
                setIsInitialized(true);
            }
        };

        void init();
    }, [
        loadQuizSets,
        setCurrentUser,
        setHomeOnboardingState,
        setIsInitialized,
        setIsLoginModalOpen,
        skipBootstrap,
        useCloudSync,
    ]);
}
