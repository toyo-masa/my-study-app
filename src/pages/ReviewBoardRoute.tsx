import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    BookOpen,
    Brain,
    CalendarCheck2,
    CircleHelp,
    PlayCircle,
    RefreshCw,
} from 'lucide-react';
import type { Question, QuizSetType, ReviewSchedule } from '../types';
import { getDueReviews, getQuizSetsWithCounts, getTodayString } from '../db';
import { LoadingView } from '../components/LoadingView';
import { useAppContext } from '../contexts/AppContext';
import { loadReviewIntervalSettings } from '../utils/spacedRepetition';
import '../App.css';

type DueReviewItem = ReviewSchedule & { question?: Question };
type ReviewSetTypeFilter = 'all' | QuizSetType;
type ReviewBoardErrorType = 'none' | 'auth' | 'network' | 'unknown';

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
    const { handleCloudError, setIsLoginModalOpen } = useAppContext();
    const [dueReviews, setDueReviews] = useState<DueReviewItem[]>([]);
    const [quizSetMetaById, setQuizSetMetaById] = useState<Record<number, QuizSetMeta>>({});
    const [typeFilter, setTypeFilter] = useState<ReviewSetTypeFilter>('all');
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [errorType, setErrorType] = useState<ReviewBoardErrorType>('none');
    const today = getTodayString();
    const reviewIntervalSettings = loadReviewIntervalSettings();
    const exampleBaseDays = 4;
    const exampleCorrectDays = Math.max(1, Math.round(exampleBaseDays * reviewIntervalSettings.correctMultiplier));

    const loadData = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        setErrorType('none');

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
            const message = error instanceof Error ? error.message : '';
            if (message === 'UNAUTHORIZED') {
                setErrorType('auth');
                setErrorMessage('ログイン状態の有効期限が切れました。再ログインしてください。');
                handleCloudError(error, '認証エラーが発生しました。');
            } else if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
                setErrorType('network');
                setErrorMessage('復習データの取得に失敗しました。ネットワーク接続を確認して再試行してください。');
            } else {
                setErrorType('unknown');
                setErrorMessage('復習データの取得に失敗しました。時間をおいて再試行してください。');
            }
        } finally {
            setLoading(false);
        }
    }, [handleCloudError]);

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

    const pendingSetSummaries = useMemo(
        () => buildSetSummaries(dueReviews),
        [buildSetSummaries, dueReviews]
    );

    const totalTodayQuestions = useMemo(
        () => todaySetSummaries.reduce((sum, summary) => sum + summary.dueCount, 0),
        [todaySetSummaries]
    );

    const totalPendingQuestions = useMemo(
        () => pendingSetSummaries.reduce((sum, summary) => sum + summary.dueCount, 0),
        [pendingSetSummaries]
    );

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

    const renderSetCard = (summary: ReviewSetSummary) => (
        <button
            key={`today-${summary.quizSetId}`}
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
                <span className="review-board-pill">今日分 {summary.dueCount}問</span>
                <span className="review-board-pill">予定日 今日</span>
            </div>

            <div className="review-board-set-categories">
                {summary.categories.map(category => (
                    <span key={`today-${summary.quizSetId}-${category}`} className="review-board-set-category">
                        {category}
                    </span>
                ))}
            </div>

            <div className="review-board-set-action">
                <PlayCircle size={17} />
                今日分を復習
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

            <p className="review-board-subtitle">今日、復習予定になっている問題集・暗記カードを表示します。</p>

            {loading ? (
                <LoadingView message="復習データを読み込み中..." />
            ) : errorMessage ? (
                <div className="review-board-empty">
                    <p>{errorMessage}</p>
                    {errorType === 'auth' && (
                        <button className="nav-btn" onClick={() => setIsLoginModalOpen(true)}>
                            ログインする
                        </button>
                    )}
                    <button className="nav-btn" onClick={() => void loadData()}>
                        <RefreshCw size={16} /> 再読み込み
                    </button>
                </div>
            ) : (
                <>
                    <div className="review-board-stats">
                        <div className="review-board-stat-card">
                            <span className="review-board-stat-label">今日に復習する問題数</span>
                            <strong className="review-board-stat-value">{totalTodayQuestions}</strong>
                        </div>
                        <div className="review-board-stat-card">
                            <span className="review-board-stat-label">今日の対象セット数</span>
                            <strong className="review-board-stat-value">{todaySetSummaries.length}</strong>
                        </div>
                        <div className="review-board-stat-card">
                            <span className="review-board-stat-label">復習対象合計</span>
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
                                <div className="review-board-column-title-wrap">
                                    <h2 className="review-board-column-title">今日復習すべきもの</h2>
                                    <details className="review-board-help">
                                        <summary className="help-icon-btn review-board-help-btn" aria-label="今日復習すべきものの選定ルール">
                                            <CircleHelp size={13} />
                                        </summary>
                                        <div className="help-popover review-board-help-popover">
                                            <div className="help-popover-header">
                                                <h4>選定ルール</h4>
                                            </div>
                                            <div className="help-popover-body">
                                                <ul className="review-board-help-list">
                                                    <li>各問題には「次に復習する予定日」があり、その予定日が今日のものを表示します。</li>
                                                    <li>この予定日は問題を解くたびに更新され、初回は基準日数1日から始まります。</li>
                                                    <li>正解したとき: 基準日数に {reviewIntervalSettings.correctMultiplier} を掛けて四捨五入します。</li>
                                                    <li>不正解・自信なしのとき: 常に {reviewIntervalSettings.retryIntervalDays} 日を採用します。</li>
                                                    <li>採用された日数が、次に解いたときの基準日数になります。</li>
                                                    <li>例: 基準日数が {exampleBaseDays} 日なら、正解時は {exampleCorrectDays} 日、不正解・自信なし時は {reviewIntervalSettings.retryIntervalDays} 日です。</li>
                                                    <li>画面上部の種別フィルタ（すべて/問題集/暗記カード）が適用されます。</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </details>
                                </div>
                                <span className="review-board-column-count">{todaySetSummaries.length}セット / {totalTodayQuestions}問</span>
                            </div>
                            {todaySetSummaries.length === 0 ? (
                                <div className="review-board-empty review-board-column-empty">
                                    <p>今日復習すべきものはありません。</p>
                                </div>
                            ) : (
                                <div className="review-board-column-grid">
                                    {todaySetSummaries.map((summary) => renderSetCard(summary))}
                                </div>
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};
