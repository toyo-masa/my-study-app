import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import type { Question, QuizSet } from '../types';
import {
    getQuestionsForQuizSet,
    updateQuestion,
    addQuestion,
    addQuestionsBulk,
    deleteQuestion,
    updateQuizSet,
    completeHomeOnboarding
} from '../db';
import { parseQuestions, parseMemorizationQuestions, parseQuestionsFromText, parseMemorizationQuestionsFromText } from '../utils/csvParser';
import { Plus, Trash2, Save, X, Upload, ClipboardPaste, Loader2, Tag, Filter } from 'lucide-react';
import { MarkdownText } from './MarkdownText';
import { BackButton } from './BackButton';
import { useAppContext } from '../contexts/AppContext';

interface QuestionManagerProps {
    quizSet: QuizSet & { questionCount: number; categories: string[] };
    onBack: () => void;
    onCloudError: (err: unknown, fallbackMessage: string) => void;
    onQuizSetUpdated?: () => void;
}


interface EditingQuestion {
    id?: number;
    category: string;
    text: string;
    options: string[];
    correctAnswers: number[];
    explanation: string;
    questionType?: 'quiz' | 'memorization';
}

type ManageOnboardingStep = 'addQuestionButton' | 'fillAndSave' | 'tutorialComplete';

type ManageOnboardingStepMeta = {
    progress: string;
    title: string;
    description: string;
};

const MANAGE_ONBOARDING_STEP_META: Record<ManageOnboardingStep, ManageOnboardingStepMeta> = {
    addQuestionButton: {
        progress: '4 / 6',
        title: '次は問題を登録します',
        description: '今回は空の問題集に手入力で登録します。まず「問題を追加」をタップしてください。',
    },
    fillAndSave: {
        progress: '5 / 6',
        title: '問題を作成・保存してみましょう',
        description: '今回は例としてサンプル問題を自動入力しました。自由に編集できるので、内容を確認できたら右下の「保存」ボタンを押してください。',
    },
    tutorialComplete: {
        progress: '6 / 6',
        title: 'チュートリアル完了！',
        description: '問題が登録できました。左上の「戻る」ボタンを押してHomeに戻り、さっそく学習を始めてみましょう。',
    }
};

const emptyQuestion: EditingQuestion = {
    category: '',
    text: '',
    options: ['', '', '', ''],
    correctAnswers: [],
    explanation: '',
};

function buildManageOnboardingAutoQuestion(type?: QuizSet['type']): EditingQuestion {
    if (type === 'memorization') {
        return {
            category: 'チュートリアル',
            text: 'チュートリアル用の自動入力サンプルです。暗記カードとして登録されます。',
            options: ['サンプル解答'],
            correctAnswers: [0],
            explanation: 'この問題はチュートリアルの確認用に自動作成されました。',
        };
    }

    return {
        category: 'チュートリアル',
        text: 'チュートリアル用の自動入力サンプルです。正しい選択肢を選んでください。',
        options: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
        correctAnswers: [0],
        explanation: 'この問題はチュートリアルの確認用に自動作成されました。',
    };
}

