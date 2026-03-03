import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, type SidebarClickPosition } from '../components/Sidebar';
import { TestResult } from '../components/TestResult';
import { QuestionView } from '../components/QuestionView';
import { QuizSessionLayout } from '../components/QuizSessionLayout';
import { NotFoundView } from '../components/NotFoundView';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';
import { getQuestionsForQuizSet, addHistory, upsertReviewSchedulesBulk, getReviewSchedulesForQuizSet } from '../db';
import { calculateNextInterval, calculateNextDue, loadReviewIntervalSettings, updateConsecutiveCorrect } from '../utils/spacedRepetition';
import type { Question, ConfidenceLevel, HistoryMode, QuizHistory, ReviewSchedule, FeedbackTimingMode } from '../types';
import { loadQuizSetSettings, applyShuffleSettings, saveSessionToStorage, loadSessionFromStorage, clearSessionFromStorage } from '../utils/quizSettings';

const isMobileViewport = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 768px)').matches;
};

export const StudyRoute: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const historyFromState = location.state?.history as QuizHistory | undefined;
    const startNewFromState = location.state?.startNew as boolean | undefined;
    const fromReviewBoardFromState = location.state?.fromReviewBoard === true;
    const reviewQuestionIdsFromState = Array.isArray(location.state?.reviewQuestionIds)
        ? location.state.reviewQuestionIds as number[]
        : undefined;

    const { quizSetId, activeQuizSet } = useActiveQuizSetFromRoute();

    const [isLoading, setIsLoading] = useState(true);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, number[]>>({});
    const [answeredMap, setAnsweredMap] = useState<Record<string, boolean>>({});
    const [memos, setMemos] = useState<Record<string, string>>({});
    const [showAnswerMap, setShowAnswerMap] = useState<Record<string, boolean>>({});
    const [pendingRevealQuestionIds, setPendingRevealQuestionIds] = useState<number[]>([]);
    const [feedbackPhase, setFeedbackPhase] = useState<'answering' | 'revealing'>('answering');
    const [feedbackTimingMode, setFeedbackTimingMode] = useState<FeedbackTimingMode>('immediate');
    const [feedbackBlockSize, setFeedbackBlockSize] = useState(5);
    const [markedQuestions, setMarkedQuestions] = useState<number[]>([]);
    const [confidences, setConfidences] = useState<Record<string, ConfidenceLevel>>({});
    const [memorizationAnswers, setMemorizationAnswers] = useState<Record<string, string>>({});
    const [isTestCompleted, setIsTestCompleted] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileViewport());
    const [endTime, setEndTime] = useState<Date>(new Date());
    const [activeHistory, setActiveHistory] = useState<QuizHistory | null>(null);
    const [historyMode, setHistoryMode] = useState<HistoryMode>('normal');
    const [showEmptyQuestionsModal, setShowEmptyQuestionsModal] = useState(false);
    const [sessionInlineNotice, setSessionInlineNotice] = useState<string | null>(null);
    const [sessionPointerNotice, setSessionPointerNotice] = useState<{ message: string; x: number; y: number } | null>(null);

    const startTimeRef = useRef<Date>(new Date());
    const lastSessionKeyRef = useRef<string | null>(null);
    const sessionInlineNoticeTimeoutRef = useRef<number | null>(null);
    const sessionPointerNoticeTimeoutRef = useRef<number | null>(null);
    const saveDebounceRef = useRef<number | null>(null);


    // Mirror of state needed for auto-save (to avoid stale closure in event listeners)
    const autoSaveStateRef = useRef({
        quizSetId: undefined as number | undefined,
        questions,
        currentQuestionIndex,
        answers,
        answeredMap,
        memos,
        showAnswerMap,
        pendingRevealQuestionIds,
        feedbackPhase,
        feedbackTimingMode,
        feedbackBlockSize,
        markedQuestions,
        historyMode,
        isTestCompleted: false,
        activeHistory: null as null | typeof historyFromState,
    });

    // Unique key for the current session to detect changes
    const reviewQuestionIdsKey = reviewQuestionIdsFromState && reviewQuestionIdsFromState.length > 0
        ? reviewQuestionIdsFromState.join(',')
        : 'all';
    const sessionKey = `${quizSetId}-${startNewFromState}-${historyFromState?.id || 'new'}-${reviewQuestionIdsKey}-${location.key}`;

    // Reset session state before paint when navigation/session key changes.
    useLayoutEffect(() => {
        setIsLoading(true);
        setQuestions([]);
        setCurrentQuestionIndex(0);
        setAnswers({});
        setAnsweredMap({});
        setMemos({});
        setShowAnswerMap({});
        setPendingRevealQuestionIds([]);
        setFeedbackPhase('answering');
        setFeedbackTimingMode('immediate');
        setFeedbackBlockSize(5);
        setMarkedQuestions([]);
        setConfidences({});
        setIsTestCompleted(false);
        setSidebarOpen(!isMobileViewport());
        setActiveHistory(null);
        setHistoryMode('normal');
        setShowEmptyQuestionsModal(false);
        setSessionInlineNotice(null);
        setSessionPointerNotice(null);
        if (sessionInlineNoticeTimeoutRef.current !== null) {
            window.clearTimeout(sessionInlineNoticeTimeoutRef.current);
            sessionInlineNoticeTimeoutRef.current = null;
        }
        if (sessionPointerNoticeTimeoutRef.current !== null) {
            window.clearTimeout(sessionPointerNoticeTimeoutRef.current);
            sessionPointerNoticeTimeoutRef.current = null;
        }
    }, [sessionKey]);

    useEffect(() => {
        return () => {
            if (sessionInlineNoticeTimeoutRef.current !== null) {
                window.clearTimeout(sessionInlineNoticeTimeoutRef.current);
                sessionInlineNoticeTimeoutRef.current = null;
            }
            if (sessionPointerNoticeTimeoutRef.current !== null) {
                window.clearTimeout(sessionPointerNoticeTimeoutRef.current);
                sessionPointerNoticeTimeoutRef.current = null;
            }
        };
    }, []);

    // Auto-save session when page is hidden or app is closed
    const doAutoSaveRef = useRef(() => {
        const s = autoSaveStateRef.current;
        if (s.isTestCompleted || s.activeHistory !== null) return;
        if (s.quizSetId === undefined || s.questions.length === 0) return;
        const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000);
        void saveSessionToStorage(s.quizSetId, {
            questions: s.questions,
            currentQuestionIndex: s.currentQuestionIndex,
            answers: s.answers,
            answeredMap: s.answeredMap,
            memos: s.memos,
            showAnswerMap: s.showAnswerMap,
            pendingRevealQuestionIds: s.pendingRevealQuestionIds,
            feedbackPhase: s.feedbackPhase,
            feedbackTimingMode: s.feedbackTimingMode,
            feedbackBlockSize: s.feedbackBlockSize,
            markedQuestions: s.markedQuestions,
            startTime: startTimeRef.current,
            elapsedSeconds,
            historyMode: s.historyMode,
            type: 'study',
        }).catch((err) => {
            console.error('Failed to auto-save suspended session', err);
        });
    });

    // Debounced save on each answer (1s for cloud, immediate for local)
    const scheduleSaveSession = () => {
        if (saveDebounceRef.current !== null) {
            window.clearTimeout(saveDebounceRef.current);
        }
        saveDebounceRef.current = window.setTimeout(() => {
            saveDebounceRef.current = null;
            doAutoSaveRef.current();
        }, 1000);
    };

    useEffect(() => {
        const doAutoSave = () => doAutoSaveRef.current();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                doAutoSave();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', doAutoSave);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', doAutoSave);
        };
    }, []);

    // Keep autoSaveStateRef in sync with current state so event listeners always have fresh data
    useEffect(() => {
        autoSaveStateRef.current = {
            quizSetId: activeQuizSet?.id,
            questions,
            currentQuestionIndex,
            answers,
            answeredMap,
            memos,
            showAnswerMap,
            pendingRevealQuestionIds,
            feedbackPhase,
            feedbackTimingMode,
            feedbackBlockSize,
            markedQuestions,
            historyMode,
            isTestCompleted,
            activeHistory,
        };
    });

    useEffect(() => {
        const initStudy = async () => {
            if (!quizSetId) return;

            // Atomic Guard: Ensure we only initialize ONCE per unique session/navigation
            if (lastSessionKeyRef.current === sessionKey) return;
            lastSessionKeyRef.current = sessionKey;

            try {
                const qs = await getQuestionsForQuizSet(quizSetId);
                const quizSetSettings = loadQuizSetSettings(quizSetId);

                if (!historyFromState && !reviewQuestionIdsFromState && qs.length === 0) {
                    await clearSessionFromStorage(quizSetId).catch(err => console.error('Failed to clear suspended session', err));
                    setQuestions([]);
                    setShowEmptyQuestionsModal(true);
                    setIsLoading(false);
                    return;
                }

                // Handle history review mode
                if (historyFromState) {
                    let studyQuestions: Question[] = [];
                    if (historyFromState.questionIds && historyFromState.questionIds.length > 0) {
                        studyQuestions = qs.filter(q => historyFromState.questionIds!.includes(q.id!));
                        studyQuestions.sort((a, b) => historyFromState.questionIds!.indexOf(a.id!) - historyFromState.questionIds!.indexOf(b.id!));
                    } else {
                        const answeredIds = Object.keys(historyFromState.answers || {}).map(Number);
                        const isSubset = historyFromState.totalCount < qs.length;
                        if (isSubset && answeredIds.length > 0) {
                            studyQuestions = qs.filter(q => answeredIds.includes(q.id!));
                        } else {
                            studyQuestions = qs;
                        }
                    }

                    // Batch state updates
                    setQuestions(studyQuestions);
                    setActiveHistory(historyFromState);
                    setAnswers(historyFromState.answers || {});
                    const allAnswered: Record<string, boolean> = {};
                    setMemos(historyFromState.memos || {});
                    setConfidences(historyFromState.confidences || {});
                    setMarkedQuestions(historyFromState.markedQuestionIds || []);
                    setHistoryMode(historyFromState.mode || 'normal');
                    setPendingRevealQuestionIds([]);
                    setFeedbackPhase('revealing');
                    setFeedbackTimingMode(historyFromState.feedbackTimingMode || 'immediate');
                    setFeedbackBlockSize(quizSetSettings.feedbackBlockSize);

                    const allShown: Record<string, boolean> = {};
                    studyQuestions.forEach(q => {
                        allShown[String(q.id)] = true;
                        allAnswered[String(q.id)] = true;
                    });
                    setShowAnswerMap(allShown);
                    setAnsweredMap(allAnswered);

                    setEndTime(new Date(historyFromState.date));
                    const restoredStartTime = new Date(new Date(historyFromState.date).getTime() - historyFromState.durationSeconds * 1000);
                    startTimeRef.current = restoredStartTime;
                    setIsTestCompleted(true);
                    setIsLoading(false);
                    return;
                }

                if (reviewQuestionIdsFromState && reviewQuestionIdsFromState.length > 0) {
                    startNew(qs, reviewQuestionIdsFromState, 'review_due');
                    return;
                }

                // Check if resuming session
                const suspendedSession = !startNewFromState ? await loadSessionFromStorage(quizSetId) : null;

                if (suspendedSession && suspendedSession.type !== 'memorization') {
                    // Resume logic
                    const validOptionIds = new Set(qs.map(q => q.id));
                    const filteredQuestions = suspendedSession.questions.filter((q: Question) => q.id !== undefined && validOptionIds.has(q.id));

                    if (filteredQuestions.length === 0) {
                        alert('中断していた問題はすべて削除されました。新規開始します。');
                        await clearSessionFromStorage(quizSetId);
                        startNew(qs);
                    } else {
                        const nextIndex = Math.min(suspendedSession.currentQuestionIndex, filteredQuestions.length - 1);
                        setIsLoading(false);
                        setQuestions(filteredQuestions);
                        setCurrentQuestionIndex(nextIndex);
                        setAnswers(suspendedSession.answers || {});
                        setAnsweredMap(suspendedSession.answeredMap || suspendedSession.showAnswerMap || {});
                        setMemos(suspendedSession.memos || {});
                        setShowAnswerMap(suspendedSession.showAnswerMap || {});
                        setPendingRevealQuestionIds(suspendedSession.pendingRevealQuestionIds || []);
                        setFeedbackPhase(suspendedSession.feedbackPhase || 'answering');
                        setFeedbackTimingMode(suspendedSession.feedbackTimingMode || quizSetSettings.feedbackTimingMode);
                        setFeedbackBlockSize(suspendedSession.feedbackBlockSize || quizSetSettings.feedbackBlockSize);
                        setMarkedQuestions(suspendedSession.markedQuestions || []);

                        // Restore startTimeRef by subtracting previously spent time from NOW
                        const resumedStartTime = new Date(Date.now() - (suspendedSession.elapsedSeconds || 0) * 1000);
                        startTimeRef.current = resumedStartTime;

                        setHistoryMode(suspendedSession.historyMode || 'normal');
                        setIsTestCompleted(false);
                        setActiveHistory(null);
                        setIsLoading(false);
                    }
                } else {
                    // Start new logic
                    startNew(qs);
                }
            } catch (err) {
                console.error('Failed to load study questions:', err);
                // On error, we reset the ref to allow retry
                lastSessionKeyRef.current = null;
                alert('問題の読み込みに失敗しました');
                setIsLoading(false);
            }
        };

        const startNew = (qs: Question[], targetQuestionIds?: number[], mode: HistoryMode = 'normal') => {
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
                clearSessionFromStorage(quizSetId).catch(err => console.error('Failed to clear suspended session', err));
                setFeedbackTimingMode(settings.feedbackTimingMode);
                setFeedbackBlockSize(settings.feedbackBlockSize);
            }
            // All state updates together
            setQuestions(studyQuestions);
            setCurrentQuestionIndex(0);
            setAnswers({});
            setAnsweredMap({});
            setMemos({});
            setShowAnswerMap({});
            setPendingRevealQuestionIds([]);
            setFeedbackPhase('answering');
            setMarkedQuestions([]);
            setConfidences({});
            setIsTestCompleted(false);
            setActiveHistory(null);
            setHistoryMode(mode);
            startTimeRef.current = new Date();
            setIsLoading(false);
        };

        initStudy();
    }, [sessionKey, quizSetId, historyFromState, startNewFromState, reviewQuestionIdsFromState, navigate, fromReviewBoardFromState]);

    const handleBackToDetail = () => {
        if (fromReviewBoardFromState) {
            navigate('/review-board');
            return;
        }

        const quizSetIdForSave = activeQuizSet?.id;
        const shouldSaveSuspendedSession =
            !isTestCompleted &&
            !activeHistory &&
            quizSetIdForSave !== undefined &&
            questions.length > 0;

        if (shouldSaveSuspendedSession) {
            const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000);
            void saveSessionToStorage(quizSetIdForSave, {
                questions,
                currentQuestionIndex,
                answers,
                answeredMap,
                memos,
                showAnswerMap,
                pendingRevealQuestionIds,
                feedbackPhase,
                feedbackTimingMode,
                feedbackBlockSize,
                markedQuestions,
                startTime: startTimeRef.current,
                elapsedSeconds,
                historyMode,
                type: 'study',
            }).catch((err) => {
                console.error('Failed to save suspended session', err);
            });

            navigate(`/quiz/${quizSetId}`, { state: { expectSuspendedSession: true } });
            return;
        }
        navigate(`/quiz/${quizSetId}`);
    };

    const getAnsweringPhasePendingIdsForBlock = (
        targetAnswers: Record<string, number[]> = answers,
        targetAnsweredMap: Record<string, boolean> = answeredMap,
        targetPendingRevealQuestionIds: number[] = pendingRevealQuestionIds
    ): number[] => {
        const pendingSet = new Set<number>();

        targetPendingRevealQuestionIds.forEach(questionId => {
            if (!showAnswerMap[String(questionId)]) {
                pendingSet.add(questionId);
            }
        });

        questions.forEach(q => {
            const questionId = q.id!;
            const qKey = String(questionId);
            if (showAnswerMap[qKey]) return;
            if (targetAnsweredMap[qKey]) {
                pendingSet.add(questionId);
                return;
            }
            if ((targetAnswers[qKey] || []).length > 0) {
                pendingSet.add(questionId);
            }
        });

        return questions.map(q => q.id!).filter(questionId => pendingSet.has(questionId));
    };

    const getDelayedBlockLockPreview = (
        targetAnswers: Record<string, number[]> = answers,
        targetAnsweredMap: Record<string, boolean> = answeredMap,
        targetPendingRevealQuestionIds: number[] = pendingRevealQuestionIds
    ) => {
        if (feedbackTimingMode !== 'delayed_block' || feedbackPhase !== 'answering' || questions.length === 0) {
            return { locked: false, pendingIds: [] as number[], remainingCount: 0 };
        }

        const pendingIds = getAnsweringPhasePendingIdsForBlock(
            targetAnswers,
            targetAnsweredMap,
            targetPendingRevealQuestionIds
        );
        const pendingSet = new Set(pendingIds);
        const allAnsweredLike = questions.every(
            q => showAnswerMap[String(q.id)] === true || pendingSet.has(q.id!)
        );
        const locked = pendingIds.length > 0 && (pendingIds.length >= feedbackBlockSize || allAnsweredLike);

        return {
            locked,
            pendingIds,
            remainingCount: pendingIds.length,
        };
    };

    const handleToggleOption = (optionIndex: number) => {
        const currentQuestion = questions[currentQuestionIndex];
        if (!currentQuestion) return;
        const qId = String(currentQuestion.id);
        if (showAnswerMap[qId]) return;

        const currentAnswers = answers[qId] || [];
        const isSingleChoice = currentQuestion.correctAnswers.length === 1;

        let newAnswers: number[];
        if (isSingleChoice) {
            newAnswers = [optionIndex];
        } else {
            if (currentAnswers.includes(optionIndex)) {
                newAnswers = currentAnswers.filter(i => i !== optionIndex);
            } else {
                newAnswers = [...currentAnswers, optionIndex];
            }
        }

        const nextAnswers = { ...answers, [qId]: newAnswers };
        setAnswers(nextAnswers);
    };

    const findQuestionIndexById = (questionId: number): number => {
        return questions.findIndex(q => q.id === questionId);
    };

    const findNextUnansweredIndex = (fromIndex: number, targetAnsweredMap: Record<string, boolean> = answeredMap): number => {
        // answeredMap=true または showAnswerMap=true の問題は「完了済み」とみなす
        const isDone = (idx: number) =>
            targetAnsweredMap[String(questions[idx].id)] ||
            showAnswerMap[String(questions[idx].id)];

        for (let i = fromIndex + 1; i < questions.length; i++) {
            if (!isDone(i)) {
                return i;
            }
        }
        for (let i = 0; i <= fromIndex; i++) {
            if (!isDone(i)) {
                return i;
            }
        }
        return -1;
    };

    const getUnrevealedAnsweredQuestionIds = (targetAnsweredMap: Record<string, boolean> = answeredMap): number[] => {
        return questions
            .map(q => q.id!)
            .filter(questionId => targetAnsweredMap[String(questionId)] && !showAnswerMap[String(questionId)]);
    };

    const enterRevealPhase = (questionIds: number[]) => {
        if (questionIds.length === 0) return;
        setFeedbackPhase('revealing');
        setPendingRevealQuestionIds(questionIds);
        setShowAnswerMap(prev => ({ ...prev, [String(questionIds[0])]: true }));
        const nextIndex = findQuestionIndexById(questionIds[0]);
        if (nextIndex >= 0) {
            setCurrentQuestionIndex(nextIndex);
        }
    };

    const flashSessionInlineNotice = (message: string) => {
        if (sessionInlineNoticeTimeoutRef.current !== null) {
            window.clearTimeout(sessionInlineNoticeTimeoutRef.current);
        }
        setSessionInlineNotice(message);
        sessionInlineNoticeTimeoutRef.current = window.setTimeout(() => {
            setSessionInlineNotice(null);
            sessionInlineNoticeTimeoutRef.current = null;
        }, 1800);
    };

    const flashSessionPointerNotice = (message: string, clickPosition?: SidebarClickPosition) => {
        if (!clickPosition) {
            return;
        }
        if (sessionPointerNoticeTimeoutRef.current !== null) {
            window.clearTimeout(sessionPointerNoticeTimeoutRef.current);
        }
        const maxNoticeWidth = 320;
        const x = Math.min(Math.max(clickPosition.x + 14, 8), window.innerWidth - maxNoticeWidth - 8);
        const y = Math.min(Math.max(clickPosition.y + 14, 72), window.innerHeight - 44);
        setSessionPointerNotice({ message, x, y });
        sessionPointerNoticeTimeoutRef.current = window.setTimeout(() => {
            setSessionPointerNotice(null);
            sessionPointerNoticeTimeoutRef.current = null;
        }, 1800);
    };

    const finalizeTestCompletion = async (overrideConfidences?: Record<string, ConfidenceLevel>) => {
        const end = new Date();
        setEndTime(end);
        setIsTestCompleted(true);

        if (activeQuizSet?.id !== undefined) {
            await clearSessionFromStorage(activeQuizSet.id);

            // overrideConfidences: 暗記問題の最後判定直後は state が未反映のため引数で渡す
            const effectiveConfidences = overrideConfidences ?? confidences;

            let correctCount = 0;
            questions.forEach(q => {
                const qKey = String(q.id);
                const userAnswers = answers[qKey] || [];
                const conf = effectiveConfidences[qKey] || 'high';
                const isCorrect = q.questionType === 'memorization'
                    ? conf === 'high'
                    : (userAnswers.length === q.correctAnswers.length && userAnswers.every(a => q.correctAnswers.includes(a)));
                if (isCorrect) correctCount++;
            });

            const durationSeconds = Math.round((end.getTime() - startTimeRef.current.getTime()) / 1000);

            const historyData = {
                quizSetId: activeQuizSet.id,
                date: end,
                correctCount,
                totalCount: questions.length,
                durationSeconds,
                answers,
                markedQuestionIds: markedQuestions,
                memos,
                confidences: effectiveConfidences,
                questionIds: questions.map(q => q.id!),
                mode: historyMode,
                feedbackTimingMode,
            };

            await addHistory(historyData);

            const existingSchedules = await getReviewSchedulesForQuizSet(activeQuizSet.id);
            const intervalByQuestionId = new Map(existingSchedules.map(s => [s.questionId, s.intervalDays]));
            const consecutiveByQuestionId = new Map(existingSchedules.map(s => [s.questionId, s.consecutiveCorrect]));
            const reviewIntervalSettings = loadReviewIntervalSettings();

            const schedulesToUpdate: (Omit<ReviewSchedule, 'id'> & { id?: number })[] = [];
            for (const q of questions) {
                const qKey = String(q.id);
                const userAnswers = answers[qKey] || [];
                const confidence: ConfidenceLevel = effectiveConfidences[qKey] || 'high';
                const isCorrect = q.questionType === 'memorization'
                    ? confidence === 'high'
                    : (userAnswers.length === q.correctAnswers.length && userAnswers.every(a => q.correctAnswers.includes(a)));
                const currentInterval = intervalByQuestionId.get(q.id!) ?? 1;
                const currentConsecutive = consecutiveByQuestionId.get(q.id!) ?? 0;
                const intervalDays = calculateNextInterval(isCorrect, confidence, currentInterval, reviewIntervalSettings);
                const nextDue = calculateNextDue(intervalDays);
                const consecutiveCorrect = updateConsecutiveCorrect(isCorrect, currentConsecutive);

                schedulesToUpdate.push({
                    questionId: q.id!,
                    quizSetId: activeQuizSet.id,
                    intervalDays,
                    nextDue,
                    lastReviewedAt: new Date().toISOString(),
                    consecutiveCorrect,
                });
            }

            if (schedulesToUpdate.length > 0) {
                await upsertReviewSchedulesBulk(schedulesToUpdate);
            }
        }
    };

    const handleShowAnswer = () => {
        const currentQuestion = questions[currentQuestionIndex];
        if (!currentQuestion) return;

        const questionId = currentQuestion.id!;
        const qId = String(questionId);
        const selectedCount = (answers[qId] || []).length;
        const alreadyAnswered = answeredMap[qId] === true;

        if (showAnswerMap[qId]) return;
        if (feedbackTimingMode === 'delayed_block' && feedbackPhase === 'answering') {
            const blockState = getDelayedBlockLockPreview();
            const isCurrentPending = blockState.pendingIds.includes(questionId);
            if (blockState.locked && blockState.remainingCount > 0 && !isCurrentPending) {
                return;
            }
        }
        const isMemoQuestion = currentQuestion.questionType === 'memorization';
        if (!alreadyAnswered && selectedCount === 0 && !isMemoQuestion) {
            flashSessionInlineNotice('選択肢を1つ以上選んでから回答してください');
            return;
        }

        if (feedbackTimingMode === 'immediate' || feedbackPhase === 'revealing') {
            // 暗記問題は answeredMap を即セットしない（onMemorizationJudge で判定後にセット）
            if (!isMemoQuestion) {
                setAnsweredMap(prev => ({ ...prev, [qId]: true }));
            }
            setShowAnswerMap(prev => ({ ...prev, [qId]: true }));
            scheduleSaveSession();
            return;
        }
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
        const remainingPendingCount = nextPendingRevealQuestionIds.filter(
            questionId => !showAnswerMap[String(questionId)]
        ).length;

        if (feedbackTimingMode === 'delayed_end' && allAnswered) {
            enterRevealPhase(getUnrevealedAnsweredQuestionIds(nextAnsweredMap));
            scheduleSaveSession();
            return;
        }

        if (feedbackTimingMode === 'delayed_block' && shouldLockByDelayedBlock && remainingPendingCount > 0) {
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

        const currentQuestion = questions[currentQuestionIndex];
        if (!currentQuestion) {
            setCurrentQuestionIndex(targetIndex);
            return;
        }

        const targetQuestionId = questions[targetIndex].id!;

        if (feedbackTimingMode !== 'immediate' && feedbackPhase === 'revealing') {
            const remainingPendingCount = pendingRevealQuestionIds.filter(
                questionId => !showAnswerMap[String(questionId)]
            ).length;
            const isTargetPending = pendingRevealQuestionIds.includes(targetQuestionId);
            const isTargetAlreadyConfirmed = showAnswerMap[String(targetQuestionId)] === true;
            if (remainingPendingCount > 0 && !isTargetPending && !isTargetAlreadyConfirmed) {
                flashSessionPointerNotice(`残り${remainingPendingCount}件の回答確認後に移動できます`, clickPosition);
                return;
            }

            if (remainingPendingCount === 0 && feedbackTimingMode === 'delayed_block') {
                setPendingRevealQuestionIds([]);
                setFeedbackPhase('answering');
                setCurrentQuestionIndex(targetIndex);
                return;
            }

            if (isTargetPending) {
                setShowAnswerMap(prev => ({ ...prev, [String(targetQuestionId)]: true }));
            }
            setCurrentQuestionIndex(targetIndex);
            return;
        }

        if (feedbackTimingMode === 'immediate' || feedbackPhase !== 'answering') {
            setCurrentQuestionIndex(targetIndex);
            return;
        }

        const currentQuestionId = currentQuestion.id!;
        const currentQKey = String(currentQuestionId);
        const hasSelectedOptions = (answers[currentQKey] || []).length > 0;
        let nextAnsweredMap = answeredMap;
        let nextPendingRevealQuestionIds = pendingRevealQuestionIds;
        let didAutoSave = false;

        if (hasSelectedOptions && !answeredMap[currentQKey] && !showAnswerMap[currentQKey]) {
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
            answers,
            nextAnsweredMap,
            nextPendingRevealQuestionIds
        );
        const isTargetAlreadyConfirmed = showAnswerMap[String(targetQuestionId)] === true;
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

    const handleNext = () => {
        if (feedbackTimingMode === 'immediate') {
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
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

            const unrevealedAnswered = getUnrevealedAnsweredQuestionIds();
            if (unrevealedAnswered.length > 0) {
                enterRevealPhase(unrevealedAnswered);
                scheduleSaveSession();
            }
            return;
        }

        const currentQuestionId = questions[currentQuestionIndex]?.id;
        if (currentQuestionId === undefined) return;

        const currentPos = pendingRevealQuestionIds.indexOf(currentQuestionId);
        const nextPendingId = currentPos >= 0 ? pendingRevealQuestionIds[currentPos + 1] : pendingRevealQuestionIds[0];

        if (nextPendingId !== undefined) {
            setShowAnswerMap(prev => ({ ...prev, [String(nextPendingId)]: true }));
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
            scheduleSaveSession();
            return;
        }

        void finalizeTestCompletion();
    };

    const handleMemoChange = (questionId: number, value: string) => {
        setMemos(prev => ({ ...prev, [String(questionId)]: value }));
    };

    const handleConfidenceChange = (questionId: number, level: ConfidenceLevel) => {
        setConfidences(prev => ({ ...prev, [String(questionId)]: level }));
    };

    /**
     * 混合セット内の暗記問題用判定ハンドラ。
     * 「覚えた（isRemembered=true）」→ confidence='high'（正解）
     * 「覚えていない（isRemembered=false）」→ confidence='low'（不正解）
     * 最後の問題の場合は overrideConfidences を直接 finalizeTestCompletion に渡して
     * React state の非同期更新タイミング問題を回避する。
     */
    const handleMemorizationJudge = (questionId: number, isRemembered: boolean) => {
        const level: ConfidenceLevel = isRemembered ? 'high' : 'low';
        const qId = String(questionId);
        const newConfidences = { ...confidences, [qId]: level };
        const newAnsweredMap = { ...answeredMap, [qId]: true };
        setConfidences(newConfidences);
        setAnsweredMap(newAnsweredMap);
        scheduleSaveSession();

        if (feedbackTimingMode === 'immediate') {
            // 全問の answeredMap または showAnswerMap が埋まれていれば完了
            const allDone = questions.every(q => {
                const id = String(q.id);
                return newAnsweredMap[id] || showAnswerMap[id];
            });
            if (allDone) {
                void finalizeTestCompletion(newConfidences);
                return;
            }
            const nextIdx = findNextUnansweredIndex(currentQuestionIndex, newAnsweredMap);
            if (nextIdx >= 0) setCurrentQuestionIndex(nextIdx);
            return;
        }

        // ------- 遅延モード -------
        if (feedbackPhase === 'revealing') {
            // handleNext の revealing フェーズと同じロジックで次の pending へ進む
            const currentPos = pendingRevealQuestionIds.indexOf(questionId);
            const nextPendingId = currentPos >= 0
                ? pendingRevealQuestionIds[currentPos + 1]
                : pendingRevealQuestionIds[0];

            if (nextPendingId !== undefined) {
                // 次の pending 問題の答えを表示して移動
                setShowAnswerMap(prev => ({ ...prev, [String(nextPendingId)]: true }));
                const nextIndex = findQuestionIndexById(nextPendingId);
                if (nextIndex >= 0) setCurrentQuestionIndex(nextIndex);
                return;
            }

            // pending がすべて確認済み
            setPendingRevealQuestionIds([]);
            const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex, newAnsweredMap);
            if (feedbackTimingMode === 'delayed_block' && nextUnansweredIndex >= 0) {
                // delayed_block: まだ回答していない問題が残っている
                setFeedbackPhase('answering');
                setCurrentQuestionIndex(nextUnansweredIndex);
                return;
            }
            // delayed_end or 全問完了 → テスト終了
            void finalizeTestCompletion(newConfidences);
            return;
        }

        // answering フェーズ: 次の未回答問題へ移動、なければ reveal 開始
        const nextIdx = findNextUnansweredIndex(currentQuestionIndex, newAnsweredMap);
        if (nextIdx >= 0) {
            setCurrentQuestionIndex(nextIdx);
        } else {
            const unrevealedAnswered = getUnrevealedAnsweredQuestionIds(newAnsweredMap);
            if (unrevealedAnswered.length > 0) {
                enterRevealPhase(unrevealedAnswered);
            } else {
                void finalizeTestCompletion(newConfidences);
            }
        }
    };


    const handleCompleteTest = async () => {
        const answeredCount = Object.values(answeredMap).filter(Boolean).length;
        if (answeredCount < questions.length) {
            if (!window.confirm('未回答の問題があります。テストを完了してもいいですか？')) {
                return;
            }
        }

        if (feedbackTimingMode !== 'immediate') {
            const unrevealedAnswered = getUnrevealedAnsweredQuestionIds();
            if (unrevealedAnswered.length > 0) {
                enterRevealPhase(unrevealedAnswered);
                return;
            }

            const remainingPending = pendingRevealQuestionIds.filter(questionId => !showAnswerMap[String(questionId)]);
            if (remainingPending.length > 0) {
                enterRevealPhase(remainingPending);
                return;
            }
        }

        await finalizeTestCompletion();
    };

    const handleReview = () => {
        setIsTestCompleted(false);
        setCurrentQuestionIndex(0);
        const allShown: Record<string, boolean> = {};
        const allAnswered: Record<string, boolean> = {};
        questions.forEach(q => {
            allShown[String(q.id)] = true;
            allAnswered[String(q.id)] = true;
        });
        setAnsweredMap(allAnswered);
        setShowAnswerMap(allShown);
        setPendingRevealQuestionIds([]);
        setFeedbackPhase('revealing');
    };

    const startReviewSession = (targetQuestions: Question[], mode: HistoryMode) => {
        let qs = [...targetQuestions];
        if (activeQuizSet?.id !== undefined) {
            const settings = loadQuizSetSettings(activeQuizSet.id);
            qs = applyShuffleSettings(qs, settings);
        }
        setQuestions(qs);
        setCurrentQuestionIndex(0);
        setAnswers({});
        setAnsweredMap({});
        setMemos({});
        setShowAnswerMap({});
        setPendingRevealQuestionIds([]);
        setFeedbackPhase('answering');
        setMarkedQuestions([]);
        setConfidences({});
        setIsTestCompleted(false);
        setHistoryMode(mode);
        startTimeRef.current = new Date();
    };

    const handleRetestWrong = () => {
        const wrongQuestions = questions.filter(q => {
            const qKey = String(q.id);
            const userAnswers = answers[qKey] || [];
            const isCorrect = userAnswers.length > 0 && userAnswers.length === q.correctAnswers.length &&
                userAnswers.every(a => q.correctAnswers.includes(a));
            const isAnswered = userAnswers.length > 0;
            return isAnswered && !isCorrect;
        });

        if (wrongQuestions.length === 0) {
            alert('間違えた問題はありません。');
            return;
        }
        startReviewSession(wrongQuestions, 'review_wrong');
    };

    const handleRetestWeak = () => {
        const targetQuestions = questions.filter(q => {
            const qKey = String(q.id);
            const userAnswers = answers[qKey] || [];
            const isCorrect = userAnswers.length > 0 && userAnswers.length === q.correctAnswers.length &&
                userAnswers.every(a => q.correctAnswers.includes(a));
            const isAnswered = userAnswers.length > 0;
            const confidence = confidences[qKey];
            const isLowConfidence = confidence === 'low';
            return (isAnswered && !isCorrect) || (isAnswered && isCorrect && isLowConfidence);
        });

        if (targetQuestions.length === 0) {
            alert('復習対象の問題はありません。');
            return;
        }
        startReviewSession(targetQuestions, 'review_weak');
    };

    if (!activeQuizSet) {
        return <NotFoundView />;
    }

    const managePath = `/quiz/${quizSetId}/manage`;
    const detailPath = `/quiz/${quizSetId}`;
    const currentQuestion = questions[currentQuestionIndex];
    const qId = currentQuestion ? String(currentQuestion.id) : '';
    const showAnswerForCurrent = currentQuestion
        ? (feedbackTimingMode === 'immediate'
            ? showAnswerMap[qId] === true
            : feedbackPhase === 'revealing' && answeredMap[qId] === true)
        : false;
    const isAnswerLocked =
        feedbackTimingMode !== 'immediate' &&
        feedbackPhase === 'answering' &&
        answeredMap[qId] === true &&
        !showAnswerMap[qId];
    const revealReadyCount = (() => {
        if (!currentQuestion) return null;
        if (feedbackTimingMode === 'immediate') return null;
        if (feedbackPhase !== 'answering') return null;
        if (showAnswerMap[qId]) return null;

        if (feedbackTimingMode === 'delayed_block') {
            const blockState = getDelayedBlockLockPreview();
            if (blockState.locked && blockState.pendingIds.includes(currentQuestion.id!)) {
                return blockState.remainingCount > 0 ? blockState.remainingCount : null;
            }
            return null;
        }

        if (answeredMap[qId]) {
            const allAnsweredNow = questions.every(q => answeredMap[String(q.id)] === true);

            if (feedbackTimingMode === 'delayed_end') {
                if (!allAnsweredNow) return null;
                const count = questions.filter(q => answeredMap[String(q.id)] && !showAnswerMap[String(q.id)]).length;
                return count > 0 ? count : null;
            }
        }

        return null;
    })();
    const canCompleteAfterCurrent = (() => {
        if (!currentQuestion) return false;
        if (feedbackTimingMode === 'immediate') {
            return currentQuestionIndex === questions.length - 1;
        }
        if (!showAnswerForCurrent || feedbackPhase !== 'revealing') {
            return false;
        }

        const currentQuestionId = currentQuestion.id!;
        const currentPos = pendingRevealQuestionIds.indexOf(currentQuestionId);
        const nextPendingId = currentPos >= 0
            ? pendingRevealQuestionIds[currentPos + 1]
            : pendingRevealQuestionIds[0];

        if (nextPendingId !== undefined) {
            return false;
        }

        if (feedbackTimingMode === 'delayed_block') {
            const nextUnansweredIndex = findNextUnansweredIndex(currentQuestionIndex);
            return nextUnansweredIndex < 0;
        }

        return true;
    })();
    const useNextAnswerLabel = (() => {
        if (!currentQuestion) return false;
        if (feedbackTimingMode === 'immediate') return false;
        if (!showAnswerForCurrent || feedbackPhase !== 'revealing') return false;

        const currentQuestionId = currentQuestion.id!;
        const currentPos = pendingRevealQuestionIds.indexOf(currentQuestionId);
        const nextPendingId = currentPos >= 0
            ? pendingRevealQuestionIds[currentPos + 1]
            : pendingRevealQuestionIds[0];

        return nextPendingId !== undefined;
    })();
    const sidebarLockedQuestionIds = (() => {
        if (feedbackTimingMode === 'immediate' || questions.length === 0) {
            return [] as number[];
        }

        const blockState = getDelayedBlockLockPreview();
        if (blockState.locked && blockState.remainingCount > 0) {
            const allowedSet = new Set(blockState.pendingIds);
            return questions
                .filter(q => !allowedSet.has(q.id!) && !showAnswerMap[String(q.id)])
                .map(q => q.id!);
        }

        if (feedbackPhase === 'revealing') {
            const remainingPendingCount = pendingRevealQuestionIds.filter(questionId => !showAnswerMap[String(questionId)]).length;
            if (remainingPendingCount > 0) {
                const allowedSet = new Set(pendingRevealQuestionIds);
                return questions
                    .filter(q => !allowedSet.has(q.id!) && !showAnswerMap[String(q.id)])
                    .map(q => q.id!);
            }
        }

        return [] as number[];
    })();
    const answeredCount = Object.values(answeredMap).filter(Boolean).length;
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
            title={activeQuizSet.name}
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
                    answers={answers}
                    answeredMap={answeredMap}
                    showAnswerMap={showAnswerMap}
                    markedQuestionIds={markedQuestions}
                    onToggleMark={handleToggleMark}
                    lockedQuestionIds={sidebarLockedQuestionIds}
                    confidences={confidences}
                />
            }
        >
            {isTestCompleted ? (
                <TestResult
                    questions={questions}
                    answers={answers}
                    confidences={confidences}
                    startTime={startTimeRef.current}
                    endTime={endTime}
                    onReview={handleReview}
                    onRetestWrong={handleRetestWrong}
                    onRetestWeak={handleRetestWeak}
                    historyOverrides={activeHistory ? {
                        correctCount: activeHistory.correctCount,
                        totalCount: activeHistory.totalCount
                    } : undefined}
                />
            ) : currentQuestion ? (
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
                    <div className="progress-section">
                        <span className="progress-text">
                            {answeredCount}/{questions.length}
                        </span>
                        <div className="progress-bar-track">
                            <div
                                className="progress-bar-fill"
                                style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                            />
                        </div>
                        <button className="finish-test-btn" onClick={handleCompleteTest}>
                            テストを完了する
                        </button>
                    </div>

                    <QuestionView
                        question={currentQuestion}
                        questionIndex={currentQuestionIndex}
                        totalQuestions={questions.length}
                        selectedOptions={answers[qId] || []}
                        onToggleOption={handleToggleOption}
                        showAnswer={showAnswerForCurrent}
                        isMarked={markedQuestions.includes(currentQuestion.id!)}
                        onToggleMark={handleToggleMark}
                        onShowAnswer={handleShowAnswer}
                        onNext={handleNext}
                        onCompleteTest={handleCompleteTest}
                        isLast={canCompleteAfterCurrent}
                        memo={memos[qId] || ''}
                        onMemoChange={(val) => handleMemoChange(currentQuestion.id!, val)}
                        confidence={confidences[qId] || null}
                        onConfidenceChange={(level) => handleConfidenceChange(currentQuestion.id!, level)}
                        onMemorizationJudge={(isRemembered) => handleMemorizationJudge(currentQuestion.id!, isRemembered)}
                        memorizationAnswer={memorizationAnswers[qId] || ''}
                        onMemorizationAnswerChange={(val) => setMemorizationAnswers(prev => ({ ...prev, [qId]: val }))}
                        feedbackTimingMode={feedbackTimingMode}
                        isAnswerLocked={isAnswerLocked}
                        revealReadyCount={revealReadyCount}
                        useNextAnswerLabel={useNextAnswerLabel}
                    />
                </>
            ) : (
                <div className="loading-text">Loading questions...</div>
            )}
            <ConfirmationModal
                isOpen={showEmptyQuestionsModal}
                title="問題がまだありません"
                message="この問題集には問題が0件です。問題/暗記カードを追加してから開始してください。"
                confirmLabel="管理画面へ"
                cancelLabel="戻る"
                onConfirm={() => {
                    setShowEmptyQuestionsModal(false);
                    navigate(managePath);
                }}
                onCancel={() => {
                    setShowEmptyQuestionsModal(false);
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
