import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, type SidebarClickPosition } from '../components/Sidebar';
import type { HandwritingPadState } from '../components/HandwritingPad';
import { MemorizationResultView, MemorizationQuestionView } from '../components/MemorizationView';
import { QuizSessionLayout } from '../components/QuizSessionLayout';
import { NotFoundView } from '../components/NotFoundView';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';
import { useSessionAutoSaveOnPageHide } from '../hooks/useSessionAutoSaveOnPageHide';
import { useSessionNotices } from '../hooks/useSessionNotices';
import { getQuestionsForQuizSet, addHistory, getReviewSchedulesForQuizSet, upsertReviewSchedulesBulk } from '../db';
import type {
    Question,
    QuizHistory,
    HistoryMode,
    FeedbackTimingMode,
    ReviewSchedule,
    MemorizationLog,
    SuspendedSession,
} from '../types';
import {
    saveSessionToStorage,
    loadSessionFromStorage,
    clearSessionFromStorage,
    loadQuizSetSettings,
    applyShuffleSettings,
    loadReviewBoardSettings,
    resolveReviewBoardFeedbackBlockSize,
} from '../utils/quizSettings';
import { calculateNextDue, calculateNextInterval, loadReviewIntervalSettings, updateConsecutiveCorrect } from '../utils/spacedRepetition';
import {
    buildMemorizationSuspendedSession,
    buildQuizSessionKey,
    buildResumedStartTime,
    buildReviewDueResumeSession,
    clearWindowTimeout,
    DEFAULT_SUSPENDED_SESSION_SLOT_KEY,
    filterExistingSessionQuestions,
    getCompletedQuestionIdsFromSuspendedSession,
    isMobileViewport,
    mergeCompletedQuestionIds,
    REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY,
} from '../utils/quizSession';

interface MemorizationRouteProps {
    allowTouchDrawing: boolean;
}

