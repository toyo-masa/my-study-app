import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BookOpen,
    Brain,
    CalendarCheck2,
    CircleHelp,
    PlayCircle,
    RefreshCw,
    X,
} from 'lucide-react';
import type { Question, QuizHistory, QuizSetType, ReviewSchedule, SuspendedSession } from '../types';
import {
    getAllReviewSchedules,
    getDueReviews,
    getHistories,
    getQuizSetsWithCounts,
    getTodayString,
    updateQuizSet,
    getQuestionsForQuizSet,
} from '../db';
import { MarkdownText } from '../components/MarkdownText';
import { LoadingView } from '../components/LoadingView';
import { BackButton } from '../components/BackButton';
import { useAppContext } from '../contexts/AppContext';
import { ApiError } from '../cloudApi';
import { loadSessionFromStorage } from '../utils/quizSettings';
import { getCompletedQuestionIdsFromSuspendedSession, REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY } from '../utils/quizSession';
import { loadReviewIntervalSettings } from '../utils/spacedRepetition';
import { getMasteredQuestionIdsFromHistories } from '../utils/reviewMastery';
import { getQuestionAttemptSummariesFromHistories, type QuestionAttemptSummary } from '../utils/reviewQuestionHistory';
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
    questionText: string;
    nextDue: string;
}

interface SelectedUpcomingQuestionState {
    row: UpcomingScheduleRow;
}

interface SelectedUpcomingQuestionDetail {
    row: UpcomingScheduleRow;
    question: Question;
    attemptSummaries: QuestionAttemptSummary[];
}

interface CalendarColumn {
    key: string;
    label: string;
    weekday: string;
}

interface ReviewBoardRouteProps {
    masteryThreshold: number;
}

function normalizeQuestionType(question: Question): 'quiz' | 'memorization' {
    return question.questionType === 'memorization' ? 'memorization' : 'quiz';
}

function getMemorizationAnswerText(question: Question): string {
    if (question.correctAnswers?.length > 0) {
        return question.correctAnswers.map((answer) => String(answer)).join('\n');
    }

    if (question.options?.length > 0) {
        return question.options.join('\n');
    }

    return '';
}

function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

