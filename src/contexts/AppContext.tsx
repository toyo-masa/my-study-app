import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { QuizSetWithMeta } from '../components/HomePage';
import { cloudApi, type AuthUser } from '../cloudApi';
import {
    getAllQuizSets,
    addQuizSetWithQuestions,
    getHomeOnboardingState
} from '../db';
import { parseQuestions } from '../utils/csvParser';
import type { HomeOnboardingState } from '../types';

interface AppContextType {
    currentUser: AuthUser | null;
    setCurrentUser: (user: AuthUser | null) => void;
    quizSets: QuizSetWithMeta[];
    setQuizSets: React.Dispatch<React.SetStateAction<QuizSetWithMeta[]>>;
    deletedQuizSets: QuizSetWithMeta[];
    setDeletedQuizSets: React.Dispatch<React.SetStateAction<QuizSetWithMeta[]>>;
    archivedQuizSets: QuizSetWithMeta[];
    setArchivedQuizSets: React.Dispatch<React.SetStateAction<QuizSetWithMeta[]>>;

    isLoginModalOpen: boolean;
    setIsLoginModalOpen: (open: boolean) => void;
    isRegisterModalOpen: boolean;
    setIsRegisterModalOpen: (open: boolean) => void;

    homeOnboardingState: HomeOnboardingState | null;
    setHomeOnboardingState: React.Dispatch<React.SetStateAction<HomeOnboardingState | null>>;

    useCloudSync: boolean;

    loadQuizSets: () => Promise<QuizSetWithMeta[]>;
    handleCloudError: (err: any, fallbackMessage: string) => void;

    isInitialized: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
    const [quizSets, setQuizSets] = useState<QuizSetWithMeta[]>([]);
    const [deletedQuizSets, setDeletedQuizSets] = useState<QuizSetWithMeta[]>([]);
    const [archivedQuizSets, setArchivedQuizSets] = useState<QuizSetWithMeta[]>([]);

    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

    const [homeOnboardingState, setHomeOnboardingState] = useState<HomeOnboardingState | null>(null);

    const [isInitialized, setIsInitialized] = useState(false);

    // Derive cloud sync state from localStorage
    const [useCloudSync] = useState(() => {
        return localStorage.getItem('useCloudSync') === 'true';
    });

    const handleCloudError = useCallback((err: any, fallbackMessage: string) => {
        if (err instanceof Error && err.message === 'UNAUTHORIZED') {
            setCurrentUser(null);
            setIsLoginModalOpen(true);
        } else {
            console.error(fallbackMessage, err);
            alert(fallbackMessage);
        }
    }, []);

    const loadQuizSets = useCallback(async () => {
        try {
            const allSets = await getAllQuizSets();

            const activeSets = allSets.filter(Qs => !Qs.isDeleted && !Qs.isArchived);
            const deletedSets = allSets.filter(Qs => !!Qs.isDeleted);
            const archivedSets = allSets.filter(Qs => !Qs.isDeleted && !!Qs.isArchived);

            setQuizSets(activeSets);
            setDeletedQuizSets(deletedSets);
            setArchivedQuizSets(archivedSets);
            return activeSets;
        } catch (err) {
            if (err instanceof Error && err.message === 'UNAUTHORIZED') {
                setCurrentUser(null);
                setIsLoginModalOpen(true);
            } else {
                console.error('Failed to load quiz sets:', err);
            }
            return [];
        }
    }, []);

    useEffect(() => {
        const init = async () => {
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

                // First loading of all sets. Replaces `isDBSeeded()`.
                const allLoadedSets = await loadQuizSets();

                try {
                    const os = await getHomeOnboardingState();
                    setHomeOnboardingState(os);
                } catch (err) {
                    console.error('Failed to load onboarding state:', err);
                }

                // If the user truly has 0 sets (or local IndexedDB is completely empty), seed sample questions.
                if (allLoadedSets.length === 0) {
                    try {
                        const response = await fetch('/sample_questions.csv');
                        const blob = await response.blob();
                        const file = new File([blob], 'sample_questions.csv', { type: 'text/csv' });
                        const parsed = await parseQuestions(file);
                        const questionsForDB = parsed.map(q => ({
                            category: q.category,
                            text: q.text,
                            options: q.options,
                            correctAnswers: q.correctAnswers,
                            explanation: q.explanation,
                        }));
                        await addQuizSetWithQuestions('sample_questions', questionsForDB);

                        // Reload state with the seeded data
                        await loadQuizSets();
                    } catch (err) {
                        if (err instanceof Error && err.message === 'UNAUTHORIZED') throw err;
                        console.error('Failed to seed DB:', err);
                    }
                }

                setIsInitialized(true);
            } catch (err) {
                if (err instanceof Error && err.message === 'UNAUTHORIZED') {
                    setIsLoginModalOpen(true);
                } else {
                    console.error('Failed to initialize app:', err);
                }
                setIsInitialized(true);
            }
        };
        init();
    }, [useCloudSync, loadQuizSets]);

    return (
        <AppContext.Provider value={{
            currentUser, setCurrentUser,
            quizSets, setQuizSets,
            deletedQuizSets, setDeletedQuizSets,
            archivedQuizSets, setArchivedQuizSets,
            isLoginModalOpen, setIsLoginModalOpen,
            isRegisterModalOpen, setIsRegisterModalOpen,
            homeOnboardingState, setHomeOnboardingState,
            useCloudSync,
            loadQuizSets,
            handleCloudError,
            isInitialized
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
