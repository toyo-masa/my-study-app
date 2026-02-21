import React, { useEffect, useCallback } from 'react';
import type { Question, ConfidenceLevel } from '../types';
import { motion } from 'framer-motion';
import { Bookmark } from 'lucide-react';
import { MarkdownText } from './MarkdownText';

interface QuestionViewProps {
    question: Question;
    questionIndex: number;
    totalQuestions: number;
    selectedOptions: number[];
    onToggleOption: (optionIndex: number) => void;
    showAnswer: boolean;
    onShowAnswer: () => void;
    onNext: () => void;
    onPrev: () => void;
    onCompleteTest: () => void;
    isLast: boolean;
    isFirst: boolean;
    isMarked: boolean;
    onToggleMark: () => void;
    memo: string;
    onMemoChange: (value: string) => void;
    confidence: ConfidenceLevel | null;
    onConfidenceChange: (level: ConfidenceLevel) => void;
}

export const QuestionView: React.FC<QuestionViewProps> = ({
    question,
    selectedOptions,
    onToggleOption,
    showAnswer,
    onShowAnswer,
    onNext,
    onCompleteTest,
    isLast,
    questionIndex,
    isMarked,
    onToggleMark,
    memo,
    onMemoChange,
    confidence,
    onConfidenceChange,
}) => {
    // キーボードショートカット
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // メモ入力中（textarea/input にフォーカス）はショートカット無効
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;

        // 1-4: 選択肢トグル（解答確認前のみ）
        if (!showAnswer && e.key >= '1' && e.key <= '4') {
            const idx = parseInt(e.key) - 1;
            if (idx < question.options.length) {
                e.preventDefault();
                onToggleOption(idx);
            }
            return;
        }

        // スペース: 解答確認 or 次の問題
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (!showAnswer) {
                if (!confidence) onConfidenceChange('high');
                onShowAnswer();
            } else if (isLast) {
                onCompleteTest();
            } else {
                onNext();
            }
            return;
        }

        // V, B, N: 自信度（解答確認前のみ）
        if (!showAnswer) {
            if (e.key.toLowerCase() === 'v') {
                e.preventDefault();
                onConfidenceChange('low');
            } else if (e.key.toLowerCase() === 'n') {
                e.preventDefault();
                onConfidenceChange('high');
            }
        }

        // M: 復習フラグトグル（解答確認後のみ）
        if (showAnswer && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            onConfidenceChange(confidence === 'low' ? 'high' : 'low');
        }
    }, [showAnswer, question.options.length, onToggleOption, onShowAnswer, onNext, onCompleteTest, isLast, confidence, onConfidenceChange]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div className="question-view">


            <motion.div
                key={question.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="question-content"
            >
                <div className="question-header">
                    <button
                        className={`bookmark-btn ${isMarked ? 'marked' : ''}`}
                        onClick={() => onToggleMark()}
                        title={isMarked ? "見直しマークを外す" : "見直しマークを付ける"}
                    >
                        <Bookmark size={20} fill={isMarked ? "#f59e0b" : "none"} color={isMarked ? "#f59e0b" : "currentColor"} />
                    </button>
                    <h2 className="question-text">
                        <span className="question-number-prefix">問題{questionIndex + 1}: </span>
                        <div style={{ display: 'inline-block', width: '100%' }}>
                            <MarkdownText content={question.text} />
                        </div>
                    </h2>
                </div>
                <p className="instruction">
                    {question.correctAnswers.length > 1
                        ? `この要件を満たすアプローチは ${question.correctAnswers.length} つ どれですか。（${question.correctAnswers.length} つ選択してください）`
                        : 'この要件を満たすアプローチはどれですか。（1つ選択してください）'
                    }
                </p>

                <div className="options-list">
                    {question.options.map((option, idx) => {
                        const isSelected = selectedOptions.includes(idx);
                        const isCorrect = question.correctAnswers.includes(idx);

                        let optionClass = `option-item ${isSelected ? 'selected' : ''}`;
                        if (showAnswer) {
                            if (isCorrect) optionClass += ' correct';
                            if (isSelected && !isCorrect) optionClass += ' incorrect';
                        }

                        const isSingleChoice = question.correctAnswers.length === 1;

                        return (
                            <div
                                key={idx}
                                className={optionClass}
                                onClick={() => !showAnswer && onToggleOption(idx)}
                            >
                                {isSingleChoice ? (
                                    <div className={`radio-button ${isSelected ? 'checked' : ''}`}>
                                        {isSelected && <div className="radio-inner" />}
                                    </div>
                                ) : (
                                    <div className={`checkbox ${isSelected ? 'checked' : ''}`}>
                                        {isSelected && <span className="check-mark">✓</span>}
                                    </div>
                                )}
                                <div className="option-text" style={{ flex: 1 }}>
                                    <MarkdownText content={option} />
                                </div>
                                {!showAnswer && idx < 4 && <kbd className="option-kbd">{idx + 1}</kbd>}
                            </div>
                        );
                    })}
                </div>

                {!showAnswer && (
                    <div className="navigation-buttons inline-nav">
                        <div className="confidence-select-section">
                            <span className="confidence-prompt">自信度</span>
                            <div className="confidence-buttons-inline">
                                <button
                                    className={`confidence-btn-inline low ${confidence === 'low' ? 'active' : ''}`}
                                    onClick={() => onConfidenceChange('low')}
                                >
                                    <span className="btn-label">😟 自信なし</span>
                                    <kbd className="confidence-kbd">V</kbd>
                                </button>
                                <button
                                    className={`confidence-btn-inline high ${confidence === 'high' ? 'active' : ''}`}
                                    onClick={() => onConfidenceChange('high')}
                                >
                                    <span className="btn-label">😊 確信</span>
                                    <kbd className="confidence-kbd">N</kbd>
                                </button>
                            </div>
                        </div>
                        <div style={{ flex: 1 }} />
                        <div className="nav-right">
                            <button onClick={() => {
                                if (!confidence) onConfidenceChange('high');
                                onShowAnswer();
                            }} className="nav-btn action-btn">解答を確認する</button>
                        </div>
                    </div>
                )}

                {showAnswer && (
                    <div className="answer-row">
                        {question.explanation && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="explanation-box"
                            >
                                <h3>解説</h3>
                                <MarkdownText content={question.explanation?.replace(/\\n/g, '\n')} />
                            </motion.div>
                        )}
                        <div className="nav-right answer-nav">
                            {isLast ? (
                                <button onClick={onCompleteTest} className="nav-btn action-btn complete-btn">テストを完了する</button>
                            ) : (
                                <button onClick={onNext} className="nav-btn action-btn">次の質問</button>
                            )}
                            <button
                                className={`review-flag-btn ${confidence === 'low' ? 'active' : ''}`}
                                onClick={() => onConfidenceChange(confidence === 'low' ? 'high' : 'low')}
                                title={confidence === 'low' ? '復習フラグを解除' : '復習に回す'}
                            >
                                😟 {confidence === 'low' ? '復習対象' : '復習に回す'}
                                <kbd className="confidence-kbd">M</kbd>
                            </button>
                        </div>
                    </div>
                )}

                <div className="memo-section">
                    <div className="memo-header">
                        <span className="memo-title">学習メモ (後で調べたいことなど)</span>
                    </div>
                    <textarea
                        className="memo-input"
                        placeholder="調べたいキーワードやメモを入力..."
                        value={memo}
                        onChange={(e) => onMemoChange(e.target.value)}
                    />
                </div>
            </motion.div>
        </div>
    );
};
