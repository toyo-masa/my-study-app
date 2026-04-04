import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Table2, X } from 'lucide-react';
import { getHistories, getQuestionsForQuizSet, getReviewLogsByQuizSet } from '../db';
import type { Question, QuizHistory, ReviewLog } from '../types';
import { LoadingView } from '../components/LoadingView';
import { NotFoundView } from '../components/NotFoundView';
import { MarkdownText } from '../components/MarkdownText';
import { BackButton } from '../components/BackButton';
import { useAppContext } from '../contexts/AppContext';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';

type CellStatus = 'correct' | 'incorrect';
type SelectedQuestionState = {
    question: Question;
    questionNumber: number;
};

type AttemptColumn = {
    key: string;
    date: Date;
    dateLabel: string;
    statusMap: Map<number, CellStatus>;
};

function formatMonthDay(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

function buildHistoryStatusMap(history: QuizHistory, questions: Question[]): Map<number, CellStatus> {
    const statusMap = new Map<number, CellStatus>();

    if (history.memorizationDetail && history.memorizationDetail.length > 0) {
        history.memorizationDetail.forEach((detail) => {
            statusMap.set(detail.questionId, detail.isMemorized ? 'correct' : 'incorrect');
        });
        return statusMap;
    }

    const answers = history.answers || {};
    const targetQuestionIds = history.questionIds && history.questionIds.length > 0
        ? new Set(history.questionIds)
        : null;

    questions.forEach((question) => {
        if (question.id === undefined) return;

        const questionId = question.id;
        const hasAnswer = Object.prototype.hasOwnProperty.call(answers, String(questionId));
        const isIncluded = targetQuestionIds ? targetQuestionIds.has(questionId) : hasAnswer;

        if (!isIncluded) return;

        const rawUserAnswers = answers[String(questionId)];
        const userAnswers = Array.isArray(rawUserAnswers) ? rawUserAnswers : [];
        const isCorrect = userAnswers.length === question.correctAnswers.length &&
            userAnswers.every((answer) => question.correctAnswers.includes(answer));

        statusMap.set(questionId, isCorrect ? 'correct' : 'incorrect');
    });

    return statusMap;
}

function buildReviewLogAttemptColumns(reviewLogs: ReviewLog[]): AttemptColumn[] {
    const grouped = new Map<string, AttemptColumn>();
    const sortedLogs = [...reviewLogs].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));

    for (const log of sortedLogs) {
        const key = log.reviewedAt;
        const current = grouped.get(key);
        const status: CellStatus = log.isCorrect ? 'correct' : 'incorrect';
        if (current) {
            current.statusMap.set(log.questionId, status);
            continue;
        }

        const date = new Date(log.reviewedAt);
        grouped.set(key, {
            key: `review-log-${key}`,
            date,
            dateLabel: formatMonthDay(date),
            statusMap: new Map([[log.questionId, status]]),
        });
    }

    return [...grouped.values()];
}

