import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, type SidebarClickPosition } from '../components/Sidebar';
import type { HandwritingPadState } from '../components/HandwritingPad';
import { MemorizationResultView, MemorizationQuestionView } from '../components/MemorizationView';
import { QuizSessionLayout } from '../components/QuizSessionLayout';
import { NotFoundView } from '../components/NotFoundView';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { QuestionEditorModal } from '../components/QuestionEditorModal';
import { StudyQuestionChatPanel } from '../components/StudyQuestionChatPanel';
import { SessionToolsLauncher } from '../components/SessionToolsLauncher';
import { useAppContext } from '../contexts/AppContext';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';
import { useQuestionElapsedTimer } from '../hooks/useQuestionElapsedTimer';
import { useSessionAutoSaveOnPageHide } from '../hooks/useSessionAutoSaveOnPageHide';
import { useSessionNotices } from '../hooks/useSessionNotices';
import { getQuestionsForQuizSet, addHistory, addReviewLogs, getReviewSchedulesForQuizSet, upsertReviewSchedulesBulk, updateQuestion } from '../db';
import type {
    DailyStudyStats,
    Question,
    QuizHistory,
    HistoryMode,
    FeedbackTimingMode,
    ReviewSchedule,
    MemorizationLog,
    ReviewLog,
    SuspendedSession,
} from '../types';
import {
    DEFAULT_REVIEW_BOARD_SETTINGS,
    saveSessionToStorage,
    loadSessionFromStorage,
    clearSessionFromStorage,
    loadQuizSetSettings,
    applyShuffleSettings,
    resolveReviewBoardFeedbackBlockSize,
} from '../utils/quizSettings';
import {
    calculateNextDue,
    calculateNextInterval,
    loadReviewIntervalSettings,
    resolveReviewDateOffsetDays,
    updateConsecutiveCorrect,
} from '../utils/spacedRepetition';
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
import {
    appendDailyStudyStats,
    buildRecordedQuestionIdSet,
    getLocalDateString,
    type DailyStudyRecord,
    normalizeDailyStudyStats,
} from '../utils/dailyStudyStats';
import {
    buildQuestionEditorDraft,
    buildQuestionSavePayload,
    isQuestionDraftDirty,
    validateQuestionDraft,
    type EditableQuestionDraft,
} from '../utils/questionEditor';
import { applyQuestionEditToMemorizationSession } from '../utils/sessionQuestionEdit';
import type { LocalLlmMode, LocalLlmSettings, LocalLlmSettingsUpdater } from '../utils/settings';

interface MemorizationRouteProps {
    allowTouchDrawing: boolean;
    reviewBoardFeedbackBlockSize: number;
    localLlmSettings: LocalLlmSettings;
    onLocalLlmSettingsChange: (settings: LocalLlmSettingsUpdater) => void;
    onLocalLlmModeChange: (preferredMode: LocalLlmMode) => void;
    onWebLlmModelChange: (modelId: string) => void;
}

type MemorizationAutoSaveState = {
    quizSetId: number | undefined;
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
    isTestCompleted: boolean;
    activeHistory: QuizHistory | null;
};

const isStudyChatDrawerViewport = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 1200px)').matches;
};

function collectMemorizationDailyRecords(
    memorizationLogs: MemorizationLog[],
    dailyStudyStats: DailyStudyStats
): DailyStudyRecord[] {
    const recordedQuestionIds = buildRecordedQuestionIdSet(dailyStudyStats);
    const records: DailyStudyRecord[] = [];

    memorizationLogs.forEach((log) => {
        if (recordedQuestionIds.has(log.questionId)) {
            return;
        }

        recordedQuestionIds.add(log.questionId);
        records.push({
            questionId: log.questionId,
            isCorrect: log.isMemorized,
        });
    });

    return records;
}

