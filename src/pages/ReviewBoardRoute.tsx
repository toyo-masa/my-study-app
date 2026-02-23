import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
    getAllReviewSchedules,
    getDueReviews,
    getQuestionsForQuizSet,
    getQuizSetsWithCounts,
    getTodayString,
    updateQuizSet,
} from '../db';
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
    isReviewExcluded: boolean;
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

interface UpcomingScheduleRow {
    quizSetId: number;
    quizSetName: string;
    questionId: number;
    questionNumber: number;
    questionText: string;
    nextDue: string;
}

interface CalendarColumn {
    key: string;
    label: string;
    weekday: string;
}

function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function toLocalDateStringFromIso(iso?: string): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return toLocalDateString(date);
}

function parseLocalDate(dateString: string): Date | null {
    const parts = dateString.split('-').map(Number);
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    return new Date(year, month - 1, day);
}

function buildCalendarLabel(dateString: string): CalendarColumn {
    const date = parseLocalDate(dateString);
    if (!date || Number.isNaN(date.getTime())) {
        return { key: dateString, label: dateString, weekday: '' };
    }
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return {
        key: dateString,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        weekday: weekdays[date.getDay()],
    };
}

export const ReviewBoardRoute: React.FC = () => {
    const navigate = useNavigate();
    const { handleCloudError, setIsLoginModalOpen } = useAppContext();
    const [dueReviews, setDueReviews] = useState<DueReviewItem[]>([]);
    const [allReviewSchedules, setAllReviewSchedules] = useState<ReviewSchedule[]>([]);
    const [quizSetMetaById, setQuizSetMetaById] = useState<Record<number, QuizSetMeta>>({});
    const [questionById, setQuestionById] = useState<Record<number, Question>>({});
    const [questionNumberById, setQuestionNumberById] = useState<Record<number, number>>({});
    const [typeFilter, setTypeFilter] = useState<ReviewSetTypeFilter>('all');
    const [futureSetFilter, setFutureSetFilter] = useState<string>('all');
    const [togglingSetIds, setTogglingSetIds] = useState<Set<number>>(new Set());
    const [targetToggleNotice, setTargetToggleNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const targetToggleNoticeTimeoutRef = useRef<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [errorType, setErrorType] = useState<ReviewBoardErrorType>('none');
    const today = getTodayString();
    const reviewIntervalSettings = loadReviewIntervalSettings();
    const exampleBaseDays = 4;
    const exampleCorrectDays = Math.max(1, Math.round(exampleBaseDays * reviewIntervalSettings.correctMultiplier));

    const loadData = useCallback(async (options?: { silent?: boolean }) => {
        const shouldShowLoading = !options?.silent;
        if (shouldShowLoading) {
            setLoading(true);
        }
        setErrorMessage('');
        setErrorType('none');

        try {
            const [reviews, quizSets, schedules] = await Promise.all([
                getDueReviews(),
                getQuizSetsWithCounts(),
                getAllReviewSchedules(),
            ]);

            const nextMetaById: Record<number, QuizSetMeta> = {};
            for (const quizSet of quizSets) {
                if (quizSet.id !== undefined) {
                    nextMetaById[quizSet.id] = {
                        name: quizSet.name,
                        type: quizSet.type === 'memorization' ? 'memorization' : 'quiz',
                        isReviewExcluded: !!quizSet.isReviewExcluded,
                    };
                }
            }

            const targetQuizSetIds = [...new Set(schedules.map(schedule => schedule.quizSetId))]
                .filter((quizSetId) => nextMetaById[quizSetId] !== undefined);
            const questionLists = await Promise.all(
                targetQuizSetIds.map(async (quizSetId) => ({
                    quizSetId,
                    questions: await getQuestionsForQuizSet(quizSetId),
                }))
            );
            const nextQuestionById: Record<number, Question> = {};
            const nextQuestionNumberById: Record<number, number> = {};
            for (const { questions } of questionLists) {
                const sortedQuestions = [...questions].sort((a, b) => {
                    const aId = a.id ?? 0;
                    const bId = b.id ?? 0;
                    return aId - bId;
                });
                for (const [index, question] of sortedQuestions.entries()) {
                    if (question.id !== undefined) {
                        nextQuestionById[question.id] = question;
                        nextQuestionNumberById[question.id] = index + 1;
                    }
                }
            }

            setDueReviews(reviews);
            setAllReviewSchedules(schedules);
            setQuizSetMetaById(nextMetaById);
            setQuestionById(nextQuestionById);
            setQuestionNumberById(nextQuestionNumberById);
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
            if (shouldShowLoading) {
                setLoading(false);
            }
        }
    }, [handleCloudError]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        return () => {
            if (targetToggleNoticeTimeoutRef.current !== null) {
                window.clearTimeout(targetToggleNoticeTimeoutRef.current);
                targetToggleNoticeTimeoutRef.current = null;
            }
        };
    }, []);

    const showTargetToggleNotice = useCallback((text: string, type: 'success' | 'error' = 'success') => {
        if (targetToggleNoticeTimeoutRef.current !== null) {
            window.clearTimeout(targetToggleNoticeTimeoutRef.current);
            targetToggleNoticeTimeoutRef.current = null;
        }
        setTargetToggleNotice({ text, type });
        targetToggleNoticeTimeoutRef.current = window.setTimeout(() => {
            setTargetToggleNotice(null);
            targetToggleNoticeTimeoutRef.current = null;
        }, 3000);
    }, []);

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
    }, [quizSetMetaById]);

    const filteredTodayReviews = useMemo(
        () => dueReviews.filter((review) => {
            if (review.nextDue !== today) return false;
            if (typeFilter === 'all') return true;
            return quizSetMetaById[review.quizSetId]?.type === typeFilter;
        }),
        [dueReviews, today, typeFilter, quizSetMetaById]
    );

    const todaySetSummaries = useMemo(
        () => buildSetSummaries(filteredTodayReviews),
        [buildSetSummaries, filteredTodayReviews]
    );

    const activeSchedules = useMemo(
        () => allReviewSchedules.filter(schedule => {
            const setMeta = quizSetMetaById[schedule.quizSetId];
            if (!setMeta) return false;
            return true;
        }),
        [allReviewSchedules, quizSetMetaById]
    );

    const totalTodayUnreviewedQuestions = useMemo(
        () => activeSchedules.filter(schedule => schedule.nextDue === today).length,
        [activeSchedules, today]
    );

    const totalOverdueUnreviewedQuestions = useMemo(
        () => activeSchedules.filter(schedule => schedule.nextDue < today).length,
        [activeSchedules, today]
    );

    const totalReviewedTodayQuestions = useMemo(
        () => activeSchedules.filter(schedule => {
            const reviewedDate = toLocalDateStringFromIso(schedule.lastReviewedAt);
            return reviewedDate === today && schedule.nextDue > today;
        }).length,
        [activeSchedules, today]
    );

    const nextWeekDateKeys = useMemo(() => {
        const startDate = parseLocalDate(today) ?? new Date();
        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + index + 1);
            return toLocalDateString(date);
        });
    }, [today]);

    const nextWeekLastDateKey = nextWeekDateKeys[nextWeekDateKeys.length - 1] ?? today;

    const futureSetOptions = useMemo(() => {
        const setNameById = new Map<number, string>();
        for (const schedule of activeSchedules) {
            if (schedule.nextDue <= today || schedule.nextDue > nextWeekLastDateKey) continue;
            const setName = quizSetMetaById[schedule.quizSetId]?.name;
            if (!setName) continue;
            if (!setNameById.has(schedule.quizSetId)) {
                setNameById.set(schedule.quizSetId, setName);
            }
        }
        return [...setNameById.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }, [activeSchedules, quizSetMetaById, today, nextWeekLastDateKey]);

    useEffect(() => {
        if (futureSetFilter === 'all') return;
        const exists = futureSetOptions.some((option) => String(option.id) === futureSetFilter);
        if (!exists) {
            setFutureSetFilter('all');
        }
    }, [futureSetFilter, futureSetOptions]);

    const upcomingScheduleRows = useMemo<UpcomingScheduleRow[]>(
        () => activeSchedules
            .filter((schedule) => schedule.nextDue > today && schedule.nextDue <= nextWeekLastDateKey)
            .map((schedule) => {
                const question = questionById[schedule.questionId];
                const quizSetName = quizSetMetaById[schedule.quizSetId]?.name || `セット #${schedule.quizSetId}`;
                const questionNumber = questionNumberById[schedule.questionId] ?? schedule.questionId;
                return {
                    quizSetId: schedule.quizSetId,
                    quizSetName,
                    questionId: schedule.questionId,
                    questionNumber,
                    questionText: question?.text || '(問題文を取得できませんでした)',
                    nextDue: schedule.nextDue,
                };
            })
            .filter((row) => futureSetFilter === 'all' || String(row.quizSetId) === futureSetFilter)
            .sort((a, b) => {
                const dateCmp = a.nextDue.localeCompare(b.nextDue);
                if (dateCmp !== 0) return dateCmp;
                const setCmp = a.quizSetName.localeCompare(b.quizSetName, 'ja');
                if (setCmp !== 0) return setCmp;
                return a.questionNumber - b.questionNumber;
            }),
        [activeSchedules, questionById, questionNumberById, quizSetMetaById, today, nextWeekLastDateKey, futureSetFilter]
    );

    const calendarColumns = useMemo<CalendarColumn[]>(
        () => nextWeekDateKeys.map(buildCalendarLabel),
        [nextWeekDateKeys]
    );

    const reviewTargetSets = useMemo(() => {
        const allSets = Object.entries(quizSetMetaById)
            .map(([id, meta]) => ({
                id: Number(id),
                ...meta,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

        return {
            included: allSets.filter((set) => !set.isReviewExcluded),
            excluded: allSets.filter((set) => set.isReviewExcluded),
        };
    }, [quizSetMetaById]);

    const handleToggleReviewTarget = useCallback(async (quizSetId: number) => {
        const targetSet = quizSetMetaById[quizSetId];
        if (!targetSet) return;

        const targetSetName = targetSet.name;
        const previousExcluded = targetSet.isReviewExcluded;
        const nextExcluded = !previousExcluded;

        setTogglingSetIds((prev) => {
            const next = new Set(prev);
            next.add(quizSetId);
            return next;
        });
        setQuizSetMetaById((prev) => {
            const current = prev[quizSetId];
            if (!current) return prev;
            return {
                ...prev,
                [quizSetId]: {
                    ...current,
                    isReviewExcluded: nextExcluded,
                },
            };
        });

        try {
            await updateQuizSet(quizSetId, { isReviewExcluded: nextExcluded });
            await loadData({ silent: true });
            showTargetToggleNotice(
                nextExcluded
                    ? `「${targetSetName}」を復習対象外にしました。`
                    : `「${targetSetName}」を復習対象に戻しました。`,
                'success'
            );
        } catch (error) {
            setQuizSetMetaById((prev) => {
                const current = prev[quizSetId];
                if (!current) return prev;
                return {
                    ...prev,
                    [quizSetId]: {
                        ...current,
                        isReviewExcluded: previousExcluded,
                    },
                };
            });
            showTargetToggleNotice('復習設定の更新に失敗しました。', 'error');
            handleCloudError(error, '復習設定の更新に失敗しました。');
        } finally {
            setTogglingSetIds((prev) => {
                const next = new Set(prev);
                next.delete(quizSetId);
                return next;
            });
        }
    }, [quizSetMetaById, loadData, handleCloudError, showTargetToggleNotice]);

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

            <div className="review-board-subtitle-row">
                <p className="review-board-subtitle">今日、復習予定になっている問題集・暗記カードを表示します。</p>
                {!loading && !errorMessage && (
                    <button className="nav-btn review-board-refresh-btn" onClick={() => void loadData()}>
                        <RefreshCw size={16} /> 更新
                    </button>
                )}
            </div>

            {targetToggleNotice && (
                <div className={`session-inline-notice review-board-toggle-notice ${targetToggleNotice.type === 'success' ? 'is-success' : 'is-error'}`}>
                    {targetToggleNotice.text}
                </div>
            )}

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
                            <span className="review-board-stat-label">今日の未復習問題数</span>
                            <strong className="review-board-stat-value">{totalTodayUnreviewedQuestions}</strong>
                        </div>
                        <div className="review-board-stat-card">
                            <span className="review-board-stat-label">今日の復習済み問題数</span>
                            <strong className="review-board-stat-value">{totalReviewedTodayQuestions}</strong>
                        </div>
                        <div className="review-board-stat-card">
                            <span className="review-board-stat-label">期限切れ未復習の問題数</span>
                            <strong className="review-board-stat-value">{totalOverdueUnreviewedQuestions}</strong>
                        </div>
                    </div>

                    <section className="review-board-columns">
                        <div className="review-board-column">
                            <div className="review-board-column-head">
                                <div className="review-board-column-title-wrap">
                                    <h2 className="review-board-column-title">今日復習すべき問題</h2>
                                    <details className="review-board-help">
                                        <summary className="help-icon-btn review-board-help-btn" aria-label="今日復習すべき問題の選定ルール">
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
                                                    <li>見出し右側の種別フィルタ（すべて/問題集/暗記カード）は、この一覧だけに適用されます。</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </details>
                                    <div className="review-board-filter-chips review-board-filter-chips-inline">
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
                                </div>
                                <span className="review-board-column-count">{todaySetSummaries.length}セット / {filteredTodayReviews.length}問</span>
                            </div>
                            {todaySetSummaries.length === 0 ? (
                                <div className="review-board-empty review-board-column-empty">
                                    <p>今日復習すべき問題はありません。</p>
                                </div>
                            ) : (
                                <div className="review-board-column-grid">
                                    {todaySetSummaries.map((summary) => renderSetCard(summary))}
                                </div>
                            )}
                        </div>

                        <div className="review-board-column">
                            <div className="review-board-column-head">
                                <div className="review-board-column-title-wrap">
                                    <h2 className="review-board-column-title">今後の復習予定</h2>
                                </div>
                                <div className="review-board-column-head-controls">
                                    <span className="review-board-future-legend" role="note" aria-label="凡例">
                                        <span className="review-board-future-legend-dot" aria-hidden="true">●</span>
                                        復習予定日
                                    </span>
                                    <select
                                        className="review-board-future-set-filter"
                                        value={futureSetFilter}
                                        onChange={(event) => setFutureSetFilter(event.target.value)}
                                        aria-label="今後の復習予定のセットフィルタ"
                                    >
                                        <option value="all">すべてのセット</option>
                                        {futureSetOptions.map((option) => (
                                            <option key={`future-set-${option.id}`} value={String(option.id)}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="review-board-column-count">{upcomingScheduleRows.length}問</span>
                                </div>
                            </div>

                            {upcomingScheduleRows.length === 0 ? (
                                <div className="review-board-empty review-board-column-empty">
                                    <p>今後1週間の復習予定はありません。</p>
                                </div>
                            ) : (
                                <div className="table-wrapper review-board-future-table-wrap">
                                    <table className="question-table review-board-future-table">
                                        <thead>
                                            <tr>
                                                <th>セット名</th>
                                                <th>番号</th>
                                                <th>問題文</th>
                                                {calendarColumns.map((column) => (
                                                    <th key={`cal-head-${column.key}`} className="review-board-future-calendar-head">
                                                        <span>{column.label}</span>
                                                        <small>{column.weekday}</small>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {upcomingScheduleRows.map((row) => (
                                                <tr key={`future-${row.quizSetId}-${row.questionId}-${row.nextDue}`} className="table-row">
                                                    <td className="review-board-future-set-name">{row.quizSetName}</td>
                                                    <td className="review-board-future-question-number">{row.questionNumber}</td>
                                                    <td className="text-cell review-board-future-question-text">{row.questionText}</td>
                                                    {calendarColumns.map((column) => {
                                                        const isDueDay = row.nextDue === column.key;
                                                        return (
                                                            <td
                                                                key={`future-${row.quizSetId}-${row.questionId}-${column.key}`}
                                                                className={`review-board-future-calendar-cell ${isDueDay ? 'is-due' : ''}`}
                                                            >
                                                                {isDueDay ? '●' : ''}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="review-board-column">
                            <div className="review-board-column-head">
                                <div className="review-board-column-title-wrap">
                                    <h2 className="review-board-column-title">復習対象一覧</h2>
                                    <span className="review-board-target-guide">セットをクリックで対象切替</span>
                                </div>
                                <div className="review-board-column-head-controls">
                                    <span className="review-board-column-count">
                                        {reviewTargetSets.included.length + reviewTargetSets.excluded.length}セット
                                    </span>
                                </div>
                            </div>

                            <div className="review-board-target-groups">
                                <div className="review-board-target-group">
                                    <div className="review-board-target-group-head">
                                        <h3 className="review-board-target-group-title">復習対象</h3>
                                        <span className="review-board-column-count">{reviewTargetSets.included.length}セット</span>
                                    </div>
                                    {reviewTargetSets.included.length === 0 ? (
                                        <p className="review-board-target-empty">対象のセットはありません。</p>
                                    ) : (
                                        <ul className="review-board-target-list">
                                            {reviewTargetSets.included.map((set) => (
                                                <li key={`review-included-${set.id}`} className="review-board-target-item">
                                                    <button
                                                        type="button"
                                                        className="review-board-target-item-btn"
                                                        onClick={() => void handleToggleReviewTarget(set.id)}
                                                        disabled={togglingSetIds.has(set.id)}
                                                        title="クリックで復習対象を切り替え"
                                                    >
                                                        <span className="review-board-target-name">{set.name}</span>
                                                        <span className="review-board-target-item-right">
                                                            <span className={`review-board-set-type ${set.type}`}>
                                                                {set.type === 'memorization' ? '暗記カード' : '問題集'}
                                                            </span>
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="review-board-target-group">
                                    <div className="review-board-target-group-head">
                                        <h3 className="review-board-target-group-title">復習対象外</h3>
                                        <span className="review-board-column-count">{reviewTargetSets.excluded.length}セット</span>
                                    </div>
                                    {reviewTargetSets.excluded.length === 0 ? (
                                        <p className="review-board-target-empty">対象外のセットはありません。</p>
                                    ) : (
                                        <ul className="review-board-target-list">
                                            {reviewTargetSets.excluded.map((set) => (
                                                <li key={`review-excluded-${set.id}`} className="review-board-target-item">
                                                    <button
                                                        type="button"
                                                        className="review-board-target-item-btn"
                                                        onClick={() => void handleToggleReviewTarget(set.id)}
                                                        disabled={togglingSetIds.has(set.id)}
                                                        title="クリックで復習対象を切り替え"
                                                    >
                                                        <span className="review-board-target-name">{set.name}</span>
                                                        <span className="review-board-target-item-right">
                                                            <span className={`review-board-set-type ${set.type}`}>
                                                                {set.type === 'memorization' ? '暗記カード' : '問題集'}
                                                            </span>
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};
