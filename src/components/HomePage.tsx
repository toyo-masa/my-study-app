import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Upload, BookOpen, FileText, Settings, Trash2, HelpCircle, Brain, RotateCcw, Filter, ChevronDown, Plus, Archive, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { AppLauncher } from './AppLauncher';
import type { HomeOnboardingState, QuizSet } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { HelpModal } from './HelpModal';
import '../App.css';

export interface QuizSetWithMeta extends QuizSet {
    questionCount: number;
    categories: string[];
}

interface HomePageProps {
    quizSets: QuizSetWithMeta[];
    onAddQuizSet: (file: File) => void;
    onAddEmptyQuizSet: () => Promise<boolean>;
    onAddMemorizationSet: (file: File) => void;
    onAddEmptyMemorizationSet: () => Promise<boolean>;
    onSelectQuizSet: (quizSet: QuizSetWithMeta) => void;
    onManageQuizSet: (quizSet: QuizSetWithMeta) => void;
    onDeleteQuizSet: (quizSetId: number) => void;
    onRestoreQuizSet: (quizSetId: number) => void; // New prop
    onPermanentDeleteQuizSet: (quizSetId: number) => void;
    onArchiveQuizSet: (quizSetId: number) => void;
    onUnarchiveQuizSet: (quizSetId: number) => void;
    onOpenApp?: (appId: string) => void;
    deletedQuizSets: QuizSetWithMeta[];
    archivedQuizSets: QuizSetWithMeta[];
    onRefresh: () => void;
    homeOnboardingState: HomeOnboardingState | null;
    onCompleteHomeOnboarding: () => Promise<boolean>;
    onAdvanceHomeOnboardingToManage: (quizSetId: number) => Promise<boolean>;
}

type HomeOnboardingStep = 'addQuizMenu' | 'addEmptyQuiz' | 'openManage';

type HomeOnboardingStepMeta = {
    progress: string;
    title: string;
    description: string;
};

const HOME_ONBOARDING_STEP_META: Record<HomeOnboardingStep, HomeOnboardingStepMeta> = {
    addQuizMenu: {
        progress: '1 / 6',
        title: 'まずは問題集を作成します',
        description: 'CSVで作成することもできますが、このチュートリアルでは「空の問題集に問題を登録する流れ」で進めます。まず「問題集を追加」をタップしてください。',
    },
    addEmptyQuiz: {
        progress: '2 / 6',
        title: '空の問題集を作成します',
        description: '今回はCSV取込ではなく、メニューの「空の問題集を追加」をタップしてください。',
    },
    openManage: {
        progress: '3 / 6',
        title: '問題を追加する画面へ進みます',
        description: '「問題管理」（最新作成の問題集）をタップしてください。',
    },
};

const toCreatedAtMs = (createdAt: unknown): number => {
    if (createdAt instanceof Date) {
        const ms = createdAt.getTime();
        return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
    }
    if (typeof createdAt === 'string' || typeof createdAt === 'number') {
        const ms = new Date(createdAt).getTime();
        return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
    }
    return Number.NEGATIVE_INFINITY;
};