export const MemorizationRoute: React.FC<MemorizationRouteProps> = ({
    allowTouchDrawing,
    reviewBoardFeedbackBlockSize,
    localLlmSettings,
    onLocalLlmSettingsChange,
    onLocalLlmModeChange,
    onWebLlmModelChange,
}) => {
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
    const { handleCloudError } = useAppContext();

    const [isLoading, setIsLoading] = useState(true);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [editingQuestion, setEditingQuestion] = useState<EditableQuestionDraft | null>(null);
    const [isSavingQuestionEdit, setIsSavingQuestionEdit] = useState(false);
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
    const [isMobileLayout, setIsMobileLayout] = useState(() => isMobileViewport());
    const [isRightPanelModal, setIsRightPanelModal] = useState(() => isStudyChatDrawerViewport());
    const [rightPanelOpen, setRightPanelOpen] = useState(false);
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
    const dailyStudyStatsRef = useRef<DailyStudyStats>({});
    const currentQuestion = questions[currentQuestionIndex];
    const currentQuestionKey = currentQuestion ? String(currentQuestion.id) : '';
    const judgedQuestionIds = new Set(memorizationLogs.map(log => log.questionId));
    const showAnswerForCurrent = currentQuestion
        ? (feedbackTimingMode === 'immediate'
            ? showAnswerMap[currentQuestionKey] === true
            : feedbackPhase === 'revealing' && answeredMap[currentQuestionKey] === true)
        : false;
    const shouldTrackCurrentQuestionTime =
        !isTestCompleted &&
        !activeHistory &&
        currentQuestion?.id !== undefined &&
        !showAnswerForCurrent;
    const {
        currentQuestionElapsedSeconds,
        getQuestionElapsedMsSnapshot,
        replaceQuestionElapsedMsById,
        resetQuestionElapsedMsById,
    } = useQuestionElapsedTimer(currentQuestion?.id, shouldTrackCurrentQuestionTime);

    const resolveCurrentReviewBoardFeedbackBlockSize = useCallback((questionCount: number) => {
        return resolveReviewBoardFeedbackBlockSize(questionCount, {
            ...DEFAULT_REVIEW_BOARD_SETTINGS,
            feedbackBlockSize: reviewBoardFeedbackBlockSize,
        });
    }, [reviewBoardFeedbackBlockSize]);

    // Mirror of state needed for auto-save (to avoid stale closure in event listeners)
    const autoSaveStateRef = useRef<MemorizationAutoSaveState>({
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
        activeHistory: null,
    });
    const syncAutoSaveState = useCallback((patch: Partial<MemorizationAutoSaveState>) => {
        autoSaveStateRef.current = { ...autoSaveStateRef.current, ...patch };
    }, []);

    // Unique key for the current session
    const sessionKey = buildQuizSessionKey({
        quizSetId,
        startNew: startNewFromState,
        historyId: historyFromState?.id,
        reviewQuestionIds: reviewQuestionIdsFromState,
        locationKey: location.key,
    });

    useLayoutEffect(() => {
        const frameId = window.requestAnimationFrame(() => {
            resetQuestionElapsedMsById();
            setIsLoading(true);
            setQuestions([]);
            setEditingQuestion(null);
            setIsSavingQuestionEdit(false);
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
            setIsMobileLayout(isMobileViewport());
            setIsRightPanelModal(isStudyChatDrawerViewport());
            setRightPanelOpen(false);
            setActiveHistory(null);
            setHistoryMode('normal');
            setShowEmptyCardsModal(false);
            resetSessionNotices();
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [resetQuestionElapsedMsById, resetSessionNotices, sessionKey]);

    useEffect(() => {
        clearWindowTimeout(saveDebounceRef);
        completedQuestionIdsRef.current = [];
        persistedCompletedQuestionIdsRef.current = [];
        dailyStudyStatsRef.current = {};
    }, [sessionKey]);

    useEffect(() => {
        const handleResize = () => {
            setIsMobileLayout(isMobileViewport());
            setIsRightPanelModal(isStudyChatDrawerViewport());
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
            questionElapsedMsById: getQuestionElapsedMsSnapshot(),
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

    const buildMemorizationReviewArtifacts = async (
        questionIds: number[],
        targetLogs: MemorizationLog[],
        reviewedAt: string
    ): Promise<{
        schedules: (Omit<ReviewSchedule, 'id'> & { id?: number })[];
        logs: Omit<ReviewLog, 'id'>[];
    }> => {
        if (activeQuizSet?.id === undefined || questionIds.length === 0) {
            return { schedules: [], logs: [] };
        }

        const existingSchedules = await getReviewSchedulesForQuizSet(activeQuizSet.id);
        const consecutiveByQuestionId = new Map(existingSchedules.map(s => [s.questionId, s.consecutiveCorrect]));
        const reviewIntervalSettings = loadReviewIntervalSettings();
        const logByQuestionId = new Map(targetLogs.map((log) => [log.questionId, log]));
        const reviewedAtDate = new Date(reviewedAt);
        const schedules: (Omit<ReviewSchedule, 'id'> & { id?: number })[] = [];
        const logs: Omit<ReviewLog, 'id'>[] = [];

        questionIds.forEach((questionId) => {
            const log = logByQuestionId.get(questionId);
            if (!log) {
                return;
            }

            const currentConsecutive = consecutiveByQuestionId.get(questionId) ?? 0;
            const intervalDays = calculateNextInterval(log.isMemorized, 'high', currentConsecutive, reviewIntervalSettings);
            const offsetDays = resolveReviewDateOffsetDays(
                intervalDays,
                log.isMemorized && reviewIntervalSettings.distributeCorrectReviewDates
            );
            const nextDue = calculateNextDue(intervalDays, reviewedAtDate, offsetDays);
            const consecutiveCorrect = updateConsecutiveCorrect(log.isMemorized, currentConsecutive);

            schedules.push({
                questionId,
                quizSetId: activeQuizSet.id!,
                intervalDays,
                nextDue,
                lastReviewedAt: reviewedAt,
                consecutiveCorrect,
            });
            logs.push({
                questionId,
                quizSetId: activeQuizSet.id!,
                reviewedAt,
                isCorrect: log.isMemorized,
                confidence: log.isMemorized ? 'high' : 'low',
                intervalDays,
                nextDue,
            });
        });

        return { schedules, logs };
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
        const nextDailyStudyStats = appendDailyStudyStats(
            dailyStudyStatsRef.current,
            getLocalDateString(),
            collectMemorizationDailyRecords(targetMemorizationLogs, dailyStudyStatsRef.current)
        );
        dailyStudyStatsRef.current = nextDailyStudyStats;

        let session: SuspendedSession = {
            ...buildMemorizationSessionForSave({
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
            }),
            dailyStudyStats: nextDailyStudyStats,
        };

        if (sessionSlotKey === REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY) {
            const persistedSet = new Set(persistedCompletedQuestionIdsRef.current);
            const newCompletedQuestionIds = (session.completedQuestionIds || []).filter((questionId) => !persistedSet.has(questionId));
            if (newCompletedQuestionIds.length > 0) {
                const reviewedAt = new Date().toISOString();
                const { schedules: schedulesToUpdate, logs: reviewLogsToAdd } = await buildMemorizationReviewArtifacts(
                    newCompletedQuestionIds,
                    targetMemorizationLogs,
                    reviewedAt
                );
                if (schedulesToUpdate.length > 0) {
                    await upsertReviewSchedulesBulk(schedulesToUpdate);
                    await addReviewLogs(reviewLogsToAdd);
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

    const scheduleSaveSession = useCallback(() => {
        clearWindowTimeout(saveDebounceRef);
        saveDebounceRef.current = window.setTimeout(() => {
            saveDebounceRef.current = null;
            doAutoSaveRef.current();
        }, 1000);
    }, []);

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

    const handleOpenCurrentQuestionEditor = useCallback(() => {
        if (!currentQuestion) {
            return;
        }

        setEditingQuestion(buildQuestionEditorDraft(currentQuestion, activeQuizSet?.type));
    }, [activeQuizSet?.type, currentQuestion]);

    const handleCloseCurrentQuestionEditor = useCallback(() => {
        if (isSavingQuestionEdit) {
            return;
        }

        setEditingQuestion(null);
    }, [isSavingQuestionEdit]);

    const handleSaveCurrentQuestionEdit = useCallback(async () => {
        if (!editingQuestion || editingQuestion.id === undefined || !activeQuizSet) {
            return;
        }

        const validationError = validateQuestionDraft(editingQuestion, activeQuizSet.type);
        if (validationError) {
            flashSessionInlineNotice(validationError);
            return;
        }

        const previousQuestion = questions.find((question) => question.id === editingQuestion.id);
        if (!previousQuestion) {
            flashSessionInlineNotice('現在の問題を取得できませんでした');
            return;
        }

        const updatedData = buildQuestionSavePayload(editingQuestion, activeQuizSet.type);
        const updatedQuestion: Question = {
            ...previousQuestion,
            ...updatedData,
        };

        setIsSavingQuestionEdit(true);
        try {
            await updateQuestion(editingQuestion.id, updatedData);

            const { nextState } = applyQuestionEditToMemorizationSession({
                previousQuestion,
                updatedQuestion,
                state: {
                    questions,
                    answeredMap,
                    showAnswerMap,
                    memorizationInputsMap,
                    memorizationLogs,
                    pendingRevealQuestionIds,
                    questionElapsedMsById: getQuestionElapsedMsSnapshot(),
                    feedbackPhase,
                },
            });

            setQuestions(nextState.questions);
            setAnsweredMap(nextState.answeredMap);
            setShowAnswerMap(nextState.showAnswerMap);
            setMemorizationInputsMap(nextState.memorizationInputsMap);
            setMemorizationLogs(nextState.memorizationLogs);
            setPendingRevealQuestionIds(nextState.pendingRevealQuestionIds);
            setFeedbackPhase(nextState.feedbackPhase);
            replaceQuestionElapsedMsById(nextState.questionElapsedMsById);
            syncAutoSaveState({
                questions: nextState.questions,
                answeredMap: nextState.answeredMap,
                showAnswerMap: nextState.showAnswerMap,
                memorizationInputsMap: nextState.memorizationInputsMap,
                memorizationLogs: nextState.memorizationLogs,
                pendingRevealQuestionIds: nextState.pendingRevealQuestionIds,
                feedbackPhase: nextState.feedbackPhase,
            });
            scheduleSaveSession();
            setEditingQuestion(null);
            flashSessionInlineNotice('問題を更新しました');
        } catch (err) {
            handleCloudError(err, '問題の更新に失敗しました');
        } finally {
            setIsSavingQuestionEdit(false);
        }
    }, [
        activeQuizSet,
        answeredMap,
        editingQuestion,
        feedbackPhase,
        flashSessionInlineNotice,
        getQuestionElapsedMsSnapshot,
        handleCloudError,
        memorizationInputsMap,
        memorizationLogs,
        pendingRevealQuestionIds,
        questions,
        replaceQuestionElapsedMsById,
        scheduleSaveSession,
        showAnswerMap,
        syncAutoSaveState,
    ]);

    const isCurrentQuestionEditorDirty = isQuestionDraftDirty({
        draft: editingQuestion,
        originalQuestion: questions.find((question) => question.id === editingQuestion?.id),
        quizSetType: activeQuizSet?.type,
        isNew: false,
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
                    setFeedbackTimingMode('delayed_block');
                    setFeedbackBlockSize(resolveCurrentReviewBoardFeedbackBlockSize(studyQuestions.length));
                } else {
                    setFeedbackTimingMode(settings.feedbackTimingMode);
                    setFeedbackBlockSize(settings.feedbackBlockSize);
            }
        }
        completedQuestionIdsRef.current = [];
        persistedCompletedQuestionIdsRef.current = [];
        dailyStudyStatsRef.current = {};
        resetQuestionElapsedMsById();
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
    }, [
        fromReviewBoardFromState,
        navigate,
        quizSetId,
        resetQuestionElapsedMsById,
        resolveCurrentReviewBoardFeedbackBlockSize,
        sessionKey,
        sessionSlotKey,
    ]);

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
                    dailyStudyStatsRef.current = normalizeDailyStudyStats(session.dailyStudyStats);
                    replaceQuestionElapsedMsById(session.questionElapsedMsById);
                    const nextIndex = Math.min(session.currentQuestionIndex, filteredQuestions.length - 1);
                    setQuestions(filteredQuestions);
                    setMemorizationLogs(session.memorizationLogs || []);
                    setMemorizationInputsMap(session.memorizationInputsMap || {});
                    setAnsweredMap(session.answeredMap || {});
                    setShowAnswerMap(session.showAnswerMap || {});
                    setPendingRevealQuestionIds(session.pendingRevealQuestionIds || []);
                    setFeedbackPhase(session.feedbackPhase || 'answering');
                    if (sessionSlotKey === REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY) {
                        setFeedbackTimingMode('delayed_block');
                        setFeedbackBlockSize(resolveCurrentReviewBoardFeedbackBlockSize(filteredQuestions.length));
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
                    resetQuestionElapsedMsById();
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
    }, [
        fromReviewBoardFromState,
        historyFromState,
        quizSetId,
        replaceQuestionElapsedMsById,
        resetQuestionElapsedMsById,
        resolveCurrentReviewBoardFeedbackBlockSize,
        reviewQuestionIdsFromState,
        sessionKey,
        sessionSlotKey,
        startNew,
        startNewFromState,
    ]);

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
            navigate('/review-board', { flushSync: true });
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

            navigate(`/quiz/${quizSetId}`, {
                state: { expectSuspendedSession: true },
                flushSync: true,
            });
            return;
        }
        navigate(`/quiz/${quizSetId}`, { flushSync: true });
    };

    const handleToggleMark = (questionId?: number) => {
        let qId = typeof questionId === 'number' ? questionId : undefined;
        if (qId === undefined) {
            const currentQuestion = questions[currentQuestionIndex];
            if (!currentQuestion || !currentQuestion.id) return;
            qId = currentQuestion.id;
        }

        setMarkedQuestions(prev => {
            const nextMarkedQuestions = prev.includes(qId!)
                ? prev.filter(id => id !== qId)
                : [...prev, qId!];
            syncAutoSaveState({ markedQuestions: nextMarkedQuestions });
            return nextMarkedQuestions;
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
        const nextIndex = findQuestionIndexById(questionIds[0]);
        setFeedbackPhase('revealing');
        setPendingRevealQuestionIds(questionIds);
        if (nextIndex >= 0) {
            setCurrentQuestionIndex(nextIndex);
        }
        syncAutoSaveState({
            feedbackPhase: 'revealing',
            pendingRevealQuestionIds: questionIds,
            currentQuestionIndex: nextIndex >= 0 ? nextIndex : autoSaveStateRef.current.currentQuestionIndex,
        });
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
        syncAutoSaveState({ memorizationInputsMap: nextInputsMap });
        scheduleSaveSession();
    };

    const handleRevealAnswer = () => {
        const currentQ = questions[currentQuestionIndex];
        if (!currentQ) return;
        const questionId = currentQ.id!;
        const qId = String(questionId);
        const nextInputsMap = memorizationInputsMap[qId]
            ? memorizationInputsMap
            : { ...memorizationInputsMap, [qId]: new Array(currentQ.options.length).fill('') };

        setMemorizationInputsMap(nextInputsMap);
        syncAutoSaveState({ memorizationInputsMap: nextInputsMap });

        if (feedbackTimingMode === 'immediate' || feedbackPhase === 'revealing') {
            const nextAnsweredMap = { ...answeredMap, [qId]: true };
            const nextShowAnswerMap = { ...showAnswerMap, [qId]: true };
            setAnsweredMap(nextAnsweredMap);
            setShowAnswerMap(nextShowAnswerMap);
            syncAutoSaveState({
                answeredMap: nextAnsweredMap,
                showAnswerMap: nextShowAnswerMap,
            });
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
            syncAutoSaveState({
                answeredMap: nextAnsweredMap,
                pendingRevealQuestionIds: nextPendingRevealQuestionIds,
            });
            enterRevealPhase(getUnjudgedAnsweredQuestionIds(nextAnsweredMap));
            scheduleSaveSession();
            return;
        }

        if (shouldLockByDelayedBlock) {
            syncAutoSaveState({
                answeredMap: nextAnsweredMap,
                pendingRevealQuestionIds: nextPendingRevealQuestionIds,
            });
            enterRevealPhase(nextPendingRevealQuestionIds);
            scheduleSaveSession();
            return;
        }

        const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex, nextAnsweredMap);
        if (nextUnansweredIndex >= 0) {
            setCurrentQuestionIndex(nextUnansweredIndex);
        }
        syncAutoSaveState({
            answeredMap: nextAnsweredMap,
            pendingRevealQuestionIds: nextPendingRevealQuestionIds,
            currentQuestionIndex: nextUnansweredIndex >= 0 ? nextUnansweredIndex : autoSaveStateRef.current.currentQuestionIndex,
        });
        scheduleSaveSession();
    };

    const handleSidebarSelectQuestion = (targetIndex: number, clickPosition?: SidebarClickPosition) => {
        if (targetIndex < 0 || targetIndex >= questions.length || targetIndex === currentQuestionIndex) {
            return;
        }

        const currentQ = questions[currentQuestionIndex];
        if (!currentQ) {
            setCurrentQuestionIndex(targetIndex);
            syncAutoSaveState({ currentQuestionIndex: targetIndex });
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
                syncAutoSaveState({
                    pendingRevealQuestionIds: [],
                    feedbackPhase: 'answering',
                    currentQuestionIndex: targetIndex,
                });
                scheduleSaveSession();
                return;
            }

            if (isTargetPending) {
                const nextShowAnswerMap = { ...showAnswerMap, [String(targetQuestionId)]: true };
                setShowAnswerMap(nextShowAnswerMap);
                syncAutoSaveState({
                    showAnswerMap: nextShowAnswerMap,
                    currentQuestionIndex: targetIndex,
                });
            } else {
                syncAutoSaveState({ currentQuestionIndex: targetIndex });
            }
            setCurrentQuestionIndex(targetIndex);
            scheduleSaveSession();
            return;
        }

        if (feedbackTimingMode === 'immediate' || feedbackPhase !== 'answering') {
            setCurrentQuestionIndex(targetIndex);
            syncAutoSaveState({ currentQuestionIndex: targetIndex });
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
        syncAutoSaveState({
            answeredMap: nextAnsweredMap,
            pendingRevealQuestionIds: nextPendingRevealQuestionIds,
            currentQuestionIndex: targetIndex,
        });
        scheduleSaveSession();
    };

    const handleMoveNext = () => {
        if (feedbackTimingMode === 'immediate') {
            if (currentQuestionIndex < questions.length - 1) {
                const nextIndex = currentQuestionIndex + 1;
                setCurrentQuestionIndex(nextIndex);
                syncAutoSaveState({ currentQuestionIndex: nextIndex });
                scheduleSaveSession();
            }
            return;
        }

        if (feedbackPhase === 'answering') {
            const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex);
            if (nextUnansweredIndex >= 0) {
                setCurrentQuestionIndex(nextUnansweredIndex);
                syncAutoSaveState({ currentQuestionIndex: nextUnansweredIndex });
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
            syncAutoSaveState({
                currentQuestionIndex: nextIndex >= 0 ? nextIndex : autoSaveStateRef.current.currentQuestionIndex,
            });
            scheduleSaveSession();
            return;
        }

        setPendingRevealQuestionIds([]);
        const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex);
        if (feedbackTimingMode === 'delayed_block' && nextUnansweredIndex >= 0) {
            setFeedbackPhase('answering');
            setCurrentQuestionIndex(nextUnansweredIndex);
        }
        syncAutoSaveState({
            pendingRevealQuestionIds: [],
            feedbackPhase: feedbackTimingMode === 'delayed_block' && nextUnansweredIndex >= 0 ? 'answering' : autoSaveStateRef.current.feedbackPhase,
            currentQuestionIndex: nextUnansweredIndex >= 0 ? nextUnansweredIndex : autoSaveStateRef.current.currentQuestionIndex,
        });
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
        syncAutoSaveState({
            memorizationInputsMap: { ...memorizationInputsMap, [qId]: inputs },
            answeredMap: { ...answeredMap, [qId]: true },
            showAnswerMap: { ...showAnswerMap, [qId]: true },
            memorizationLogs: newLogs,
        });
        scheduleSaveSession();

        if (feedbackTimingMode === 'immediate') {
            if (currentQuestionIndex < questions.length - 1) {
                const nextIndex = currentQuestionIndex + 1;
                setCurrentQuestionIndex(nextIndex);
                syncAutoSaveState({ currentQuestionIndex: nextIndex });
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
                syncAutoSaveState({
                    currentQuestionIndex: nextIndex >= 0 ? nextIndex : autoSaveStateRef.current.currentQuestionIndex,
                });
                return;
            }

            setPendingRevealQuestionIds([]);
            const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex);
            if (feedbackTimingMode === 'delayed_block' && nextUnansweredIndex >= 0) {
                setFeedbackPhase('answering');
                setCurrentQuestionIndex(nextUnansweredIndex);
                syncAutoSaveState({
                    pendingRevealQuestionIds: [],
                    feedbackPhase: 'answering',
                    currentQuestionIndex: nextUnansweredIndex,
                });
            }
        }
    };

    const handleCompleteMemorization = async (finalLogs: MemorizationLog[]) => {
        clearWindowTimeout(saveDebounceRef);
        setIsTestCompleted(true);
        if (activeHistory) return;
        const persistedCompletedQuestionIdSet = new Set(persistedCompletedQuestionIdsRef.current);

        const endTime = new Date();
        const nextDailyStudyStats = appendDailyStudyStats(
            dailyStudyStatsRef.current,
            getLocalDateString(endTime),
            collectMemorizationDailyRecords(finalLogs, dailyStudyStatsRef.current)
        );
        dailyStudyStatsRef.current = nextDailyStudyStats;
        const durationSeconds = Math.floor((endTime.getTime() - startTimeRef.current.getTime()) / 1000);
        const memorizedCount = finalLogs.filter(l => l.isMemorized).length;

        const history: Omit<QuizHistory, 'id'> = {
            quizSetId: activeQuizSet!.id!,
            date: endTime,
            totalCount: questions.length,
            correctCount: memorizedCount,
            durationSeconds,
            answers: {},
            markedQuestionIds: finalLogs.filter(l => !l.isMemorized).map(l => l.questionId),
            memorizationDetail: finalLogs,
            mode: historyMode,
            feedbackTimingMode,
            dailyStudyStats: nextDailyStudyStats,
        };

        if (activeQuizSet?.id !== undefined) {
            await clearSessionFromStorage(activeQuizSet.id, sessionSlotKey);
            completedQuestionIdsRef.current = [];
            persistedCompletedQuestionIdsRef.current = [];
            dailyStudyStatsRef.current = {};
        }

        try {
            await addHistory(history);

            if (activeQuizSet?.id !== undefined && finalLogs.length > 0) {
                const reviewedAt = endTime.toISOString();
                const { schedules: schedulesToUpdate, logs: reviewLogsToAdd } = await buildMemorizationReviewArtifacts(
                    finalLogs
                        .map((log) => log.questionId)
                        .filter((questionId) => !persistedCompletedQuestionIdSet.has(questionId)),
                    finalLogs,
                    reviewedAt
                );

                await upsertReviewSchedulesBulk(schedulesToUpdate);
                await addReviewLogs(reviewLogsToAdd);
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
    const currentInputs = currentQuestion
        ? (memorizationInputsMap[currentQuestionKey] || new Array(currentQuestion.options.length).fill(''))
        : [];
    const isCurrentQuestionJudged = currentQuestion ? judgedQuestionIds.has(currentQuestion.id!) : false;
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
    const answersUntilRevealCount = (() => {
        if (!currentQuestion) return null;
        if (feedbackTimingMode === 'immediate') return null;
        if (feedbackPhase !== 'answering') return null;
        if (showAnswerMap[currentQuestionKey]) return null;
        if (isAnswerLocked) return null;
        if (revealReadyCount !== null && revealReadyCount > 0) return null;

        const remainingUnansweredCount = questions.filter(q => answeredMap[String(q.id)] !== true).length;
        if (remainingUnansweredCount <= 0) return null;

        if (feedbackTimingMode === 'delayed_end') {
            return remainingUnansweredCount;
        }

        const unjudgedAnsweredCount = getUnjudgedAnsweredQuestionIds().length;
        return Math.min(
            Math.max(1, feedbackBlockSize - unjudgedAnsweredCount),
            remainingUnansweredCount
        );
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
    const showStudyQuestionChat = !isTestCompleted;
    const resolvedRightPanelOpen = showStudyQuestionChat ? rightPanelOpen : false;
    const handleToggleSidebar = () => {
        if (isMobileLayout && showStudyQuestionChat) {
            setRightPanelOpen(false);
        }
        setSidebarOpen(!sidebarOpen);
    };
    const handleToggleRightPanel = () => {
        if (isMobileLayout) {
            setSidebarOpen(false);
        }
        setRightPanelOpen(!resolvedRightPanelOpen);
    };
    return (
        <QuizSessionLayout
            title={`${activeQuizSet.name} (暗記)`}
            isLoading={isLoading}
            sidebarOpen={sidebarOpen}
            showSidebar={!isTestCompleted}
            hideMenuButton={isTestCompleted}
            onBack={handleBackToDetail}
            sessionBadge={!isTestCompleted ? reviewHeaderBadge : undefined}
            onToggleSidebar={handleToggleSidebar}
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
            showRightPanel={showStudyQuestionChat}
            rightPanelOpen={resolvedRightPanelOpen}
            rightPanelModal={isRightPanelModal}
            showRightPanelToggle={showStudyQuestionChat}
            onToggleRightPanel={handleToggleRightPanel}
            onCloseRightPanel={() => setRightPanelOpen(false)}
            headerActions={showStudyQuestionChat ? (
                <SessionToolsLauncher
                    onEditCurrentQuestion={handleOpenCurrentQuestionEditor}
                    canEditCurrentQuestion={currentQuestion?.id !== undefined}
                />
            ) : undefined}
            rightPanelContent={showStudyQuestionChat && currentQuestion && activeQuizSet?.id !== undefined ? (
                <StudyQuestionChatPanel
                    quizSetId={activeQuizSet.id}
                    question={currentQuestion}
                    questionIndex={currentQuestionIndex}
                    showAnswer={showAnswerForCurrent}
                    isPanelOpen={resolvedRightPanelOpen}
                    localLlmSettings={localLlmSettings}
                    onLocalLlmSettingsChange={onLocalLlmSettingsChange}
                    onLocalLlmModeChange={onLocalLlmModeChange}
                    onWebLlmModelChange={onWebLlmModelChange}
                />
            ) : null}
        >
            <QuestionEditorModal
                key={editingQuestion ? `${editingQuestion.id ?? 'current'}-${editingQuestion.questionType}` : 'memorization-question-editor-closed'}
                draft={editingQuestion}
                isOpen={editingQuestion !== null}
                isSaving={isSavingQuestionEdit}
                isDirty={isCurrentQuestionEditorDirty}
                quizSetType={activeQuizSet?.type}
                onChange={setEditingQuestion}
                onClose={handleCloseCurrentQuestionEditor}
                onSave={handleSaveCurrentQuestionEdit}
            />
            {isTestCompleted ? (
                <MemorizationResultView
                    logs={memorizationLogs}
                    questions={questions}
                    onBack={() => {
                        setActiveHistory(null);
                        if (fromReviewBoardFromState) {
                            navigate('/review-board', { flushSync: true });
                        } else {
                            navigate(`/quiz/${quizSetId}`, { flushSync: true });
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
                            answersUntilRevealCount={answersUntilRevealCount}
                            questionElapsedSeconds={currentQuestionElapsedSeconds}
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
