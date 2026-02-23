import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Table2 } from 'lucide-react';
import { getHistories, getQuestionsForQuizSet } from '../db';
import type { Question, QuizHistory } from '../types';
import { LoadingView } from '../components/LoadingView';
import { NotFoundView } from '../components/NotFoundView';
import { MarkdownText } from '../components/MarkdownText';
import { useAppContext } from '../contexts/AppContext';
import { useActiveQuizSetFromRoute } from '../hooks/useActiveQuizSetFromRoute';

type CellStatus = 'correct' | 'incorrect';

function formatMonthDay(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

export const HistoryTableRoute: React.FC = () => {
    const navigate = useNavigate();
    const { loadQuizSets, handleCloudError } = useAppContext();
    const { quizSetId, activeQuizSet, quizSetsCount } = useActiveQuizSetFromRoute();
    const [questions, setQuestions] = useState<Question[]>([]);
    const [histories, setHistories] = useState<QuizHistory[]>([]);
    const [isLoadingQuizSet, setIsLoadingQuizSet] = useState(() => quizSetsCount === 0);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

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
            const [loadedQuestions, loadedHistories] = await Promise.all([
                getQuestionsForQuizSet(quizSetId),
                getHistories(quizSetId),
            ]);

            setQuestions(loadedQuestions);
            setHistories(loadedHistories);
        } catch (error) {
            console.error('回答履歴テーブルの読み込みに失敗しました:', error);
            handleCloudError(error, '回答履歴の読み込みに失敗しました。');
            setErrorMessage('回答履歴の読み込みに失敗しました。時間をおいて再試行してください。');
            setQuestions([]);
            setHistories([]);
        } finally {
            setIsLoadingData(false);
        }
    }, [quizSetId, handleCloudError]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

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

    const historyColumns = useMemo(() => {
        return sortedHistories.map((history, index) => ({
            history,
            attemptNumber: index + 1,
            dateLabel: formatMonthDay(history.date),
        }));
    }, [sortedHistories]);

    const historyStatusMaps = useMemo(() => {
        return historyColumns.map(({ history }) => {
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

            sortedQuestions.forEach((question) => {
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
        });
    }, [historyColumns, sortedQuestions]);

    if (isLoadingQuizSet || isLoadingData) {
        return <LoadingView fullPage message="回答履歴を読み込み中..." />;
    }

    if (!activeQuizSet || quizSetId === undefined) {
        return <NotFoundView message="問題集が見つかりませんでした。または読み込み中です..." />;
    }

    const handleBack = () => {
        navigate(`/quiz/${quizSetId}`);
    };

    return (
        <main className="content-area history-table-page">
            <div className="detail-header history-table-header">
                <button className="nav-btn" onClick={handleBack}>
                    <ArrowLeft size={16} /> 戻る
                </button>
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
            ) : historyColumns.length === 0 ? (
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
                        <span>回答履歴: {historyColumns.length}回</span>
                        <span>セル色: 緑=正解 / 赤=不正解</span>
                    </div>
                    <div className="history-table-wrapper">
                        <table className="history-table-grid">
                            <thead>
                                <tr>
                                    <th>問題番号</th>
                                    <th>問題文</th>
                                    {historyColumns.map((column) => (
                                        <th key={`attempt-${column.attemptNumber}`}>回答{column.attemptNumber}回目</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedQuestions.map((question, rowIndex) => (
                                    <tr key={question.id ?? `question-${rowIndex}`}>
                                        <td className="history-question-number">{rowIndex + 1}</td>
                                        <td className="history-question-text">
                                            <MarkdownText content={question.text} className="table-markdown" />
                                        </td>
                                        {historyColumns.map((column, columnIndex) => {
                                            const status = question.id !== undefined
                                                ? historyStatusMaps[columnIndex].get(question.id)
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
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </main>
    );
};