export const HomePage: React.FC<HomePageProps> = ({
    quizSets,
    onAddQuizSet,
    onAddEmptyQuizSet,
    onAddMemorizationSet,
    onAddEmptyMemorizationSet,
    onSelectQuizSet,
    onManageQuizSet,
    onDeleteQuizSet,
    onRestoreQuizSet,
    onPermanentDeleteQuizSet,
    onArchiveQuizSet,
    onUnarchiveQuizSet,
    onOpenApp,
    deletedQuizSets,
    archivedQuizSets,
    onRefresh,
    homeOnboardingState,
    onCompleteHomeOnboarding,
    onAdvanceHomeOnboardingToManage
}) => {
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'active' | 'trash' | 'archive'>('active');
    const [quizMenuOpen, setQuizMenuOpen] = useState(false);
    const [memoMenuOpen, setMemoMenuOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
    const [permanentDeleteTargetId, setPermanentDeleteTargetId] = useState<number | null>(null);
    const helpRef = useRef<HTMLDivElement>(null);
    const quizMenuRef = useRef<HTMLDivElement>(null);
    const memoMenuRef = useRef<HTMLDivElement>(null);
    const addQuizMenuButtonRef = useRef<HTMLButtonElement>(null);
    const addEmptyQuizButtonRef = useRef<HTMLButtonElement>(null);
    const tutorialManageButtonRef = useRef<HTMLButtonElement>(null);
    const tutorialManageCardRef = useRef<HTMLDivElement>(null);

    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [tutorialStep, setTutorialStep] = useState<HomeOnboardingStep>('addQuizMenu');
    const [isTutorialDismissedThisSession, setIsTutorialDismissedThisSession] = useState(false);
    const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
    const [tutorialCardHighlightRect, setTutorialCardHighlightRect] = useState<DOMRect | null>(null);

    const allTags = useMemo(
        () => Array.from(new Set(quizSets.flatMap(qs => qs.tags || []))).sort(),
        [quizSets]
    );

    const filteredQuizSets = useMemo(() => {
        if (selectedTags.length === 0) return quizSets;
        return quizSets.filter(qs => {
            const qsTags = qs.tags || [];
            return selectedTags.every(t => qsTags.includes(t));
        });
    }, [quizSets, selectedTags]);

    const tutorialManageTargetQuizSetId = useMemo(() => {
        const candidates = quizSets.filter(
            (quizSet): quizSet is QuizSetWithMeta & { id: number } =>
                typeof quizSet.id === 'number' && quizSet.type !== 'memorization'
        );
        if (candidates.length === 0) {
            return null;
        }

        let latest = candidates[0];
        for (let index = 1; index < candidates.length; index += 1) {
            const current = candidates[index];
            const latestCreatedAt = toCreatedAtMs(latest.createdAt);
            const currentCreatedAt = toCreatedAtMs(current.createdAt);
            if (currentCreatedAt > latestCreatedAt) {
                latest = current;
                continue;
            }
            if (currentCreatedAt === latestCreatedAt && current.id > latest.id) {
                latest = current;
            }
        }

        return latest.id;
    }, [quizSets]);

    const tutorialManageTargetQuizSet = useMemo(
        () => quizSets.find((quizSet) => quizSet.id === tutorialManageTargetQuizSetId) ?? null,
        [quizSets, tutorialManageTargetQuizSetId]
    );

    const canShowHomeOnboarding =
        viewMode === 'active' &&
        homeOnboardingState !== null &&
        homeOnboardingState.flowStage === 'home' &&
        !homeOnboardingState.homeTutorialCompleted &&
        !isTutorialDismissedThisSession;
    const isTutorialActive = canShowHomeOnboarding;

    const completeHomeOnboardingFlow = useCallback(async (): Promise<boolean> => {
        const success = await onCompleteHomeOnboarding();
        if (success) {
            setIsTutorialDismissedThisSession(true);
        }
        return success;
    }, [onCompleteHomeOnboarding]);

    const skipHomeOnboarding = useCallback(async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setIsTutorialDismissedThisSession(true);
        try {
            await completeHomeOnboardingFlow();
        } catch (err) {
            console.error('Failed to skip tutorial', err);
        }
    }, [completeHomeOnboardingFlow]);

    const handleToggleTagFilter = useCallback((tag: string) => {
        setSelectedTags(prev => (
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        ));
    }, []);

    const getCurrentTutorialTarget = useCallback((): HTMLElement | null => {
        if (!isTutorialActive) return null;

        if (tutorialStep === 'addQuizMenu') {
            return addQuizMenuButtonRef.current;
        }
        if (tutorialStep === 'addEmptyQuiz') {
            return addEmptyQuizButtonRef.current;
        }
        if (tutorialStep === 'openManage') {
            return tutorialManageButtonRef.current;
        }
        return null;
    }, [isTutorialActive, tutorialStep]);

    const handleQuizMenuToggle = useCallback(() => {
        if (isTutorialActive && tutorialStep === 'addQuizMenu') {
            setQuizMenuOpen(true);
            setMemoMenuOpen(false);
            setTutorialStep('addEmptyQuiz');
            return;
        }

        setQuizMenuOpen(prev => !prev);
        setMemoMenuOpen(false);
    }, [isTutorialActive, tutorialStep]);

    const handleAddEmptyQuizSetClick = useCallback(async () => {
        const success = await onAddEmptyQuizSet();
        if (success) {
            setSelectedTags([]);
            setTutorialStep('openManage');
        }
        setQuizMenuOpen(false);
    }, [onAddEmptyQuizSet]);

    const handleManageQuizSetClick = useCallback(async (event: React.MouseEvent, qs: QuizSetWithMeta) => {
        event.stopPropagation();

        if (isTutorialActive && tutorialStep === 'openManage') {
            if (
                typeof qs.id !== 'number' ||
                tutorialManageTargetQuizSetId === null ||
                qs.id !== tutorialManageTargetQuizSetId
            ) {
                return;
            }
            const advanced = await onAdvanceHomeOnboardingToManage(qs.id);
            if (!advanced) {
                return;
            }
        }

        onManageQuizSet(qs);
    }, [isTutorialActive, onAdvanceHomeOnboardingToManage, onManageQuizSet, tutorialManageTargetQuizSetId, tutorialStep]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onAddQuizSet(file);
            event.target.value = '';
        }
    };

    const handleMemorizationFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onAddMemorizationSet(file);
            event.target.value = '';
        }
    };

    // 外部クリックで各種メニュー・モーダルを閉じる
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (isHelpOpen && helpRef.current && !helpRef.current.contains(target)) {
                setIsHelpOpen(false);
            }
            if (quizMenuOpen && quizMenuRef.current && !quizMenuRef.current.contains(target)) {
                if (isTutorialActive && tutorialStep === 'addEmptyQuiz') {
                    return;
                }
                setQuizMenuOpen(false);
            }
            if (memoMenuOpen && memoMenuRef.current && !memoMenuRef.current.contains(target)) {
                setMemoMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isHelpOpen, isTutorialActive, memoMenuOpen, quizMenuOpen, tutorialStep]);

    useEffect(() => {
        if (!isTutorialActive) return;

        // Ensure the step target is scrolled into view (especially if it's on a lower row)
        // Set a small timeout to allow layout changes (like new cards appearing) to settle
        const timerId = setTimeout(() => {
            let targetNode: Element | null = null;
            if (tutorialStep === 'addQuizMenu' && addQuizMenuButtonRef.current) {
                targetNode = addQuizMenuButtonRef.current;
            } else if (tutorialStep === 'addEmptyQuiz' && addEmptyQuizButtonRef.current) {
                targetNode = addEmptyQuizButtonRef.current;
            } else if (tutorialStep === 'openManage' && tutorialManageCardRef.current) {
                targetNode = tutorialManageCardRef.current;
            }

            if (targetNode) {
                targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);

        return () => clearTimeout(timerId);
    }, [isTutorialActive, tutorialStep, tutorialManageTargetQuizSetId]);

    useEffect(() => {
        if (!isTutorialActive) return;

        let rafId: number;
        let lastTargetRectStr = '';
        let lastCardRectStr = '';

        const updateHighlightRect = () => {
            const target = getCurrentTutorialTarget();
            if (!target) {
                if (lastTargetRectStr !== 'null') {
                    setHighlightRect(null);
                    setTutorialCardHighlightRect(null);
                    lastTargetRectStr = 'null';
                    lastCardRectStr = 'null';
                }
            } else {
                const tr = target.getBoundingClientRect();
                const trStr = `${Math.round(tr.top)},${Math.round(tr.left)},${Math.round(tr.width)},${Math.round(tr.height)}`;

                let crStr = 'null';
                let cr: DOMRect | null = null;

                if (tutorialStep === 'openManage' && tutorialManageCardRef.current) {
                    cr = tutorialManageCardRef.current.getBoundingClientRect();
                    crStr = `${Math.round(cr.top)},${Math.round(cr.left)},${Math.round(cr.width)},${Math.round(cr.height)}`;
                }

                if (trStr !== lastTargetRectStr || crStr !== lastCardRectStr) {
                    setHighlightRect(tr);
                    setTutorialCardHighlightRect(cr);
                    lastTargetRectStr = trStr;
                    lastCardRectStr = crStr;
                }
            }
            rafId = window.requestAnimationFrame(updateHighlightRect);
        };

        rafId = window.requestAnimationFrame(updateHighlightRect);

        return () => {
            window.cancelAnimationFrame(rafId);
        };
    }, [getCurrentTutorialTarget, isTutorialActive, tutorialStep]);

    const currentTutorialMeta = useMemo(() => {
        if (tutorialStep !== 'openManage' || !tutorialManageTargetQuizSet) {
            return HOME_ONBOARDING_STEP_META[tutorialStep];
        }
        return {
            ...HOME_ONBOARDING_STEP_META.openManage,
            description: `「問題管理」をタップしてください。`,
        };
    }, [tutorialManageTargetQuizSet, tutorialStep]);
    const highlightPadding = tutorialStep === 'openManage' ? 4 : 8;
    const tutorialRect = highlightRect
        ? {
            top: Math.max(0, highlightRect.top - highlightPadding),
            left: Math.max(0, highlightRect.left - highlightPadding),
            width: Math.max(0, highlightRect.width + highlightPadding * 2),
            height: Math.max(0, highlightRect.height + highlightPadding * 2),
        }
        : null;
    const tutorialCardRect = tutorialCardHighlightRect
        ? {
            top: Math.max(0, tutorialCardHighlightRect.top - 6),
            left: Math.max(0, tutorialCardHighlightRect.left - 6),
            width: Math.max(0, tutorialCardHighlightRect.width + 12),
            height: Math.max(0, tutorialCardHighlightRect.height + 12),
        }
        : null;
    const referenceRect = tutorialCardRect || tutorialRect;

    const tutorialViewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const tutorialViewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const tutorialPopoverWidth = Math.min(360, Math.max(260, tutorialViewportWidth - 24));
    const tutorialPopoverLeft = referenceRect
        ? Math.min(
            Math.max(12, referenceRect.left + referenceRect.width / 2 - tutorialPopoverWidth / 2),
            Math.max(12, tutorialViewportWidth - tutorialPopoverWidth - 12)
        )
        : Math.max(12, tutorialViewportWidth / 2 - tutorialPopoverWidth / 2);
    const tutorialAvailableAbove = referenceRect ? Math.max(0, referenceRect.top - 12) : Math.max(0, tutorialViewportHeight - 24);
    const tutorialAvailableBelow = referenceRect
        ? Math.max(0, tutorialViewportHeight - (referenceRect.top + referenceRect.height) - 12)
        : Math.max(0, tutorialViewportHeight - 24);
    const tutorialPreferredSpace = 210;
    const tutorialPlaceAbove = !!referenceRect && tutorialAvailableBelow < tutorialPreferredSpace && tutorialAvailableAbove >= tutorialAvailableBelow;
    const tutorialPopoverStyle: React.CSSProperties = referenceRect
        ? tutorialPlaceAbove
            ? {
                left: tutorialPopoverLeft,
                bottom: Math.max(12, tutorialViewportHeight - referenceRect.top + 12),
                width: tutorialPopoverWidth,
                maxHeight: Math.max(120, tutorialAvailableAbove),
                overflowY: 'auto',
            }
            : {
                top: referenceRect.top + referenceRect.height + 12,
                left: tutorialPopoverLeft,
                width: tutorialPopoverWidth,
                maxHeight: Math.max(120, tutorialAvailableBelow),
                overflowY: 'auto',
            }
        : {
            top: Math.max(12, tutorialViewportHeight / 2 - 70),
            left: tutorialPopoverLeft,
            width: tutorialPopoverWidth,
            maxHeight: Math.max(120, tutorialViewportHeight - 24),
            overflowY: 'auto',
        };

    return (
        <div className="home-page">
            <AppLauncher onOpenApp={onOpenApp} />
            <header className="home-header">
                <div className="home-brand">
                    <BookOpen size={32} />
                    <h1>Study App</h1>
                </div>
                <p className="home-subtitle">
                    {viewMode === 'trash' ? "ゴミ箱（削除済みの問題集）" :
                        viewMode === 'archive' ? "アーカイブ（非表示中の問題集）" : "問題集を選択して学習を始めましょう"}
                </p>
            </header>

            <div className="home-content">
                <div className="home-actions">
                    <div className="dropdown-container" ref={quizMenuRef} style={{ position: 'relative', zIndex: isTutorialActive && quizMenuOpen ? 2500 : undefined }}>
                        <button
                            ref={addQuizMenuButtonRef}
                            className={`nav-btn ${quizMenuOpen ? 'active' : ''}`}
                            onClick={handleQuizMenuToggle}
                        >
                            <BookOpen size={16} /> 問題集を追加 <ChevronDown size={14} style={{ marginLeft: 4 }} />
                        </button>
                        {quizMenuOpen && (
                            <div className="dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                <button ref={addEmptyQuizButtonRef} className="dropdown-item" onClick={() => { void handleAddEmptyQuizSetClick(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}>
                                    <Plus size={14} /> 空の問題集を追加
                                </button>
                                <label className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}>
                                    <Upload size={14} /> CSVで追加
                                    <input type="file" accept=".csv" onChange={(e) => { handleFileChange(e); setQuizMenuOpen(false); }} hidden />
                                </label>
                            </div>
                        )}
                    </div>

                    <div className="dropdown-container" ref={memoMenuRef} style={{ position: 'relative', zIndex: isTutorialActive && memoMenuOpen ? 2500 : undefined }}>
                        <button
                            className={`nav-btn ${memoMenuOpen ? 'active' : ''}`}
                            onClick={() => { setMemoMenuOpen(!memoMenuOpen); setQuizMenuOpen(false); }}
                        >
                            <Brain size={16} /> 暗記カードを追加 <ChevronDown size={14} style={{ marginLeft: 4 }} />
                        </button>
                        {memoMenuOpen && (
                            <div className="dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                <button className="dropdown-item" onClick={() => { void onAddEmptyMemorizationSet(); setMemoMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}>
                                    <Plus size={14} /> 空の暗記カードを追加
                                </button>
                                <label className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}>
                                    <Upload size={14} /> CSVで追加
                                    <input type="file" accept=".csv" onChange={(e) => { handleMemorizationFileChange(e); setMemoMenuOpen(false); }} hidden />
                                </label>
                            </div>
                        )}
                    </div>
                    <div className="help-popover-wrapper" ref={helpRef}>
                        <button
                            className="help-icon-btn"
                            onClick={() => setIsHelpOpen(!isHelpOpen)}
                            data-tooltip="CSVフォーマット仕様"
                        >
                            <HelpCircle size={20} />
                        </button>
                        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                        <button className="nav-btn" onClick={onRefresh} title="更新">
                            <RefreshCw size={16} /> 更新
                        </button>
                        <button
                            className={`nav-btn ${viewMode === 'archive' ? 'active' : ''}`}
                            onClick={() => setViewMode(viewMode === 'archive' ? 'active' : 'archive')}
                            style={{ background: viewMode === 'archive' ? 'var(--primary-color)' : 'var(--bg-secondary)', color: viewMode === 'archive' ? 'white' : 'var(--text-primary)' }}
                        >
                            <FileText size={16} /> アーカイブ
                        </button>
                        <button
                            className={`nav-btn ${viewMode === 'trash' ? 'active' : ''}`}
                            onClick={() => setViewMode(viewMode === 'trash' ? 'active' : 'trash')}
                            style={{ background: viewMode === 'trash' ? 'var(--primary-color)' : 'var(--bg-secondary)', color: viewMode === 'trash' ? 'white' : 'var(--text-primary)' }}
                        >
                            {viewMode === 'trash' ? <BookOpen size={16} /> : <Trash2 size={16} />}
                            {viewMode === 'trash' ? "一覧に戻る" : "ゴミ箱"}
                        </button>
                    </div>
                </div>

                {viewMode === 'active' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {quizSets.length > 0 && allTags.length > 0 && (
                            <div className="tag-filter-container" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                                    <Filter size={16} />
                                </div>
                                {allTags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => handleToggleTagFilter(tag)}
                                        className={`tag tag - filter - btn ${selectedTags.includes(tag) ? 'active' : ''} `}
                                        style={{
                                            cursor: 'pointer',
                                            background: selectedTags.includes(tag) ? 'var(--primary-color)' : 'var(--bg-secondary)',
                                            color: selectedTags.includes(tag) ? 'white' : 'var(--text-primary)',
                                            border: `1px solid ${selectedTags.includes(tag) ? 'var(--primary-color)' : 'var(--border-color)'} `
                                        }}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        )}
                        {filteredQuizSets.length > 0 ? (
                            <div className="quiz-sets-grid">
                                {filteredQuizSets.map((qs, index) => (
                                    <motion.div
                                        layout
                                        key={qs.id}
                                        ref={qs.id === tutorialManageTargetQuizSetId ? tutorialManageCardRef : undefined}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.08 }}
                                    >
                                        <div className="quiz-card">
                                            <div
                                                className="card-click-overlay"
                                                onClick={() => onSelectQuizSet(qs)}
                                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, cursor: 'pointer' }}
                                            />
                                            <div className="quiz-card-icon">
                                                {qs.type === 'memorization' ? <Brain size={24} /> : <FileText size={24} />}
                                            </div>
                                            <h3 className="quiz-card-title">{qs.name}</h3>
                                            <p className="quiz-card-count">{qs.questionCount} 問</p>
                                            <div className="quiz-card-tags">
                                                {(qs.tags || qs.categories).slice(0, 2).map(cat => (
                                                    <span key={cat} className="tag">{cat}</span>
                                                ))}
                                                {(qs.tags || qs.categories).length > 2 && <span className="tag">+{(qs.tags || qs.categories).length - 2}</span>}
                                            </div>
                                            <div className="quiz-card-actions" style={{ position: 'relative', zIndex: 2 }}>
                                                <button className="start-btn" onClick={(e) => { e.stopPropagation(); onSelectQuizSet(qs); }} data-tooltip="演習を開始">開始</button>
                                                <button
                                                    ref={qs.id === tutorialManageTargetQuizSetId ? tutorialManageButtonRef : undefined}
                                                    className="manage-btn"
                                                    onClick={(e) => { void handleManageQuizSetClick(e, qs); }}
                                                    title="問題管理"
                                                    data-tooltip="問題を編集・管理"
                                                >
                                                    <Settings size={16} />
                                                </button>
                                                <button className="archive-btn" onClick={(e) => { e.stopPropagation(); onArchiveQuizSet(qs.id!); }} title="アーカイブ" data-tooltip="アーカイブに移動">
                                                    <Archive size={16} />
                                                </button>
                                                <button className="delete-btn" onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteTargetId(qs.id!);
                                                }} title="削除" data-tooltip="ゴミ箱へ移動">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-hint">
                                <p>{quizSets.length > 0 ? "条件に一致する問題集がありません" : "まだ問題集がありません"}</p>
                                {quizSets.length === 0 && (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>上のボタンから問題集や暗記カードを追加しましょう</p>
                                )}
                            </div>
                        )}
                    </div>
                ) : viewMode === 'trash' ? (
                    /* ======== Trash View ======== */
                    <div className="trash-view">
                        {deletedQuizSets.length > 0 ? (
                            <div className="quiz-sets-grid">
                                {deletedQuizSets.map((qs, index) => (
                                    <motion.div
                                        layout
                                        key={qs.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.08 }}
                                    >
                                        <div className="quiz-card deleted-item" style={{ opacity: 0.8, borderColor: 'var(--border-color)' }}>
                                            <div className="quiz-card-icon" style={{ filter: 'grayscale(100%)' }}>
                                                {qs.type === 'memorization' ? <Brain size={24} /> : <FileText size={24} />}
                                            </div>
                                            <h3 className="quiz-card-title" style={{ color: 'var(--text-secondary)' }}>{qs.name}</h3>
                                            <p className="quiz-card-count">{qs.questionCount} 問</p>
                                            <div className="quiz-card-actions" style={{ position: 'relative', zIndex: 2, justifyContent: 'flex-end', width: '100%' }}>
                                                <button className="review-btn" onClick={(e) => { e.stopPropagation(); onRestoreQuizSet(qs.id!); }} data-tooltip="復元する" style={{ color: 'var(--primary-color)' }}>
                                                    <RotateCcw size={16} /> 元に戻す
                                                </button>
                                                <button className="delete-btn" onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPermanentDeleteTargetId(qs.id!);
                                                }} title="完全に削除" data-tooltip="完全に削除">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-hint">
                                <p>ゴミ箱は空です</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ======== Archive View ======== */
                    <div className="archive-view">
                        {archivedQuizSets.length > 0 ? (
                            <div className="quiz-sets-grid">
                                {archivedQuizSets.map((qs, index) => (
                                    <motion.div
                                        layout
                                        key={qs.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.08 }}
                                    >
                                        <div className="quiz-card archived-item" style={{ opacity: 0.8, borderColor: 'var(--border-color)' }}>
                                            <div className="quiz-card-icon" style={{ filter: 'grayscale(100%)' }}>
                                                {qs.type === 'memorization' ? <Brain size={24} /> : <FileText size={24} />}
                                            </div>
                                            <h3 className="quiz-card-title" style={{ color: 'var(--text-secondary)' }}>{qs.name}</h3>
                                            <p className="quiz-card-count">{qs.questionCount} 問</p>
                                            <div className="quiz-card-actions" style={{ position: 'relative', zIndex: 2, justifyContent: 'flex-end', width: '100%' }}>
                                                <button className="review-btn" onClick={(e) => { e.stopPropagation(); onUnarchiveQuizSet(qs.id!); }} data-tooltip="アーカイブを解除" style={{ color: 'var(--primary-color)' }}>
                                                    <RotateCcw size={16} /> 元に戻す
                                                </button>
                                                <button className="delete-btn" onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteTargetId(qs.id!);
                                                }} title="ゴミ箱へ移動" data-tooltip="ゴミ箱へ移動">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-hint">
                                <p>アーカイブは空です</p>
                            </div>
                        )}
                    </div>
                )}

                {isTutorialActive && (
                    <div className="home-onboarding-layer" aria-live="polite">
                        {tutorialRect ? (
                            <>
                                <div className="home-onboarding-mask" style={{ top: 0, left: 0, width: '100vw', height: tutorialRect.top }} />
                                <div className="home-onboarding-mask" style={{ top: tutorialRect.top, left: 0, width: tutorialRect.left, height: tutorialRect.height }} />
                                <div
                                    className="home-onboarding-mask"
                                    style={{
                                        top: tutorialRect.top,
                                        left: tutorialRect.left + tutorialRect.width,
                                        width: Math.max(0, tutorialViewportWidth - (tutorialRect.left + tutorialRect.width)),
                                        height: tutorialRect.height
                                    }}
                                />
                                <div
                                    className="home-onboarding-mask"
                                    style={{
                                        top: tutorialRect.top + tutorialRect.height,
                                        left: 0,
                                        width: '100vw',
                                        height: Math.max(0, tutorialViewportHeight - (tutorialRect.top + tutorialRect.height))
                                    }}
                                />
                                <div
                                    className="home-onboarding-highlight"
                                    style={{
                                        top: tutorialRect.top,
                                        left: tutorialRect.left,
                                        width: tutorialRect.width,
                                        height: tutorialRect.height,
                                    }}
                                />
                                {tutorialStep === 'openManage' && tutorialCardRect && (
                                    <div
                                        className="home-onboarding-card-highlight"
                                        style={{
                                            top: tutorialCardRect.top,
                                            left: tutorialCardRect.left,
                                            width: tutorialCardRect.width,
                                            height: tutorialCardRect.height,
                                        }}
                                    />
                                )}
                            </>
                        ) : (
                            <div className="home-onboarding-mask" style={{ inset: 0 }} />
                        )}

                        <div
                            className="home-onboarding-popover"
                            style={tutorialPopoverStyle}
                        >
                            <p className="home-onboarding-progress">チュートリアル {currentTutorialMeta.progress}</p>
                            <h3 className="home-onboarding-title">{currentTutorialMeta.title}</h3>
                            <p className="home-onboarding-description">{currentTutorialMeta.description}</p>
                            <div className="home-onboarding-actions">
                                <button className="nav-btn" onClick={(e) => { void skipHomeOnboarding(e); }}>
                                    スキップ
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <ConfirmationModal
                    isOpen={deleteTargetId !== null}
                    title="問題集の削除"
                    message={deleteTargetId ? `「${quizSets.find(q => q.id === deleteTargetId)?.name}」をゴミ箱に移動しますか？` : "この問題集を削除してもよろしいですか？"}
                    onConfirm={() => {
                        if (deleteTargetId !== null) {
                            onDeleteQuizSet(deleteTargetId);
                            setDeleteTargetId(null);
                        }
                    }}
                    onCancel={() => setDeleteTargetId(null)}
                />

                <ConfirmationModal
                    isOpen={permanentDeleteTargetId !== null}
                    title="問題集の完全削除"
                    message={permanentDeleteTargetId ? `「${deletedQuizSets.find(q => q.id === permanentDeleteTargetId)?.name}」を完全に削除しますか？\nこの操作は取り消せません。` : "完全に削除してもよろしいですか？"}
                    onConfirm={() => {
                        if (permanentDeleteTargetId !== null) {
                            onPermanentDeleteQuizSet(permanentDeleteTargetId);
                            setPermanentDeleteTargetId(null);
                        }
                    }}
                    onCancel={() => setPermanentDeleteTargetId(null)}
                />

            </div>

            {/* Version Footer */}
            <footer style={{ marginTop: 'auto', paddingTop: '4rem', paddingBottom: '2rem', textAlign: 'center', opacity: 0.6 }}>
                <button
                    onClick={() => window.location.href = '/release-notes'}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                    v{__APP_VERSION__} - リリースノート
                </button>
            </footer>
        </div>
    );
};
