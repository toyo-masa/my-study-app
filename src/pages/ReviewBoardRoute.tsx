import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    BookOpen,
    Brain,
    CalendarCheck2,
    PlayCircle,
    RefreshCw,
} from 'lucide-react';
import type { Question, QuizSetType, ReviewSchedule } from '../types';
import { getDueReviews, getQuizSetsWithCounts, getTodayString } from '../db';
import { LoadingView } from '../components/LoadingView';
import '../App.css';

type DueReviewItem = ReviewSchedule & { question?: Question };
type ReviewSetTypeFilter = 'all' | QuizSetType;

interface QuizSetMeta {
    name: string;
    type: QuizSetType;
}

interface ReviewSetSummary {
    quizSetId: number;
    name: string;
    type: QuizSetType;
    dueCount: number;
    earliestDue: string;
    categories: string[];
    reviewQuestionIds: number[];
}

export const ReviewBoardRoute: React.FC = () => {
    const navigate = useNavigate();
    const [dueReviews, setDueReviews] = useState<DueReviewItem[]>([]);
    const [quizSetMetaById, setQuizSetMetaById] = useState<Record<number, QuizSetMeta>>({});
    const [typeFilter, setTypeFilter] = useState<ReviewSetTypeFilter>('all');
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const today = getTodayString();

    const loadData = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');

        try {
            const [reviews, quizSets] = await Promise.all([
                getDueReviews(),
                getQuizSetsWithCounts(),
            ]);

            const nextMetaById: Record<number, QuizSetMeta> = {};
            for (const quizSet of quizSets) {
                if (quizSet.id !== undefined) {
                    nextMetaById[quizSet.id] = {
                        name: quizSet.name,
                        type: quizSet.type === 'memorization' ? 'memorization' : 'quiz',
                    };
                }
            }

            setDueReviews(reviews);
            setQuizSetMetaById(nextMetaById);
        } catch (error) {
            console.error('復習ボードの読み込みに失敗しました:', error);
            setErrorMessage('復習データの取得に失敗しました。時間をおいて再試行してください。');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const buildSetSummaries = useCallback((reviews: DueReviewItem[]): ReviewSetSummary[] => {
        const grouped = new Map<number, {
            quizSetId: number;
            name: string;
            type: QuizSetType;
            dueCount: number;
            earliestDue: string;
            categorySet: Set<string>;
            questionIdSet: Set<number>;
        }>();

        for (const review of reviews) {
            const setMeta = quizSetMetaById[review.quizSetId];
            if (!setMeta) {
                continue;
            }

            const setType: QuizSetType = setMeta.type;

            if (typeFilter !== 'all' && setType !== typeFilter) {
                continue;
            }

            const current = grouped.get(review.quizSetId);
            if (!current) {
                grouped.set(review.quizSetId, {
                    quizSetId: review.quizSetId,
                    name: setMeta.name,
                    type: setType,
                    dueCount: 1,
                    earliestDue: review.nextDue,
                    categorySet: new Set([review.question?.category || 'General']),
                    questionIdSet: new Set([review.questionId]),
                });
                continue;
            }

            current.dueCount += 1;
            if (review.nextDue < current.earliestDue) {
                current.earliestDue = review.nextDue;
            }
            current.categorySet.add(review.question?.category || 'General');
            current.questionIdSet.add(review.questionId);
        }

        return [...grouped.values()]
            .map((group): ReviewSetSummary => ({
                quizSetId: group.quizSetId,
                name: group.name,
                type: group.type,
                dueCount: group.dueCount,
                earliestDue: group.earliestDue,
                categories: [...group.categorySet].sort((a, b) => a.localeCompare(b, 'ja')),
                reviewQuestionIds: [...group.questionIdSet],
            }))
            .sort((a, b) => {
                if (b.dueCount !== a.dueCount) return b.dueCount - a.dueCount;
                const dateCmp = a.earliestDue.localeCompare(b.earliestDue);
                if (dateCmp !== 0) return dateCmp;
                return a.name.localeCompare(b.name, 'ja');
            });
    }, [quizSetMetaById, typeFilter]);

    const todaySetSummaries = useMemo(
        () => buildSetSummaries(dueReviews.filter(review => review.nextDue === today)),
        [buildSetSummaries, dueReviews, today]
    );

    const overdueSetSummaries = useMemo(
        () => buildSetSummaries(dueReviews.filter(review => review.nextDue < today)),
        [buildSetSummaries, dueReviews, today]
    );

    const totalTodayQuestions = useMemo(
        () => todaySetSummaries.reduce((sum, summary) => sum + summary.dueCount, 0),
        [todaySetSummaries]
    );

    const totalOverdueQuestions = useMemo(
        () => overdueSetSummaries.reduce((sum, summary) => sum + summary.dueCount, 0),
        [overdueSetSummaries]
    );

    const totalPendingQuestions = totalTodayQuestions + totalOverdueQuestions;

    const openReviewSession = (summary: ReviewSetSummary) => {
        if (summary.reviewQuestionIds.length === 0) {
            return;
        }

        const navigationState = {
            startNew: true,
            reviewQuestionIds: summary.reviewQuestionIds,
            fromReviewBoard: true,
        };

        if (summary.type === 'memorization') {
            navigate(`/quiz/${summary.quizSetId}/memorization`, { state: navigationState });
            return;
        }
        navigate(`/quiz/${summary.quizSetId}/study`, { state: navigationState });
    };

    const renderSetCard = (summary: ReviewSetSummary, kind: 'today' | 'overdue') => (
        <button
            key={`${kind}-${summary.quizSetId}`}
            type="button"
            className="review-board-set-card"
            onClick={() => openReviewSession(summary)}
        >
            <div className="review-board-set-head">
                <div className="review-board-set-title-wrap">
                    <span className="review-board-set-icon">
                        {summary.type === 'memorization' ? <Brain size={20} /> : <BookOpen size={20} />}
                    </span>
                    <span className="review-board-set-title">{summary.name}</span>
                </div>
                <span className={`review-board-set-type ${summary.type}`}>
                    {summary.type === 'memorization' ? '暗記カード' : '問題集'}
                </span>
            </div>

            <div className="review-board-set-meta">
                {kind === 'today' ? (
                    <span className="review-board-pill">今日分 {summary.dueCount}問</span>
                ) : (
                    <span className="review-board-pill danger">未復習 {summary.dueCount}問</span>
                )}
                <span className="review-board-pill">
                    {kind === 'today' ? '期限 今日' : `最古の期限 ${summary.earliestDue}`}
                </span>
            </div>

            <div className="review-board-set-categories">
                {summary.categories.map(category => (
                    <span key={`${kind}-${summary.quizSetId}-${category}`} className="review-board-set-category">
                        {category}
                    </span>
                ))}
            </div>

            <div className="review-board-set-action">
                <PlayCircle size={17} />
                {kind === 'today' ? '今日分を復習' : '未復習を復習'}
            </div>
        </button>
    );

    return (
        <div className="review-board-page">
            <div className="detail-header review-board-header">
                <button className="nav-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={16} /> 戻る
                </button>
                <h1 className="review-board-title">
                    <CalendarCheck2 size={24} />
                    復習ボード（試作）
                </h1>
            </div>

            <p className="review-board-subtitle">
                復習ボードを「今日復習すべきもの」と「まだ復習していないもの（昨日以前）」に分けて表示します。Webでは横並びで比較できます。
            </p>

            {loading ? (
                <LoadingView message="復習データを読み込み中..." />
            ) : errorMessage ? (
                <div className="review-board-empty">
                    <p>{errorMessage}</p>
                    <button className="nav-btn" onClick={() => void loadData()}>
                        <RefreshCw size={16} /> 再読み込み
                    </button>
                </div>
            ) : (
                <>
                    <div className="review-board-stats">
                        <div className="review-board-stat-card">
                            <span className="review-board-stat-label">今日の復習問題</span>
                            <strong className="review-board-stat-value">{totalTodayQuestions}</strong>
                        </div>
                        <div className="review-board-stat-card">
                            <span className="review-board-stat-label">未復習問題（昨日以前）</span>
                            <strong className="review-board-stat-value error">{totalOverdueQuestions}</strong>
                        </div>
                        <div className="review-board-stat-card">
                            <span className="review-board-stat-label">未消化 合計</span>
                            <strong className="review-board-stat-value">{totalPendingQuestions}</strong>
                        </div>
                    </div>

                    <div className="review-board-toolbar">
                        <div className="review-board-filter-chips">
                            <button
                                className={`review-board-filter-chip ${typeFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setTypeFilter('all')}
                            >
                                すべて
                            </button>
                            <button
                                className={`review-board-filter-chip ${typeFilter === 'quiz' ? 'active' : ''}`}
                                onClick={() => setTypeFilter('quiz')}
                            >
                                問題集
                            </button>
                            <button
                                className={`review-board-filter-chip ${typeFilter === 'memorization' ? 'active' : ''}`}
                                onClick={() => setTypeFilter('memorization')}
                            >
                                暗記カード
                            </button>
                        </div>
                        <div className="review-board-toolbar-right">
                            <button className="nav-btn" onClick={() => void loadData()}>
                                <RefreshCw size={16} /> 更新
                            </button>
                        </div>
                    </div>

                    <section className="review-board-columns">
                        <div className="review-board-column">
                            <div className="review-board-column-head">
                                <h2 className="review-board-column-title">今日復習すべきもの</h2>
                                <span className="review-board-column-count">{todaySetSummaries.length}セット / {totalTodayQuestions}問</span>
                            </div>
                            {todaySetSummaries.length === 0 ? (
                                <div className="review-board-empty review-board-column-empty">
                                    <p>今日復習すべきものはありません。</p>
                                </div>
                            ) : (
                                <div className="review-board-column-grid">
                                    {todaySetSummaries.map((summary) => renderSetCard(summary, 'today'))}
                                </div>
                            )}
                        </div>

                        <div className="review-board-column">
                            <div className="review-board-column-head">
                                <h2 className="review-board-column-title">まだ復習していないもの</h2>
                                <span className="review-board-column-count">{overdueSetSummaries.length}セット / {totalOverdueQuestions}問</span>
                            </div>
                            {overdueSetSummaries.length === 0 ? (
                                <div className="review-board-empty review-board-column-empty">
                                    <p>まだ復習していないものはありません。</p>
                                </div>
                            ) : (
                                <div className="review-board-column-grid">
                                    {overdueSetSummaries.map((summary) => renderSetCard(summary, 'overdue'))}
                                </div>
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};
