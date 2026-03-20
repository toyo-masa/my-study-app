import React, { useState, useMemo } from 'react';
import { Bookmark, Check, X, RotateCcw, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Question, FeedbackTimingMode, MemorizationLog } from '../types';
import { MarkdownText } from './MarkdownText';
import { HandwritingPad, type HandwritingPadState } from './HandwritingPad';

interface QuestionViewProps {
    question: Question;
    index: number;
    total: number;
    userInputs: string[];
    onInputChange: (index: number, value: string) => void;
    showAnswer: boolean;
    onRevealAnswer: () => void;
    onJudge: (inputs: string[], isMemorized: boolean) => void;
    isCurrentQuestionJudged?: boolean;
    showResultButton?: boolean;
    onShowResult?: () => void;
    isMarked?: boolean;
    onToggleMark?: (questionId?: number) => void;
    onNext?: () => void;
    isAnswerLocked?: boolean;
    isLastQuestion?: boolean;
    feedbackTimingMode?: FeedbackTimingMode;
    feedbackBlockSize?: number;
    revealReadyCount?: number | null;
    handwritingState?: HandwritingPadState;
    onHandwritingStateChange?: (value: HandwritingPadState) => void;
}

export const MemorizationQuestionView: React.FC<QuestionViewProps> = ({
    question,
    index,
    total,
    userInputs,
    onInputChange,
    showAnswer,
    onRevealAnswer,
    onJudge,
    isCurrentQuestionJudged = false,
    showResultButton = false,
    onShowResult,
    isMarked,
    onToggleMark,
    onNext,
    isAnswerLocked = false,
    isLastQuestion = false,
    feedbackTimingMode = 'immediate',
    feedbackBlockSize = 5,
    revealReadyCount = null,
    handwritingState,
    onHandwritingStateChange,
}) => {
    const handleInputChange = (idx: number, value: string) => {
        onInputChange(idx, value);
    };

    return (
        <main className="memorization-content">
            <div className="question-card">
                <div className="card-header" style={{ display: 'flex', alignItems: 'center' }}>
                    {onToggleMark && (
                        <button
                            className={`bookmark-btn ${isMarked ? 'marked' : ''}`}
                            onClick={() => onToggleMark()}
                            title={isMarked ? "見直しマークを外す" : "見直しマークを付ける"}
                            style={{ marginRight: '0.5rem', marginTop: 0 }}
                        >
                            <Bookmark size={20} fill={isMarked ? "#f59e0b" : "none"} color={isMarked ? "#f59e0b" : "currentColor"} />
                        </button>
                    )}
                    <span className="category-badge">{question.category}</span>
                    <span className="progress-text-card" style={{ marginLeft: 'auto' }}>{index + 1} / {total}</span>
                </div>
                <h2 className="question-text">
                    <MarkdownText content={question.text} />
                </h2>

                {(() => {
                    const legacyAnswers: string[] = [];
                    if (question.options?.length > 0) legacyAnswers.push(...question.options);
                    else if (question.correctAnswers?.length > 0) {
                        const strAns = question.correctAnswers.filter(a => typeof a === 'string');
                        strAns.forEach(a => legacyAnswers.push(String(a)));
                    }

                    // 解答として表示する文字列: correctAnswers 優先、なければ legacyAnswers
                    const answerText: string = question.correctAnswers?.length > 0
                        ? question.correctAnswers.map(a => String(a)).join('\n')
                        : legacyAnswers.join('\n');

                    return (
                        <>
                            <div className="answer-inputs">
                                <div className="input-wrapper">
                                    <div className="input-group">
                                        <textarea
                                            className="memorization-input"
                                            placeholder="回答を入力（メモ用）..."
                                            value={userInputs[0] || ''}
                                            onChange={(e) => handleInputChange(0, e.target.value)}
                                            disabled={showAnswer}
                                            rows={2}
                                            style={{ minHeight: '60px' }}
                                        />
                                    </div>
                                    {showAnswer && answerText && (
                                        <div className="correct-answer-card">
                                            <div className="answer-header">
                                                <Check size={14} className="check-icon" />
                                                <span className="answer-label">解答</span>
                                            </div>
                                            <div className="answer-text">
                                                <MarkdownText content={answerText} />
                                            </div>
                                        </div>
                                    )}
                                    {showAnswer && question.explanation && (
                                        <div className="explanation-box" style={{ marginTop: '0.5rem' }}>
                                            <h3>解説</h3>
                                            <MarkdownText content={question.explanation} />
                                        </div>
                                    )}
                                    <HandwritingPad
                                        key={question.id ?? `${index}-${question.text}`}
                                        value={handwritingState}
                                        onChange={onHandwritingStateChange}
                                    />
                                </div>
                            </div>
                        </>
                    );
                })()}
            </div>

            <div className="control-bar">
                {!showAnswer ? (
                    <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                className="check-answer-btn"
                                onClick={() => {
                                    const canRevealPendingAnswers = revealReadyCount !== null && revealReadyCount > 0;
                                    if (canRevealPendingAnswers) {
                                        onRevealAnswer();
                                        return;
                                    }
                                    if (isAnswerLocked) {
                                        onNext?.();
                                        return;
                                    }
                                    onRevealAnswer();
                                }}
                            >
                                {(revealReadyCount !== null && revealReadyCount > 0)
                                    ? `${revealReadyCount}件の回答を確認する`
                                    : isAnswerLocked
                                        ? (isLastQuestion ? '完了へ進む' : '次の問題へ')
                                        : feedbackTimingMode === 'immediate'
                                            ? '回答を確認'
                                            : '回答して次へ'}
                            </button>
                        </div>
                        {isAnswerLocked && feedbackTimingMode !== 'immediate' && (
                            <p className="instruction" style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                {feedbackTimingMode === 'delayed_block'
                                    ? `このカードは回答済みです。正解と解説は遅延表示（${feedbackBlockSize}問回答後）でまとめて確認します。`
                                    : 'このカードは回答済みです。正解と解説は最後にまとめて確認します。'}
                            </p>
                        )}
                    </div>
                ) : (
                    <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                        <div className="judgement-buttons">
                            <button className="judge-btn bad" onClick={() => onJudge(userInputs, false)}>
                                <X size={20} />
                                <span>覚えられていない</span>
                            </button>
                            <button className="judge-btn good" onClick={() => onJudge(userInputs, true)}>
                                <Check size={20} />
                                <span>完全に覚えた</span>
                            </button>
                        </div>
                        {showResultButton && isCurrentQuestionJudged && onShowResult && (
                            <button className="check-answer-btn" onClick={onShowResult}>
                                テスト結果を表示する
                            </button>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
};

interface ResultViewProps {
    logs: MemorizationLog[];
    questions: Question[];
    onBack?: () => void;
    onRetry?: () => void;
    isHistory?: boolean;
}

type MemorizationFilter = 'all' | 'memorized' | 'not_memorized';

export const MemorizationResultView: React.FC<ResultViewProps> = ({
    logs,
    questions,
    onBack,
    onRetry,
    isHistory
}) => {
    type MemorizationResultItem = { log: MemorizationLog; question: Question; index: number };
    const [filter, setFilter] = useState<MemorizationFilter>('all');
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const toggleExpand = (id: number) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allLogs = useMemo(() => {
        return logs.map((log, idx) => ({ log, question: questions.find(q => q.id === log.questionId), index: idx }))
            .filter((item): item is MemorizationResultItem => {
                return !!item.question && item.question.id !== undefined;
            });
    }, [logs, questions]);

    const filteredLogs = useMemo(() => {
        return allLogs.filter((item) => {
            if (filter === 'memorized') return item.log.isMemorized;
            if (filter === 'not_memorized') return !item.log.isMemorized;
            return true;
        });
    }, [allLogs, filter]);

    const filterCounts = useMemo(() => {
        const memorized = allLogs.filter(item => item.log.isMemorized).length;
        return {
            memorized,
            not_memorized: allLogs.length - memorized
        };
    }, [allLogs]);

    const memorizedCount = filterCounts.memorized;
    const validTotalCount = allLogs.length;
    const percentage = validTotalCount > 0 ? Math.round((memorizedCount / validTotalCount) * 100) : 0;

    return (
        <motion.div
            className={`test-result-container memorization-result-view ${isHistory ? 'is-history' : ''}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
        >
            <div className="result-main">
                {/* Simplified info section without chart */}
                <div className="result-info-section memorization-result-info">
                    <p className="result-attempt">{isHistory ? '学習履歴' : '学習完了'}</p>
                    <h1 className="result-percentage">{percentage}%<span className="result-sub">記憶 ({memorizedCount}/{validTotalCount})</span></h1>

                    <div className="result-actions memorization-result-actions">
                        {onBack && <button className="review-btn" onClick={onBack}>戻る</button>}
                        {!isHistory && onRetry && (
                            <button className="review-btn secondary" onClick={onRetry}>
                                <RotateCcw size={16} style={{ marginRight: 8 }} /> もう一度
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="result-question-review">
                <h2>問題一覧</h2>
                <div className="review-filter-bar">
                    <button className={`review-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                        <span>すべて ({validTotalCount})</span>
                    </button>
                    <button
                        className={`review-filter-btn ${filter === 'memorized' ? 'active' : ''}`}
                        onClick={() => setFilter('memorized')}
                    >
                        <Check size={14} style={{ marginRight: 4 }} />
                        <span>覚えた ({filterCounts.memorized})</span>
                    </button>
                    <button
                        className={`review-filter-btn ${filter === 'not_memorized' ? 'active' : ''}`}
                        onClick={() => setFilter('not_memorized')}
                    >
                        <X size={14} style={{ marginRight: 4 }} />
                        <span>覚えていない ({filterCounts.not_memorized})</span>
                    </button>
                </div>

                {filteredLogs.length === 0 ? (
                    <p className="review-empty">該当する問題はありません</p>
                ) : (
                    <div className="review-question-list">
                        {filteredLogs.map(({ log, question: q, index }) => {
                            // q is guaranteed defined and has id by filter
                            const isExpanded = expandedIds.has(q.id!);

                            return (
                                <div key={q.id!} className={`review-question-card ${log.isMemorized ? 'correct' : 'incorrect'}`}>
                                    <div className={`review-question-header ${isExpanded ? 'expanded' : ''}`} onClick={() => toggleExpand(q.id!)}>
                                        <div className="review-question-meta">
                                            <span className={`review-result-badge ${log.isMemorized ? 'correct' : 'incorrect'}`}>
                                                {log.isMemorized ? <Check size={14} /> : <X size={14} />}
                                            </span>
                                            <span className="review-question-num">Q{index + 1}</span>
                                        </div>
                                        <div className={`review-question-text ${isExpanded ? 'expanded' : ''}`}><MarkdownText content={q.text} /></div>
                                        <ChevronDown size={18} className={`review-chevron ${isExpanded ? 'expanded' : ''}`} />
                                    </div>
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                className="review-question-body"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <div className="review-options">
                                                    {/* Show Your Answer vs Correct Answer */}
                                                    <div className="review-answer-compare-grid">
                                                        <div className="review-answer-compare-column">
                                                            <strong className="review-answer-compare-title">あなたの回答</strong>
                                                            {log.userInputs.map((input, i) => (
                                                                <div key={i} className="review-option" style={{ borderColor: log.isMemorized ? 'var(--success-color)' : 'var(--error-color)' }}>
                                                                    <span>{i + 1}. {input || '(未入力)'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="review-answer-compare-column">
                                                            <strong className="review-answer-compare-title">正解</strong>
                                                            {q.correctAnswers.map((opt, i) => (
                                                                <div key={i} className="review-option correct review-option-multiline">
                                                                    <span style={{ flexShrink: 0 }}>{i + 1}.</span>
                                                                    <div className="review-option-text-block">
                                                                        <MarkdownText content={String(opt)} />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {q.explanation && (
                                                        <div className="explanation-box" style={{ marginTop: '1rem' }}>
                                                            <h3>解説</h3>
                                                            <MarkdownText content={q.explanation} />
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </motion.div>
    );
};
