import React, { useState, useMemo } from 'react';
import { Check, X, RotateCcw, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Question } from '../types';
import { MarkdownText } from './MarkdownText';

export interface MemorizationLog {
    questionId: number;
    userInputs: string[];
    isMemorized: boolean;
}

interface QuestionViewProps {
    question: Question;
    index: number;
    total: number;
    onJudge: (inputs: string[], isMemorized: boolean) => void;
}

export const MemorizationQuestionView: React.FC<QuestionViewProps> = ({ question, index, total, onJudge }) => {
    // State local to the specific question instance
    const [userInputs, setUserInputs] = useState<string[]>(new Array(question.options.length).fill(''));
    const [showAnswer, setShowAnswer] = useState(false);

    const handleInputChange = (idx: number, value: string) => {
        const newInputs = [...userInputs];
        newInputs[idx] = value;
        setUserInputs(newInputs);
    };

    return (
        <main className="memorization-content">
            <div className="question-card">
                <div className="card-header">
                    <span className="category-badge">{question.category}</span>
                    <span className="progress-text-card">{index + 1} / {total}</span>
                </div>
                <h2 className="question-text">
                    <MarkdownText content={question.text} />
                </h2>

                <div className="answer-inputs">
                    {question.options.map((ans, idx) => (
                        <div key={idx} className="input-wrapper">
                            <div className="input-group">
                                <span className="input-index">{idx + 1}.</span>
                                <textarea
                                    className="memorization-input"
                                    placeholder="回答を入力..."
                                    value={userInputs[idx] || ''}
                                    onChange={(e) => handleInputChange(idx, e.target.value)}
                                    disabled={showAnswer}
                                    rows={2}
                                />
                            </div>
                            {showAnswer && (
                                <div className="correct-answer-card">
                                    <div className="answer-header">
                                        <Check size={14} className="check-icon" />
                                        <span className="answer-label">正解</span>
                                    </div>
                                    <div className="answer-text">
                                        <MarkdownText content={ans} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {showAnswer && question.explanation && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="explanation-box"
                    >
                        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>解説</h4>
                        <MarkdownText content={question.explanation} />
                    </motion.div>
                )}
            </div>

            <div className="control-bar">
                {!showAnswer ? (
                    <button className="check-answer-btn" onClick={() => setShowAnswer(true)}>
                        回答を確認
                    </button>
                ) : (
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

    const filteredLogs = useMemo(() => {
        return logs.map((log, idx) => ({ log, question: questions.find(q => q.id === log.questionId), index: idx }))
            .filter((item): item is { log: MemorizationLog; question: Question; index: number } => {
                const { log, question } = item;
                if (!question || question.id === undefined) return false;
                if (filter === 'memorized') return log.isMemorized;
                if (filter === 'not_memorized') return !log.isMemorized;
                return true;
            });
    }, [logs, questions, filter]);

    const filterCounts = useMemo(() => {
        const memorized = filteredLogs.filter(item => item.log.isMemorized).length;
        return {
            memorized,
            not_memorized: filteredLogs.length - memorized
        };
    }, [filteredLogs]);

    const memorizedCount = filteredLogs.filter(item => item.log.isMemorized).length;
    const validTotalCount = filteredLogs.length;
    const percentage = validTotalCount > 0 ? Math.round((memorizedCount / validTotalCount) * 100) : 0;

    return (
        <motion.div
            className="test-result-container"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
        >
            <div className="result-main">
                {/* Simplified info section without chart */}
                <div className="result-info-section" style={{ width: '100%', textAlign: 'center', marginBottom: '2rem' }}>
                    <p className="result-attempt">{isHistory ? '学習履歴' : '学習完了'}</p>
                    <h1 className="result-percentage">{percentage}%<span className="result-sub">記憶 ({memorizedCount}/{validTotalCount})</span></h1>

                    <div className="result-actions" style={{ justifyContent: 'center' }}>
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
                                    <div className="review-question-header" onClick={() => toggleExpand(q.id!)}>
                                        <div className="review-question-meta">
                                            <span className={`review-result-badge ${log.isMemorized ? 'correct' : 'incorrect'}`}>
                                                {log.isMemorized ? <Check size={14} /> : <X size={14} />}
                                            </span>
                                            <span className="review-question-num">Q{index + 1}</span>
                                        </div>
                                        <div className="review-question-text"><MarkdownText content={q.text} /></div>
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
                                                    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
                                                        <div>
                                                            <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>あなたの回答</strong>
                                                            {log.userInputs.map((input, i) => (
                                                                <div key={i} className="review-option" style={{ borderColor: log.isMemorized ? 'var(--success-color)' : 'var(--error-color)' }}>
                                                                    <span>{i + 1}. {input || '(未入力)'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div>
                                                            <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>正解</strong>
                                                            {q.options.map((opt, i) => (
                                                                <div key={i} className="review-option correct">
                                                                    <span>{i + 1}. {opt}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {q.explanation && (
                                                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                                                            <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>解説</strong>
                                                            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: '0.9rem' }}>{q.explanation}</p>
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
