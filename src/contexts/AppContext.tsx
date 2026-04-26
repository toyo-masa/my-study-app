import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ApiError, type AuthUser } from '../cloudApi';
import { getAllQuizSets } from '../db';
import type { HomeOnboardingState, QuizSetWithMeta } from '../types';
import { useAppBootstrap } from '../hooks/useAppBootstrap';
import { useGlobalNotice, type GlobalNotice } from '../hooks/useGlobalNotice';
import { isCloudSyncEnabledInStorage, setCloudSyncEnabledInStorage } from '../utils/settings';

type HandleCloudErrorOptions = {
    suppressGlobalNotice?: boolean;
};

interface AppContextType {
    globalNotice: GlobalNotice | null;
    showGlobalNotice: (text: string, type: 'success' | 'error') => void;

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
    setUseCloudSync: (enabled: boolean) => void;

    loadQuizSets: () => Promise<QuizSetWithMeta[]>;
    handleCloudError: (err: unknown, fallbackMessage: string, options?: HandleCloudErrorOptions) => void;

    isInitialized: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const location = useLocation();
    const skipBootstrap = location.pathname.startsWith('/room-sim');
    const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
    const [quizSets, setQuizSets] = useState<QuizSetWithMeta[]>([]);
    const [deletedQuizSets, setDeletedQuizSets] = useState<QuizSetWithMeta[]>([]);
    const [archivedQuizSets, setArchivedQuizSets] = useState<QuizSetWithMeta[]>([]);

    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

    const [homeOnboardingState, setHomeOnboardingState] = useState<HomeOnboardingState | null>(null);

    const [isInitialized, setIsInitialized] = useState(false);

    const [useCloudSync, setUseCloudSyncState] = useState(() => isCloudSyncEnabledInStorage());
    const { globalNotice, showGlobalNotice } = useGlobalNotice();

    const setUseCloudSync = useCallback((enabled: boolean) => {
        setCloudSyncEnabledInStorage(enabled);
        setUseCloudSyncState(enabled);
    }, []);

    const handleCloudError = useCallback((err: unknown, fallbackMessage: string, options?: HandleCloudErrorOptions) => {
        if (err instanceof ApiError && err.status === 401) {
            setCurrentUser(null);
            setIsLoginModalOpen(true);
        } else {
            console.error(fallbackMessage, err);
            if (!options?.suppressGlobalNotice) {
                showGlobalNotice(fallbackMessage, 'error');
            }
        }
    }, [showGlobalNotice]);

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
            if (err instanceof ApiError && err.status === 401) {
                setCurrentUser(null);
                setIsLoginModalOpen(true);
            } else {
                console.error('Failed to load quiz sets:', err);
            }
            return [];
        }
    }, []);

    useAppBootstrap({
        useCloudSync,
        skipBootstrap,
        loadQuizSets,
        setCurrentUser,
        setIsLoginModalOpen,
        setHomeOnboardingState,
        setIsInitialized,
    });

    return (
        <AppContext.Provider value={{
            globalNotice, showGlobalNotice,
            currentUser, setCurrentUser,
            quizSets, setQuizSets,
            deletedQuizSets, setDeletedQuizSets,
            archivedQuizSets, setArchivedQuizSets,
            isLoginModalOpen, setIsLoginModalOpen,
            isRegisterModalOpen, setIsRegisterModalOpen,
            homeOnboardingState, setHomeOnboardingState,
            useCloudSync,
            setUseCloudSync,
            loadQuizSets,
            handleCloudError,
            isInitialized
        }}>
            {children}
        </AppContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