export const QuestionManager: React.FC<QuestionManagerProps> = ({ quizSet, onBack, onCloudError, onQuizSetUpdated }) => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [editing, setEditing] = useState<EditingQuestion | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState(quizSet.name);
    const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
    const [csvText, setCsvText] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newTagInput, setNewTagInput] = useState('');
    const [currentTags, setCurrentTags] = useState<string[]>(quizSet.tags || []);
    const [isReviewExcluded, setIsReviewExcluded] = useState<boolean>(!!quizSet.isReviewExcluded);
    const [modalError, setModalError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const addQuestionButtonRef = useRef<HTMLButtonElement>(null);
    const manageModalContentRef = useRef<HTMLDivElement>(null);
    const saveButtonRef = useRef<HTMLButtonElement>(null);
    const backButtonRef = useRef<HTMLButtonElement>(null);

    const [isImporting, setIsImporting] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>(''); // Category filter state
    const { quizSets, setQuizSets, homeOnboardingState: onboardingState, setHomeOnboardingState: setOnboardingState } = useAppContext();
    const [manageOnboardingStep, setManageOnboardingStep] = useState<ManageOnboardingStep>('addQuestionButton');
    const [isManageOnboardingDismissedThisSession, setIsManageOnboardingDismissedThisSession] = useState(false);
    const [manageOnboardingHighlightRect, setManageOnboardingHighlightRect] = useState<DOMRect | null>(null);
    const [isTagSuggestOpen, setIsTagSuggestOpen] = useState(false);

    // 全問題集から既存のタグを抽出し、重複を除去してソート
    const allExistingTags = React.useMemo(() => {
        const tagSet = new Set<string>();
        quizSets.forEach(qs => {
            if (qs.tags) qs.tags.forEach(t => tagSet.add(t));
        });
        return Array.from(tagSet).sort();
    }, [quizSets]);

    useEffect(() => {
        if (statusMessage) {
            const timer = setTimeout(() => setStatusMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
        setStatusMessage({ text, type });
    };

    const isManageOnboardingActive =
        onboardingState !== null &&
        onboardingState.flowStage === 'manage' &&
        onboardingState.homeTutorialCompleted === false &&
        onboardingState.manageQuizSetId === quizSet.id &&
        !isManageOnboardingDismissedThisSession;

    const completeManageOnboardingFlow = async (): Promise<boolean> => {
        try {
            const state = await completeHomeOnboarding();
            setOnboardingState(state);
            setIsManageOnboardingDismissedThisSession(true);
            return true;
        } catch (err) {
            onCloudError(err, 'オンボーディング状態の保存に失敗しました。');
            return false;
        }
    };

    const skipManageOnboarding = async () => {
        await completeManageOnboardingFlow();
    };

    const handleBack = () => {
        if (isManageOnboardingActive && manageOnboardingStep === 'tutorialComplete') {
            void completeManageOnboardingFlow();
        }
        onBack();
    };

    useEffect(() => {
        let mounted = true;
        const fetchQs = async () => {
            if (quizSet.id !== undefined) {
                const qs = await getQuestionsForQuizSet(quizSet.id);
                if (mounted) setQuestions(qs);
            }
        };
        fetchQs();
        setCurrentTags(quizSet.tags || []);
        setIsReviewExcluded(!!quizSet.isReviewExcluded);
        return () => { mounted = false; };
    }, [quizSet.id, quizSet.tags, quizSet.isReviewExcluded]);

    const loadQuestions = async () => {
        if (quizSet.id !== undefined) {
            const qs = await getQuestionsForQuizSet(quizSet.id);
            setQuestions(qs);
        }
    };

    const updateGlobalQuestionCount = (delta: number) => {
        setQuizSets((prev) => prev.map(qs =>
            qs.id === quizSet.id
                ? { ...qs, questionCount: (qs.questionCount || 0) + delta }
                : qs
        ));
    };

    const handleEdit = (question: Question) => {
        setEditing({
            id: question.id,
            category: question.category || '',
            text: question.text,
            options: [...question.options],
            correctAnswers: [...question.correctAnswers] as number[],
            explanation: question.explanation || '',
            questionType: question.questionType || (quizSet.type === 'memorization' ? 'memorization' : 'quiz')
        });
        setIsNew(false);
    };

    const handleNew = () => {
        if (isManageOnboardingActive && manageOnboardingStep === 'addQuestionButton') {
            const autoQuestion = buildManageOnboardingAutoQuestion(quizSet.type);
            setEditing(autoQuestion);
            setIsNew(true);
            setManageOnboardingStep('fillAndSave');
            showStatus('チュートリアル用のサンプルを自動入力しました。内容を確認して保存してください。', 'success');
            return;
        }

        setEditing({
            ...emptyQuestion,
            questionType: quizSet.type === 'memorization' ? 'memorization' : 'quiz'
        });
        setIsNew(true);
    };

    const handleAddTag = async () => {
        const trimmed = newTagInput.trim();
        if (trimmed) {
            setNewTagInput('');
            if (!currentTags.includes(trimmed)) {
                const previousTags = [...currentTags];
                const finalTags = [...currentTags, trimmed];

                // Optimistic UI update
                setCurrentTags(finalTags);

                try {
                    if (quizSet.id !== undefined) {
                        await updateQuizSet(quizSet.id, { tags: finalTags });
                        showStatus(`タグ「${trimmed}」を追加しました`, 'success');
                        if (onQuizSetUpdated) onQuizSetUpdated();
                    }
                } catch (err) {
                    // Rollback
                    setCurrentTags(previousTags);
                    onCloudError(err, 'タグの追加に失敗しました');
                }
            }
        }
    };

    const handleRemoveTag = async (tagToRemove: string) => {
        const previousTags = [...currentTags];
        const finalTags = currentTags.filter(t => t !== tagToRemove);

        // Optimistic UI update
        setCurrentTags(finalTags);

        try {
            if (quizSet.id !== undefined) {
                await updateQuizSet(quizSet.id, { tags: finalTags });
                showStatus(`タグ「${tagToRemove}」を削除しました`, 'success');
                if (onQuizSetUpdated) onQuizSetUpdated();
            }
        } catch (err) {
            // Rollback
            setCurrentTags(previousTags);
            onCloudError(err, 'タグの削除に失敗しました');
        }
    };

    const handleToggleReviewExcluded = async () => {
        if (quizSet.id === undefined) return;

        const previousValue = isReviewExcluded;
        const nextValue = !previousValue;
        setIsReviewExcluded(nextValue);
        setQuizSets((prev) => prev.map(qs =>
            qs.id === quizSet.id
                ? { ...qs, isReviewExcluded: nextValue }
                : qs
        ));

        try {
            await updateQuizSet(quizSet.id, { isReviewExcluded: nextValue });
            showStatus(
                nextValue
                    ? 'このセットを復習対象から除外しました'
                    : 'このセットを復習対象に戻しました',
                'success'
            );
            if (onQuizSetUpdated) onQuizSetUpdated();
        } catch (err) {
            setIsReviewExcluded(previousValue);
            setQuizSets((prev) => prev.map(qs =>
                qs.id === quizSet.id
                    ? { ...qs, isReviewExcluded: previousValue }
                    : qs
            ));
            onCloudError(err, '復習設定の更新に失敗しました');
        }
    };

    const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const parsed = quizSet.type === 'memorization'
                ? await parseMemorizationQuestions(file)
                : await parseQuestions(file);

            if (parsed.length > 0) {
                // Optimistic UI: Update local list and global count immediately
                const nextId = (questions.length > 0 ? Math.max(...questions.filter(q => q.id).map(q => q.id!)) : 0) + 1;
                const tempQuestions = parsed.map((p, idx) => ({
                    ...p,
                    id: nextId + idx, // temporary ID
                    quizSetId: quizSet.id!
                }));

                setQuestions(prev => [...prev, ...tempQuestions]);
                updateGlobalQuestionCount(parsed.length);

                const bulkData = parsed.map(q => ({
                    quizSetId: quizSet.id!,
                    category: q.category,
                    text: q.text,
                    options: q.options,
                    correctAnswers: q.correctAnswers,
                    explanation: q.explanation,
                }));

                await addQuestionsBulk(bulkData);

                showStatus(`${parsed.length}問を追加しました`, 'success');
                // Final sync with real IDs from DB
                await loadQuestions();
                if (onQuizSetUpdated) onQuizSetUpdated();
            } else {
                showStatus('追加できる問題が見つかりませんでした。形式を確認してください。', 'error');
            }
        } catch (err) {
            onCloudError(err, 'CSVの解析・インポートエラー: ' + (err as Error).message);
            // Rollback optimistic update if possible, or just refresh
            await loadQuestions();
            if (onQuizSetUpdated) onQuizSetUpdated();
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleCSVTextImport = async () => {
        if (!csvText.trim()) {
            setModalError('CSVテキストを入力してください');
            return;
        }
        setModalError(null);

        setIsAdding(true);
        setIsImporting(true);
        try {
            const parsed = quizSet.type === 'memorization'
                ? await parseMemorizationQuestionsFromText(csvText)
                : await parseQuestionsFromText(csvText);

            if (parsed.length === 0) {
                setModalError('追加できる問題が見つかりませんでした。CSVの形式を確認してください。');
                return;
            }

            // Optimistic UI
            const nextId = (questions.length > 0 ? Math.max(...questions.filter(q => q.id).map(q => q.id!)) : 0) + 1;
            const tempQuestions = parsed.map((p, idx) => ({
                ...p,
                id: nextId + idx,
                quizSetId: quizSet.id!
            }));

            setQuestions(prev => [...prev, ...tempQuestions]);
            updateGlobalQuestionCount(parsed.length);
            setIsPasteModalOpen(false);
            setCsvText('');

            const bulkData = parsed.map(q => ({
                quizSetId: quizSet.id!,
                category: q.category,
                text: q.text,
                options: q.options,
                correctAnswers: q.correctAnswers,
                explanation: q.explanation,
            }));
            await addQuestionsBulk(bulkData);

            showStatus(`${parsed.length}問を追加しました`, 'success');
            await loadQuestions();
            if (onQuizSetUpdated) onQuizSetUpdated();
        } catch (err) {
            onCloudError(err, 'インポートエラー: ' + (err as Error).message);
            await loadQuestions();
            if (onQuizSetUpdated) onQuizSetUpdated();
        } finally {
            setIsAdding(false);
            setIsImporting(false);
        }
    };

    const handleSave = async () => {
        if (!editing || isSaving) return;

        if (!editing.text.trim()) {
            showStatus('問題文を入力してください', 'error');
            return;
        }

        const cleanOptions = editing.options.filter(o => o.trim() !== '');

        const isMemo = quizSet.type === 'memorization' || (quizSet.type === 'mixed' && editing.questionType === 'memorization');

        if (isMemo) {
            if (cleanOptions.length === 0) {
                showStatus('暗記カードの裏面（解答）として、選択肢に最低1つはテキストを入力してください', 'error');
                return;
            }
        } else {
            if (cleanOptions.length < 2) {
                showStatus('選択肢は2つ以上必要です', 'error');
                return;
            }
        }

        setIsSaving(true);
        let addedNewQuestion = false;
        try {
            if (isNew) {
                // Optimistic UI for new question
                updateGlobalQuestionCount(1);
                await addQuestion({
                    quizSetId: quizSet.id!,
                    category: editing.category,
                    text: editing.text,
                    options: cleanOptions,
                    correctAnswers: isMemo ? [0] : editing.correctAnswers,
                    explanation: editing.explanation,
                    questionType: editing.questionType,
                });
                addedNewQuestion = true;
                showStatus('問題を追加しました', 'success');
            } else if (editing.id !== undefined) {
                await updateQuestion(editing.id, {
                    category: editing.category,
                    text: editing.text,
                    options: cleanOptions,
                    correctAnswers: isMemo ? [0] : editing.correctAnswers,
                    explanation: editing.explanation,
                    questionType: editing.questionType,
                });
                showStatus('問題を更新しました', 'success');
            }

            setEditing(null);
            await loadQuestions();
            if (onQuizSetUpdated) onQuizSetUpdated();
            if (addedNewQuestion && isManageOnboardingActive && manageOnboardingStep === 'fillAndSave') {
                setManageOnboardingStep('tutorialComplete');
            }
        } catch (err) {
            onCloudError(err, '保存エラー: ' + (err as Error).message);
            await loadQuestions();
            if (onQuizSetUpdated) onQuizSetUpdated();
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClick = (id: number) => {
        setDeleteConfirmId(id);
    };

    const confirmDelete = async () => {
        if (deleteConfirmId !== null) {
            const targetId = deleteConfirmId;
            const index = questions.findIndex(q => q.id === targetId);
            const questionNum = index !== -1 ? index + 1 : '';

            try {
                // Optimistic UI for delete
                updateGlobalQuestionCount(-1);
                setQuestions(prev => prev.filter(q => q.id !== targetId));
                setDeleteConfirmId(null);

                showStatus(`問題 ${questionNum} を削除しました`, 'success');

                await deleteQuestion(targetId);
                await loadQuestions();
                if (onQuizSetUpdated) onQuizSetUpdated();
            } catch (err) {
                onCloudError(err, '削除エラー: ' + (err as Error).message);
                await loadQuestions();
                if (onQuizSetUpdated) onQuizSetUpdated();
            }
        }
    };

    const cancelDelete = () => {
        setDeleteConfirmId(null);
    };

    const handleCloseEditingModal = () => {
        setEditing(null);
        if (isManageOnboardingActive && manageOnboardingStep === 'fillAndSave') {
            setManageOnboardingStep('addQuestionButton');
        }
    };

    const toggleCorrectAnswer = (idx: number) => {
        if (!editing) return;
        const current = editing.correctAnswers;
        if (current.includes(idx)) {
            setEditing({ ...editing, correctAnswers: current.filter(i => i !== idx) });
        } else {
            setEditing({ ...editing, correctAnswers: [...current, idx].sort() });
        }
    };

    const updateOption = (idx: number, value: string) => {
        if (!editing) return;
        const newOptions = [...editing.options];
        newOptions[idx] = value;
        setEditing({ ...editing, options: newOptions });
    };

    const addOptionField = () => {
        if (!editing) return;
        setEditing({ ...editing, options: [...editing.options, ''] });
    };

    const removeOptionField = (idx: number) => {
        if (!editing) return;
        const newOptions = editing.options.filter((_, i) => i !== idx);
        const newCorrect = editing.correctAnswers
            .filter(i => i !== idx)
            .map(i => (i > idx ? i - 1 : i));
        setEditing({ ...editing, options: newOptions, correctAnswers: newCorrect });
    };

    const handleNameSave = async () => {
        if (newName.trim() === '' || newName === quizSet.name) {
            setIsEditingName(false);
            setNewName(quizSet.name);
            return;
        }
        try {
            await updateQuizSet(quizSet.id!, { name: newName });
            setIsEditingName(false);
            if (onQuizSetUpdated) onQuizSetUpdated();
        } catch (err) {
            onCloudError(err, '名前の保存に失敗しました');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') {
            handleNameSave();
        } else if (e.key === 'Escape') {
            setIsEditingName(false);
            setNewName(quizSet.name);
        }
    };

    // Calculate if the editing question has changes compared to the original
    const isDirty = React.useMemo(() => {
        if (!editing) return false;
        if (isNew) return true; // Always dirty if it's new

        const original = questions.find(q => q.id === editing.id);
        if (!original) return true;

        const cleanOptions = editing.options.filter(o => o.trim() !== '');
        return original.category !== editing.category ||
            original.text !== editing.text ||
            original.explanation !== editing.explanation ||
            original.questionType !== editing.questionType ||
            JSON.stringify(original.options) !== JSON.stringify(cleanOptions) ||
            JSON.stringify(original.correctAnswers) !== JSON.stringify(editing.correctAnswers);
    }, [editing, isNew, questions]);

    // Dynamic category extraction and filtering
    const categoriesWithCounts = React.useMemo(() => {
        const counts: Record<string, number> = {};
        questions.forEach(q => {
            const cat = q.category || 'General';
            counts[cat] = (counts[cat] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
    }, [questions]);

    const filteredQuestions = React.useMemo(() => {
        if (!selectedCategory) return questions;
        return questions.filter(q => (q.category || 'General') === selectedCategory);
    }, [questions, selectedCategory]);

    const getCurrentManageOnboardingTarget = useCallback((): HTMLElement | null => {
        if (!isManageOnboardingActive) return null;
        if (manageOnboardingStep === 'addQuestionButton') {
            return addQuestionButtonRef.current;
        }
        if (manageOnboardingStep === 'fillAndSave') {
            return manageModalContentRef.current;
        }
        if (manageOnboardingStep === 'tutorialComplete') {
            return backButtonRef.current; // Assuming backButtonRef is defined and points to the back button
        }
        return null;
    }, [isManageOnboardingActive, manageOnboardingStep]);

    useEffect(() => {
        if (!isManageOnboardingActive) return;

        const updateHighlightRect = () => {
            const target = getCurrentManageOnboardingTarget();
            if (!target) {
                setManageOnboardingHighlightRect(null);
                return;
            }
            setManageOnboardingHighlightRect(target.getBoundingClientRect());
        };

        const rafId = window.requestAnimationFrame(updateHighlightRect);
        window.addEventListener('resize', updateHighlightRect);
        window.addEventListener('scroll', updateHighlightRect, true);

        return () => {
            window.cancelAnimationFrame(rafId);
            window.removeEventListener('resize', updateHighlightRect);
            window.removeEventListener('scroll', updateHighlightRect, true);
        };
    }, [editing, getCurrentManageOnboardingTarget, isManageOnboardingActive, manageOnboardingStep, questions.length]);

    const currentManageOnboardingMeta = MANAGE_ONBOARDING_STEP_META[manageOnboardingStep];
    const manageHighlightPadding = 8;
    const manageTutorialRect = manageOnboardingHighlightRect
        ? {
            top: Math.max(0, manageOnboardingHighlightRect.top - manageHighlightPadding),
            left: Math.max(0, manageOnboardingHighlightRect.left - manageHighlightPadding),
            width: Math.max(0, manageOnboardingHighlightRect.width + manageHighlightPadding * 2),
            height: Math.max(0, manageOnboardingHighlightRect.height + manageHighlightPadding * 2),
        }
        : null;

    const manageViewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const manageViewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const managePopoverWidth = Math.min(380, Math.max(260, manageViewportWidth - 24));

    let managePopoverLeft = manageTutorialRect
        ? Math.min(
            Math.max(12, manageTutorialRect.left + manageTutorialRect.width / 2 - managePopoverWidth / 2),
            Math.max(12, manageViewportWidth - managePopoverWidth - 12)
        )
        : Math.max(12, manageViewportWidth / 2 - managePopoverWidth / 2);

    const manageAvailableAbove = manageTutorialRect ? Math.max(0, manageTutorialRect.top - 12) : Math.max(0, manageViewportHeight - 24);
    const manageAvailableBelow = manageTutorialRect
        ? Math.max(0, manageViewportHeight - (manageTutorialRect.top + manageTutorialRect.height) - 12)
        : Math.max(0, manageViewportHeight - 24);
    const managePreferredSpace = 220;
    const managePlaceAbove = !!manageTutorialRect && manageAvailableBelow < managePreferredSpace && manageAvailableAbove >= manageAvailableBelow;

    // Use an unconstrained maxHeight or a generous one, rather than Math.max(120, space) which can cut things off tightly
    const manageMaxHeight = 400;

    // Calculate vertical position carefully to not go off-screen
    let popoverTop: number | undefined;
    let popoverBottom: number | undefined;

    if (manageOnboardingStep === 'fillAndSave') {
        // Fix for 5/6: Prevent overlaying the input form

        // 1. If we have plenty of width (e.g. desktop), put it to the right
        if (manageTutorialRect && manageViewportWidth - (manageTutorialRect.left + manageTutorialRect.width) >= managePopoverWidth + 24) {
            managePopoverLeft = manageTutorialRect.left + manageTutorialRect.width + 12;
            popoverTop = Math.max(12, manageTutorialRect.top);
        }
        // 2. If we have plenty of width on the left, put it to the left
        else if (manageTutorialRect && manageTutorialRect.left >= managePopoverWidth + 24) {
            managePopoverLeft = manageTutorialRect.left - managePopoverWidth - 12;
            popoverTop = Math.max(12, manageTutorialRect.top);
        }
        // 3. Mobile/Narrow screen: Since the modal usually takes up the whole screen,
        // and the "Save" button is at the bottom right, we place the tooltip
        // as high up as possible (top center). Setting popoverTop = 16 guarantees it is at the 
        // very top of the viewport.
        else {
            popoverTop = 16;
            managePopoverLeft = Math.max(12, manageViewportWidth / 2 - managePopoverWidth / 2);
        }
    } else if (manageTutorialRect) {
        if (managePlaceAbove) {
            popoverBottom = manageViewportHeight - manageTutorialRect.top + 12;
            // if this pushes it off the top of the screen (i.e. bottom is too large), clamp it
            if (popoverBottom + 150 > manageViewportHeight) {
                popoverBottom = undefined;
                popoverTop = 12; // just stick it to the top of the screen
            }
        } else {
            popoverTop = manageTutorialRect.top + manageTutorialRect.height + 12;
            // if this pushes it off the bottom of the screen, clamp it
            if (popoverTop + 150 > manageViewportHeight) {
                popoverTop = undefined;
                popoverBottom = 12; // stick to bottom of the screen
            }
        }
    } else {
        popoverTop = Math.max(12, manageViewportHeight / 2 - 72);
    }

    const managePopoverStyle: React.CSSProperties = {
        top: popoverTop,
        bottom: popoverBottom,
        left: managePopoverLeft,
        width: managePopoverWidth,
        maxHeight: manageMaxHeight,
        overflowY: 'auto',
        pointerEvents: manageOnboardingStep === 'fillAndSave' ? 'none' : 'auto',
    };

    return (
        <div className="manager-container">
            <div className="manager-header">
                <BackButton className="nav-btn" onClick={handleBack} ref={backButtonRef} />
                {isEditingName ? (
                    <input
                        className="title-edit-input"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onBlur={handleNameSave}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                ) : (
                    <div style={{ flex: 1, textAlign: 'left' }}>
                        <h2 onDoubleClick={() => setIsEditingName(true)} title="ダブルクリックで名前を変更" className="editable-title" style={{ margin: 0 }}>
                            {quizSet.name} - 問題管理
                        </h2>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            作成: {quizSet.createdAt ? new Date(quizSet.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '未設定'}
                            {quizSet.updatedAt && ` (更新: ${new Date(quizSet.updatedAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })})`}
                        </div>
                    </div>
                )}
                <div className="manager-actions">
                    <button className="nav-btn" onClick={() => setIsPasteModalOpen(true)} disabled={isImporting}>
                        {isImporting ? <Loader2 className="animate-spin" size={16} /> : <ClipboardPaste size={16} />} テキストで追加
                    </button>
                    <label className={`nav-btn ${isImporting ? 'disabled' : ''}`}>
                        {isImporting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} CSVで追加
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleCSVImport}
                            hidden
                            disabled={isImporting}
                        />
                    </label>
                    <button ref={addQuestionButtonRef} className="nav-btn action-btn" onClick={handleNew} disabled={isImporting}>
                        <Plus size={16} /> 問題を追加
                    </button>
                </div>
            </div>

            {statusMessage && (
                <div className={`status-message-banner ${statusMessage.type}`} style={{
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    backgroundColor: statusMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: statusMessage.type === 'success' ? '#22c55e' : '#ef4444',
                    border: `1px solid ${statusMessage.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                }}>
                    {statusMessage.text}
                </div>
            )}

            <div className="tags-management-section" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                        <Tag size={14} /> タグ
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {currentTags.map(tag => (
                            <span key={tag} className="tag edit-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0.6rem', fontSize: '0.70rem' }}>
                                {tag}
                                <button
                                    onClick={() => handleRemoveTag(tag)}
                                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                    title="削除"
                                >
                                    <X size={14} />
                                </button>
                            </span>
                        ))}
                        {currentTags.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>未設定</span>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '400px', marginTop: '0.75rem' }}>
                    <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                        <input
                            type="text"
                            value={newTagInput}
                            onChange={(e) => {
                                setNewTagInput(e.target.value);
                                setIsTagSuggestOpen(true);
                            }}
                            onFocus={() => setIsTagSuggestOpen(true)}
                            onBlur={() => setTimeout(() => setIsTagSuggestOpen(false), 200)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleAddTag();
                                    setIsTagSuggestOpen(false);
                                } else if (e.key === 'Escape') {
                                    setIsTagSuggestOpen(false);
                                }
                            }}
                            placeholder="新しいタグを入力..."
                            style={{
                                padding: '0.4rem 0.75rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '0.9rem',
                                width: '100%'
                            }}
                        />
                        {isTagSuggestOpen && allExistingTags.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                marginTop: '4px',
                                background: 'var(--bg-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                zIndex: 50
                            }}>
                                {allExistingTags.filter(t => t.toLowerCase().includes(newTagInput.toLowerCase())).map((tag, index, arr) => (
                                    <div
                                        key={tag}
                                        onMouseDown={(e) => {
                                            e.preventDefault(); // prevent input blur
                                            setNewTagInput('');
                                            if (!currentTags.includes(tag)) {
                                                const finalTags = [...currentTags, tag];
                                                setCurrentTags(finalTags);
                                                if (quizSet.id !== undefined) {
                                                    updateQuizSet(quizSet.id, { tags: finalTags }).then(() => {
                                                        showStatus(`タグ「${tag}」を追加しました`, 'success');
                                                    }).catch(err => {
                                                        // Fallback on error handled implicitly or could add complete rollback
                                                        onCloudError(err, 'タグの追加に失敗しました');
                                                    });
                                                }
                                            }
                                            setIsTagSuggestOpen(false);
                                        }}
                                        style={{
                                            padding: '0.5rem 0.75rem',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            borderBottom: index < arr.length - 1 ? '1px solid var(--border-color)' : 'none',
                                            color: 'var(--text-primary)'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        {tag}
                                    </div>
                                ))}
                                {allExistingTags.filter(t => t.toLowerCase().includes(newTagInput.toLowerCase())).length === 0 && (
                                    <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        候補はありません
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <button onClick={handleAddTag} className="nav-btn primary" style={{ padding: '0.4rem 0.75rem', background: 'var(--primary-color)', color: 'white' }}>
                        追加
                    </button>
                </div>
            </div>

            <div className="review-setting-section" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>復習設定</h4>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                このセットを復習対象から除外すると、復習ボードに表示されなくなります。
                            </p>
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    width: 'fit-content',
                                    marginLeft: '0.2rem',
                                    padding: '0.18rem 0.5rem',
                                    borderRadius: '999px',
                                    border: isReviewExcluded ? '1px solid var(--border-color)' : '1px solid var(--primary-color)',
                                    background: isReviewExcluded ? 'var(--bg-primary)' : 'rgba(var(--primary-color-rgb, 99, 102, 241), 0.08)',
                                    color: isReviewExcluded ? 'var(--text-color)' : 'var(--primary-color)',
                                    fontSize: '0.74rem',
                                    fontWeight: 600
                                }}
                            >
                                {isReviewExcluded ? '復習対象外（復習ボード非表示）' : '復習対象設定（復習ボード表示中）'}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className={`nav-btn ${isReviewExcluded ? '' : 'action-btn'}`}
                        onClick={handleToggleReviewExcluded}
                        style={{
                            background: isReviewExcluded ? 'var(--bg-secondary)' : 'var(--primary-color)',
                            color: isReviewExcluded ? 'var(--text-color)' : 'white',
                            border: isReviewExcluded ? '1px solid var(--border-color)' : 'none'
                        }}
                    >
                        {isReviewExcluded ? '復習対象に戻す' : '復習対象から除外する'}
                    </button>
                </div>
            </div>

            {/* Category Filter Section */}
            <div className="category-filter-section" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.25rem 1rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                    <Filter size={14} /> フィルタ
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <button
                        className={`filter-chip ${selectedCategory === '' ? 'active' : ''}`}
                        onClick={() => setSelectedCategory('')}
                        style={{
                            padding: '0.2rem 0.7rem',
                            borderRadius: '20px',
                            border: '1px solid var(--border-color)',
                            background: selectedCategory === '' ? 'var(--primary-color)' : 'var(--bg-secondary)',
                            color: selectedCategory === '' ? 'white' : 'var(--text-primary)',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        すべて <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>({questions.length})</span>
                    </button>
                    {categoriesWithCounts.map(([cat, count]) => (
                        <button
                            key={cat}
                            className={`filter-chip ${selectedCategory === cat ? 'active' : ''}`}
                            onClick={() => setSelectedCategory(cat)}
                            style={{
                                padding: '0.2rem 0.7rem',
                                borderRadius: '20px',
                                border: '1px solid var(--border-color)',
                                background: selectedCategory === cat ? 'var(--primary-color)' : 'var(--bg-secondary)',
                                color: selectedCategory === cat ? 'white' : 'var(--text-primary)',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                transition: 'all 0.2s'
                            }}
                        >
                            {cat} <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>({count})</span>
                        </button>
                    ))}
                </div>
            </div>

            {isManageOnboardingActive && ReactDOM.createPortal(
                <div className="home-onboarding-layer" aria-live="polite" style={{ zIndex: 99999 }}>
                    {manageTutorialRect ? (
                        <>
                            <div className="home-onboarding-mask" style={{ top: 0, left: 0, width: '100vw', height: manageTutorialRect.top }} />
                            <div className="home-onboarding-mask" style={{ top: manageTutorialRect.top, left: 0, width: manageTutorialRect.left, height: manageTutorialRect.height }} />
                            <div
                                className="home-onboarding-mask"
                                style={{
                                    top: manageTutorialRect.top,
                                    left: manageTutorialRect.left + manageTutorialRect.width,
                                    width: Math.max(0, manageViewportWidth - (manageTutorialRect.left + manageTutorialRect.width)),
                                    height: manageTutorialRect.height
                                }}
                            />
                            <div
                                className="home-onboarding-mask"
                                style={{
                                    top: manageTutorialRect.top + manageTutorialRect.height,
                                    left: 0,
                                    width: '100vw',
                                    height: Math.max(0, manageViewportHeight - (manageTutorialRect.top + manageTutorialRect.height))
                                }}
                            />
                            <div
                                className="home-onboarding-highlight"
                                style={{
                                    top: manageTutorialRect.top,
                                    left: manageTutorialRect.left,
                                    width: manageTutorialRect.width,
                                    height: manageTutorialRect.height,
                                }}
                            />
                        </>
                    ) : (
                        <div className="home-onboarding-mask" style={{ inset: 0 }} />
                    )}

                    <div
                        className="home-onboarding-popover"
                        style={{
                            ...managePopoverStyle,
                            ...(manageOnboardingStep === 'fillAndSave' && manageViewportWidth < 600 ? {
                                padding: '0.6rem 0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                                width: 'auto',
                                left: '12px',
                                right: '12px',
                                maxWidth: 'none',
                            } : {})
                        }}
                    >
                        {manageOnboardingStep === 'fillAndSave' && manageViewportWidth < 600 ? (
                            <>
                                <div style={{ textAlign: 'left', flex: 1 }}>
                                    <p className="home-onboarding-progress" style={{ marginBottom: '0.1rem', fontSize: '0.65rem' }}>チュートリアル {currentManageOnboardingMeta.progress}</p>
                                    <h3 className="home-onboarding-title" style={{ fontSize: '0.85rem' }}>{currentManageOnboardingMeta.title}</h3>
                                    <p className="home-onboarding-description" style={{ display: 'none' }}>{currentManageOnboardingMeta.description}</p>
                                </div>
                                <div className="home-onboarding-actions" style={{ marginTop: 0, flexShrink: 0 }}>
                                    <button
                                        className="nav-btn"
                                        onClick={(e) => { e.stopPropagation(); void skipManageOnboarding(); }}
                                        style={{ pointerEvents: 'auto', padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}
                                    >
                                        スキップ
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="home-onboarding-progress">チュートリアル {currentManageOnboardingMeta.progress}</p>
                                <h3 className="home-onboarding-title">{currentManageOnboardingMeta.title}</h3>
                                <p className="home-onboarding-description">{currentManageOnboardingMeta.description}</p>
                                <div className="home-onboarding-actions">
                                    {manageOnboardingStep !== 'tutorialComplete' && (
                                        <button
                                            className="nav-btn"
                                            onClick={(e) => { e.stopPropagation(); void skipManageOnboarding(); }}
                                            style={{ pointerEvents: 'auto' }}
                                        >
                                            スキップ
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Edit Modal */}
            {editing && (
                <div className="modal-overlay" onClick={() => !isSaving && handleCloseEditingModal()}>
                    <div ref={manageModalContentRef} className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{isNew ? '問題を追加' : '問題を編集'}</h3>
                            <button className="icon-btn" onClick={handleCloseEditingModal} disabled={isSaving}><X size={20} /></button>
                        </div>

                        <div className="modal-body">
                            <label className="field-label">カテゴリ</label>
                            <input
                                className="field-input"
                                value={editing.category}
                                onChange={e => setEditing({ ...editing, category: e.target.value })}
                                placeholder="例: AWS"
                            />

                            {quizSet.type === 'mixed' && (
                                <>
                                    <label className="field-label">問題タイプ</label>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="questionType"
                                                value="quiz"
                                                checked={editing.questionType !== 'memorization'}
                                                onChange={() => setEditing({ ...editing, questionType: 'quiz', correctAnswers: [] })}
                                            />
                                            選択式問題
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="questionType"
                                                value="memorization"
                                                checked={editing.questionType === 'memorization'}
                                                onChange={() => setEditing({ ...editing, questionType: 'memorization', correctAnswers: [0] })}
                                            />
                                            暗記カード
                                        </label>
                                    </div>
                                </>
                            )}

                            <label className="field-label">
                                {quizSet.type === 'memorization' || (quizSet.type === 'mixed' && editing.questionType === 'memorization') ? '裏面（表側の問題文に対する解答）' : '問題文'}
                            </label>
                            <textarea
                                className="field-textarea"
                                value={editing.text}
                                onChange={e => setEditing({ ...editing, text: e.target.value })}
                                rows={4}
                                placeholder={quizSet.type === 'memorization' || (quizSet.type === 'mixed' && editing.questionType === 'memorization') ? '暗記カードの表側に表示するテキストを入力...' : '問題文を入力...'}
                            />

                            <label className="field-label">
                                {quizSet.type === 'memorization' || (quizSet.type === 'mixed' && editing.questionType === 'memorization') ? '裏面（解答）' : '選択肢（✓で正解をマーク）'}
                            </label>
                            {editing.options.map((opt, idx) => (
                                <div key={idx} className="option-edit-row">
                                    {(quizSet.type !== 'memorization' && !(quizSet.type === 'mixed' && editing.questionType === 'memorization')) && (
                                        <button
                                            className={`correct-toggle ${editing.correctAnswers.includes(idx) ? 'active' : ''}`}
                                            onClick={() => toggleCorrectAnswer(idx)}
                                            title="正解にする"
                                        >
                                            ✓
                                        </button>
                                    )}
                                    <input
                                        className="field-input option-input"
                                        value={opt}
                                        onChange={e => updateOption(idx, e.target.value)}
                                        placeholder={(quizSet.type === 'memorization' || (quizSet.type === 'mixed' && editing.questionType === 'memorization')) ? `解答 ${idx + 1}` : `選択肢 ${idx + 1}`}
                                    />
                                    {editing.options.length > ((quizSet.type === 'memorization' || (quizSet.type === 'mixed' && editing.questionType === 'memorization')) ? 1 : 2) && (
                                        <button className="icon-btn danger" onClick={() => removeOptionField(idx)}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button className="add-option-btn" onClick={addOptionField}>
                                <Plus size={14} /> {(quizSet.type === 'memorization' || (quizSet.type === 'mixed' && editing.questionType === 'memorization')) ? '解答を追加' : '選択肢を追加'}
                            </button>

                            <label className="field-label">解説</label>
                            <textarea
                                className="field-textarea"
                                value={editing.explanation}
                                onChange={e => setEditing({ ...editing, explanation: e.target.value })}
                                rows={3}
                                placeholder="解説を入力..."
                            />
                        </div>

                        <div className="modal-footer">
                            <button className="nav-btn" onClick={handleCloseEditingModal} disabled={isSaving}>キャンセル</button>
                            <button
                                className="nav-btn action-btn primary"
                                onClick={handleSave}
                                disabled={isSaving || !isDirty}
                                ref={saveButtonRef}
                            >
                                {isSaving ? (
                                    <>保存中...</>
                                ) : (
                                    <><Save size={16} /> 保存</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Paste CSV Modal */}
            {isPasteModalOpen && (
                <div className="modal-overlay" onClick={() => !isAdding && (setIsPasteModalOpen(false), setModalError(null))}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>CSVテキストで追加</h3>
                            <button className="icon-btn" onClick={() => { setIsPasteModalOpen(false); setModalError(null); }} disabled={isAdding}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            {modalError && (
                                <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                    {modalError}
                                </div>
                            )}
                            <p className="modal-desc" style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                                エクセルやCSVファイルからコピーした内容を貼り付けて一括追加できます。
                                <br />
                                <strong>※ 1行目には必ず以下のヘッダー（列名）が必要です。</strong>
                                <br />
                                通常モード: <code>category,text,options,correct_answers,explanation</code>
                                <br />
                                暗記モード: <code>category,question,answer,explanation</code>
                            </p>
                            <textarea
                                className="field-textarea"
                                value={csvText}
                                onChange={e => { setCsvText(e.target.value); if (modalError) setModalError(null); }}
                                rows={10}
                                placeholder="テキストをここにペーストしてください..."
                                style={{ fontFamily: 'monospace' }}
                                disabled={isAdding}
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="nav-btn" onClick={() => { setIsPasteModalOpen(false); setModalError(null); }} disabled={isAdding}>キャンセル</button>
                            <button className="nav-btn action-btn" onClick={handleCSVTextImport} disabled={isAdding}>
                                {isAdding ? (
                                    <>追加中...</>
                                ) : (
                                    <><Save size={16} /> 追加する</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteConfirmId !== null && (
                <div className="modal-overlay" onClick={cancelDelete}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>問題の削除</h3>
                            <button className="icon-btn" onClick={cancelDelete}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <p>
                                問題 {questions.findIndex(q => q.id === deleteConfirmId) + 1} を削除しますか？<br />
                                この操作は取り消せません。
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="nav-btn" onClick={cancelDelete}>キャンセル</button>
                            <button className="nav-btn action-btn danger" style={{ backgroundColor: '#ef4444', color: 'white' }} onClick={confirmDelete}>
                                削除する
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="table-wrapper">
                <table className="question-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>カテゴリ</th>
                            <th>問題文</th>
                            <th>選択肢数</th>
                            <th>正解</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredQuestions.map((q) => {
                            // Find original index for the # column
                            const originalIdx = questions.findIndex(orig => orig.id === q.id);
                            return (
                                <tr key={q.id} className="table-row" onClick={() => handleEdit(q)}>
                                    <td>{originalIdx + 1}</td>
                                    <td>
                                        <span className="tag" style={{
                                            background: (q.questionType === 'memorization' || quizSet.type === 'memorization') ? 'rgba(236, 72, 153, 0.1)' : 'rgba(56, 189, 248, 0.1)',
                                            color: (q.questionType === 'memorization' || quizSet.type === 'memorization') ? '#ec4899' : '#38bdf8',
                                            border: `1px solid ${(q.questionType === 'memorization' || quizSet.type === 'memorization') ? 'rgba(236, 72, 153, 0.2)' : 'rgba(56, 189, 248, 0.2)'}`,
                                            marginRight: '0.4rem'
                                        }}>
                                            {(q.questionType === 'memorization' || quizSet.type === 'memorization') ? '暗記' : '選択'}
                                        </span>
                                        <span className="tag">{q.category || 'General'}</span>
                                    </td>
                                    <td className="text-cell">
                                        <MarkdownText content={q.text} className="table-markdown" />
                                    </td>
                                    <td>{(q.questionType === 'memorization' || quizSet.type === 'memorization') ? '-' : q.options.length}</td>
                                    <td>{(q.questionType === 'memorization' || quizSet.type === 'memorization') ? q.options[0] : q.correctAnswers.filter((i): i is number => typeof i === 'number').map(i => i + 1).join(', ')}</td>
                                    <td>
                                        <button
                                            className="icon-btn danger"
                                            onClick={e => { e.stopPropagation(); handleDeleteClick(q.id!); }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredQuestions.length === 0 && (
                            <tr><td colSpan={6} className="empty-table">{selectedCategory ? '選択したカテゴリの問題はありません' : '問題がありません'}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
