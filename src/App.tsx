import { useState, useRef, useEffect, useCallback } from 'react';
import { HomePage } from './components/HomePage';
import type { QuizSetWithMeta } from './components/HomePage';
import { QuestionManager } from './components/QuestionManager';
import { QuizDetail } from './components/QuizDetail';
import type { QuizSetSettings } from './components/QuizDetail';
import { Sidebar } from './components/Sidebar';
import { QuestionView } from './components/QuestionView';
import { TestResult } from './components/TestResult';
import { SettingsModal } from './components/SettingsModal';
import { MemorizationQuestionView, MemorizationResultView, type MemorizationLog } from './components/MemorizationView';
import { DistributionSimulator } from './components/DistributionSimulator';
import type { Question, ConfidenceLevel, HistoryMode, QuizHistory } from './types';
import { parseQuestions, parseMemorizationQuestions } from './utils/csvParser';
import { calculateNextInterval, calculateNextDue } from './utils/spacedRepetition';
import {
  getQuizSetsWithCounts,
  getQuestionsForQuizSet,
  addQuizSetWithQuestions,
  isDBSeeded,
  addHistory,
  softDeleteQuizSet, // Changed from deleteQuizSet to softDeleteQuizSet
  restoreQuizSet,
  upsertReviewSchedule,
  getDeletedQuizSets,
  updateQuizSet,
  getArchivedQuizSets, // Added
  archiveQuizSet, // Added
  unarchiveQuizSet, // Added
  hardDeleteQuizSet, // Added
} from './db';
import { Menu, ArrowLeft, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

type AppView = 'home' | 'detail' | 'study' | 'manage' | 'memorization-view' | 'distribution-sim';

// Define SuspendedSession type
interface SuspendedSession {
  questions: Question[];
  currentQuestionIndex: number;
  answers: Record<string, number[]>;
  memos: Record<string, string>;
  showAnswerMap: Record<string, boolean>;
  markedQuestions: number[];
  startTime: Date;
  historyMode: HistoryMode;
  type?: 'study' | 'memorization';
  memorizationLogs?: MemorizationLog[];
}

function App() {
  const [view, setView] = useState<AppView>('home');
  const [quizSets, setQuizSets] = useState<QuizSetWithMeta[]>([]);
  const [deletedQuizSets, setDeletedQuizSets] = useState<QuizSetWithMeta[]>([]);
  const [archivedQuizSets, setArchivedQuizSets] = useState<QuizSetWithMeta[]>([]); // Added
  const [activeQuizSet, setActiveQuizSet] = useState<QuizSetWithMeta | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Study session state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [showAnswerMap, setShowAnswerMap] = useState<Record<string, boolean>>({});
  const [isTestCompleted, setIsTestCompleted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const startTimeRef = useRef<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(new Date());
  const isRestoredRef = useRef(false);
  const [activeHistory, setActiveHistory] = useState<QuizHistory | null>(null);

  // Memorization state
  const [memorizationLogs, setMemorizationLogs] = useState<MemorizationLog[]>([]);
  const [markedQuestions, setMarkedQuestions] = useState<number[]>([]);
  const [confidences, setConfidences] = useState<Record<string, ConfidenceLevel>>({});
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem('accentColor') || '#6366f1';
  });
  const [historyMode, setHistoryMode] = useState<HistoryMode>('normal');
  // suspendedSession state is removed in favor of localStorage + load on demand/render

  // Helper to load suspended session for a specific quiz set
  const loadSessionFromStorage = (quizSetId: number): SuspendedSession | null => {
    try {
      const stored = localStorage.getItem(`suspendedSession_${quizSetId}`);
      if (stored) {
        const session = JSON.parse(stored);
        // Date strings need to be converted back to Date objects
        return {
          ...session,
          startTime: new Date(session.startTime),
        };
      }
    } catch (e) {
      console.error('Failed to load suspended session', e);
    }
    return null;
  };

  const saveSessionToStorage = (quizSetId: number, session: SuspendedSession) => {
    localStorage.setItem(`suspendedSession_${quizSetId}`, JSON.stringify(session));
  };

  const clearSessionFromStorage = (quizSetId: number) => {
    localStorage.removeItem(`suspendedSession_${quizSetId}`);
  };

  // Quiz set settings helpers (localStorage)
  const loadQuizSetSettings = (quizSetId: number): QuizSetSettings => {
    try {
      const stored = localStorage.getItem(`quizSetSettings_${quizSetId}`);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to load quiz set settings', e);
    }
    return { shuffleQuestions: false, shuffleOptions: false };
  };

  const saveQuizSetSettings = (quizSetId: number, settings: QuizSetSettings) => {
    localStorage.setItem(`quizSetSettings_${quizSetId}`, JSON.stringify(settings));
  };

  // Fisher-Yates shuffle (immutable)
  const shuffleArray = <T,>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Shuffle options for a question (returns new Question with shuffled options and adjusted correctAnswers)
  const shuffleQuestionOptions = (q: Question): Question => {
    const indices = q.options.map((_, i) => i);
    const shuffledIndices = shuffleArray(indices);
    const newOptions = shuffledIndices.map(i => q.options[i]);
    const newCorrectAnswers = q.correctAnswers.map(ca => shuffledIndices.indexOf(ca));
    return { ...q, options: newOptions, correctAnswers: newCorrectAnswers };
  };

  // Apply quiz set settings to questions
  const applyShuffleSettings = (qs: Question[], settings: QuizSetSettings): Question[] => {
    let result = [...qs];
    if (settings.shuffleQuestions) {
      result = shuffleArray(result);
    }
    if (settings.shuffleOptions) {
      result = result.map(q => shuffleQuestionOptions(q));
    }
    return result;
  };

  // Handle dark mode class on body
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  // Handle accent color
  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', accentColor);
    // Derive hover color (simple version: just use the same for now, or could use more complex logic)
    // For premium feel, we'll set a slightly darker version
    localStorage.setItem('accentColor', accentColor);
  }, [accentColor]);

  const toggleDarkMode = () => {
    document.body.classList.add('theme-transitioning');
    setIsDarkMode(prev => !prev);
    setTimeout(() => {
      document.body.classList.remove('theme-transitioning');
    }, 500);
  };

  // Load quiz sets from DB
  const loadQuizSets = useCallback(async () => {
    const sets = await getQuizSetsWithCounts(false); // Active
    const deletedSets = await getDeletedQuizSets(); // Deleted
    const archivedSets = await getArchivedQuizSets(); // Archived
    setQuizSets(sets);
    setDeletedQuizSets(deletedSets);
    setArchivedQuizSets(archivedSets);
    return sets;
  }, []);

  // Initialize app
  useEffect(() => {
    const init = async () => {
      // Seed DB if needed
      const seeded = await isDBSeeded();
      if (!seeded) {
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
        } catch (err) {
          console.error('Failed to seed DB:', err);
        }
      }

      const sets = await loadQuizSets();

      // Restore state from localStorage
      const savedState = localStorage.getItem('appState');
      if (savedState) {
        try {
          const parsedState = JSON.parse(savedState);
          if (parsedState.view && parsedState.view !== 'home') {
            const targetSet = sets.find(s => s.id === parsedState.activeQuizSetId);
            if (targetSet) {
              setActiveQuizSet(targetSet);
              if (parsedState.view === 'memorization-view') {
                const qs = await getQuestionsForQuizSet(targetSet.id!);
                // For memorization, we use the raw questions (no shuffle usually, or maybe shuffle setting applies?)
                // Assuming raw for now, similar to handleStartStudy memorization branch
                setQuestions(qs);
                setMemorizationLogs(parsedState.memorizationLogs || []);
                setCurrentQuestionIndex(parsedState.currentQuestionIndex || 0);
                setIsTestCompleted(parsedState.isTestCompleted || false);
                if (parsedState.startTime) startTimeRef.current = new Date(parsedState.startTime);
                if (parsedState.endTime) setEndTime(new Date(parsedState.endTime));
              } else if (parsedState.view === 'study') {
                // Restore study session
                const qs = await getQuestionsForQuizSet(targetSet.id!);
                const studyQuestions: Question[] = qs.map(q => ({ ...q, id: q.id! }));
                setQuestions(studyQuestions);
                setCurrentQuestionIndex(parsedState.currentQuestionIndex || 0);
                setAnswers(parsedState.answers || {});
                setMemos(parsedState.memos || {});
                setShowAnswerMap(parsedState.showAnswerMap || {});
                setMarkedQuestions(parsedState.markedQuestions || []);
                setIsTestCompleted(parsedState.isTestCompleted || false);
                if (parsedState.startTime) startTimeRef.current = new Date(parsedState.startTime);
                if (parsedState.endTime) setEndTime(new Date(parsedState.endTime));
              }
              setView(parsedState.view);
            }
          }
        } catch (e) {
          console.error('Failed to restore state:', e);
          localStorage.removeItem('appState');
        }
      }
      isRestoredRef.current = true;
    };
    init();
  }, []); // Run only once on mount

  // Save state to localStorage
  useEffect(() => {
    if (!isRestoredRef.current) return;

    if (view === 'home') {
      localStorage.removeItem('appState');
    } else {
      const stateToSave = {
        view,
        activeQuizSetId: activeQuizSet?.id,
        currentQuestionIndex,
        answers,
        memos,
        showAnswerMap,
        markedQuestions,
        memorizationLogs,
        isTestCompleted,
        startTime: startTimeRef.current.toISOString(),
        endTime: endTime.toISOString(),
      };
      localStorage.setItem('appState', JSON.stringify(stateToSave));
    }
  }, [view, activeQuizSet, currentQuestionIndex, answers, memos, showAnswerMap, markedQuestions, memorizationLogs, isTestCompleted, endTime]);

  const resetStudyState = () => {
    setCurrentQuestionIndex(0);
    setAnswers({});
    setMemos({});
    setShowAnswerMap({});
    setMarkedQuestions([]);
    setConfidences({});
    setIsTestCompleted(false);
    startTimeRef.current = new Date();
    setActiveHistory(null);
  };

  // Add quiz set from uploaded CSV
  const handleAddQuizSet = async (file: File) => {
    try {
      const parsed = await parseQuestions(file);
      const name = file.name.replace(/\.csv$/i, '');
      const questionsForDB = parsed.map(q => ({
        category: q.category,
        text: q.text,
        options: q.options,
        correctAnswers: q.correctAnswers,
        explanation: q.explanation,
      }));
      await addQuizSetWithQuestions(name, questionsForDB);
      await loadQuizSets();
    } catch (err) {
      alert('CSVの解析エラー: ' + (err as Error).message);
    }
  };

  // Add memorization set from uploaded CSV
  const handleAddMemorizationSet = async (file: File) => {
    try {
      const parsed = await parseMemorizationQuestions(file);
      const name = file.name.replace(/\.csv$/i, '');
      // parsed matches the structure needed for addQuizSetWithQuestions
      await addQuizSetWithQuestions(name, parsed, 'memorization');
      await loadQuizSets();
    } catch (err) {
      alert('暗記用CSVの解析エラー: ' + (err as Error).message);
    }
  };

  // Add empty quiz set
  const handleAddEmptyQuizSet = async () => {
    try {
      await addQuizSetWithQuestions('新しい問題集', []);
      await loadQuizSets();
    } catch (err) {
      alert('問題集の作成エラー: ' + (err as Error).message);
    }
  };

  // Add empty memorization set
  const handleAddEmptyMemorizationSet = async () => {
    try {
      await addQuizSetWithQuestions('新しい暗記カード', [], 'memorization');
      await loadQuizSets();
    } catch (err) {
      alert('暗記カードの作成エラー: ' + (err as Error).message);
    }
  };

  // Select quiz set -> go to detail view or memorization view
  // Select quiz set -> go to detail view
  const handleSelectQuizSet = async (quizSet: QuizSetWithMeta) => {
    setActiveQuizSet(quizSet);
    setView('detail');
  };

  // Start study from detail view
  const handleStartStudy = async () => {
    if (!activeQuizSet || activeQuizSet.id === undefined) return;

    // Branch for memorization
    if (activeQuizSet.type === 'memorization') {
      try {
        const qs = await getQuestionsForQuizSet(activeQuizSet.id);
        setQuestions(qs);
        setMemorizationLogs([]);
        setCurrentQuestionIndex(0);
        setIsTestCompleted(false);
        setActiveHistory(null);
        startTimeRef.current = new Date(); // Start timer
        setView('memorization-view');
        // Clear any previous suspended session when starting new
        clearSessionFromStorage(activeQuizSet.id);
      } catch (err) {
        alert('問題読み込みエラー: ' + (err as Error).message);
      }
      return;
    }

    try {
      const qs = await getQuestionsForQuizSet(activeQuizSet.id!);
      let studyQuestions: Question[] = qs.map(q => ({
        ...q,
        id: q.id!,
      }));

      // Apply shuffle settings
      const settings = loadQuizSetSettings(activeQuizSet.id);
      studyQuestions = applyShuffleSettings(studyQuestions, settings);

      setQuestions(studyQuestions);
      resetStudyState();
      setHistoryMode('normal');

      // Clear any suspended session since we are starting a new one
      clearSessionFromStorage(activeQuizSet.id);

      setView('study');
    } catch (err) {
      alert('読込エラー: ' + (err as Error).message);
    }
  };

  const handleResumeStudy = async () => {
    if (!activeQuizSet || activeQuizSet.id === undefined) return;
    const suspendedSession = loadSessionFromStorage(activeQuizSet.id);
    if (!suspendedSession) return;

    // 最新の問題一覧をDBから取得し、削除された問題を除外する
    const validQuestionsFromDB = await getQuestionsForQuizSet(activeQuizSet.id);
    const validOptionIds = new Set(validQuestionsFromDB.map(q => q.id));

    // 中断セッションの問題リストをフィルタリング
    const filteredQuestions = suspendedSession.questions.filter(q => q.id !== undefined && validOptionIds.has(q.id));

    if (filteredQuestions.length === 0) {
      alert('中断していた問題はすべて削除されました。');
      clearSessionFromStorage(activeQuizSet.id);
      return;
    }

    // 削除された問題文、現在のインデックスが範囲外にならないよう調整
    // (元のインデックスが指していた問題のIDを追跡するのは難しいため、単純に範囲内に収める)
    const nextIndex = Math.min(suspendedSession.currentQuestionIndex, filteredQuestions.length - 1);

    if (suspendedSession.type === 'memorization') {
      setQuestions(filteredQuestions);
      setMemorizationLogs(suspendedSession.memorizationLogs || []);
      setCurrentQuestionIndex(nextIndex);
      startTimeRef.current = suspendedSession.startTime;
      setIsTestCompleted(false);
      setActiveHistory(null);
      setView('memorization-view');
    } else {
      setQuestions(filteredQuestions);
      setCurrentQuestionIndex(nextIndex);
      setAnswers(suspendedSession.answers);
      setMemos(suspendedSession.memos);
      setShowAnswerMap(suspendedSession.showAnswerMap);
      setMarkedQuestions(suspendedSession.markedQuestions);
      startTimeRef.current = suspendedSession.startTime;
      setHistoryMode(suspendedSession.historyMode);

      setIsTestCompleted(false);
      setActiveHistory(null);
      setView('study');
    }

    // Clear suspended session after resuming (optional: or keep it until finished?)
    // Usually safe to clear, as current state in 'study' view is what matters now. 
    // And if they back out again, it will be re-saved.
    clearSessionFromStorage(activeQuizSet.id);
  };

  // Open manage view
  const handleManageQuizSet = (quizSet: QuizSetWithMeta) => {
    setActiveQuizSet(quizSet);
    setView('manage');
  };

  const handleDeleteQuizSet = async (quizSetId: number) => { // Renamed from handleSoftDeleteQuizSet
    try {
      await softDeleteQuizSet(quizSetId);
      // Also clear any suspended session
      clearSessionFromStorage(quizSetId);
      await loadQuizSets();
    } catch (error) {
      console.error('Failed to delete quiz set:', error);
      alert('削除に失敗しました。');
    }
  };

  const handleRestoreQuizSet = async (id: number) => {
    await restoreQuizSet(id);
    await loadQuizSets();
  };

  const handlePermanentDeleteQuizSet = async (id: number) => {
    await hardDeleteQuizSet(id);
    await loadQuizSets();
  };

  const handleArchiveQuizSet = async (id: number) => {
    await archiveQuizSet(id);
    await loadQuizSets();
  };

  const handleUnarchiveQuizSet = async (id: number) => {
    await unarchiveQuizSet(id);
    await loadQuizSets();
  };

  const handleUpdateQuizSet = async (quizSetId: number, changes: Partial<import('./types').QuizSet>) => {
    try {
      await updateQuizSet(quizSetId, changes);
      const sets = await loadQuizSets();
      const updatedSet = sets.find(s => s.id === quizSetId);
      if (updatedSet) {
        setActiveQuizSet(updatedSet);
      }
    } catch (error) {
      console.error('Failed to update quiz set:', error);
      alert('問題集の更新に失敗しました。');
    }
  };

  const handleBackToHome = async () => {
    // Check if we need to suspend the current session before going home
    if (view === 'study' && !isTestCompleted && !activeHistory && activeQuizSet?.id !== undefined && questions.length > 0) {
      saveSessionToStorage(activeQuizSet.id, {
        questions,
        currentQuestionIndex,
        answers,
        memos,
        showAnswerMap,
        markedQuestions,
        startTime: startTimeRef.current,
        historyMode,
        type: 'study',
      });
    } else if (view === 'memorization-view' && !isTestCompleted && !activeHistory && activeQuizSet?.id !== undefined && questions.length > 0) {
      saveSessionToStorage(activeQuizSet.id, {
        questions,
        currentQuestionIndex,
        answers: {},
        memos: {},
        showAnswerMap: {},
        markedQuestions: [],
        startTime: startTimeRef.current,
        historyMode: 'normal',
        type: 'memorization',
        memorizationLogs,
      });
    }

    setView('home');
    setQuestions([]);
    setActiveQuizSet(null);
    // suspendedSession state is no longer used, we used localStorage
    await loadQuizSets();
  };

  // --- Memorization Handlers ---
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

    try {
      await addHistory(history);
    } catch (e) {
      console.error('Failed to save history', e);
    }
  };

  const handleRetryMemorization = () => {
    setMemorizationLogs([]);
    setCurrentQuestionIndex(0);
    setIsTestCompleted(false);
    startTimeRef.current = new Date();
  };

  const handleBackToDetail = () => {
    // If we are navigating back from a study session that is NOT completed,
    // and it's not a history review (activeHistory is null),
    // save the session.
    if (view === 'study' && !isTestCompleted && !activeHistory && activeQuizSet?.id !== undefined && questions.length > 0) {
      saveSessionToStorage(activeQuizSet.id, {
        questions,
        currentQuestionIndex,
        answers,
        memos,
        showAnswerMap,
        markedQuestions,
        startTime: startTimeRef.current,
        historyMode,
        type: 'study',
      });
    } else if (view === 'memorization-view' && !isTestCompleted && !activeHistory && activeQuizSet?.id !== undefined && questions.length > 0) {
      saveSessionToStorage(activeQuizSet.id, {
        questions,
        currentQuestionIndex,
        answers: {},
        memos: {},
        showAnswerMap: {},
        markedQuestions: [],
        startTime: startTimeRef.current,
        historyMode: 'normal',
        type: 'memorization',
        memorizationLogs,
      });
    }

    setActiveHistory(null);
    setView('detail');
    setQuestions([]);
    // activeQuizSet remains set
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

  // 自信度の変更ハンドラ
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
    // Clear any suspended session since we finished
    if (activeQuizSet?.id !== undefined) {
      clearSessionFromStorage(activeQuizSet.id);
    }

    // Save history
    if (activeQuizSet?.id !== undefined) {
      // Calculate correct count based on user inputs
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

      // 各問題の正誤×自信度に基づいて復習スケジュールを自動生成
      for (const q of questions) {
        const qKey = String(q.id);
        const userAnswers = answers[qKey] || [];
        const isCorrect = userAnswers.length === q.correctAnswers.length &&
          userAnswers.every(a => q.correctAnswers.includes(a));
        const confidence: ConfidenceLevel = confidences[qKey] || 'high';
        const intervalDays = calculateNextInterval(isCorrect, confidence, 1);
        const nextDue = calculateNextDue(intervalDays);

        await upsertReviewSchedule({
          questionId: q.id!,
          quizSetId: activeQuizSet.id,
          intervalDays,
          nextDue,
          lastReviewedAt: new Date().toISOString(),
          consecutiveCorrect: isCorrect ? 1 : 0,
        });
      }
    }
  };

  const handleSelectHistory = async (history: import('./types').QuizHistory) => {
    if (!activeQuizSet) return;
    try {
      // Load questions for the quiz set
      // Load questions for the quiz set
      const qs = await getQuestionsForQuizSet(activeQuizSet.id!);

      if (history.memorizationDetail && history.memorizationDetail.length > 0) {
        setQuestions(qs);
        setActiveHistory(history);
        setMemorizationLogs(history.memorizationDetail);
        setIsTestCompleted(true);
        setView('memorization-view');
        return;
      }

      let studyQuestions: Question[] = [];
      if (history.questionIds && history.questionIds.length > 0) {
        // If saved questionIds exist, filter based on them
        studyQuestions = qs.filter(q => history.questionIds!.includes(q.id!));
        // Sort to match original order if possible (Dexie preserves array order usually)
        studyQuestions.sort((a, b) => history.questionIds!.indexOf(a.id!) - history.questionIds!.indexOf(b.id!));
      } else {
        // Legacy fallback: If totalCount implies a subset, try to reconstruct from answers
        const answeredIds = Object.keys(history.answers || {}).map(Number);
        const isSubset = history.totalCount < qs.length;
        if (isSubset && answeredIds.length > 0) {
          // Only show answered questions for legacy partial reviews
          studyQuestions = qs.filter(q => answeredIds.includes(q.id!));
        } else {
          // Default: Show all questions
          studyQuestions = qs;
        }
      }

      setQuestions(studyQuestions);

      setActiveHistory(history);

      // Restore state from history
      setAnswers(history.answers || {});
      setMemos(history.memos || {});
      setConfidences(history.confidences || {});
      setMarkedQuestions(history.markedQuestionIds || []);

      // Show all answers for review
      const allShown: Record<string, boolean> = {};
      studyQuestions.forEach(q => { allShown[String(q.id)] = true; });
      setShowAnswerMap(allShown);

      // Set time
      setEndTime(history.date);
      // Estimate start time (rendering purpose mostly)
      const restoredStartTime = new Date(history.date.getTime() - history.durationSeconds * 1000);
      startTimeRef.current = restoredStartTime;

      setIsTestCompleted(true);
      setView('study');

      setView('study');
    } catch (err) {
      console.error('Failed to load history:', err);
      alert('履歴の読み込みに失敗しました');
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
    // Apply shuffle settings if activeQuizSet is available
    if (activeQuizSet?.id !== undefined) {
      const settings = loadQuizSetSettings(activeQuizSet.id);
      qs = applyShuffleSettings(qs, settings);
    }
    setQuestions(qs);
    resetStudyState();
    setHistoryMode(mode);
    setIsTestCompleted(false);
    setView('study');
  };

  const handleRetestWrong = () => {
    const wrongQuestions = questions.filter(q => {
      const qKey = String(q.id);
      const userAnswers = answers[qKey] || [];
      const isCorrect = userAnswers.length === q.correctAnswers.length &&
        userAnswers.every(a => q.correctAnswers.includes(a));
      return !isCorrect;
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
      const isCorrect = userAnswers.length === q.correctAnswers.length &&
        userAnswers.every(a => q.correctAnswers.includes(a));
      const confidence = confidences[qKey];
      // Wrong OR (Correct but Low confidence)
      // If confidence is undefined (e.g. old history), treat as high (exclude from weak retest if correct)
      const isLowConfidence = confidence === 'low';
      return !isCorrect || (isCorrect && isLowConfidence);
    });

    if (targetQuestions.length === 0) {
      alert('復習対象の問題はありません。');
      return;
    }
    startReviewSession(targetQuestions, 'review_weak');
  };

  const renderContent = () => {
    switch (view) {
      case 'home':
        return (
          <HomePage
            quizSets={quizSets}
            onAddQuizSet={handleAddQuizSet}
            onSelectQuizSet={handleSelectQuizSet}
            onManageQuizSet={handleManageQuizSet}
            onDeleteQuizSet={handleDeleteQuizSet} // Renamed from onDeleteQuizSet
            onRestoreQuizSet={handleRestoreQuizSet}
            onPermanentDeleteQuizSet={handlePermanentDeleteQuizSet}
            onAddMemorizationSet={handleAddMemorizationSet}
            onAddEmptyQuizSet={handleAddEmptyQuizSet}
            onAddEmptyMemorizationSet={handleAddEmptyMemorizationSet}
            deletedQuizSets={deletedQuizSets}
            archivedQuizSets={archivedQuizSets} // Added
            onArchiveQuizSet={handleArchiveQuizSet} // Added
            onUnarchiveQuizSet={handleUnarchiveQuizSet} // Added
            onOpenApp={(appId) => {
              if (appId === 'distribution-sim') setView('distribution-sim');
            }}
          />
        );
      case 'distribution-sim':
        return (
          <DistributionSimulator onBack={() => setView('home')} />
        );
      case 'memorization-view':
        const memStatus = memorizationLogs.reduce((acc, log) => {
          acc[log.questionId] = log.isMemorized ? 'memorized' : 'not_memorized';
          return acc;
        }, {} as Record<number, 'memorized' | 'not_memorized' | 'unanswered'>);

        return activeQuizSet && (
          <>
            <header className="app-header">
              <div className="header-left">
                <button className="menu-btn" onClick={handleBackToDetail}>
                  <ArrowLeft size={20} />
                </button>
                <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                  <Menu />
                </button>
                <h1>{activeQuizSet.name} (暗記)</h1>
              </div>
            </header>

            <div className="main-layout">
              <AnimatePresence>
                {sidebarOpen && !isTestCompleted && (
                  <motion.div
                    className="sidebar-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSidebarOpen(false)}
                  />
                )}
              </AnimatePresence>
              {!isTestCompleted && (
                <aside className={`sidebar-container ${sidebarOpen ? 'open' : 'closed'}`}>
                  <Sidebar
                    questions={questions}
                    currentQuestionIndex={currentQuestionIndex}
                    onSelectQuestion={setCurrentQuestionIndex}
                    mode="memorization"
                    memorizationStatus={memStatus}
                    // dummy props
                    answers={{}}
                    showAnswerMap={{}}
                    markedQuestionIds={[]}
                    onToggleMark={() => { }}
                  />
                </aside>
              )}
              <main className="content-area">
                {isTestCompleted ? (
                  <MemorizationResultView
                    logs={memorizationLogs}
                    questions={questions}
                    onBack={() => {
                      setActiveHistory(null);
                      setView('detail');
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
                    />
                  )
                )}
              </main>
            </div>
          </>
        );
      case 'detail':
        return activeQuizSet && activeQuizSet.id !== undefined && (
          <main className="content-area" style={{ padding: '1.5rem' }}>
            <QuizDetail
              quizSet={activeQuizSet}
              onBack={handleBackToHome}
              onStart={handleStartStudy}
              onSelectHistory={handleSelectHistory}
              hasSuspendedSession={!!loadSessionFromStorage(activeQuizSet.id)}
              onResume={handleResumeStudy}
              settings={loadQuizSetSettings(activeQuizSet.id)}
              onSettingsChange={(s) => saveQuizSetSettings(activeQuizSet.id!, s)}
              onUpdateQuizSet={handleUpdateQuizSet}
            />
          </main>
        );
      case 'manage':
        return activeQuizSet && (
          <main className="content-area" style={{ padding: '1.5rem' }}>
            <QuestionManager quizSet={activeQuizSet} onBack={handleBackToHome} />
          </main>
        );
      case 'study':
      default: {
        const currentQuestion = questions[currentQuestionIndex];
        const qId = currentQuestion ? String(currentQuestion.id) : '';
        return (
          <>
            <header className="app-header">
              <div className="header-left">
                <button className="menu-btn" onClick={handleBackToDetail}>
                  <ArrowLeft size={20} />
                </button>
                <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                  <Menu />
                </button>
                <h1>{activeQuizSet?.name || 'Study'}</h1>
              </div>
            </header>

            <div className="main-layout">
              <AnimatePresence>
                {sidebarOpen && !isTestCompleted && (
                  <motion.div
                    className="sidebar-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSidebarOpen(false)}
                  />
                )}
              </AnimatePresence>
              {!isTestCompleted && (
                <aside className={`sidebar-container ${sidebarOpen ? 'open' : 'closed'}`}>
                  <Sidebar
                    questions={questions}
                    currentQuestionIndex={currentQuestionIndex}
                    onSelectQuestion={setCurrentQuestionIndex}
                    answers={answers}
                    showAnswerMap={showAnswerMap}
                    markedQuestionIds={markedQuestions}
                    onToggleMark={handleToggleMark}
                  />
                </aside>
              )}

              <main className="content-area">
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
                        {Object.values(showAnswerMap).filter(Boolean).length}/{questions.length}
                      </span>
                      <div className="progress-bar-track">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${(Object.values(showAnswerMap).filter(Boolean).length / questions.length) * 100}%` }}
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
              </main>
            </div>
          </>
        );
      }
    }
  };


  return (
    <div className={`app-container view-${view} ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button className="global-settings-btn" onClick={() => setIsSettingsOpen(true)} data-tooltip="ページ設定">
        <Settings size={20} />
      </button>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        accentColor={accentColor}
        onAccentColorChange={setAccentColor}
      />

      {renderContent()}
    </div>
  );
}

export default App;
