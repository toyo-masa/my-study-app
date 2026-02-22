import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { TestResult } from '../components/TestResult';
import { QuestionView } from '../components/QuestionView';
import { QuizSessionLayout } from '../components/QuizSessionLayout';
import { NotFoundView } from '../components/NotFoundView';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';
import { getQuestionsForQuizSet, addHistory, upsertReviewSchedulesBulk, getReviewSchedulesForQuizSet } from '../db';
import { calculateNextInterval, calculateNextDue, loadReviewIntervalSettings, updateConsecutiveCorrect } from '../utils/spacedRepetition';
import type { Question, ConfidenceLevel, HistoryMode, QuizHistory, ReviewSchedule } from '../types';
import { loadQuizSetSettings, applyShuffleSettings, saveSessionToStorage, loadSessionFromStorage, clearSessionFromStorage } from '../utils/quizSettings';

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
    const [memos, setMemos] = useState<Record<string, string>>({});
    const [showAnswerMap, setShowAnswerMap] = useState<Record<string, boolean>>({});
    const [markedQuestions, setMarkedQuestions] = useState<number[]>([]);
    const [confidences, setConfidences] = useState<Record<string, ConfidenceLevel>>({});
    const [isTestCompleted, setIsTestCompleted] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [endTime, setEndTime] = useState<Date>(new Date());
    const [activeHistory, setActiveHistory] = useState<QuizHistory | null>(null);
    const [historyMode, setHistoryMode] = useState<HistoryMode>('normal');
    const [showEmptyQuestionsModal, setShowEmptyQuestionsModal] = useState(false);

    const startTimeRef = useRef<Date>(new Date());
    const lastSessionKeyRef = useRef<string | null>(null);

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
        setMemos({});
        setShowAnswerMap({});
        setMarkedQuestions([]);
        setConfidences({});
        setIsTestCompleted(false);
        setActiveHistory(null);
        setHistoryMode('normal');
        setShowEmptyQuestionsModal(false);
    }, [sessionKey]);

    useEffect(() => {
        const initStudy = async () => {
            if (!quizSetId) return;

            // Atomic Guard: Ensure we only initialize ONCE per unique session/navigation
            if (lastSessionKeyRef.current === sessionKey) return;
            lastSessionKeyRef.current = sessionKey;

            try {
                const qs = await getQuestionsForQuizSet(quizSetId);

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
                    setMemos(historyFromState.memos || {});
                    setConfidences(historyFromState.confidences || {});
                    setMarkedQuestions(historyFromState.markedQuestionIds || []);
                    setHistoryMode(historyFromState.mode || 'normal');

                    const allShown: Record<string, boolean> = {};
                    studyQuestions.forEach(q => { allShown[String(q.id)] = true; });
                    setShowAnswerMap(allShown);

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
                        setMemos(suspendedSession.memos || {});
                        setShowAnswerMap(suspendedSession.showAnswerMap || {});
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
            }
            // All state updates together
            setQuestions(studyQuestions);
            setCurrentQuestionIndex(0);
            setAnswers({});
            setMemos({});
            setShowAnswerMap({});
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
                    memos,
                    showAnswerMap,
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

    const handleToggleOption = (optionIndex: number) => {
        const currentQuestion = questions[currentQuestionIndex];
        if (!currentQuestion) return;
        const qId = String(currentQuestion.id);
        if (showAnswerMap[qId]) return;

        const currentAnswers = answers[qId] || [];
        const isSingleChoice = currentQuestion.correctAnswers.length === 1;

        let newAnswers;
        if (isSingleChoice) {
            newAnswers = [optionIndex];
        } else {
            if (currentAnswers.includes(optionIndex)) {
                newAnswers = currentAnswers.filter(i => i !== optionIndex);
            } else {
                newAnswers = [...currentAnswers, optionIndex];
            }
        }
        setAnswers({ ...answers, [qId]: newAnswers });
    };

    const handleShowAnswer = () => {
        const qId = String(questions[currentQuestionIndex].id);
        setShowAnswerMap(prev => ({ ...prev, [qId]: true }));
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
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };

    const handleMemoChange = (questionId: number, value: string) => {
        setMemos(prev => ({ ...prev, [String(questionId)]: value }));
    };

    const handleConfidenceChange = (questionId: number, level: ConfidenceLevel) => {
        setConfidences(prev => ({ ...prev, [String(questionId)]: level }));
    };

    const handleCompleteTest = async () => {
        const answeredCount = Object.values(showAnswerMap).filter(Boolean).length;
        if (answeredCount < questions.length) {
            if (!window.confirm('未回答の問題があります。テストを完了してもいいですか？')) {
                return;
            }
        }
        const end = new Date();
        setEndTime(end);
        setIsTestCompleted(true);

        if (activeQuizSet?.id !== undefined) {
            await clearSessionFromStorage(activeQuizSet.id);

            let correctCount = 0;
            questions.forEach(q => {
                const userAnswers = answers[String(q.id)] || [];
                if (userAnswers.length === q.correctAnswers.length &&
                    userAnswers.every(a => q.correctAnswers.includes(a))) {
                    correctCount++;
                }
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
                confidences,
                questionIds: questions.map(q => q.id!),
                mode: historyMode,
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
                const isCorrect = userAnswers.length === q.correctAnswers.length &&
                    userAnswers.every(a => q.correctAnswers.includes(a));
                const confidence: ConfidenceLevel = confidences[qKey] || 'high';
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

    const handleReview = () => {
        setIsTestCompleted(false);
        setCurrentQuestionIndex(0);
        const allShown: Record<string, boolean> = {};
        questions.forEach(q => { allShown[String(q.id)] = true; });
        setShowAnswerMap(allShown);
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
        setMemos({});
        setShowAnswerMap({});
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
    const answeredCount = Object.values(showAnswerMap).filter(Boolean).length;
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
            onBack={handleBackToDetail}
            sessionBadge={!isTestCompleted ? reviewHeaderBadge : undefined}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onCloseSidebar={() => setSidebarOpen(false)}
            sidebarContent={
                <Sidebar
                    questions={questions}
                    currentQuestionIndex={currentQuestionIndex}
                    onSelectQuestion={setCurrentQuestionIndex}
                    answers={answers}
                    showAnswerMap={showAnswerMap}
                    markedQuestionIds={markedQuestions}
                    onToggleMark={handleToggleMark}
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
                        showAnswer={showAnswerMap[qId] || false}
                        isMarked={markedQuestions.includes(currentQuestion.id!)}
                        onToggleMark={handleToggleMark}
                        onShowAnswer={handleShowAnswer}
                        onNext={handleNext}
                        onPrev={handlePrev}
                        onCompleteTest={handleCompleteTest}
                        isLast={currentQuestionIndex === questions.length - 1}
                        isFirst={currentQuestionIndex === 0}
                        memo={memos[qId] || ''}
                        onMemoChange={(val) => handleMemoChange(currentQuestion.id!, val)}
                        confidence={confidences[qId] || null}
                        onConfidenceChange={(level) => handleConfidenceChange(currentQuestion.id!, level)}
                    />
                </>
            ) : (
                <div className="loading-text">Loading questions...</div>
            )}
            <ConfirmationModal
                isOpen={showEmptyQuestionsModal}
                title="問題がまだありません"
                message={
                    <>
                        この問題集には問題が0件です。問題/暗記カードを追加してから開始してください。<br />
                        <a
                            href={managePath}
                            onClick={(e) => {
                                e.preventDefault();
                                setShowEmptyQuestionsModal(false);
                                navigate(managePath);
                            }}
                            style={{ color: 'var(--primary-color)', textDecoration: 'underline', fontWeight: 600 }}
                        >
                            管理画面を開く
                        </a>
                    </>
                }
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
