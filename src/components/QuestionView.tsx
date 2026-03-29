import React, { useEffect, useCallback } from 'react';
import type { Question, ConfidenceLevel, FeedbackTimingMode } from '../types';
import { motion } from 'framer-motion';
import { Bookmark, Check, X } from 'lucide-react';
import { MarkdownText } from './MarkdownText';
import { HandwritingPad, type HandwritingPadState } from './HandwritingPad';

interface QuestionViewProps {
    question: Question;
    questionIndex: number;
    totalQuestions: number;
    selectedOptions: number[];
    onToggleOption: (optionIndex: number) => void;
    showAnswer: boolean;
    onShowAnswer: () => void;
    onNext: () => void;
    onCompleteTest: () => void;
    isLast: boolean;
    isMarked: boolean;
    onToggleMark: () => void;
    memo: string;
    onMemoChange: (value: string) => void;
    confidence: ConfidenceLevel | null;
    onConfidenceChange: (level: ConfidenceLevel) => void;
    /** 暗記問題専用: 覚えた(true) / 覚えていない(false) 判定 */
    onMemorizationJudge: (isRemembered: boolean) => void;
    /** 暗記問題の回答記述欄の値 */
    memorizationAnswer: string;
    onMemorizationAnswerChange: (value: string) => void;
    feedbackTimingMode: FeedbackTimingMode;
    isAnswerLocked: boolean;
    revealReadyCount?: number | null;
    answersUntilRevealCount?: number | null;
    useNextAnswerLabel?: boolean;
    showHandwritingPad: boolean;
    handwritingState?: HandwritingPadState;
    onHandwritingStateChange?: (value: HandwritingPadState) => void;
    allowTouchDrawing: boolean;
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
    onMemorizationJudge,
    memorizationAnswer,
    onMemorizationAnswerChange,
    feedbackTimingMode,
    isAnswerLocked,
    revealReadyCount = null,
    answersUntilRevealCount = null,
    useNextAnswerLabel = false,
    showHandwritingPad,
    handwritingState,
    onHandwritingStateChange,
    allowTouchDrawing,
}) => {
    const isMemoQuestion = question.questionType === 'memorization';
    const isShortcutIgnoredTarget = useCallback((target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) {
            return false;
        }

        if (target.closest('textarea, input, select, button, [contenteditable="true"]')) {
            return true;
        }

        if (target.closest('.study-question-chat-panel, .local-llm-page, .right-panel-container')) {
            return true;
        }

        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) {
            return false;
        }

        return activeElement.closest('.study-question-chat-panel, .local-llm-page, .right-panel-container') !== null;
    }, []);

    // キーボードショートカット
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (isShortcutIgnoredTarget(e.target)) {
            return;
        }

        // 1-4: 選択肢トグル（クイズ問題・解答確認前のみ）
        if (!isMemoQuestion && !showAnswer && e.key >= '1' && e.key <= '4') {
            const idx = parseInt(e.key) - 1;
            if (idx < question.options.length) {
                e.preventDefault();
                onToggleOption(idx);
            }
            return;
        }

        // スペース: 解答確認 or 次の問題（クイズ問題のみ）
        if (!isMemoQuestion && (e.key === ' ' || e.code === 'Space')) {
            e.preventDefault();
            if (!showAnswer) {
                const shouldAutoSetConfidence = !confidence && !isAnswerLocked && selectedOptions.length > 0;
                if (shouldAutoSetConfidence) onConfidenceChange('high');
                onShowAnswer();
            } else if (isLast) {
                onCompleteTest();
            } else {
                onNext();
            }
            return;
        }

        // V, N: 自信度（クイズ問題・解答確認前のみ）
        if (!isMemoQuestion && !showAnswer) {
            if (e.key.toLowerCase() === 'v') {
                e.preventDefault();
                onConfidenceChange('low');
            } else if (e.key.toLowerCase() === 'n') {
                e.preventDefault();
                onConfidenceChange('high');
            }
        }

        // M: 復習フラグトグル（クイズ問題・解答確認後のみ）
        if (!isMemoQuestion && showAnswer && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            onConfidenceChange(confidence === 'low' ? 'high' : 'low');
        }
    }, [confidence, isAnswerLocked, isLast, isMemoQuestion, isShortcutIgnoredTarget, onCompleteTest, onConfidenceChange, onNext, onShowAnswer, onToggleOption, question.options.length, selectedOptions.length, showAnswer]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // 問題の指示テキスト（複数選択時のみ個数を表示）
    const instructionText = (() => {
        if (isMemoQuestion) return null;
        if (question.correctAnswers.length > 1) {
            return `${question.correctAnswers.length} つ選択してください`;
        }
        return null;
    })();

    // 暗記問題の解答・解説コンテンツ
    const memorizationBackContent = (() => {
        if (!isMemoQuestion) return '';
        const legacyAnswers: string[] = [];
        if (question.options?.length > 0) legacyAnswers.push(...question.options);
        else if (question.correctAnswers?.length > 0) {
            const strAns = question.correctAnswers.filter(a => typeof a === 'string');
            strAns.forEach(a => legacyAnswers.push(String(a)));
        }
        let backContent = question.explanation || '';
        if (legacyAnswers.length > 0) {
            const combined = legacyAnswers.join('\n');
            if (!backContent.includes(combined)) {
                backContent = backContent ? `${combined}\n\n${backContent}` : combined;
            }
        }
        return backContent;
    })();
    const primaryActionLabel = (revealReadyCount !== null && revealReadyCount > 0)
        ? `${revealReadyCount}件の回答を確認する`
        : isAnswerLocked
            ? (isLast ? '完了へ進む' : '次の問題へ')
            : feedbackTimingMode === 'immediate'
                ? '解答を確認する'
                : '回答して次へ';
    const shouldShowAnswerCountdown =
        !isAnswerLocked &&
        feedbackTimingMode !== 'immediate' &&
        revealReadyCount === null &&
        (answersUntilRevealCount ?? 0) > 0;

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

                {/* 複数選択時のみ個数を案内 */}
                {instructionText && (
                    <p className="instruction">{instructionText}</p>
                )}

                {/* 暗記問題: 回答記述欄 */}
                {isMemoQuestion && (
                    <div className="answer-inputs" style={{ marginBottom: '1rem' }}>
                        <div className="input-wrapper">
                            <div className="input-group">
                                <textarea
                                    className="memorization-input"
                                    placeholder="回答を入力（メモ用）..."
                                    value={memorizationAnswer}
                                    onChange={(e) => onMemorizationAnswerChange(e.target.value)}
                                    disabled={showAnswer}
                                    rows={2}
                                    style={{ minHeight: '60px' }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* クイズ問題: 選択肢リスト */}
                {!isMemoQuestion && (
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
                )}

                {/* 解答確認前ナビゲーション */}
                {!showAnswer && (
                    <div className="navigation-buttons inline-nav">
                        {/* クイズ問題のみ自信度ボタンを表示 */}
                        {!isMemoQuestion && (
                            <div className="confidence-select-section">
                                <span className="confidence-prompt">自信度：</span>
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
                                        <span className="btn-label">😃 確信</span>
                                        <kbd className="confidence-kbd">N</kbd>
                                    </button>
                                </div>
                            </div>
                        )}
                        <div style={{ flex: 1 }} />
                        <div className="nav-right">
                            <button onClick={() => {
                                if (!isMemoQuestion) {
                                    const shouldAutoSetConfidence = !confidence && !isAnswerLocked && selectedOptions.length > 0;
                                    if (shouldAutoSetConfidence) onConfidenceChange('high');
                                }
                                onShowAnswer();
                            }} className={`nav-btn action-btn${shouldShowAnswerCountdown ? ' stacked-action-btn' : ''}`}>
                                {shouldShowAnswerCountdown ? (
                                    <>
                                        <span className="stacked-action-btn-title">{primaryActionLabel}</span>
                                        <span className="stacked-action-btn-subtitle">
                                            {`回答確認まであと${answersUntilRevealCount}`}
                                        </span>
                                    </>
                                ) : primaryActionLabel}
                            </button>
                        </div>
                    </div>
                )}

                {!showAnswer && isAnswerLocked && feedbackTimingMode !== 'immediate' && (
                    <p className="instruction" style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
                        この問題は回答済みです。正誤と解説は遅延表示モードでまとめて表示されます。
                    </p>
                )}

                {/* 解答確認後 */}
                {showAnswer && (
                    isMemoQuestion ? (
                        <>
                            <div className="answer-row">
                                {memorizationBackContent ? (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        className="explanation-box"
                                    >
                                        <h3>解答・解説</h3>
                                        <MarkdownText content={memorizationBackContent.replace(/\\n/g, '\n')} />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        className="explanation-box"
                                    >
                                        <h3>解答・解説</h3>
                                        <p style={{ color: 'var(--text-secondary)' }}>(解答が登録されていません)</p>
                                    </motion.div>
                                )}
                            </div>
                            <div className="memorization-answer-actions">
                                <div className="judgement-buttons">
                                    <button
                                        className="judge-btn bad"
                                        onClick={() => onMemorizationJudge(false)}
                                    >
                                        <X size={20} />
                                        <span>覚えていない</span>
                                    </button>
                                    <button
                                        className="judge-btn good"
                                        onClick={() => onMemorizationJudge(true)}
                                    >
                                        <Check size={20} />
                                        <span>完全に覚えた</span>
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="answer-row">
                            {question.explanation ? (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="explanation-box"
                                >
                                    <h3>解説</h3>
                                    <MarkdownText content={question.explanation?.replace(/\\n/g, '\n')} />
                                </motion.div>
                            ) : null}
                            <div className="nav-right answer-nav">
                                <button
                                    className={`review-flag-btn ${confidence === 'low' ? 'active' : ''}`}
                                    onClick={() => onConfidenceChange(confidence === 'low' ? 'high' : 'low')}
                                    title={confidence === 'low' ? '復習フラグを解除' : '復習に回す'}
                                >
                                    <span className="review-flag-btn-label">
                                        <span className="review-flag-btn-text">
                                            {confidence === 'low' ? '🤔 復習対象' : '🤔 復習に回す'}
                                        </span>
                                        <span className="review-flag-btn-measure" aria-hidden="true">
                                            🤔 復習に回す
                                        </span>
                                    </span>
                                    <kbd className="confidence-kbd">M</kbd>
                                </button>
                                {isLast ? (
                                    <button onClick={onCompleteTest} className="nav-btn action-btn complete-btn" style={{ marginLeft: 'auto' }}>テストを完了する</button>
                                ) : (
                                    <button onClick={onNext} className="nav-btn action-btn" style={{ marginLeft: 'auto' }}>
                                        {useNextAnswerLabel ? '次の回答' : '次の質問'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )
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
                        rows={2}
                    />
                    {showHandwritingPad && (
                        <HandwritingPad
                            key={question.id ?? `${questionIndex}-${question.text}`}
                            value={handwritingState}
                            onChange={onHandwritingStateChange}
                            allowTouchDrawing={allowTouchDrawing}
                        />
                    )}
                </div>
            </motion.div>
        </div>
    );
};
