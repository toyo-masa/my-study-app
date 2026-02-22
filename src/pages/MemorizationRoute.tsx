import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { MemorizationResultView, MemorizationQuestionView, type MemorizationLog } from '../components/MemorizationView';
import { QuizSessionLayout } from '../components/QuizSessionLayout';
import { NotFoundView } from '../components/NotFoundView';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';
import { getQuestionsForQuizSet, addHistory } from '../db';
import type { Question, QuizHistory } from '../types';
import { saveSessionToStorage, loadSessionFromStorage, clearSessionFromStorage, loadQuizSetSettings, applyShuffleSettings } from '../utils/quizSettings';

export const MemorizationRoute: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const historyFromState = location.state?.history as QuizHistory | undefined;
    const startNewFromState = location.state?.startNew as boolean | undefined;

    const { quizSetId, activeQuizSet } = useActiveQuizSetFromRoute();

    const [isLoading, setIsLoading] = useState(true);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [memorizationLogs, setMemorizationLogs] = useState<MemorizationLog[]>([]);
    const [markedQuestions, setMarkedQuestions] = useState<number[]>([]);
    const [isTestCompleted, setIsTestCompleted] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [activeHistory, setActiveHistory] = useState<QuizHistory | null>(null);
    const startTimeRef = useRef<Date>(new Date());

    const lastSessionKeyRef = useRef<string | null>(null);

    // Unique key for the current session
    const sessionKey = `${quizSetId}-${startNewFromState}-${historyFromState?.id || 'new'}-${location.key}`;

    // Synchronous state reset to prevent flickering
    const [renderedSessionKey, setRenderedSessionKey] = useState<string | null>(null);
    if (renderedSessionKey !== sessionKey) {
        setRenderedSessionKey(sessionKey);
        setIsLoading(true);
        setQuestions([]);
        setMemorizationLogs([]);
        setCurrentQuestionIndex(0);
        setMarkedQuestions([]);
        setIsTestCompleted(false);
        setActiveHistory(null);
    }

    const startNew = useCallback((qs: Question[]) => {
        let studyQuestions: Question[] = qs.map(q => ({ ...q, id: q.id! }));
        if (quizSetId) {
            const settings = loadQuizSetSettings(quizSetId);
            studyQuestions = applyShuffleSettings(studyQuestions, settings);
            clearSessionFromStorage(quizSetId).catch(err => console.error('Failed to clear suspended session', err));
        }
        setQuestions(studyQuestions);
        setMemorizationLogs([]);
        setCurrentQuestionIndex(0);
        setMarkedQuestions([]);
        setIsTestCompleted(false);
        setActiveHistory(null);
        startTimeRef.current = new Date();

        // Mark as initialized to prevent useEffect from re-shuffling
        lastSessionKeyRef.current = sessionKey;
        setIsLoading(false);
    }, [quizSetId, sessionKey]);

    useEffect(() => {
        const initMem = async () => {
            if (!quizSetId) return;

            // Atomic Guard
            if (lastSessionKeyRef.current === sessionKey) return;
            lastSessionKeyRef.current = sessionKey;

            try {
                const qs = await getQuestionsForQuizSet(quizSetId);

                if (historyFromState && historyFromState.memorizationDetail && historyFromState.memorizationDetail.length > 0) {
                    setQuestions(qs);
                    setActiveHistory(historyFromState);
                    setMemorizationLogs(historyFromState.memorizationDetail);
                    setMarkedQuestions(historyFromState.markedQuestionIds || []);
                    setIsTestCompleted(true);
                    setIsLoading(false);
                    return;
                }

                const suspendedSession = !startNewFromState ? await loadSessionFromStorage(quizSetId) : null;

                if (suspendedSession && suspendedSession.type === 'memorization') {
                    const validOptionIds = new Set(qs.map(q => q.id));
                    const filteredQuestions = suspendedSession.questions.filter((q: Question) => q.id !== undefined && validOptionIds.has(q.id));

                    if (filteredQuestions.length === 0) {
                        alert('中断していた問題はすべて削除されました。');
                        await clearSessionFromStorage(quizSetId);
                        startNew(qs);
                    } else {
                        const nextIndex = Math.min(suspendedSession.currentQuestionIndex, filteredQuestions.length - 1);
                        setQuestions(filteredQuestions);
                        setMemorizationLogs(suspendedSession.memorizationLogs || []);
                        setCurrentQuestionIndex(nextIndex);
                        setMarkedQuestions(suspendedSession.markedQuestions || []);

                        // Restore startTimeRef by subtracting previously spent time from NOW
                        const resumedStartTime = new Date(Date.now() - (suspendedSession.elapsedSeconds || 0) * 1000);
                        startTimeRef.current = resumedStartTime;

                        setIsTestCompleted(false);
                        setActiveHistory(null);
                        setIsLoading(false);
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
    }, [sessionKey, startNew, quizSetId, historyFromState, startNewFromState]);

    const handleBackToDetail = () => {
        if (!isTestCompleted && !activeHistory && activeQuizSet?.id !== undefined && questions.length > 0) {
            const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000);
            saveSessionToStorage(activeQuizSet.id, {
                questions,
                currentQuestionIndex,
                answers: {},
                memos: {},
                showAnswerMap: {},
                markedQuestions,
                startTime: startTimeRef.current,
                elapsedSeconds,
                historyMode: 'normal',
                type: 'memorization',
                memorizationLogs,
            }).catch(err => console.error('Failed to save suspended session', err));
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

    const handleMemorizationJudge = (inputs: string[], isMemorized: boolean) => {
        const currentQ = questions[currentQuestionIndex];
        if (!currentQ) return;

        const filteredLogs = memorizationLogs.filter(l => l.questionId !== currentQ.id);

        const log: MemorizationLog = {
            questionId: currentQ.id!,
            userInputs: inputs,
            isMemorized,
        };
        const newLogs = [...filteredLogs, log];
        setMemorizationLogs(newLogs);

        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        } else {
            handleCompleteMemorization(newLogs);
        }
    };

    const handleCompleteMemorization = async (finalLogs: MemorizationLog[]) => {
        setIsTestCompleted(true);
        if (activeHistory) return;

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
            mode: 'normal'
        };

        if (activeQuizSet?.id !== undefined) {
            await clearSessionFromStorage(activeQuizSet.id);
        }

        try {
            await addHistory(history);
        } catch (e) {
            console.error('Failed to save history', e);
        }
    };

    const handleRetryMemorization = () => {
        setIsLoading(true);
        getQuestionsForQuizSet(quizSetId!).then(qs => {
            startNew(qs);
        });
    };

    if (!activeQuizSet) {
        return <NotFoundView />;
    }

    const memStatus = memorizationLogs.reduce((acc, log) => {
        acc[log.questionId] = log.isMemorized ? 'memorized' : 'not_memorized';
        return acc;
    }, {} as Record<number, 'memorized' | 'not_memorized' | 'unanswered'>);

    return (
        <QuizSessionLayout
            title={`${activeQuizSet.name} (暗記)`}
            isLoading={isLoading}
            sidebarOpen={sidebarOpen}
            showSidebar={!isTestCompleted}
            onBack={handleBackToDetail}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onCloseSidebar={() => setSidebarOpen(false)}
            sidebarContent={
                <Sidebar
                    questions={questions}
                    currentQuestionIndex={currentQuestionIndex}
                    onSelectQuestion={setCurrentQuestionIndex}
                    mode="memorization"
                    memorizationStatus={memStatus}
                    answers={{}}
                    showAnswerMap={{}}
                    markedQuestionIds={markedQuestions}
                    onToggleMark={handleToggleMark}
                />
            }
        >
            {isTestCompleted ? (
                <MemorizationResultView
                    logs={memorizationLogs}
                    questions={questions}
                    onBack={() => {
                        setActiveHistory(null);
                        navigate(`/quiz/${quizSetId}`);
                    }}
                    onRetry={!activeHistory ? handleRetryMemorization : undefined}
                    isHistory={!!activeHistory}
                />
            ) : (
                questions[currentQuestionIndex] && (
                    <MemorizationQuestionView
                        key={questions[currentQuestionIndex].id}
                        question={questions[currentQuestionIndex]}
                        index={currentQuestionIndex}
                        total={questions.length}
                        onJudge={handleMemorizationJudge}
                        isMarked={markedQuestions.includes(questions[currentQuestionIndex].id!)}
                        onToggleMark={handleToggleMark}
                    />
                )
            )}
        </QuizSessionLayout>
    );
};
