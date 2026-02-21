import React, { useMemo, useState } from 'react';
import type { Question, ConfidenceLevel } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { MarkdownText } from './MarkdownText';

interface TestResultProps {
    questions: Question[];
    answers: Record<string, number[]>;
    confidences: Record<string, ConfidenceLevel>;
    startTime: Date;
    endTime: Date;
    onReview: () => void;
    onRetestWrong?: () => void;
    onRetestWeak?: () => void;
    historyOverrides?: {
        correctCount: number;
        totalCount: number;
    };
}

// Simple donut chart component using SVG
const DonutChart: React.FC<{ correct: number; incorrect: number; skipped: number }> = ({ correct, incorrect, skipped }) => {
    const total = correct + incorrect + skipped;
    if (total === 0) return null;

    const correctPct = (correct / total) * 100;
    const incorrectPct = (incorrect / total) * 100;

    const radius = 80;
    const circumference = 2 * Math.PI * radius;

    const correctDash = (correctPct / 100) * circumference;
    const incorrectDash = (incorrectPct / 100) * circumference;
    const skippedDash = circumference - correctDash - incorrectDash;

    return (
        <div className="donut-chart-container">
            <svg width="200" height="200" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="24" />
                <circle
                    cx="100" cy="100" r={radius} fill="none"
                    stroke="#22c55e" strokeWidth="24"
                    strokeDasharray={`${correctDash} ${circumference - correctDash}`}
                    strokeDashoffset={circumference * 0.25}
                    strokeLinecap="butt"
                    className="donut-segment"
                />
                <circle
                    cx="100" cy="100" r={radius} fill="none"
                    stroke="#ef4444" strokeWidth="24"
                    strokeDasharray={`${incorrectDash} ${circumference - incorrectDash}`}
                    strokeDashoffset={circumference * 0.25 - correctDash}
                    strokeLinecap="butt"
                    className="donut-segment"
                />
                <circle
                    cx="100" cy="100" r={radius} fill="none"
                    stroke="#94a3b8" strokeWidth="24"
                    strokeDasharray={`${skippedDash} ${circumference - skippedDash}`}
                    strokeDashoffset={circumference * 0.25 - correctDash - incorrectDash}
                    strokeLinecap="butt"
                    className="donut-segment"
                />
            </svg>
        </div>
    );
};

type QuestionFilter = 'all' | 'wrong' | 'low' | 'wrong-low';