export const MemorizationRoute: React.FC<MemorizationRouteProps> = ({ allowTouchDrawing }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const historyFromState = location.state?.history as QuizHistory | undefined;
    const startNewFromState = location.state?.startNew as boolean | undefined;
    const fromReviewBoardFromState = location.state?.fromReviewBoard === true;
    const reviewQuestionIdsFromState = Array.isArray(location.state?.reviewQuestionIds)
        ? location.state.reviewQuestionIds as number[]
        : undefined;
    const sessionSlotKey = fromReviewBoardFromState
        ? REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY
        : DEFAULT_SUSPENDED_SESSION_SLOT_KEY;

    const { quizSetId, activeQuizSet } = useActiveQuizSetFromRoute();

    const [isLoading, setIsLoading] = useState(true);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [memorizationLogs, setMemorizationLogs] = useState<MemorizationLog[]>([]);
    const [memorizationInputsMap, setMemorizationInputsMap] = useState<Record<string, string[]>>({});
    const [answeredMap, setAnsweredMap] = useState<Record<string, boolean>>({});
    const [showAnswerMap, setShowAnswerMap] = useState<Record<string, boolean>>({});
    const [pendingRevealQuestionIds, setPendingRevealQuestionIds] = useState<number[]>([]);
    const [feedbackPhase, setFeedbackPhase] = useState<'answering' | 'revealing'>('answering');
    const [feedbackTimingMode, setFeedbackTimingMode] = useState<FeedbackTimingMode>('immediate');
    const [feedbackBlockSize, setFeedbackBlockSize] = useState(5);
    const [markedQuestions, setMarkedQuestions] = useState<number[]>([]);
    const [handwritingMap, setHandwritingMap] = useState<Record<string, HandwritingPadState>>({});
    const [isTestCompleted, setIsTestCompleted] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileViewport());
    const [activeHistory, setActiveHistory] = useState<QuizHistory | null>(null);
    const [historyMode, setHistoryMode] = useState<HistoryMode>('normal');
    const [showEmptyCardsModal, setShowEmptyCardsModal] = useState(false);
    const {
        sessionInlineNotice,
        sessionPointerNotice,
        resetSessionNotices,
        flashSessionInlineNotice,
        flashSessionPointerNotice,
    } = useSessionNotices();
    const startTimeRef = useRef<Date>(new Date());

    const lastSessionKeyRef = useRef<string | null>(null);
    const saveDebounceRef = useRef<number | null>(null);
    const completedQuestionIdsRef = useRef<number[]>([]);
    const persistedCompletedQuestionIdsRef = useRef<number[]>([]);

    // Mirror of state needed for auto-save (to avoid stale closure in event listeners)
    const autoSaveStateRef = useRef({
        quizSetId: undefined as number | undefined,
        questions,
        currentQuestionIndex,
        answeredMap,
        showAnswerMap,
        pendingRevealQuestionIds,
        feedbackPhase,
        feedbackTimingMode,
        feedbackBlockSize,
        markedQuestions,
        historyMode,
        memorizationLogs,
        memorizationInputsMap,
        isTestCompleted: false,
        activeHistory: null as QuizHistory | null,
    });

    // Unique key for the current session
    const sessionKey = buildQuizSessionKey({
        quizSetId,
        startNew: startNewFromState,
        historyId: historyFromState?.id,
        reviewQuestionIds: reviewQuestionIdsFromState,
        locationKey: location.key,
    });

    // Synchronous state reset to prevent flickering
    const [renderedSessionKey, setRenderedSessionKey] = useState<string | null>(null);
    if (renderedSessionKey !== sessionKey) {
        setRenderedSessionKey(sessionKey);
        setIsLoading(true);
        setQuestions([]);
        setMemorizationLogs([]);
        setMemorizationInputsMap({});
        setAnsweredMap({});
        setShowAnswerMap({});
        setPendingRevealQuestionIds([]);
        setFeedbackPhase('answering');
        setFeedbackTimingMode('immediate');
        setFeedbackBlockSize(5);
        setCurrentQuestionIndex(0);
        setMarkedQuestions([]);
        setHandwritingMap({});
        setIsTestCompleted(false);
        setSidebarOpen(!isMobileViewport());
        setActiveHistory(null);
        setHistoryMode('normal');
        setShowEmptyCardsModal(false);
        resetSessionNotices();
    }

    useEffect(() => {
        clearWindowTimeout(saveDebounceRef);
        completedQuestionIdsRef.current = [];
        persistedCompletedQuestionIdsRef.current = [];
    }, [sessionKey]);

    const buildMemorizationSessionForSave = ({
        questions: targetQuestions,
        currentQuestionIndex: targetCurrentQuestionIndex,
        answeredMap: targetAnsweredMap,
        showAnswerMap: targetShowAnswerMap,
        pendingRevealQuestionIds: targetPendingRevealQuestionIds,
        feedbackPhase: targetFeedbackPhase,
        feedbackTimingMode: targetFeedbackTimingMode,
        feedbackBlockSize: targetFeedbackBlockSize,
        markedQuestions: targetMarkedQuestions,
        historyMode: targetHistoryMode,
        memorizationLogs: targetMemorizationLogs,
        memorizationInputsMap: targetMemorizationInputsMap,
    }: {
        questions: Question[];
        currentQuestionIndex: number;
        answeredMap: Record<string, boolean>;
        showAnswerMap: Record<string, boolean>;
        pendingRevealQuestionIds: number[];
        feedbackPhase: 'answering' | 'revealing';
        feedbackTimingMode: FeedbackTimingMode;
        feedbackBlockSize: number;
        markedQuestions: number[];
        historyMode: HistoryMode;
        memorizationLogs: MemorizationLog[];
        memorizationInputsMap: Record<string, string[]>;
    }): SuspendedSession => {
        const session = buildMemorizationSuspendedSession({
            questions: targetQuestions,
            currentQuestionIndex: targetCurrentQuestionIndex,
            answeredMap: targetAnsweredMap,
            showAnswerMap: targetShowAnswerMap,
            pendingRevealQuestionIds: targetPendingRevealQuestionIds,
            feedbackPhase: targetFeedbackPhase,
            feedbackTimingMode: targetFeedbackTimingMode,
            feedbackBlockSize: targetFeedbackBlockSize,
            markedQuestions: targetMarkedQuestions,
            startTime: startTimeRef.current,
            historyMode: targetHistoryMode,
            memorizationLogs: targetMemorizationLogs,
            memorizationInputsMap: targetMemorizationInputsMap,
        });

        if (sessionSlotKey !== REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY) {
            return session;
        }

        const completedQuestionIds = mergeCompletedQuestionIds(
            completedQuestionIdsRef.current,
            getCompletedQuestionIdsFromSuspendedSession(session)
        );
        completedQuestionIdsRef.current = completedQuestionIds;

        return {
            ...session,
            completedQuestionIds,
            persistedCompletedQuestionIds: persistedCompletedQuestionIdsRef.current,
        };
    };

    const buildMemorizationReviewScheduleUpdates = async (
        questionIds: number[],
        targetLogs: MemorizationLog[]
    ): Promise<(Omit<ReviewSchedule, 'id'> & { id?: number })[]> => {
        if (activeQuizSet?.id === undefined || questionIds.length === 0) {
            return [];
        }

        const existingSchedules = await getReviewSchedulesForQuizSet(activeQuizSet.id);
        const intervalByQuestionId = new Map(existingSchedules.map(s => [s.questionId, s.intervalDays]));
        const consecutiveByQuestionId = new Map(existingSchedules.map(s => [s.questionId, s.consecutiveCorrect]));
        const reviewIntervalSettings = loadReviewIntervalSettings();
        const logByQuestionId = new Map(targetLogs.map((log) => [log.questionId, log]));

        return questionIds.flatMap((questionId) => {
            const log = logByQuestionId.get(questionId);
            if (!log) {
                return [];
            }

            const currentInterval = intervalByQuestionId.get(questionId) ?? 1;
            const currentConsecutive = consecutiveByQuestionId.get(questionId) ?? 0;
            const intervalDays = calculateNextInterval(log.isMemorized, 'high', currentInterval, reviewIntervalSettings);
            const nextDue = calculateNextDue(intervalDays);
            const consecutiveCorrect = updateConsecutiveCorrect(log.isMemorized, currentConsecutive);

            return [{
                questionId,
                quizSetId: activeQuizSet.id!,
                intervalDays,
                nextDue,
                lastReviewedAt: new Date().toISOString(),
                consecutiveCorrect,
            }];
        });
    };

    const saveMemorizationSession = async ({
        quizSetId: targetQuizSetId,
        questions: targetQuestions,
        currentQuestionIndex: targetCurrentQuestionIndex,
        answeredMap: targetAnsweredMap,
        showAnswerMap: targetShowAnswerMap,
        pendingRevealQuestionIds: targetPendingRevealQuestionIds,
        feedbackPhase: targetFeedbackPhase,
        feedbackTimingMode: targetFeedbackTimingMode,
        feedbackBlockSize: targetFeedbackBlockSize,
        markedQuestions: targetMarkedQuestions,
        historyMode: targetHistoryMode,
        memorizationLogs: targetMemorizationLogs,
        memorizationInputsMap: targetMemorizationInputsMap,
    }: {
        quizSetId: number;
        questions: Question[];
        currentQuestionIndex: number;
        answeredMap: Record<string, boolean>;
        showAnswerMap: Record<string, boolean>;
        pendingRevealQuestionIds: number[];
        feedbackPhase: 'answering' | 'revealing';
        feedbackTimingMode: FeedbackTimingMode;
        feedbackBlockSize: number;
        markedQuestions: number[];
        historyMode: HistoryMode;
        memorizationLogs: MemorizationLog[];
        memorizationInputsMap: Record<string, string[]>;
    }) => {
        let session = buildMemorizationSessionForSave({
            questions: targetQuestions,
            currentQuestionIndex: targetCurrentQuestionIndex,
            answeredMap: targetAnsweredMap,
            showAnswerMap: targetShowAnswerMap,
            pendingRevealQuestionIds: targetPendingRevealQuestionIds,
            feedbackPhase: targetFeedbackPhase,
            feedbackTimingMode: targetFeedbackTimingMode,
            feedbackBlockSize: targetFeedbackBlockSize,
            markedQuestions: targetMarkedQuestions,
            historyMode: targetHistoryMode,
            memorizationLogs: targetMemorizationLogs,
            memorizationInputsMap: targetMemorizationInputsMap,
        });

        if (sessionSlotKey === REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY) {
            const persistedSet = new Set(persistedCompletedQuestionIdsRef.current);
            const newCompletedQuestionIds = (session.completedQuestionIds || []).filter((questionId) => !persistedSet.has(questionId));
            if (newCompletedQuestionIds.length > 0) {
                const schedulesToUpdate = await buildMemorizationReviewScheduleUpdates(
                    newCompletedQuestionIds,
                    targetMemorizationLogs
                );
                if (schedulesToUpdate.length > 0) {
                    await upsertReviewSchedulesBulk(schedulesToUpdate);
                    persistedCompletedQuestionIdsRef.current = mergeCompletedQuestionIds(
                        persistedCompletedQuestionIdsRef.current,
                        schedulesToUpdate.map((schedule) => schedule.questionId)
                    );
                }
            }

            session = {
                ...session,
                persistedCompletedQuestionIds: persistedCompletedQuestionIdsRef.current,
            };
        }

        await saveSessionToStorage(targetQuizSetId, session, sessionSlotKey);
    };

    // Auto-save session when page is hidden or app is closed
    const doAutoSaveRef = useRef<() => void>(() => {});
    useEffect(() => {
        doAutoSaveRef.current = () => {
            const s = autoSaveStateRef.current;
            if (s.isTestCompleted || s.activeHistory !== null) return;
            if (s.quizSetId === undefined || s.questions.length === 0) return;
            void saveMemorizationSession({
                quizSetId: s.quizSetId,
                questions: s.questions,
                currentQuestionIndex: s.currentQuestionIndex,
                answeredMap: s.answeredMap,
                showAnswerMap: s.showAnswerMap,
                pendingRevealQuestionIds: s.pendingRevealQuestionIds,
                feedbackPhase: s.feedbackPhase,
                feedbackTimingMode: s.feedbackTimingMode,
                feedbackBlockSize: s.feedbackBlockSize,
                markedQuestions: s.markedQuestions,
                historyMode: s.historyMode,
                memorizationLogs: s.memorizationLogs,
                memorizationInputsMap: s.memorizationInputsMap,
            }).catch((err) => {
                console.error('Failed to auto-save suspended session', err);
            });
        };
    });

    const scheduleSaveSession = () => {
        clearWindowTimeout(saveDebounceRef);
        saveDebounceRef.current = window.setTimeout(() => {
            saveDebounceRef.current = null;
            doAutoSaveRef.current();
        }, 1000);
    };

    useSessionAutoSaveOnPageHide(doAutoSaveRef);

    // Keep autoSaveStateRef in sync with current state so event listeners always have fresh data
    useEffect(() => {
        autoSaveStateRef.current = {
            quizSetId: activeQuizSet?.id,
            questions,
            currentQuestionIndex,
            answeredMap,
            showAnswerMap,
            pendingRevealQuestionIds,
            feedbackPhase,
            feedbackTimingMode,
            feedbackBlockSize,
            markedQuestions,
            historyMode,
            memorizationLogs,
            memorizationInputsMap,
            isTestCompleted,
            activeHistory,
        };
    });

    const startNew = useCallback((qs: Question[], targetQuestionIds?: number[], mode: HistoryMode = 'normal') => {
        let studyQuestions: Question[] = qs.map(q => ({ ...q, id: q.id! }));
        if (targetQuestionIds && targetQuestionIds.length > 0) {
            const targetSet = new Set(targetQuestionIds);
            studyQuestions = studyQuestions.filter(q => targetSet.has(q.id!));
        }

        if (studyQuestions.length === 0) {
            alert('復習対象の問題が見つかりませんでした。');
            setIsLoading(false);
            if (fromReviewBoardFromState) {
                navigate('/review-board');
            } else {
                navigate(`/quiz/${quizSetId}`);
            }
            return;
        }

        if (quizSetId) {
            const settings = loadQuizSetSettings(quizSetId);
            studyQuestions = applyShuffleSettings(studyQuestions, settings);
            if (sessionSlotKey === DEFAULT_SUSPENDED_SESSION_SLOT_KEY) {
                clearSessionFromStorage(quizSetId, sessionSlotKey).catch(err => console.error('Failed to clear suspended session', err));
            }
            if (mode === 'review_due') {
                const reviewBoardSettings = loadReviewBoardSettings();
                setFeedbackTimingMode('delayed_block');
                setFeedbackBlockSize(resolveReviewBoardFeedbackBlockSize(studyQuestions.length, reviewBoardSettings));
            } else {
                setFeedbackTimingMode(settings.feedbackTimingMode);
                setFeedbackBlockSize(settings.feedbackBlockSize);
            }
        }
        completedQuestionIdsRef.current = [];
        persistedCompletedQuestionIdsRef.current = [];
        setQuestions(studyQuestions);
        setMemorizationLogs([]);
        setMemorizationInputsMap({});
        setAnsweredMap({});
        setShowAnswerMap({});
        setPendingRevealQuestionIds([]);
        setFeedbackPhase('answering');
        setCurrentQuestionIndex(0);
        setMarkedQuestions([]);
        setIsTestCompleted(false);
        setActiveHistory(null);
        setHistoryMode(mode);
        startTimeRef.current = new Date();

        // Mark as initialized to prevent useEffect from re-shuffling
        lastSessionKeyRef.current = sessionKey;
        setIsLoading(false);
    }, [navigate, quizSetId, sessionKey, fromReviewBoardFromState, sessionSlotKey]);

    useEffect(() => {
        const initMem = async () => {
            if (!quizSetId) return;

            // Atomic Guard
            if (lastSessionKeyRef.current === sessionKey) return;
            lastSessionKeyRef.current = sessionKey;

            try {
                const qs = await getQuestionsForQuizSet(quizSetId);
                const quizSetSettings = loadQuizSetSettings(quizSetId);
                const shouldLoadSuspendedSession = fromReviewBoardFromState ? true : !startNewFromState;
                const suspendedSession = shouldLoadSuspendedSession
                    ? await loadSessionFromStorage(quizSetId, sessionSlotKey)
                    : null;

                const restoreSuspendedSession = (session: SuspendedSession) => {
                    const filteredQuestions = filterExistingSessionQuestions(session.questions, qs);

                    if (filteredQuestions.length === 0) {
                        return false;
                    }

                    completedQuestionIdsRef.current = getCompletedQuestionIdsFromSuspendedSession(session);
                    persistedCompletedQuestionIdsRef.current = mergeCompletedQuestionIds(session.persistedCompletedQuestionIds);
                    const nextIndex = Math.min(session.currentQuestionIndex, filteredQuestions.length - 1);
                    setQuestions(filteredQuestions);
                    setMemorizationLogs(session.memorizationLogs || []);
                    setMemorizationInputsMap(session.memorizationInputsMap || {});
                    setAnsweredMap(session.answeredMap || {});
                    setShowAnswerMap(session.showAnswerMap || {});
                    setPendingRevealQuestionIds(session.pendingRevealQuestionIds || []);
                    setFeedbackPhase(session.feedbackPhase || 'answering');
                    if (sessionSlotKey === REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY) {
                        const reviewBoardSettings = loadReviewBoardSettings();
                        const reviewBoardFeedbackBlockSize = resolveReviewBoardFeedbackBlockSize(filteredQuestions.length, reviewBoardSettings);
                        setFeedbackTimingMode(session.feedbackTimingMode || 'delayed_block');
                        setFeedbackBlockSize(session.feedbackBlockSize || reviewBoardFeedbackBlockSize);
                    } else {
                        setFeedbackTimingMode(session.feedbackTimingMode || quizSetSettings.feedbackTimingMode);
                        setFeedbackBlockSize(session.feedbackBlockSize || quizSetSettings.feedbackBlockSize);
                    }
                    setCurrentQuestionIndex(Math.max(0, nextIndex));
                    setMarkedQuestions(session.markedQuestions || []);
                    startTimeRef.current = buildResumedStartTime(session.elapsedSeconds);
                    setIsTestCompleted(false);
                    setActiveHistory(null);
                    setHistoryMode(session.historyMode || 'normal');
                    setIsLoading(false);
                    return true;
                };

                if (!historyFromState && !reviewQuestionIdsFromState && qs.length === 0) {
                    await clearSessionFromStorage(quizSetId, sessionSlotKey).catch(err => console.error('Failed to clear suspended session', err));
                    setQuestions([]);
                    setShowEmptyCardsModal(true);
                    setIsLoading(false);
                    return;
                }

                if (historyFromState && historyFromState.memorizationDetail && historyFromState.memorizationDetail.length > 0) {
                    const inputsMap: Record<string, string[]> = {};
                    const allAnswered: Record<string, boolean> = {};
                    const allShown: Record<string, boolean> = {};
                    historyFromState.memorizationDetail.forEach(log => {
                        inputsMap[String(log.questionId)] = log.userInputs;
                        allAnswered[String(log.questionId)] = true;
                        allShown[String(log.questionId)] = true;
                    });

                    setQuestions(qs);
                    setActiveHistory(historyFromState);
                    setMemorizationLogs(historyFromState.memorizationDetail);
                    setMemorizationInputsMap(inputsMap);
                    setAnsweredMap(allAnswered);
                    setShowAnswerMap(allShown);
                    setPendingRevealQuestionIds([]);
                    setFeedbackPhase('revealing');
                    setFeedbackTimingMode(historyFromState.feedbackTimingMode || 'immediate');
                    setFeedbackBlockSize(quizSetSettings.feedbackBlockSize);
                    setMarkedQuestions(historyFromState.markedQuestionIds || []);
                    setIsTestCompleted(true);
                    setHistoryMode(historyFromState.mode || 'normal');
                    setIsLoading(false);
                    return;
                }

                if (fromReviewBoardFromState && reviewQuestionIdsFromState && reviewQuestionIdsFromState.length > 0) {
                    if (suspendedSession && suspendedSession.type === 'memorization') {
                        const reviewResumeSession = buildReviewDueResumeSession(suspendedSession, qs, reviewQuestionIdsFromState);
                        if (restoreSuspendedSession(reviewResumeSession)) {
                            return;
                        }

                        await clearSessionFromStorage(quizSetId, sessionSlotKey).catch(err => console.error('Failed to clear suspended session', err));
                    }

                    startNew(qs, reviewQuestionIdsFromState, 'review_due');
                    return;
                }

                if (reviewQuestionIdsFromState && reviewQuestionIdsFromState.length > 0) {
                    startNew(qs, reviewQuestionIdsFromState, 'review_due');
                    return;
                }

                if (suspendedSession && suspendedSession.type === 'memorization') {
                    if (!restoreSuspendedSession(suspendedSession)) {
                        alert('中断していた問題はすべて削除されました。');
                        await clearSessionFromStorage(quizSetId, sessionSlotKey);
                        startNew(qs);
                    } else {
                        return;
                    }
                } else {
                    startNew(qs);
                }
            } catch (err) {
                console.error('Failed to load questions:', err);
                lastSessionKeyRef.current = null; // Allow retry after error
                alert('問題の読み込みに失敗しました');
                setIsLoading(false);
            }
        };

        initMem();
    }, [sessionKey, startNew, quizSetId, historyFromState, startNewFromState, reviewQuestionIdsFromState, fromReviewBoardFromState, sessionSlotKey]);

    const handleBackToDetail = () => {
        clearWindowTimeout(saveDebounceRef);

        const quizSetIdForSave = activeQuizSet?.id;
        const shouldSaveSuspendedSession =
            !isTestCompleted &&
            !activeHistory &&
            quizSetIdForSave !== undefined &&
            questions.length > 0;

        if (fromReviewBoardFromState) {
            if (shouldSaveSuspendedSession && quizSetIdForSave !== undefined) {
                void saveMemorizationSession({
                    quizSetId: quizSetIdForSave,
                    questions,
                    currentQuestionIndex,
                    answeredMap,
                    showAnswerMap,
                    pendingRevealQuestionIds,
                    feedbackPhase,
                    feedbackTimingMode,
                    feedbackBlockSize,
                    markedQuestions,
                    historyMode,
                    memorizationLogs,
                    memorizationInputsMap,
                }).catch((err) => {
                    console.error('Failed to save suspended session', err);
                });
            }
            navigate('/review-board');
            return;
        }

        if (shouldSaveSuspendedSession) {
            void saveMemorizationSession({
                quizSetId: quizSetIdForSave,
                questions,
                currentQuestionIndex,
                answeredMap,
                showAnswerMap,
                pendingRevealQuestionIds,
                feedbackPhase,
                feedbackTimingMode,
                feedbackBlockSize,
                markedQuestions,
                historyMode,
                memorizationLogs,
                memorizationInputsMap,
            }).catch((err) => {
                console.error('Failed to save suspended session', err);
            });

            navigate(`/quiz/${quizSetId}`, { state: { expectSuspendedSession: true } });
            return;
        }
        navigate(`/quiz/${quizSetId}`);
    };

    const handleToggleMark = (questionId?: number) => {
        let qId = typeof questionId === 'number' ? questionId : undefined;
        if (qId === undefined) {
            const currentQuestion = questions[currentQuestionIndex];
            if (!currentQuestion || !currentQuestion.id) return;
            qId = currentQuestion.id;
        }

        setMarkedQuestions(prev => {
            if (prev.includes(qId!)) {
                return prev.filter(id => id !== qId);
            } else {
                return [...prev, qId!];
            }
        });
    };

    const findQuestionIndexById = (questionId: number): number => {
        return questions.findIndex(q => q.id === questionId);
    };

    const findNextUnansweredIndex = (fromIndex: number, targetAnsweredMap: Record<string, boolean> = answeredMap): number => {
        for (let i = fromIndex + 1; i < questions.length; i++) {
            if (!targetAnsweredMap[String(questions[i].id)]) {
                return i;
            }
        }
        for (let i = 0; i <= fromIndex; i++) {
            if (!targetAnsweredMap[String(questions[i].id)]) {
                return i;
            }
        }
        return -1;
    };

    const getUnjudgedAnsweredQuestionIds = (
        targetAnsweredMap: Record<string, boolean> = answeredMap,
        targetLogs: MemorizationLog[] = memorizationLogs
    ): number[] => {
        const judgedSet = new Set(targetLogs.map(log => log.questionId));
        return questions
            .map(q => q.id!)
            .filter(questionId => targetAnsweredMap[String(questionId)] && !judgedSet.has(questionId));
    };

    const enterRevealPhase = (questionIds: number[]) => {
        if (questionIds.length === 0) return;
        setFeedbackPhase('revealing');
        setPendingRevealQuestionIds(questionIds);
        const nextIndex = findQuestionIndexById(questionIds[0]);
        if (nextIndex >= 0) {
            setCurrentQuestionIndex(nextIndex);
        }
    };

    const hasAnyMemorizationInput = (
        questionId: number,
        targetInputsMap: Record<string, string[]> = memorizationInputsMap
    ): boolean => {
        const inputs = targetInputsMap[String(questionId)] || [];
        return inputs.some(input => input.trim().length > 0);
    };

    const getAnsweringPhasePendingIdsForBlock = (
        targetInputsMap: Record<string, string[]> = memorizationInputsMap,
        targetAnsweredMap: Record<string, boolean> = answeredMap,
        targetPendingRevealQuestionIds: number[] = pendingRevealQuestionIds,
        targetLogs: MemorizationLog[] = memorizationLogs
    ): number[] => {
        const judgedSet = new Set(targetLogs.map(log => log.questionId));
        const pendingSet = new Set<number>();

        targetPendingRevealQuestionIds.forEach(questionId => {
            if (!judgedSet.has(questionId)) {
                pendingSet.add(questionId);
            }
        });

        questions.forEach(q => {
            const questionId = q.id!;
            const qKey = String(questionId);
            if (judgedSet.has(questionId)) return;
            if (targetAnsweredMap[qKey]) {
                pendingSet.add(questionId);
                return;
            }
            if (hasAnyMemorizationInput(questionId, targetInputsMap)) {
                pendingSet.add(questionId);
            }
        });

        return questions.map(q => q.id!).filter(questionId => pendingSet.has(questionId));
    };

    const getDelayedBlockLockPreview = (
        targetInputsMap: Record<string, string[]> = memorizationInputsMap,
        targetAnsweredMap: Record<string, boolean> = answeredMap,
        targetPendingRevealQuestionIds: number[] = pendingRevealQuestionIds,
        targetLogs: MemorizationLog[] = memorizationLogs
    ) => {
        if (feedbackTimingMode !== 'delayed_block' || feedbackPhase !== 'answering' || questions.length === 0) {
            return { locked: false, pendingIds: [] as number[], remainingCount: 0 };
        }

        const pendingIds = getAnsweringPhasePendingIdsForBlock(
            targetInputsMap,
            targetAnsweredMap,
            targetPendingRevealQuestionIds,
            targetLogs
        );
        const pendingSet = new Set(pendingIds);
        const judgedSet = new Set(targetLogs.map(log => log.questionId));
        const allAnsweredLike = questions.every(
            q => judgedSet.has(q.id!) || pendingSet.has(q.id!)
        );
        const locked = pendingIds.length > 0 && (pendingIds.length >= feedbackBlockSize || allAnsweredLike);

        return {
            locked,
            pendingIds,
            remainingCount: pendingIds.length,
        };
    };

    const handleInputChange = (optionIndex: number, value: string) => {
        const currentQ = questions[currentQuestionIndex];
        if (!currentQ) return;
        const qId = String(currentQ.id);

        const baseInputs = memorizationInputsMap[qId] || new Array(currentQ.options.length).fill('');
        const nextInputs = [...baseInputs];
        nextInputs[optionIndex] = value;
        const nextInputsMap = { ...memorizationInputsMap, [qId]: nextInputs };

        setMemorizationInputsMap(nextInputsMap);
        scheduleSaveSession();
    };

    const handleRevealAnswer = () => {
        const currentQ = questions[currentQuestionIndex];
        if (!currentQ) return;
        const questionId = currentQ.id!;
        const qId = String(questionId);

        setMemorizationInputsMap(prev => {
            if (prev[qId]) return prev;
            return { ...prev, [qId]: new Array(currentQ.options.length).fill('') };
        });

        if (feedbackTimingMode === 'immediate' || feedbackPhase === 'revealing') {
            setAnsweredMap(prev => ({ ...prev, [qId]: true }));
            setShowAnswerMap(prev => ({ ...prev, [qId]: true }));
            scheduleSaveSession();
            return;
        }

        const alreadyAnswered = answeredMap[qId] === true;
        const nextAnsweredMap = alreadyAnswered
            ? answeredMap
            : { ...answeredMap, [qId]: true };

        if (!alreadyAnswered) {
            setAnsweredMap(nextAnsweredMap);
        }

        const nextPendingRevealQuestionIds = pendingRevealQuestionIds.includes(questionId)
            ? pendingRevealQuestionIds
            : [...pendingRevealQuestionIds, questionId];

        if (!pendingRevealQuestionIds.includes(questionId)) {
            setPendingRevealQuestionIds(nextPendingRevealQuestionIds);
        }

        const allAnswered = questions.every(q => nextAnsweredMap[String(q.id)] === true);
        const shouldLockByDelayedBlock = feedbackTimingMode === 'delayed_block' &&
            (nextPendingRevealQuestionIds.length >= feedbackBlockSize || allAnswered);

        if (feedbackTimingMode === 'delayed_end' && allAnswered) {
            enterRevealPhase(getUnjudgedAnsweredQuestionIds(nextAnsweredMap));
            scheduleSaveSession();
            return;
        }

        if (shouldLockByDelayedBlock) {
            enterRevealPhase(nextPendingRevealQuestionIds);
            scheduleSaveSession();
            return;
        }

        const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex, nextAnsweredMap);
        if (nextUnansweredIndex >= 0) {
            setCurrentQuestionIndex(nextUnansweredIndex);
        }
        scheduleSaveSession();
    };

    const handleSidebarSelectQuestion = (targetIndex: number, clickPosition?: SidebarClickPosition) => {
        if (targetIndex < 0 || targetIndex >= questions.length || targetIndex === currentQuestionIndex) {
            return;
        }

        const currentQ = questions[currentQuestionIndex];
        if (!currentQ) {
            setCurrentQuestionIndex(targetIndex);
            scheduleSaveSession();
            return;
        }

        const targetQuestionId = questions[targetIndex].id!;

        if (feedbackTimingMode !== 'immediate' && feedbackPhase === 'revealing') {
            const judgedSet = new Set(memorizationLogs.map(log => log.questionId));
            const remainingPendingCount = pendingRevealQuestionIds.filter(
                questionId => !judgedSet.has(questionId)
            ).length;
            const isTargetPending = pendingRevealQuestionIds.includes(targetQuestionId);
            const isTargetAlreadyConfirmed = judgedSet.has(targetQuestionId);
            if (remainingPendingCount > 0 && !isTargetPending && !isTargetAlreadyConfirmed) {
                flashSessionPointerNotice(`残り${remainingPendingCount}件の回答確認後に移動できます`, clickPosition);
                return;
            }

            if (remainingPendingCount === 0 && feedbackTimingMode === 'delayed_block') {
                setPendingRevealQuestionIds([]);
                setFeedbackPhase('answering');
                setCurrentQuestionIndex(targetIndex);
                scheduleSaveSession();
                return;
            }

            if (isTargetPending) {
                setShowAnswerMap(prev => ({ ...prev, [String(targetQuestionId)]: true }));
            }
            setCurrentQuestionIndex(targetIndex);
            scheduleSaveSession();
            return;
        }

        if (feedbackTimingMode === 'immediate' || feedbackPhase !== 'answering') {
            setCurrentQuestionIndex(targetIndex);
            scheduleSaveSession();
            return;
        }

        const currentQuestionId = currentQ.id!;
        const currentQKey = String(currentQuestionId);
        const currentInputs = memorizationInputsMap[currentQKey] || [];
        const hasAnyInput = currentInputs.some(input => input.trim().length > 0);
        let nextAnsweredMap = answeredMap;
        let nextPendingRevealQuestionIds = pendingRevealQuestionIds;
        let didAutoSave = false;

        if (hasAnyInput && !answeredMap[currentQKey] && !showAnswerMap[currentQKey]) {
            nextAnsweredMap = { ...answeredMap, [currentQKey]: true };
            setAnsweredMap(nextAnsweredMap);
            didAutoSave = true;

            nextPendingRevealQuestionIds = pendingRevealQuestionIds.includes(currentQuestionId)
                ? pendingRevealQuestionIds
                : [...pendingRevealQuestionIds, currentQuestionId];

            if (!pendingRevealQuestionIds.includes(currentQuestionId)) {
                setPendingRevealQuestionIds(nextPendingRevealQuestionIds);
            }
        }

        const blockState = getDelayedBlockLockPreview(
            memorizationInputsMap,
            nextAnsweredMap,
            nextPendingRevealQuestionIds,
            memorizationLogs
        );
        const judgedSet = new Set(memorizationLogs.map(log => log.questionId));
        const isTargetAlreadyConfirmed = judgedSet.has(targetQuestionId);
        if (
            blockState.locked &&
            blockState.remainingCount > 0 &&
            !blockState.pendingIds.includes(targetQuestionId) &&
            !isTargetAlreadyConfirmed
        ) {
            flashSessionPointerNotice(`残り${blockState.remainingCount}件の回答確認後に移動できます`, clickPosition);
            return;
        }

        if (didAutoSave) {
            flashSessionInlineNotice('移動時に一時回答として保存しました');
        }

        setCurrentQuestionIndex(targetIndex);
        scheduleSaveSession();
    };

    const handleMoveNext = () => {
        if (feedbackTimingMode === 'immediate') {
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
                scheduleSaveSession();
            }
            return;
        }

        if (feedbackPhase === 'answering') {
            const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex);
            if (nextUnansweredIndex >= 0) {
                setCurrentQuestionIndex(nextUnansweredIndex);
                scheduleSaveSession();
                return;
            }

            const unjudgedAnswered = getUnjudgedAnsweredQuestionIds();
            if (unjudgedAnswered.length > 0) {
                enterRevealPhase(unjudgedAnswered);
                scheduleSaveSession();
            }
            return;
        }

        const judgedSet = new Set(memorizationLogs.map(log => log.questionId));
        const remainingPending = pendingRevealQuestionIds.filter(questionId => !judgedSet.has(questionId));
        const currentQuestionId = questions[currentQuestionIndex]?.id;
        if (currentQuestionId === undefined) return;

        const currentPos = remainingPending.indexOf(currentQuestionId);
        const nextPendingId = currentPos >= 0 ? remainingPending[currentPos + 1] : remainingPending[0];

        if (nextPendingId !== undefined) {
            const nextIndex = findQuestionIndexById(nextPendingId);
            if (nextIndex >= 0) {
                setCurrentQuestionIndex(nextIndex);
            }
            scheduleSaveSession();
            return;
        }

        setPendingRevealQuestionIds([]);
        const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex);
        if (feedbackTimingMode === 'delayed_block' && nextUnansweredIndex >= 0) {
            setFeedbackPhase('answering');
            setCurrentQuestionIndex(nextUnansweredIndex);
        }
        scheduleSaveSession();
    };

    const handleMemorizationJudge = (inputs: string[], isMemorized: boolean) => {
        const currentQ = questions[currentQuestionIndex];
        if (!currentQ) return;
        const qId = String(currentQ.id);

        setMemorizationInputsMap(prev => ({ ...prev, [qId]: inputs }));
        setAnsweredMap(prev => ({ ...prev, [qId]: true }));
        setShowAnswerMap(prev => ({ ...prev, [qId]: true }));

        const filteredLogs = memorizationLogs.filter(l => l.questionId !== currentQ.id);

        const log: MemorizationLog = {
            questionId: currentQ.id!,
            userInputs: inputs,
            isMemorized,
        };
        const newLogs = [...filteredLogs, log];
        setMemorizationLogs(newLogs);
        scheduleSaveSession();

        if (feedbackTimingMode === 'immediate') {
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
            }
            return;
        }

        if (feedbackPhase === 'revealing') {
            const judgedSet = new Set(newLogs.map(item => item.questionId));
            const remainingPending = pendingRevealQuestionIds.filter(questionId => !judgedSet.has(questionId));
            const currentPos = remainingPending.indexOf(currentQ.id!);
            const nextPendingId = currentPos >= 0 ? remainingPending[currentPos + 1] : remainingPending[0];

            if (nextPendingId !== undefined) {
                const nextIndex = findQuestionIndexById(nextPendingId);
                if (nextIndex >= 0) {
                    setCurrentQuestionIndex(nextIndex);
                }
                return;
            }

            setPendingRevealQuestionIds([]);
            const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex);
            if (feedbackTimingMode === 'delayed_block' && nextUnansweredIndex >= 0) {
                setFeedbackPhase('answering');
                setCurrentQuestionIndex(nextUnansweredIndex);
            }
        }
    };

    const handleCompleteMemorization = async (finalLogs: MemorizationLog[]) => {
        clearWindowTimeout(saveDebounceRef);
        setIsTestCompleted(true);
        if (activeHistory) return;
        const persistedCompletedQuestionIdSet = new Set(persistedCompletedQuestionIdsRef.current);

        const endTime = new Date();
        const durationSeconds = Math.floor((endTime.getTime() - startTimeRef.current.getTime()) / 1000);
        const memorizedCount = finalLogs.filter(l => l.isMemorized).length;

        const history: Omit<QuizHistory, 'id'> = {
            quizSetId: activeQuizSet!.id!,
            date: new Date(),
            totalCount: questions.length,
            correctCount: memorizedCount,
            durationSeconds,
            answers: {},
            markedQuestionIds: finalLogs.filter(l => !l.isMemorized).map(l => l.questionId),
            memorizationDetail: finalLogs,
            mode: historyMode,
            feedbackTimingMode,
        };

        if (activeQuizSet?.id !== undefined) {
            await clearSessionFromStorage(activeQuizSet.id, sessionSlotKey);
            completedQuestionIdsRef.current = [];
            persistedCompletedQuestionIdsRef.current = [];
        }

        try {
            await addHistory(history);

            if (activeQuizSet?.id !== undefined && finalLogs.length > 0) {
                const schedulesToUpdate = await buildMemorizationReviewScheduleUpdates(
                    finalLogs
                        .map((log) => log.questionId)
                        .filter((questionId) => !persistedCompletedQuestionIdSet.has(questionId)),
                    finalLogs
                );

                await upsertReviewSchedulesBulk(schedulesToUpdate);
            }
        } catch (e) {
            console.error('Failed to save history', e);
        }
    };

    const handleShowResult = async () => {
        const unansweredCount = questions.filter(q => q.id !== undefined && !answeredMap[String(q.id)]).length;
        if (unansweredCount > 0) {
            const shouldComplete = window.confirm(`未回答の問題が${unansweredCount}問あります。テスト結果を表示してもいいですか？`);
            if (!shouldComplete) return;
        }

        if (feedbackTimingMode !== 'immediate') {
            const unjudgedAnswered = getUnjudgedAnsweredQuestionIds();
            if (unjudgedAnswered.length > 0) {
                enterRevealPhase(unjudgedAnswered);
                return;
            }
        }

        await handleCompleteMemorization(memorizationLogs);
    };

    const handleRetryMemorization = () => {
        setIsLoading(true);
        getQuestionsForQuizSet(quizSetId!).then(qs => {
            startNew(qs);
        });
    };

    const memStatus = useMemo(() => {
        return memorizationLogs.reduce((acc, log) => {
            acc[log.questionId] = log.isMemorized ? 'memorized' : 'not_memorized';
            return acc;
        }, {} as Record<number, 'memorized' | 'not_memorized' | 'unanswered'>);
    }, [memorizationLogs]);

    if (!activeQuizSet) {
        return <NotFoundView />;
    }

    const managePath = `/quiz/${quizSetId}/manage`;
    const detailPath = `/quiz/${quizSetId}`;
    const currentQuestion = questions[currentQuestionIndex];
    const currentQuestionKey = currentQuestion ? String(currentQuestion.id) : '';
    const currentInputs = currentQuestion
        ? (memorizationInputsMap[currentQuestionKey] || new Array(currentQuestion.options.length).fill(''))
        : [];
    const judgedQuestionIds = new Set(memorizationLogs.map(log => log.questionId));
    const isCurrentQuestionJudged = currentQuestion ? judgedQuestionIds.has(currentQuestion.id!) : false;
    const showAnswerForCurrent = currentQuestion
        ? (feedbackTimingMode === 'immediate'
            ? showAnswerMap[currentQuestionKey] === true
            : feedbackPhase === 'revealing' && answeredMap[currentQuestionKey] === true)
        : false;
    const isAnswerLocked = currentQuestion
        ? (feedbackTimingMode !== 'immediate' &&
            feedbackPhase === 'answering' &&
            answeredMap[currentQuestionKey] === true &&
            !showAnswerMap[currentQuestionKey])
        : false;
    const revealReadyCount = (() => {
        if (!currentQuestion) return null;
        if (feedbackTimingMode === 'immediate') return null;
        if (feedbackPhase !== 'answering') return null;
        if (showAnswerMap[currentQuestionKey]) return null;

        if (feedbackTimingMode === 'delayed_block') {
            const blockState = getDelayedBlockLockPreview();
            if (blockState.locked && blockState.pendingIds.includes(currentQuestion.id!)) {
                return blockState.remainingCount > 0 ? blockState.remainingCount : null;
            }

            if (judgedQuestionIds.has(currentQuestion.id!)) {
                return null;
            }
            if (!blockState.pendingIds.includes(currentQuestion.id!)) {
                const predictedCount = blockState.pendingIds.length + 1;
                const pendingSet = new Set<number>(blockState.pendingIds);
                const allAnsweredLikeAfterCurrent = questions.every(
                    q => judgedQuestionIds.has(q.id!) || pendingSet.has(q.id!) || q.id === currentQuestion.id!
                );
                const shouldLockAfterCurrent = predictedCount > 0 &&
                    (predictedCount >= feedbackBlockSize || allAnsweredLikeAfterCurrent);

                if (shouldLockAfterCurrent) {
                    return predictedCount;
                }
            }
            return null;
        }

        if (answeredMap[currentQuestionKey] || hasAnyMemorizationInput(currentQuestion.id!)) {
            const allAnsweredNow = questions.every(q => answeredMap[String(q.id)] === true);

            if (feedbackTimingMode === 'delayed_end') {
                if (!allAnsweredNow) return null;
                const unjudgedCount = questions.filter(q => answeredMap[String(q.id)] && !judgedQuestionIds.has(q.id!)).length;
                return unjudgedCount > 0 ? unjudgedCount : null;
            }
        }

        return null;
    })();
    const canShowResultButton = currentQuestionIndex === questions.length - 1 ||
        (feedbackTimingMode !== 'immediate' &&
            questions.length > 0 &&
            questions.every(q => answeredMap[String(q.id)] && judgedQuestionIds.has(q.id!)));
    const sidebarLockedQuestionIds = (() => {
        if (feedbackTimingMode === 'immediate' || questions.length === 0) {
            return [] as number[];
        }

        const blockState = getDelayedBlockLockPreview();
        if (blockState.locked && blockState.remainingCount > 0) {
            const allowedSet = new Set(blockState.pendingIds);
            return questions
                .filter(q => !allowedSet.has(q.id!) && !judgedQuestionIds.has(q.id!))
                .map(q => q.id!);
        }

        if (feedbackPhase === 'revealing') {
            const judgedSet = new Set(memorizationLogs.map(log => log.questionId));
            const remainingPendingCount = pendingRevealQuestionIds.filter(questionId => !judgedSet.has(questionId)).length;
            if (remainingPendingCount > 0) {
                const allowedSet = new Set(pendingRevealQuestionIds);
                return questions
                    .filter(q => !allowedSet.has(q.id!) && !judgedSet.has(q.id!))
                    .map(q => q.id!);
            }
        }

        return [] as number[];
    })();

    const reviewHeaderBadge =
        historyMode === 'review_wrong'
            ? '復習中（誤りのみ）'
            : historyMode === 'review_weak' || historyMode === 'review_weak_strict'
                ? '復習中（苦手）'
                : historyMode === 'review_due'
                    ? '復習中'
                    : undefined;
    return (
        <QuizSessionLayout
            title={`${activeQuizSet.name} (暗記)`}
            isLoading={isLoading}
            sidebarOpen={sidebarOpen}
            showSidebar={!isTestCompleted}
            hideMenuButton={isTestCompleted}
            onBack={handleBackToDetail}
            sessionBadge={!isTestCompleted ? reviewHeaderBadge : undefined}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onCloseSidebar={() => setSidebarOpen(false)}
            sidebarContent={
                <Sidebar
                    questions={questions}
                    currentQuestionIndex={currentQuestionIndex}
                    onSelectQuestion={handleSidebarSelectQuestion}
                    mode="memorization"
                    memorizationStatus={memStatus}
                    answers={{}}
                    answeredMap={answeredMap}
                    showAnswerMap={{}}
                    markedQuestionIds={markedQuestions}
                    onToggleMark={handleToggleMark}
                    lockedQuestionIds={sidebarLockedQuestionIds}
                />
            }
        >
            {isTestCompleted ? (
                <MemorizationResultView
                    logs={memorizationLogs}
                    questions={questions}
                    onBack={() => {
                        setActiveHistory(null);
                        if (fromReviewBoardFromState) {
                            navigate('/review-board');
                        } else {
                            navigate(`/quiz/${quizSetId}`);
                        }
                    }}
                    onRetry={!activeHistory ? handleRetryMemorization : undefined}
                    isHistory={!!activeHistory}
                />
            ) : (
                currentQuestion && (
                    <>
                        {sessionPointerNotice && (
                            <div
                                className="session-pointer-notice"
                                style={{ left: `${sessionPointerNotice.x}px`, top: `${sessionPointerNotice.y}px` }}
                            >
                                {sessionPointerNotice.message}
                            </div>
                        )}
                        {sessionInlineNotice && (
                            <div className={`session-inline-notice ${sessionInlineNotice.includes('一時回答') ? 'saved' : ''}`}>
                                {sessionInlineNotice}
                            </div>
                        )}
                        <MemorizationQuestionView
                            key={currentQuestion.id}
                            question={currentQuestion}
                            index={currentQuestionIndex}
                            total={questions.length}
                            userInputs={currentInputs}
                            onInputChange={handleInputChange}
                            showAnswer={showAnswerForCurrent}
                            onRevealAnswer={handleRevealAnswer}
                            onJudge={handleMemorizationJudge}
                            isCurrentQuestionJudged={isCurrentQuestionJudged}
                            showResultButton={canShowResultButton}
                            onShowResult={handleShowResult}
                            isMarked={markedQuestions.includes(currentQuestion.id!)}
                            onToggleMark={handleToggleMark}
                            onNext={handleMoveNext}
                            isAnswerLocked={isAnswerLocked}
                            isLastQuestion={currentQuestionIndex === questions.length - 1}
                            feedbackTimingMode={feedbackTimingMode}
                            feedbackBlockSize={feedbackBlockSize}
                            revealReadyCount={revealReadyCount}
                            handwritingState={handwritingMap[currentQuestionKey]}
                            onHandwritingStateChange={(value) => setHandwritingMap((prev) => ({ ...prev, [currentQuestionKey]: value }))}
                            allowTouchDrawing={allowTouchDrawing}
                        />
                    </>
                )
            )}
            <ConfirmationModal
                isOpen={showEmptyCardsModal}
                title="暗記カードがまだありません"
                message="この問題集には暗記カードが0件です。問題/暗記カードを追加してから開始してください。"
                confirmLabel="管理画面へ"
                cancelLabel="戻る"
                onConfirm={() => {
                    setShowEmptyCardsModal(false);
                    navigate(managePath);
                }}
                onCancel={() => {
                    setShowEmptyCardsModal(false);
                    if (fromReviewBoardFromState) {
                        navigate('/review-board');
                    } else {
                        navigate(detailPath);
                    }
                }}
            />
        </QuizSessionLayout>
    );
};