export const HistoryTableRoute: React.FC = () => {
    const navigate = useNavigate();
    const { loadQuizSets, handleCloudError } = useAppContext();
    const { quizSetId, activeQuizSet, quizSetsCount } = useActiveQuizSetFromRoute();
    const [questions, setQuestions] = useState<Question[]>([]);
    const [histories, setHistories] = useState<QuizHistory[]>([]);
    const [reviewLogs, setReviewLogs] = useState<ReviewLog[]>([]);
    const [isLoadingQuizSet, setIsLoadingQuizSet] = useState(() => quizSetsCount === 0);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [selectedQuestion, setSelectedQuestion] = useState<SelectedQuestionState | null>(null);

    useEffect(() => {
        if (!isLoadingQuizSet) return;
        if (quizSetsCount > 0) return;
        loadQuizSets().finally(() => setIsLoadingQuizSet(false));
    }, [isLoadingQuizSet, quizSetsCount, loadQuizSets]);

    useEffect(() => {
        if (quizSetsCount > 0) {
            setIsLoadingQuizSet(false);
        }
    }, [quizSetsCount]);

    const loadData = useCallback(async () => {
        if (quizSetId === undefined) {
            setIsLoadingData(false);
            return;
        }

        setIsLoadingData(true);
        setErrorMessage('');

        try {
            const [loadedQuestions, loadedHistories, loadedReviewLogs] = await Promise.all([
                getQuestionsForQuizSet(quizSetId),
                getHistories(quizSetId),
                getReviewLogsByQuizSet(quizSetId),
            ]);

            setQuestions(loadedQuestions);
            setHistories(loadedHistories);
            setReviewLogs(loadedReviewLogs);
        } catch (error) {
            console.error('回答履歴テーブルの読み込みに失敗しました:', error);
            handleCloudError(error, '回答履歴の読み込みに失敗しました。', { suppressGlobalNotice: true });
            setErrorMessage('回答履歴の読み込みに失敗しました。時間をおいて再試行してください。');
            setQuestions([]);
            setHistories([]);
            setReviewLogs([]);
        } finally {
            setIsLoadingData(false);
        }
    }, [quizSetId, handleCloudError]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!selectedQuestion) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSelectedQuestion(null);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [selectedQuestion]);

    const sortedQuestions = useMemo(() => {
        return [...questions].sort((a, b) => {
            const aId = a.id ?? Number.MAX_SAFE_INTEGER;
            const bId = b.id ?? Number.MAX_SAFE_INTEGER;
            return aId - bId;
        });
    }, [questions]);

    const sortedHistories = useMemo(() => {
        return [...histories].sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [histories]);

    const attemptColumns = useMemo(() => {
        const hasReviewLogs = reviewLogs.length > 0;
        const historyAttemptColumns: AttemptColumn[] = sortedHistories
            .filter((history) => !hasReviewLogs || history.mode !== 'review_due')
            .map((history) => ({
                key: `history-${history.id ?? history.date.toISOString()}`,
                date: history.date,
                dateLabel: formatMonthDay(history.date),
                statusMap: buildHistoryStatusMap(history, sortedQuestions),
            }));
        const reviewLogAttemptColumns = hasReviewLogs
            ? buildReviewLogAttemptColumns(reviewLogs)
            : [];

        return [...historyAttemptColumns, ...reviewLogAttemptColumns]
            .sort((a, b) => {
                const timeDiff = a.date.getTime() - b.date.getTime();
                if (timeDiff !== 0) {
                    return timeDiff;
                }
                return a.key.localeCompare(b.key);
            })
            .map((column, index) => ({
                ...column,
                attemptNumber: index + 1,
            }));
    }, [reviewLogs, sortedHistories, sortedQuestions]);

    const historyAttemptSummaries = useMemo(() => {
        return attemptColumns.map((column) => {
            let correctCount = 0;
            let incorrectCount = 0;
            column.statusMap.forEach((status) => {
                if (status === 'correct') {
                    correctCount += 1;
                } else {
                    incorrectCount += 1;
                }
            });
            return { correctCount, incorrectCount };
        });
    }, [attemptColumns]);

    if (isLoadingQuizSet || isLoadingData) {
        return <LoadingView fullPage message="回答履歴を読み込み中..." />;
    }

    if (!activeQuizSet || quizSetId === undefined) {
        return <NotFoundView message="問題集が見つかりませんでした。または読み込み中です..." />;
    }

    const handleBack = () => {
        navigate(`/quiz/${quizSetId}`);
    };
    const answerSectionTitle = activeQuizSet.type === 'memorization' ? '解答' : '選択肢';
    const positiveSummaryLabel = activeQuizSet.type === 'memorization' ? '覚えた数' : '正解数';
    const negativeSummaryLabel = activeQuizSet.type === 'memorization' ? '覚えていない数' : '誤り数';

    return (
        <main className="content-area history-table-page">
            <div className="detail-header history-table-header">
                <BackButton className="nav-btn" onClick={handleBack} />
                <h1>
                    <Table2 size={22} />
                    回答履歴テーブル
                </h1>
            </div>

            <p className="history-table-subtitle">{activeQuizSet.name} の回答履歴を一覧で確認できます。</p>

            {errorMessage ? (
                <div className="history-table-error">
                    <p>{errorMessage}</p>
                    <button className="nav-btn" onClick={() => void loadData()}>
                        <RefreshCw size={16} /> 再読み込み
                    </button>
                </div>
            ) : attemptColumns.length === 0 ? (
                <div className="empty-history">
                    <p>まだ履歴がありません</p>
                </div>
            ) : sortedQuestions.length === 0 ? (
                <div className="empty-history">
                    <p>問題が見つかりませんでした</p>
                </div>
            ) : (
                <>
                    <div className="history-table-meta">
                        <span>問題数: {sortedQuestions.length}</span>
                        <span>回答履歴: {attemptColumns.length}回</span>
                        <span>セル色: 緑=正解 / 赤=不正解</span>
                    </div>
                    <div className="table-wrapper history-table-wrapper">
                        <table className="question-table history-table-grid">
                            <thead>
                                <tr>
                                    <th>番号</th>
                                    <th>問題文</th>
                                    {attemptColumns.map((column) => (
                                        <th key={`attempt-${column.attemptNumber}`} className="history-attempt-header">{column.attemptNumber}回目</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedQuestions.map((question, rowIndex) => (
                                    <tr
                                        key={question.id ?? `question-${rowIndex}`}
                                        className="table-row history-question-row"
                                        onClick={() => setSelectedQuestion({ question, questionNumber: rowIndex + 1 })}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                setSelectedQuestion({ question, questionNumber: rowIndex + 1 });
                                            }
                                        }}
                                    >
                                        <td className="history-question-number">{rowIndex + 1}</td>
                                        <td className="history-question-text">
                                            <MarkdownText content={question.text} className="table-markdown" />
                                        </td>
                                        {attemptColumns.map((column) => {
                                            const status = question.id !== undefined
                                                ? column.statusMap.get(question.id)
                                                : undefined;
                                            const statusClass = status === 'correct'
                                                ? 'is-correct'
                                                : status === 'incorrect'
                                                    ? 'is-incorrect'
                                                    : 'is-empty';

                                            return (
                                                <td
                                                    key={`attempt-cell-${column.attemptNumber}-${question.id ?? rowIndex}`}
                                                    className={`history-answer-cell ${statusClass}`}
                                                >
                                                    {status ? column.dateLabel : '-'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                <tr className="history-summary-row">
                                    <td className="history-question-number history-summary-label">-</td>
                                    <td className="history-question-text history-summary-title">{positiveSummaryLabel}</td>
                                    {historyAttemptSummaries.map((summary, columnIndex) => (
                                        <td key={`summary-correct-${columnIndex}`} className="history-answer-cell history-summary-cell">
                                            {summary.correctCount}
                                        </td>
                                    ))}
                                </tr>
                                <tr className="history-summary-row">
                                    <td className="history-question-number history-summary-label">-</td>
                                    <td className="history-question-text history-summary-title">{negativeSummaryLabel}</td>
                                    {historyAttemptSummaries.map((summary, columnIndex) => (
                                        <td key={`summary-incorrect-${columnIndex}`} className="history-answer-cell history-summary-cell">
                                            {summary.incorrectCount}
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {selectedQuestion && (
                <div className="modal-overlay" onClick={() => setSelectedQuestion(null)}>
                    <div className="modal-content history-question-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h3>問題 {selectedQuestion.questionNumber}</h3>
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setSelectedQuestion(null)}
                                aria-label="モーダルを閉じる"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body history-question-modal-body">
                            <section className="history-modal-section">
                                <h4>問題文</h4>
                                <div className="history-modal-markdown">
                                    <MarkdownText content={selectedQuestion.question.text} />
                                </div>
                            </section>

                            <section className="history-modal-section">
                                <h4>{answerSectionTitle}</h4>
                                <ol className="history-modal-options">
                                    {selectedQuestion.question.options.map((option, index) => {
                                        const isCorrect = selectedQuestion.question.correctAnswers.includes(index);
                                        return (
                                            <li
                                                key={`modal-option-${selectedQuestion.question.id ?? selectedQuestion.questionNumber}-${index}`}
                                                className={`history-modal-option-item ${isCorrect ? 'correct' : ''}`}
                                            >
                                                <span className="history-modal-option-index">{index + 1}.</span>
                                                <div className="history-modal-option-text">
                                                    <MarkdownText content={option} />
                                                </div>
                                                {isCorrect && <span className="history-modal-correct-badge">正解</span>}
                                            </li>
                                        );
                                    })}
                                </ol>
                            </section>

                            <section className="history-modal-section">
                                <h4>解説</h4>
                                <div className="history-modal-markdown">
                                    {selectedQuestion.question.explanation ? (
                                        <MarkdownText content={selectedQuestion.question.explanation.replace(/\\n/g, '\n')} />
                                    ) : (
                                        <p className="history-modal-empty">解説はありません</p>
                                    )}
                                </div>
                            </section>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="nav-btn" onClick={() => setSelectedQuestion(null)}>
                                閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
};