export const TestResult: React.FC<TestResultProps> = (props) => {
    const { questions, answers, confidences, startTime, endTime, onReview, onRetestWrong, onRetestWeak } = props;
    const [filter, setFilter] = useState<QuestionFilter>('all');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const stats = useMemo(() => {
        let correct = 0;
        let incorrect = 0;
        let skipped = 0;

        const categoryMap = new Map<string, { total: number; correct: number; incorrect: number; skipped: number }>();

        questions.forEach(q => {
            const userAnswers = answers[String(q.id)] || [];
            const cat = q.category || 'General';

            if (!categoryMap.has(cat)) {
                categoryMap.set(cat, { total: 0, correct: 0, incorrect: 0, skipped: 0 });
            }
            const catStats = categoryMap.get(cat)!;
            catStats.total++;

            if (userAnswers.length === 0) {
                skipped++;
                catStats.skipped++;
            } else {
                const isCorrect =
                    userAnswers.length === q.correctAnswers.length &&
                    userAnswers.every((a: number) => q.correctAnswers.includes(a));
                if (isCorrect) {
                    correct++;
                    catStats.correct++;
                } else {
                    incorrect++;
                    catStats.incorrect++;
                }
            }
        });

        if (Object.keys(answers).length === 0 && props.historyOverrides) {
            correct = props.historyOverrides.correctCount;
            const total = props.historyOverrides.totalCount;
            skipped = total - correct;
        }

        const totalQuestions = questions.length;
        const correctPct = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;

        const diffMs = endTime.getTime() - startTime.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        const timeStr = hours > 0 ? `${hours}時間 ${mins}分` : `${mins}分`;

        const dateStr = endTime.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        }) + ' ' + endTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        return { correct, incorrect, skipped, totalQuestions, correctPct, timeStr, dateStr, categoryMap };
    }, [questions, answers, startTime, endTime]);

    // Filtered questions
    const filteredQuestions = useMemo(() => {
        return questions.map((q, i) => ({ question: q, originalIndex: i })).filter(({ question: q }) => {
            const qKey = String(q.id);
            const userAnswers = answers[qKey] || [];
            const isCorrect = userAnswers.length > 0 &&
                userAnswers.length === q.correctAnswers.length &&
                userAnswers.every((a: number) => q.correctAnswers.includes(a));
            const isLowConfidence = confidences[qKey] === 'low';

            switch (filter) {
                case 'wrong': return !isCorrect;
                case 'low': return isLowConfidence;
                case 'wrong-low': return !isCorrect || isLowConfidence;
                default: return true;
            }
        });
    }, [questions, answers, confidences, filter]);

    // Filter counts
    const filterCounts = useMemo(() => {
        let wrong = 0;
        let low = 0;
        let wrongOrLow = 0;
        questions.forEach(q => {
            const qKey = String(q.id);
            const userAnswers = answers[qKey] || [];
            const isCorrect = userAnswers.length > 0 &&
                userAnswers.length === q.correctAnswers.length &&
                userAnswers.every((a: number) => q.correctAnswers.includes(a));
            const isLow = confidences[qKey] === 'low';
            if (!isCorrect) wrong++;
            if (isLow) low++;
            if (!isCorrect || isLow) wrongOrLow++;
        });
        return { wrong, low, wrongOrLow };
    }, [questions, answers, confidences]);

    return (
        <motion.div
            className="test-result-container"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
        >
            <div className="result-main">
                <div className="result-chart-section">
                    <DonutChart correct={stats.correct} incorrect={stats.incorrect} skipped={stats.skipped} />
                    <div className="result-legend">
                        <span className="legend-item"><span className="legend-dot correct"></span>正解</span>
                        <span className="legend-item"><span className="legend-dot incorrect"></span>不正解</span>
                        <span className="legend-item"><span className="legend-dot skipped"></span>スキップ/未回答</span>
                    </div>
                </div>

                <div className="result-info-section">
                    <p className="result-attempt">テスト結果</p>
                    <h1 className="result-percentage">{stats.correctPct}%<span className="result-sub">正解 ({stats.correct}/{stats.totalQuestions})</span></h1>
                    <p className="result-time">{stats.timeStr}</p>
                    <p className="result-date">{stats.dateStr}</p>
                    <div className="result-actions">
                        <button className="review-btn" onClick={onReview}>問題を見直す</button>
                        {onRetestWrong && stats.incorrect > 0 && (
                            <button className="review-btn secondary" onClick={onRetestWrong}>
                                不正解のみを復習 ({stats.incorrect}問)
                            </button>
                        )}
                        {onRetestWeak && (
                            <button className="review-btn secondary" onClick={onRetestWeak}>
                                不正解+自信なしを復習
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Category breakdown */}
            {stats.categoryMap.size > 0 && (
                <div className="result-categories">
                    <h2>ドメイン</h2>
                    {Array.from(stats.categoryMap.entries()).map(([cat, catStats]) => {
                        const correctPct = Math.round((catStats.correct / catStats.total) * 100);
                        const incorrectPct = Math.round((catStats.incorrect / catStats.total) * 100);
                        const skippedPct = 100 - correctPct - incorrectPct;
                        return (
                            <div key={cat} className="category-item">
                                <h3>{cat} ({catStats.total}問)</h3>
                                <div className="category-bar">
                                    {correctPct > 0 && <div className="cat-bar-segment correct" style={{ width: `${correctPct}%` }}>{correctPct}%</div>}
                                    {incorrectPct > 0 && <div className="cat-bar-segment incorrect" style={{ width: `${incorrectPct}%` }}>{incorrectPct}%</div>}
                                    {skippedPct > 0 && <div className="cat-bar-segment skipped" style={{ width: `${skippedPct}%` }}>{skippedPct}%</div>}
                                </div>
                                <div className="result-legend">
                                    <span className="legend-item"><span className="legend-dot correct"></span>正解</span>
                                    <span className="legend-item"><span className="legend-dot incorrect"></span>不正解</span>
                                    <span className="legend-item"><span className="legend-dot skipped"></span>スキップ/未回答</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Question Review Section */}
            <div className="result-question-review">
                <h2>問題一覧</h2>
                <div className="review-filter-bar">
                    <button className={`review-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                        すべて ({questions.length})
                    </button>
                    <button className={`review-filter-btn ${filter === 'wrong' ? 'active' : ''}`} onClick={() => setFilter('wrong')}>
                        不正解のみ ({filterCounts.wrong})
                    </button>
                    <button className={`review-filter-btn ${filter === 'low' ? 'active' : ''}`} onClick={() => setFilter('low')}>
                        自信なしのみ ({filterCounts.low})
                    </button>
                    <button className={`review-filter-btn ${filter === 'wrong-low' ? 'active' : ''}`} onClick={() => setFilter('wrong-low')}>
                        不正解+自信なし ({filterCounts.wrongOrLow})
                    </button>
                </div>

                {filteredQuestions.length === 0 ? (
                    <p className="review-empty">該当する問題はありません</p>
                ) : (
                    <div className="review-question-list">
                        {filteredQuestions.map(({ question: q, originalIndex }) => {
                            const qKey = String(q.id);
                            const userAnswers = answers[qKey] || [];
                            const isCorrect = userAnswers.length > 0 &&
                                userAnswers.length === q.correctAnswers.length &&
                                userAnswers.every((a: number) => q.correctAnswers.includes(a));
                            const isLow = confidences[qKey] === 'low';
                            const isExpanded = expandedIds.has(qKey);

                            return (
                                <div key={qKey} className={`review-question-card ${isCorrect ? 'correct' : 'incorrect'}`}>
                                    <div className="review-question-header" onClick={() => toggleExpand(qKey)}>
                                        <div className="review-question-meta">
                                            <span className={`review-result-badge ${isCorrect ? 'correct' : 'incorrect'}`}>
                                                {isCorrect ? '○' : '✗'}
                                            </span>
                                            {isLow && <span className="review-low-badge">😟</span>}
                                            <span className="review-question-num">Q{originalIndex + 1}</span>
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
                                                    {q.options.map((opt, oi) => {
                                                        const isUserSelected = userAnswers.includes(oi);
                                                        const isCorrectOption = q.correctAnswers.includes(oi);
                                                        let cls = 'review-option';
                                                        if (isCorrectOption) cls += ' correct';
                                                        if (isUserSelected && !isCorrectOption) cls += ' wrong';
                                                        return (
                                                            <div key={oi} className={cls}>
                                                                <span className="review-option-marker">
                                                                    {isCorrectOption ? '✓' : isUserSelected ? '✗' : ''}
                                                                </span>
                                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><MarkdownText content={opt} /></div>
                                                                {isUserSelected && <span className="review-your-answer">あなたの回答</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {q.explanation && (
                                                    <div className="review-explanation" style={{ marginTop: '1rem' }}>
                                                        <strong>解説:</strong>
                                                        <MarkdownText content={q.explanation?.replace(/\\n/g, '\n')} />
                                                    </div>
                                                )}
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
