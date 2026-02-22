import React, { useState, useEffect, useRef } from 'react';
import type { Question, QuizSet } from '../types';
import { getQuestionsForQuizSet, updateQuestion, addQuestion, addQuestionsBulk, deleteQuestion, updateQuizSet } from '../db';
import { parseQuestions, parseMemorizationQuestions, parseQuestionsFromText, parseMemorizationQuestionsFromText } from '../utils/csvParser';
import { ArrowLeft, Plus, Trash2, Save, X, Upload, ClipboardPaste, Loader2 } from 'lucide-react';
import { MarkdownText } from './MarkdownText';
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
}

const emptyQuestion: EditingQuestion = {
    category: '',
    text: '',
    options: ['', '', '', ''],
    correctAnswers: [],
    explanation: '',
};

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
    const [modalError, setModalError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isImporting, setIsImporting] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    const { setQuizSets } = useAppContext();

    useEffect(() => {
        if (statusMessage) {
            const timer = setTimeout(() => setStatusMessage(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
        setStatusMessage({ text, type });
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
        return () => { mounted = false; };
    }, [quizSet.id, quizSet.tags]);

    const loadQuestions = async () => {
        if (quizSet.id !== undefined) {
            const qs = await getQuestionsForQuizSet(quizSet.id);
            setQuestions(qs);
        }
    };

    const updateGlobalQuestionCount = (delta: number) => {
        setQuizSets((prev: any[]) => prev.map(qs =>
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
            correctAnswers: [...question.correctAnswers],
            explanation: question.explanation || '',
        });
        setIsNew(false);
    };

    const handleNew = () => {
        setEditing({ ...emptyQuestion });
        setIsNew(true);
    };

    const handleAddTag = async () => {
        const trimmed = newTagInput.trim();
        if (trimmed && !currentTags.includes(trimmed)) {
            const previousTags = [...currentTags];
            const finalTags = [...currentTags, trimmed];

            // Optimistic UI update
            setCurrentTags(finalTags);
            setNewTagInput('');

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

        if (quizSet.type === 'memorization') {
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
        try {
            if (isNew) {
                // Optimistic UI for new question
                updateGlobalQuestionCount(1);
                await addQuestion({
                    quizSetId: quizSet.id!,
                    category: editing.category,
                    text: editing.text,
                    options: cleanOptions,
                    correctAnswers: editing.correctAnswers,
                    explanation: editing.explanation,
                });
                showStatus('問題を追加しました', 'success');
            } else if (editing.id !== undefined) {
                await updateQuestion(editing.id, {
                    category: editing.category,
                    text: editing.text,
                    options: cleanOptions,
                    correctAnswers: editing.correctAnswers,
                    explanation: editing.explanation,
                });
                showStatus('問題を更新しました', 'success');
            }

            setEditing(null);
            await loadQuestions();
            if (onQuizSetUpdated) onQuizSetUpdated();
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
            quizSet.name = newName; // UI表示を即時更新するための簡易的な反映
            setIsEditingName(false);
            if (onQuizSetUpdated) onQuizSetUpdated();
        } catch (err) {
            onCloudError(err, '名前の保存に失敗しました');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
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
            JSON.stringify(original.options) !== JSON.stringify(cleanOptions) ||
            JSON.stringify(original.correctAnswers) !== JSON.stringify(editing.correctAnswers);
    }, [editing, isNew, questions]);

    return (
        <div className="manager-container">
            <div className="manager-header">
                <button className="nav-btn" onClick={onBack}>
                    <ArrowLeft size={16} /> 戻る
                </button>
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
                    <h2 onDoubleClick={() => setIsEditingName(true)} title="ダブルクリックで名前を変更" className="editable-title">
                        {quizSet.name} - 問題管理
                    </h2>
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
                    <button className="nav-btn action-btn" onClick={handleNew} disabled={isImporting}>
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

            <div className="tags-management-section" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={14} /> タグ管理
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {currentTags.map(tag => (
                        <span key={tag} className="tag edit-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.6rem' }}>
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
                    {currentTags.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>タグが設定されていません</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '400px' }}>
                    <input
                        type="text"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                        placeholder="新しいタグを入力..."
                        style={{
                            padding: '0.4rem 0.75rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem',
                            flex: 1
                        }}
                    />
                    <button onClick={handleAddTag} className="nav-btn primary" style={{ padding: '0.4rem 0.75rem', background: 'var(--primary-color)', color: 'white' }}>
                        追加
                    </button>
                </div>
            </div>

            {/* Edit Modal */}
            {editing && (
                <div className="modal-overlay" onClick={() => !isSaving && setEditing(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{isNew ? '問題を追加' : '問題を編集'}</h3>
                            <button className="icon-btn" onClick={() => setEditing(null)} disabled={isSaving}><X size={20} /></button>
                        </div>

                        <div className="modal-body">
                            <label className="field-label">カテゴリ</label>
                            <input
                                className="field-input"
                                value={editing.category}
                                onChange={e => setEditing({ ...editing, category: e.target.value })}
                                placeholder="例: AWS"
                            />

                            <label className="field-label">問題文</label>
                            <textarea
                                className="field-textarea"
                                value={editing.text}
                                onChange={e => setEditing({ ...editing, text: e.target.value })}
                                rows={4}
                                placeholder="問題文を入力..."
                            />

                            <label className="field-label">選択肢（✓で正解をマーク）</label>
                            {editing.options.map((opt, idx) => (
                                <div key={idx} className="option-edit-row">
                                    <button
                                        className={`correct-toggle ${editing.correctAnswers.includes(idx) ? 'active' : ''}`}
                                        onClick={() => toggleCorrectAnswer(idx)}
                                        title="正解にする"
                                    >
                                        ✓
                                    </button>
                                    <input
                                        className="field-input option-input"
                                        value={opt}
                                        onChange={e => updateOption(idx, e.target.value)}
                                        placeholder={`選択肢 ${idx + 1}`}
                                    />
                                    {editing.options.length > 2 && (
                                        <button className="icon-btn danger" onClick={() => removeOptionField(idx)}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button className="add-option-btn" onClick={addOptionField}>
                                <Plus size={14} /> 選択肢を追加
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
                            <button className="nav-btn" onClick={() => setEditing(null)} disabled={isSaving}>キャンセル</button>
                            <button
                                className="nav-btn action-btn"
                                onClick={handleSave}
                                disabled={isSaving || !isDirty}
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
                        {questions.map((q, idx) => (
                            <tr key={q.id} className="table-row" onClick={() => handleEdit(q)}>
                                <td>{idx + 1}</td>
                                <td><span className="tag">{q.category || 'General'}</span></td>
                                <td className="text-cell">
                                    <MarkdownText content={q.text} className="table-markdown" />
                                </td>
                                <td>{q.options.length}</td>
                                <td>{q.correctAnswers.map(i => i + 1).join(', ')}</td>
                                <td>
                                    <button
                                        className="icon-btn danger"
                                        onClick={e => { e.stopPropagation(); handleDeleteClick(q.id!); }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {questions.length === 0 && (
                            <tr><td colSpan={6} className="empty-table">問題がありません</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