function formatReviewDueLabel(dateString: string, today: string): string {
    if (dateString === today) {
        return '今日';
    }

    const date = parseLocalDate(dateString);
    if (!date || Number.isNaN(date.getTime())) {
        return dateString;
    }

    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export const ReviewBoardRoute: React.FC<ReviewBoardRouteProps> = ({ masteryThreshold }) => {
    const navigate = useNavigate();
    const { handleCloudError, setIsLoginModalOpen, showGlobalNotice } = useAppContext();
    const [dueReviews, setDueReviews] = useState<DueReviewItem[]>([]);
    const [allReviewSchedules, setAllReviewSchedules] = useState<ReviewSchedule[]>([]);
    const [reviewDueSessionsByQuizSet, setReviewDueSessionsByQuizSet] = useState<Record<number, SuspendedSession>>({});
    const [quizSetMetaById, setQuizSetMetaById] = useState<Record<number, QuizSetMeta>>({});
    const [typeFilter, setTypeFilter] = useState<ReviewSetTypeFilter>('all');
    const [futureSetFilter, setFutureSetFilter] = useState<string>('all');
    const [questionsById, setQuestionsById] = useState<Record<number, Question>>({});
    const [historiesByQuizSetId, setHistoriesByQuizSetId] = useState<Record<number, QuizHistory[]>>({});
    const [masteredQuestionIds, setMasteredQuestionIds] = useState<Set<number>>(() => new Set());
    const [selectedUpcomingQuestion, setSelectedUpcomingQuestion] = useState<SelectedUpcomingQuestionState | null>(null);
    const [togglingSetIds, setTogglingSetIds] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [errorType, setErrorType] = useState<ReviewBoardErrorType>('none');
    const today = getTodayString();
    const reviewIntervalSettings = loadReviewIntervalSettings();
    const exampleCorrectCount = 3;
    const exampleCorrectDays = Math.max(1, reviewIntervalSettings.correctIntervalDays * exampleCorrectCount);

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
            const dueQuizSetIds = [...new Set(reviews.map((review) => review.quizSetId))];
            const suspendedSessionEntries = await Promise.all(
                dueQuizSetIds.map(async (quizSetId) => {
                    const session = await loadSessionFromStorage(quizSetId, REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY);
                    return [quizSetId, session] as const;
                })
            );

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
            const nextReviewDueSessionsByQuizSet: Record<number, SuspendedSession> = {};
            for (const [quizSetId, session] of suspendedSessionEntries) {
                if (session) {
                    nextReviewDueSessionsByQuizSet[quizSetId] = session;
                }
            }

            setDueReviews(reviews);
            setAllReviewSchedules(schedules);
            setReviewDueSessionsByQuizSet(nextReviewDueSessionsByQuizSet);
            setQuizSetMetaById(nextMetaById);

            // Build mastery filter data and upcoming question text from the schedules visible on the board.
            const startDateObj = parseLocalDate(today) ?? new Date();
            const endDateObj = new Date(startDateObj);
            endDateObj.setDate(startDateObj.getDate() + 6);
            const futureDateEnd = toLocalDateString(endDateObj);
            const nextQuestionsById: Record<number, Question> = {};
            const nextHistoriesByQuizSetId: Record<number, QuizHistory[]> = {};
            const nextMasteredQuestionIds = new Set<number>();
            const masteryTargetQuizSetIds = [...new Set(
                schedules
                    .filter((schedule) => schedule.nextDue <= futureDateEnd)
                    .map((schedule) => schedule.quizSetId)
            )];

            const [questionResults, historyResults] = await Promise.all([
                Promise.allSettled(
                    masteryTargetQuizSetIds.map(async (quizSetId) => ({
                        quizSetId,
                        questions: await getQuestionsForQuizSet(quizSetId),
                    }))
                ),
                Promise.allSettled(
                    masteryTargetQuizSetIds.map(async (quizSetId) => ({
                        quizSetId,
                        histories: await getHistories(quizSetId),
                    }))
                ),
            ]);

            const questionsByQuizSetId = new Map<number, Question[]>();
            for (const result of questionResults) {
                if (result.status !== 'fulfilled') {
                    console.error('復習ボード用の問題取得に失敗しました:', result.reason);
                    continue;
                }

                questionsByQuizSetId.set(result.value.quizSetId, result.value.questions);
                for (const question of result.value.questions) {
                    if (question.id !== undefined) {
                        nextQuestionsById[question.id] = question;
                    }
                }
            }

            const historiesByQuizSetId = new Map<number, QuizHistory[]>();
            for (const result of historyResults) {
                if (result.status !== 'fulfilled') {
                    console.error('復習ボード用の履歴取得に失敗しました:', result.reason);
                    continue;
                }

                historiesByQuizSetId.set(result.value.quizSetId, result.value.histories);
                nextHistoriesByQuizSetId[result.value.quizSetId] = result.value.histories;
            }

            for (const quizSetId of masteryTargetQuizSetIds) {
                const questions = questionsByQuizSetId.get(quizSetId);
                const histories = historiesByQuizSetId.get(quizSetId);
                if (!questions || !histories) {
                    continue;
                }

                const masteredIds = getMasteredQuestionIdsFromHistories(histories, questions, masteryThreshold);
                masteredIds.forEach((questionId) => nextMasteredQuestionIds.add(questionId));
            }

            setQuestionsById(nextQuestionsById);
            setHistoriesByQuizSetId(nextHistoriesByQuizSetId);
            setMasteredQuestionIds(nextMasteredQuestionIds);

        } catch (error) {
            console.error('復習ボードの読み込みに失敗しました:', error);
            setDueReviews([]);
            setAllReviewSchedules([]);
            setReviewDueSessionsByQuizSet({});
            setQuizSetMetaById({});
            setQuestionsById({});
            setHistoriesByQuizSetId({});
            setMasteredQuestionIds(new Set());
            if (error instanceof ApiError && error.status === 401) {
                setErrorType('auth');
                setErrorMessage('ログイン状態の有効期限が切れました。再ログインしてください。');
                handleCloudError(error, '認証エラーが発生しました。', { suppressGlobalNotice: true });
            } else if ((error instanceof Error && error.message.includes('Failed to fetch')) || (error instanceof Error && error.message.includes('NetworkError'))) {
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
    }, [handleCloudError, masteryThreshold, today]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!selectedUpcomingQuestion) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSelectedUpcomingQuestion(null);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [selectedUpcomingQuestion]);

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
                const dateCmp = a.earliestDue.localeCompare(b.earliestDue);
                if (dateCmp !== 0) return dateCmp;
                if (b.dueCount !== a.dueCount) return b.dueCount - a.dueCount;
                return a.name.localeCompare(b.name, 'ja');
            });
    }, [quizSetMetaById]);

    const completedQuestionIdsByQuizSet = useMemo(() => {
        const result: Record<number, Set<number>> = {};
        for (const [quizSetId, session] of Object.entries(reviewDueSessionsByQuizSet)) {
            result[Number(quizSetId)] = new Set(getCompletedQuestionIdsFromSuspendedSession(session));
        }
        return result;
    }, [reviewDueSessionsByQuizSet]);

    const effectiveDueReviews = useMemo(
        () => dueReviews.filter((review) =>
            !completedQuestionIdsByQuizSet[review.quizSetId]?.has(review.questionId) &&
            !masteredQuestionIds.has(review.questionId)
        ),
        [dueReviews, completedQuestionIdsByQuizSet, masteredQuestionIds]
    );

    const filteredTodayReviews = useMemo(
        () => effectiveDueReviews.filter((review) => {
            if (review.nextDue > today) return false;
            if (typeFilter === 'all') return true;
            return quizSetMetaById[review.quizSetId]?.type === typeFilter;
        }),
        [effectiveDueReviews, today, typeFilter, quizSetMetaById]
    );

    const todaySetSummaries = useMemo(
        () => buildSetSummaries(filteredTodayReviews),
        [buildSetSummaries, filteredTodayReviews]
    );

    const activeSchedules = useMemo(
        () => allReviewSchedules.filter(schedule => {
            const setMeta = quizSetMetaById[schedule.quizSetId];
            if (!setMeta) return false;
            if (completedQuestionIdsByQuizSet[schedule.quizSetId]?.has(schedule.questionId)) return false;
            if (masteredQuestionIds.has(schedule.questionId)) return false;
            return true;
        }),
        [allReviewSchedules, quizSetMetaById, completedQuestionIdsByQuizSet, masteredQuestionIds]
    );

    const totalTodayUnreviewedQuestions = useMemo(
        () => activeSchedules.filter(schedule => schedule.nextDue <= today).length,
        [activeSchedules, today]
    );

    const totalOverdueUnreviewedQuestions = useMemo(
        () => activeSchedules.filter(schedule => schedule.nextDue < today).length,
        [activeSchedules, today]
    );

    const nextWeekDateKeys = useMemo(() => {
        const startDate = parseLocalDate(today) ?? new Date();
        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + index);
            return toLocalDateString(date);
        });
    }, [today]);

    const nextWeekLastDateKey = nextWeekDateKeys[nextWeekDateKeys.length - 1] ?? today;

    const futureSetOptions = useMemo(() => {
        const setNameById = new Map<number, string>();
        for (const schedule of activeSchedules) {
            if (schedule.nextDue < today || schedule.nextDue > nextWeekLastDateKey) continue;
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
            .filter((schedule) => schedule.nextDue >= today && schedule.nextDue <= nextWeekLastDateKey)
            .map((schedule) => {
                const quizSetName = quizSetMetaById[schedule.quizSetId]?.name || `セット #${schedule.quizSetId}`;
                const question = questionsById[schedule.questionId];
                return {
                    quizSetId: schedule.quizSetId,
                    quizSetName,
                    questionId: schedule.questionId,
                    questionText: question?.text || '（問題が見つかりません）',
                    nextDue: schedule.nextDue,
                };
            })
            .filter((row) => futureSetFilter === 'all' || String(row.quizSetId) === futureSetFilter)
            .sort((a, b) => {
                const dateCmp = a.nextDue.localeCompare(b.nextDue);
                if (dateCmp !== 0) return dateCmp;
                const setCmp = a.quizSetName.localeCompare(b.quizSetName, 'ja');
                if (setCmp !== 0) return setCmp;
                return a.questionText.localeCompare(b.questionText, 'ja');
            }),
        [activeSchedules, quizSetMetaById, questionsById, today, nextWeekLastDateKey, futureSetFilter]
    );

    const selectedUpcomingQuestionDetail = useMemo<SelectedUpcomingQuestionDetail | null>(() => {
        if (!selectedUpcomingQuestion) {
            return null;
        }

        const question = questionsById[selectedUpcomingQuestion.row.questionId];
        if (!question) {
            return null;
        }

        return {
            row: selectedUpcomingQuestion.row,
            question,
            attemptSummaries: getQuestionAttemptSummariesFromHistories(
                historiesByQuizSetId[selectedUpcomingQuestion.row.quizSetId] || [],
                question
            ),
        };
    }, [selectedUpcomingQuestion, questionsById, historiesByQuizSetId]);

    useEffect(() => {
        if (selectedUpcomingQuestion && !selectedUpcomingQuestionDetail) {
            setSelectedUpcomingQuestion(null);
        }
    }, [selectedUpcomingQuestion, selectedUpcomingQuestionDetail]);

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
            showGlobalNotice(
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
            handleCloudError(error, '復習設定の更新に失敗しました。');
        } finally {
            setTogglingSetIds((prev) => {
                const next = new Set(prev);
                next.delete(quizSetId);
                return next;
            });
        }
    }, [quizSetMetaById, loadData, handleCloudError, showGlobalNotice]);

    const openReviewSession = (summary: ReviewSetSummary) => {
        if (summary.reviewQuestionIds.length === 0) {
            return;
        }

        const navigationState = {
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
                <span className={`review-board-pill ${summary.earliestDue < today ? 'danger' : ''}`}>
                    最古予定日 {formatReviewDueLabel(summary.earliestDue, today)}
                </span>
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

    const selectedQuestionType = selectedUpcomingQuestionDetail
        ? normalizeQuestionType(selectedUpcomingQuestionDetail.question)
        : 'quiz';
    const selectedMemorizationAnswerText = selectedUpcomingQuestionDetail
        ? getMemorizationAnswerText(selectedUpcomingQuestionDetail.question)
        : '';

    return (
        <div className="review-board-page">
            <div className="detail-header review-board-header">
                <BackButton className="nav-btn" onClick={() => navigate('/')} />
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
                            <span className="review-board-stat-label">今日復習すべき問題数</span>
                            <strong className="review-board-stat-value">{totalTodayUnreviewedQuestions}</strong>
                        </div>
                        <div className="review-board-stat-card">
                            <span className="review-board-stat-label">うち期限切れ</span>
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
                                                    <li>各問題には「次に復習する予定日」があり、その予定日が今日（またはそれ以前の期限切れ）のものを表示します。</li>
                                                    <li>正解したときは、その問題の連続正解数に応じて次回日数を増やします。</li>
                                                    <li>正解したとき: {reviewIntervalSettings.correctIntervalDays} 日 × 連続正解数 を次回日数にします。</li>
                                                    <li>不正解・自信なしのとき: 常に {reviewIntervalSettings.retryIntervalDays} 日を採用します。</li>
                                                    <li>不正解になると連続正解数は 0 に戻り、次の正解時は 1 回目として数え直します。</li>
                                                    <li>設定で有効にすると、正解時だけ基準日から最大で「復習間隔の半分、かつ7日以内」後ろへ分散し、一点集中を軽く緩和します。完全に均等化するものではありません。</li>
                                                    <li>分散で後ろ倒しした日数は出題日の調整用で、次回の interval 計算には含めません。</li>
                                                    <li>この設定は今後更新される復習日にのみ適用され、すでに登録済みの復習予定は自動変更しません。</li>
                                                    <li>直近 {masteryThreshold} 回の結果が、問題集では「正解かつ復習に回さない」、暗記カードでは「完全に覚えた」だったものは習得済みとして復習ボードから外れます。</li>
                                                    <li>例: 連続正解数が {exampleCorrectCount} 回なら、正解時は {reviewIntervalSettings.correctIntervalDays} × {exampleCorrectCount} = {exampleCorrectDays} 日、不正解・自信なし時は {reviewIntervalSettings.retryIntervalDays} 日です。</li>
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
                                                <th>問題</th>
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
                                                <tr
                                                    key={`future-${row.quizSetId}-${row.questionId}-${row.nextDue}`}
                                                    className="table-row review-board-future-row"
                                                    onClick={() => setSelectedUpcomingQuestion({ row })}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            setSelectedUpcomingQuestion({ row });
                                                        }
                                                    }}
                                                >
                                                    <td className="review-board-future-set-name" title={row.quizSetName}>{row.quizSetName}</td>
                                                    <td className="review-board-future-question-text" title={row.questionText}>{row.questionText}</td>
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

            {selectedUpcomingQuestionDetail && (
                <div className="modal-overlay" onClick={() => setSelectedUpcomingQuestion(null)}>
                    <div className="modal-content history-question-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h3>復習予定の詳細</h3>
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setSelectedUpcomingQuestion(null)}
                                aria-label="モーダルを閉じる"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body history-question-modal-body">
                            <div className="review-board-detail-modal-meta">
                                <span className="review-board-pill">{selectedUpcomingQuestionDetail.row.quizSetName}</span>
                                <span className="review-board-pill">予定日 {selectedUpcomingQuestionDetail.row.nextDue}</span>
                                <span className={`review-board-set-type ${selectedQuestionType}`}>
                                    {selectedQuestionType === 'memorization' ? '暗記カード' : '問題集'}
                                </span>
                            </div>

                            <section className="history-modal-section">
                                <h4>問題文</h4>
                                <div className="history-modal-markdown">
                                    <MarkdownText content={selectedUpcomingQuestionDetail.question.text} />
                                </div>
                            </section>

                            <section className="history-modal-section">
                                <h4>{selectedQuestionType === 'memorization' ? '解答' : '選択肢'}</h4>
                                {selectedQuestionType === 'memorization' ? (
                                    <div className="history-modal-markdown">
                                        {selectedMemorizationAnswerText ? (
                                            <MarkdownText content={selectedMemorizationAnswerText} />
                                        ) : (
                                            <p className="history-modal-empty">解答はありません</p>
                                        )}
                                    </div>
                                ) : (
                                    <ol className="history-modal-options">
                                        {selectedUpcomingQuestionDetail.question.options.map((option, index) => {
                                            const isCorrect = selectedUpcomingQuestionDetail.question.correctAnswers.includes(index);
                                            return (
                                                <li
                                                    key={`review-board-option-${selectedUpcomingQuestionDetail.question.id ?? selectedUpcomingQuestionDetail.row.questionId}-${index}`}
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
                                )}
                            </section>

                            <section className="history-modal-section">
                                <h4>解説</h4>
                                <div className="history-modal-markdown">
                                    {selectedUpcomingQuestionDetail.question.explanation ? (
                                        <MarkdownText content={selectedUpcomingQuestionDetail.question.explanation.replace(/\\n/g, '\n')} />
                                    ) : (
                                        <p className="history-modal-empty">解説はありません</p>
                                    )}
                                </div>
                            </section>

                            <section className="history-modal-section">
                                <h4>これまでの履歴</h4>
                                {selectedUpcomingQuestionDetail.attemptSummaries.length === 0 ? (
                                    <p className="history-modal-empty">まだ履歴がありません</p>
                                ) : (
                                    <ul className="review-board-history-list">
                                        {selectedUpcomingQuestionDetail.attemptSummaries.map((attempt, index) => (
                                            <li
                                                key={`review-board-attempt-${selectedUpcomingQuestionDetail.row.quizSetId}-${selectedUpcomingQuestionDetail.row.questionId}-${attempt.dateLabel}-${index}`}
                                                className="review-board-history-item"
                                            >
                                                <span className="review-board-history-date">{attempt.dateLabel}</span>
                                                <div className="review-board-history-badges">
                                                    {attempt.kind === 'memorization' ? (
                                                        <span className={`review-board-history-badge ${attempt.isMemorized ? 'memorized' : 'not-memorized'}`}>
                                                            {attempt.isMemorized ? '完全に覚えた' : '覚えていない'}
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span className={`review-board-history-badge ${attempt.isCorrect ? 'correct' : 'incorrect'}`}>
                                                                {attempt.isCorrect ? '正解' : '誤り'}
                                                            </span>
                                                            <span className={`review-board-history-badge ${attempt.reviewRequested ? 'review-requested' : 'review-not-requested'}`}>
                                                                {attempt.reviewRequested ? '復習に回した' : '復習に回していない'}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="nav-btn" onClick={() => setSelectedUpcomingQuestion(null)}>
                                閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
