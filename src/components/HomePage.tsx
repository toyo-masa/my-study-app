import React, { useState, useRef, useEffect } from 'react';
import { Upload, BookOpen, FileText, Settings, Trash2, HelpCircle, CalendarClock, Brain, RotateCcw, Filter, ChevronDown, Plus, Archive } from 'lucide-react';
import { motion } from 'framer-motion';
import { AppLauncher } from './AppLauncher';
import type { QuizSet } from '../types';
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
    onAddEmptyQuizSet: () => void;
    onAddMemorizationSet: (file: File) => void;
    onAddEmptyMemorizationSet: () => void;
    onSelectQuizSet: (quizSet: QuizSetWithMeta) => void;
    onManageQuizSet: (quizSet: QuizSetWithMeta) => void;
    onDeleteQuizSet: (quizSetId: number) => void;
    onRestoreQuizSet: (quizSetId: number) => void; // New prop
    onPermanentDeleteQuizSet: (quizSetId: number) => void;
    onArchiveQuizSet: (quizSetId: number) => void;
    onUnarchiveQuizSet: (quizSetId: number) => void;
    onOpenReview: (quizSet: QuizSetWithMeta) => void;
    deletedQuizSets: QuizSetWithMeta[];
    archivedQuizSets: QuizSetWithMeta[];
}



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
    onOpenReview,
    deletedQuizSets,
    archivedQuizSets
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

    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const allTags = Array.from(new Set(quizSets.flatMap(qs => qs.tags || []))).sort();

    const filteredQuizSets = selectedTags.length > 0
        ? quizSets.filter(qs => {
            const qsTags = qs.tags || [];
            return selectedTags.every(t => qsTags.includes(t));
        })
        : quizSets;

    const handleToggleTagFilter = (tag: string) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

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
                setQuizMenuOpen(false);
            }
            if (memoMenuOpen && memoMenuRef.current && !memoMenuRef.current.contains(target)) {
                setMemoMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isHelpOpen, quizMenuOpen, memoMenuOpen]);

    return (
        <div className="home-page">
            <AppLauncher />
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
                    <div className="dropdown-container" ref={quizMenuRef} style={{ position: 'relative' }}>
                        <button
                            className={`nav-btn ${quizMenuOpen ? 'active' : ''}`}
                            onClick={() => { setQuizMenuOpen(!quizMenuOpen); setMemoMenuOpen(false); }}
                        >
                            <BookOpen size={16} /> 問題集を追加 <ChevronDown size={14} style={{ marginLeft: 4 }} />
                        </button>
                        {quizMenuOpen && (
                            <div className="dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                <button className="dropdown-item" onClick={() => { onAddEmptyQuizSet(); setQuizMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}>
                                    <Plus size={14} /> 空の問題集を追加
                                </button>
                                <label className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}>
                                    <Upload size={14} /> CSVで追加
                                    <input type="file" accept=".csv" onChange={(e) => { handleFileChange(e); setQuizMenuOpen(false); }} hidden />
                                </label>
                            </div>
                        )}
                    </div>

                    <div className="dropdown-container" ref={memoMenuRef} style={{ position: 'relative' }}>
                        <button
                            className={`nav-btn ${memoMenuOpen ? 'active' : ''}`}
                            onClick={() => { setMemoMenuOpen(!memoMenuOpen); setQuizMenuOpen(false); }}
                        >
                            <Brain size={16} /> 暗記カードを追加 <ChevronDown size={14} style={{ marginLeft: 4 }} />
                        </button>
                        {memoMenuOpen && (
                            <div className="dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                <button className="dropdown-item" onClick={() => { onAddEmptyMemorizationSet(); setMemoMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', color: 'var(--text-primary)' }}>
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
                                                <button className="review-btn" onClick={(e) => { e.stopPropagation(); onOpenReview(qs); }} data-tooltip="間隔反復で復習">
                                                    <CalendarClock size={16} />
                                                </button>
                                                <button className="manage-btn" onClick={(e) => { e.stopPropagation(); onManageQuizSet(qs); }} title="問題管理" data-tooltip="問題を編集・管理">
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
                                <p>{quizSets.length > 0 ? "条件に一致する問題集がありません" : "問題集を読み込んでいます..."}</p>
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
        </div>
    );
};
