import React, { useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { MarkdownText } from './MarkdownText';
import type { QuizSetType } from '../types';
import { isMemorizationDraft, type EditableQuestionDraft } from '../utils/questionEditor';

type MarkdownPreviewTab = 'edit' | 'preview';

type QuestionEditorModalProps = {
    draft: EditableQuestionDraft | null;
    isOpen: boolean;
    isNew?: boolean;
    isSaving?: boolean;
    isDirty?: boolean;
    quizSetType?: QuizSetType;
    onChange: (draft: EditableQuestionDraft) => void;
    onClose: () => void;
    onSave: () => void;
    contentRef?: React.Ref<HTMLDivElement>;
    saveButtonRef?: React.Ref<HTMLButtonElement>;
};

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
    draft,
    isOpen,
    isNew = false,
    isSaving = false,
    isDirty = false,
    quizSetType,
    onChange,
    onClose,
    onSave,
    contentRef,
    saveButtonRef,
}) => {
    const [questionTextTab, setQuestionTextTab] = useState<MarkdownPreviewTab>('edit');
    const [explanationTab, setExplanationTab] = useState<MarkdownPreviewTab>('edit');

    if (!isOpen || !draft) {
        return null;
    }

    const isMemorization = isMemorizationDraft(quizSetType, draft);

    const updateDraft = (nextDraft: EditableQuestionDraft) => {
        onChange(nextDraft);
    };

    const toggleCorrectAnswer = (optionIndex: number) => {
        const currentCorrectAnswers = draft.correctAnswers;
        const nextCorrectAnswers = currentCorrectAnswers.includes(optionIndex)
            ? currentCorrectAnswers.filter((answerIndex) => answerIndex !== optionIndex)
            : [...currentCorrectAnswers, optionIndex].sort((left, right) => left - right);

        updateDraft({
            ...draft,
            correctAnswers: nextCorrectAnswers,
        });
    };

    const updateOption = (optionIndex: number, value: string) => {
        const nextOptions = [...draft.options];
        nextOptions[optionIndex] = value;
        updateDraft({
            ...draft,
            options: nextOptions,
        });
    };

    const addOptionField = () => {
        updateDraft({
            ...draft,
            options: [...draft.options, ''],
        });
    };

    const removeOptionField = (optionIndex: number) => {
        const nextOptions = draft.options.filter((_, index) => index !== optionIndex);
        const nextCorrectAnswers = draft.correctAnswers
            .filter((answerIndex) => answerIndex !== optionIndex)
            .map((answerIndex) => (answerIndex > optionIndex ? answerIndex - 1 : answerIndex));

        updateDraft({
            ...draft,
            options: nextOptions,
            correctAnswers: nextCorrectAnswers,
        });
    };

    return (
        <div className="modal-overlay" onClick={() => !isSaving && onClose()}>
            <div ref={contentRef} className="modal-content" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>{isNew ? '問題を追加' : '問題を編集'}</h3>
                    <button type="button" className="icon-btn" onClick={onClose} disabled={isSaving}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <label className="field-label">カテゴリ</label>
                    <input
                        className="field-input"
                        value={draft.category}
                        onChange={(event) => updateDraft({ ...draft, category: event.target.value })}
                        placeholder="例: AWS"
                    />

                    {quizSetType === 'mixed' && (
                        <>
                            <label className="field-label">問題タイプ</label>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="questionType"
                                        value="quiz"
                                        checked={draft.questionType !== 'memorization'}
                                        onChange={() => updateDraft({ ...draft, questionType: 'quiz', correctAnswers: [] })}
                                    />
                                    選択式問題
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="questionType"
                                        value="memorization"
                                        checked={draft.questionType === 'memorization'}
                                        onChange={() => updateDraft({ ...draft, questionType: 'memorization', correctAnswers: [0] })}
                                    />
                                    暗記カード
                                </label>
                            </div>
                        </>
                    )}

                    <div className="markdown-editor-label-row">
                        <label className="field-label">問題文</label>
                        <div className="markdown-editor-tab-row">
                            <button
                                type="button"
                                className={`markdown-editor-tab ${questionTextTab === 'edit' ? 'active' : ''}`}
                                onClick={() => setQuestionTextTab('edit')}
                            >
                                入力
                            </button>
                            <button
                                type="button"
                                className={`markdown-editor-tab ${questionTextTab === 'preview' ? 'active' : ''}`}
                                onClick={() => setQuestionTextTab('preview')}
                            >
                                プレビュー
                            </button>
                        </div>
                    </div>
                    <div className="markdown-editor-panel">
                        {questionTextTab === 'edit' ? (
                            <textarea
                                className="field-textarea"
                                value={draft.text}
                                onChange={(event) => updateDraft({ ...draft, text: event.target.value })}
                                rows={4}
                                placeholder="問題文を入力..."
                            />
                        ) : (
                            <div className="markdown-preview-panel">
                                {draft.text.trim() ? (
                                    <MarkdownText content={draft.text} />
                                ) : (
                                    <p className="markdown-preview-empty">問題文を入力すると、ここでレンダリング結果を確認できます。</p>
                                )}
                            </div>
                        )}
                    </div>

                    {!isMemorization && (
                        <>
                            <label className="field-label">選択肢（✓で正解をマーク）</label>
                            {draft.options.map((option, optionIndex) => (
                                <div key={optionIndex} className="option-edit-row">
                                    <button
                                        type="button"
                                        className={`correct-toggle ${draft.correctAnswers.includes(optionIndex) ? 'active' : ''}`}
                                        onClick={() => toggleCorrectAnswer(optionIndex)}
                                        title="正解にする"
                                    >
                                        ✓
                                    </button>
                                    <input
                                        className="field-input option-input"
                                        value={option}
                                        onChange={(event) => updateOption(optionIndex, event.target.value)}
                                        placeholder={`選択肢 ${optionIndex + 1}`}
                                    />
                                    {draft.options.length > 2 && (
                                        <button type="button" className="icon-btn danger" onClick={() => removeOptionField(optionIndex)}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button type="button" className="add-option-btn" onClick={addOptionField}>
                                <Plus size={14} /> 選択肢を追加
                            </button>
                        </>
                    )}

                    <div className="markdown-editor-label-row">
                        <label className="field-label">
                            {isMemorization ? '解答・解説' : '解説'}
                        </label>
                        <div className="markdown-editor-tab-row">
                            <button
                                type="button"
                                className={`markdown-editor-tab ${explanationTab === 'edit' ? 'active' : ''}`}
                                onClick={() => setExplanationTab('edit')}
                            >
                                入力
                            </button>
                            <button
                                type="button"
                                className={`markdown-editor-tab ${explanationTab === 'preview' ? 'active' : ''}`}
                                onClick={() => setExplanationTab('preview')}
                            >
                                プレビュー
                            </button>
                        </div>
                    </div>
                    <div className="markdown-editor-panel">
                        {explanationTab === 'edit' ? (
                            <textarea
                                className="field-textarea"
                                value={draft.explanation}
                                onChange={(event) => updateDraft({ ...draft, explanation: event.target.value })}
                                rows={3}
                                placeholder={isMemorization ? '解答や解説を入力...' : '解説を入力...'}
                            />
                        ) : (
                            <div className="markdown-preview-panel">
                                {draft.explanation.trim() ? (
                                    <MarkdownText content={draft.explanation} />
                                ) : (
                                    <p className="markdown-preview-empty">解説を入力すると、ここでレンダリング結果を確認できます。</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button type="button" className="nav-btn" onClick={onClose} disabled={isSaving}>
                        キャンセル
                    </button>
                    <button
                        type="button"
                        className="nav-btn action-btn primary"
                        onClick={onSave}
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
    );
};
