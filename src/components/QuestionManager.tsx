import React, { useState, useEffect, useRef } from 'react';
import type { Question, QuizSet } from '../types';
import { getQuestionsForQuizSet, updateQuestion, addQuestion, deleteQuestion, updateQuizSet } from '../db';
import { parseQuestions, parseMemorizationQuestions, parseQuestionsFromText, parseMemorizationQuestionsFromText } from '../utils/csvParser';
import { ArrowLeft, Plus, Trash2, Save, X, Upload, ClipboardPaste } from 'lucide-react';
import { MarkdownText } from './MarkdownText';

interface QuestionManagerProps {
    quizSet: QuizSet & { questionCount: number; categories: string[] };
    onBack: () => void;
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

export const QuestionManager: React.FC<QuestionManagerProps> = ({ quizSet, onBack }) => {
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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadQuestions = async () => {
        if (quizSet.id !== undefined) {
            const qs = await getQuestionsForQuizSet(quizSet.id);
            setQuestions(qs);
        }
    };

    useEffect(() => {
        loadQuestions();
    }, [quizSet.id]);

    const handleEdit = (q: Question) => {
        setEditing({
            id: q.id,
            category: q.category,
            text: q.text,
            options: [...q.options],
            correctAnswers: [...q.correctAnswers],
            explanation: q.explanation,
        });
        setIsNew(false);
    };

    const handleNew = () => {
        setEditing({ ...emptyQuestion, options: ['', '', '', ''] });
        setIsNew(true);
    };

    const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const parsed = quizSet.type === 'memorization'
                ? await parseMemorizationQuestions(file)
                : await parseQuestions(file);

            for (const q of parsed) {
                await addQuestion({
                    quizSetId: quizSet.id!,
                    category: q.category,
                    text: q.text,
                    options: q.options,
                    correctAnswers: q.correctAnswers,
                    explanation: q.explanation,
                });
            }

            alert(`${parsed.length}問を追加しました`);
            await loadQuestions();
        } catch (err) {
            alert('CSVの解析エラー: ' + (err as Error).message);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleCSVTextImport = async () => {
        if (!csvText.trim()) {
            alert('CSVテキストを入力してください');
            return;
        }

        setIsAdding(true);
        try {
            const parsed = quizSet.type === 'memorization'
                ? await parseMemorizationQuestionsFromText(csvText)
                : await parseQuestionsFromText(csvText);

            for (const q of parsed) {
                await addQuestion({
                    quizSetId: quizSet.id!,
                    category: q.category,
                    text: q.text,
                    options: q.options,
                    correctAnswers: q.correctAnswers,
                    explanation: q.explanation,
                });
            }

            alert(`${parsed.length}問を追加しました`);
            setCsvText('');
            setIsPasteModalOpen(false);
            await loadQuestions();
        } catch (err) {
            alert('CSVテキストの解析エラー: ' + (err as Error).message);
        } finally {
            setIsAdding(false);
        }
    };

    const handleSave = async () => {
        if (!editing || isSaving) return;
        const cleanOptions = editing.options.filter(o => o.trim() !== '');

        if (quizSet.type === 'memorization') {
            if (cleanOptions.length < 1) {
                alert('暗記カードの裏面（解答）として、選択肢に最低1つはテキストを入力してください');
                return;
            }
        } else {
            if (cleanOptions.length < 2) {
                alert('選択肢は2つ以上必要です');
                return;
            }
        }
        if (editing.text.trim() === '') {
            alert('問題文を入力してください');
            return;
        }

        setIsSaving(true);
        try {
            if (isNew) {
                await addQuestion({
                    quizSetId: quizSet.id!,
                    category: editing.category,
                    text: editing.text,
                    options: cleanOptions,
                    correctAnswers: editing.correctAnswers,
                    explanation: editing.explanation,
                });
            } else if (editing.id !== undefined) {
                await updateQuestion(editing.id, {
                    category: editing.category,
                    text: editing.text,
                    options: cleanOptions,
                    correctAnswers: editing.correctAnswers,
                    explanation: editing.explanation,
                });
            }

            setEditing(null);
            await loadQuestions();
        } catch (err) {
            alert('保存エラー: ' + (err as Error).message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClick = (id: number) => {
        setDeleteConfirmId(id);
    };

    const confirmDelete = async () => {
        if (deleteConfirmId !== null) {
            await deleteQuestion(deleteConfirmId);
            setDeleteConfirmId(null);
            await loadQuestions();
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
        await updateQuizSet(quizSet.id!, { name: newName });
        quizSet.name = newName; // UI表示を即時更新するための簡易的な反映
        setIsEditingName(false);
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
                    <button className="nav-btn" onClick={() => setIsPasteModalOpen(true)}>
                        <ClipboardPaste size={16} /> テキストで追加
                    </button>
                    <label className="nav-btn">
                        <Upload size={16} /> CSVで追加
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleCSVImport}
                            hidden
                        />
                    </label>
                    <button className="nav-btn action-btn" onClick={handleNew}>
                        <Plus size={16} /> 問題を追加
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
                <div className="modal-overlay" onClick={() => !isAdding && setIsPasteModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>CSVテキストで追加</h3>
                            <button className="icon-btn" onClick={() => setIsPasteModalOpen(false)} disabled={isAdding}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <p className="modal-desc" style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                                エクセル等からコピーした内容（カンマ区切りテキスト）を貼り付けてインポートできます。
                            </p>
                            <textarea
                                className="field-textarea"
                                value={csvText}
                                onChange={e => setCsvText(e.target.value)}
                                rows={10}
                                placeholder="テキストをここにペーストしてください..."
                                style={{ fontFamily: 'monospace' }}
                                disabled={isAdding}
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="nav-btn" onClick={() => setIsPasteModalOpen(false)} disabled={isAdding}>キャンセル</button>
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
