import React, { useCallback, useMemo, useState } from 'react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CalendarCheck2, RefreshCw, Table2 } from 'lucide-react';
import { ApiError } from '../cloudApi';
import { BackButton } from '../components/BackButton';
import { LoadingView } from '../components/LoadingView';
import { useAppContext } from '../contexts/AppContext';
import { getAllQuizSets, getAllReviewSchedules, getHistories } from '../db';
import { loadSessionFromStorage } from '../utils/quizSettings';
import { DEFAULT_SUSPENDED_SESSION_SLOT_KEY, REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY } from '../utils/quizSession';
import {
    buildStudyInsightsData,
    type CountSeriesPoint,
    type HeatmapDayCell,
    type QuizSetPerformanceRow,
    type RateSeriesPoint,
    type RecentSessionRatePoint,
} from '../features/studyInsights/aggregations';
import type { QuizSetType, QuizSetWithMeta, QuizHistory, ReviewSchedule, SuspendedSession } from '../types';

type VolumeRange = 'daily' | 'weekly' | 'monthly';

type CountChartProps = {
    points: CountSeriesPoint[];
    emptyMessage: string;
};

type RateChartProps = {
    points: RateSeriesPoint[] | RecentSessionRatePoint[];
    emptyMessage: string;
};

const VOLUME_RANGE_LABELS: Record<VolumeRange, string> = {
    daily: '30日',
    weekly: '12週',
    monthly: '12か月',
};

const HEATMAP_WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

function formatNumber(value: number): string {
    return new Intl.NumberFormat('ja-JP').format(value);
}

function formatPercent(value: number | null): string {
    if (value === null) return '—';
    return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: Date | null): string {
    if (!value) return '—';
    return value.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
}

function getQuizSetTypeLabel(type: QuizSetType): string {
    if (type === 'memorization') return '暗記カード';
    if (type === 'mixed') return '混合セット';
    return '問題集';
}

function shouldShowSparseLabel(index: number, total: number): boolean {
    if (total <= 12) return true;
    if (index === total - 1) return true;
    return index % 5 === 0;
}

function getBarHeightPercent(value: number, maxValue: number): number {
    if (value <= 0 || maxValue <= 0) return 0;
    return Math.max(10, (value / maxValue) * 100);
}

const CountBarChart: React.FC<CountChartProps> = ({ points, emptyMessage }) => {
    const maxValue = points.reduce((max, point) => Math.max(max, point.value), 0);

    if (maxValue === 0) {
        return <div className="study-insights-chart-empty">{emptyMessage}</div>;
    }

    return (
        <div className="study-insights-bars">
            {points.map((point, index) => {
                const height = getBarHeightPercent(point.value, maxValue);
                return (
                    <div key={point.key} className="study-insights-bar-item" title={point.tooltip}>
                        <div className="study-insights-bar-track">
                            {height > 0 && <div className="study-insights-bar-fill" style={{ height: `${height}%` }} />}
                        </div>
                        <span className="study-insights-bar-value">{point.value}</span>
                        <span className="study-insights-bar-label">
                            {shouldShowSparseLabel(index, points.length) ? point.label : ''}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const RateBarChart: React.FC<RateChartProps> = ({ points, emptyMessage }) => {
    const hasAnyValue = points.some((point) => point.value !== null);

    if (!hasAnyValue) {
        return <div className="study-insights-chart-empty">{emptyMessage}</div>;
    }

    return (
        <div className="study-insights-bars study-insights-bars-rate">
            {points.map((point, index) => {
                const height = point.value === null ? 0 : getBarHeightPercent(point.value, 1);
                const rateValue = point.value === null ? '—' : `${Math.round(point.value * 100)}%`;
                return (
                    <div key={point.key} className="study-insights-bar-item" title={point.tooltip}>
                        <div className={`study-insights-bar-track study-insights-rate-track ${point.value === null ? 'is-empty' : ''}`}>
                            {point.value !== null && (
                                <div className="study-insights-bar-fill study-insights-rate-fill" style={{ height: `${height}%` }} />
                            )}
                        </div>
                        <span className="study-insights-bar-value">{rateValue}</span>
                        <span className="study-insights-bar-label">
                            {shouldShowSparseLabel(index, points.length) ? point.label : ''}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

function renderHeatmapCell(day: HeatmapDayCell): React.ReactNode {
    const classNames = [
        'study-insights-heatmap-cell',
        `level-${day.intensity}`,
        day.isToday ? 'is-today' : '',
        day.isFuture ? 'is-future' : '',
    ].filter(Boolean).join(' ');

    const title = day.isFuture ? `${day.date}: まだ到来していません` : `${day.date}: ${day.count}問`;

    return (
        <div
            key={day.date}
            className={classNames}
            title={title}
            aria-label={title}
        />
    );
}

export const StudyInsightsRoute: React.FC = () => {
    const navigate = useNavigate();
    const { handleCloudError } = useAppContext();
    const [quizSets, setQuizSets] = useState<QuizSetWithMeta[]>([]);
    const [historiesBySetId, setHistoriesBySetId] = useState<Record<number, QuizHistory[]>>({});
    const [reviewSchedules, setReviewSchedules] = useState<ReviewSchedule[]>([]);
    const [suspendedSessions, setSuspendedSessions] = useState<SuspendedSession[]>([]);
    const [volumeRange, setVolumeRange] = useState<VolumeRange>('daily');
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [partialWarning, setPartialWarning] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        setPartialWarning('');

        try {
            const [allQuizSets, schedules] = await Promise.all([
                getAllQuizSets(),
                getAllReviewSchedules(),
            ]);

            const targetQuizSets = allQuizSets.filter((quizSet): quizSet is QuizSetWithMeta & { id: number } => {
                return quizSet.id !== undefined && !quizSet.isDeleted;
            });

            const [historyResults, loadedSuspendedSessions] = await Promise.all([
                Promise.allSettled(
                    targetQuizSets.map(async (quizSet) => ({
                        quizSetId: quizSet.id,
                        histories: await getHistories(quizSet.id),
                    }))
                ),
                Promise.all(
                    targetQuizSets.flatMap((quizSet) => ([
                        loadSessionFromStorage(quizSet.id, DEFAULT_SUSPENDED_SESSION_SLOT_KEY),
                        loadSessionFromStorage(quizSet.id, REVIEW_DUE_SUSPENDED_SESSION_SLOT_KEY),
                    ]))
                ),
            ]);

            const nextHistoriesBySetId: Record<number, QuizHistory[]> = {};
            const nextSuspendedSessions = loadedSuspendedSessions.filter(
                (session): session is SuspendedSession => session !== null
            );
            let firstRejectedReason: unknown = null;
            let rejectedCount = 0;

            for (const result of historyResults) {
                if (result.status === 'fulfilled') {
                    nextHistoriesBySetId[result.value.quizSetId] = result.value.histories;
                    continue;
                }

                rejectedCount += 1;
                if (!firstRejectedReason) {
                    firstRejectedReason = result.reason;
                }

                if (result.reason instanceof ApiError && result.reason.status === 401) {
                    throw result.reason;
                }
            }

            if (historyResults.length > 0 && rejectedCount === historyResults.length && firstRejectedReason) {
                throw firstRejectedReason;
            }

            if (rejectedCount > 0) {
                setPartialWarning('一部の履歴を取得できなかったため参考値です。再読み込み後も改善しない場合は、時間をおいてお試しください。');
            }

            setQuizSets(targetQuizSets);
            setHistoriesBySetId(nextHistoriesBySetId);
            setReviewSchedules(schedules);
            setSuspendedSessions(nextSuspendedSessions);
        } catch (error) {
            setQuizSets([]);
            setHistoriesBySetId({});
            setReviewSchedules([]);
            setSuspendedSessions([]);

            if (error instanceof ApiError && error.status === 401) {
                handleCloudError(error, '認証エラーが発生しました。', { suppressGlobalNotice: true });
                setErrorMessage('ログイン状態の有効期限が切れました。再ログインしてください。');
            } else {
                handleCloudError(error, '学習実績の読み込みに失敗しました。', { suppressGlobalNotice: true });
                setErrorMessage('学習実績の読み込みに失敗しました。時間をおいて再試行してください。');
            }
        } finally {
            setLoading(false);
        }
    }, [handleCloudError]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const insights = useMemo(() => {
        return buildStudyInsightsData({
            quizSets,
            historiesBySetId,
            reviewSchedules,
            suspendedSessions,
        });
    }, [quizSets, historiesBySetId, reviewSchedules, suspendedSessions]);

    const activeVolumePoints = insights.answerVolume[volumeRange];
    const hasAnyQuizSet = quizSets.length > 0;
    const hasAnyRecentSessions = insights.accuracy.recentSessions.length > 0;
    const hasAnyWeakRows = insights.weakQuizSetRows.length > 0;

    if (loading) {
        return <LoadingView fullPage message="学習実績を読み込み中..." />;
    }

    return (
        <main className="content-area study-insights-page">
            <div className="detail-header study-insights-header">
                <BackButton className="nav-btn" onClick={() => navigate('/')} />
                <h1>
                    <BarChart3 size={24} />
                    学習実績
                </h1>
            </div>

            <p className="study-insights-subtitle">
                日々の学習量と、中長期の進み具合を問題集横断で振り返れます。
            </p>

            {errorMessage ? (
                <div className="study-insights-error">
                    <p>{errorMessage}</p>
                    <button className="nav-btn" onClick={() => void loadData()}>
                        <RefreshCw size={16} />
                        再読み込み
                    </button>
                </div>
            ) : (
                <>
                    {partialWarning && (
                        <div className="study-insights-inline-note">
                            <span>{partialWarning}</span>
                            <button className="nav-btn" onClick={() => void loadData()}>
                                <RefreshCw size={15} />
                                再読み込み
                            </button>
                        </div>
                    )}

                    <section className="study-insights-section">
                        <div className="study-insights-summary-grid">
                            <article className="study-insights-summary-card">
                                <span className="study-insights-summary-label">今日解いた問題数</span>
                                <strong className="study-insights-summary-value">{formatNumber(insights.summary.todayAnswers)}問</strong>
                            </article>
                            <article className="study-insights-summary-card">
                                <span className="study-insights-summary-label">今週解いた問題数</span>
                                <strong className="study-insights-summary-value">{formatNumber(insights.summary.weekAnswers)}問</strong>
                            </article>
                            <article className="study-insights-summary-card">
                                <span className="study-insights-summary-label">今月解いた問題数</span>
                                <strong className="study-insights-summary-value">{formatNumber(insights.summary.monthAnswers)}問</strong>
                            </article>
                            <article className="study-insights-summary-card">
                                <span className="study-insights-summary-label">累計解答数</span>
                                <strong className="study-insights-summary-value">{formatNumber(insights.summary.totalAnswers)}問</strong>
                            </article>
                            <article className="study-insights-summary-card">
                                <span className="study-insights-summary-label">累計正答率</span>
                                <strong className="study-insights-summary-value">{formatPercent(insights.summary.totalAccuracyRate)}</strong>
                            </article>
                            <article className="study-insights-summary-card">
                                <span className="study-insights-summary-label">連続学習日数</span>
                                <strong className="study-insights-summary-value">{formatNumber(insights.summary.streakDays)}日</strong>
                            </article>
                            <article className="study-insights-summary-card">
                                <span className="study-insights-summary-label">今日時点の未消化復習件数</span>
                                <strong className="study-insights-summary-value">{formatNumber(insights.summary.dueReviewCount)}件</strong>
                            </article>
                            <article className="study-insights-summary-card">
                                <span className="study-insights-summary-label">今日時点の期限超過復習件数</span>
                                <strong className="study-insights-summary-value is-danger">{formatNumber(insights.summary.overdueReviewCount)}件</strong>
                            </article>
                        </div>
                    </section>

                    {!hasAnyQuizSet ? (
                        <section className="study-insights-section study-insights-empty-state">
                            <h2>まだ学習データがありません</h2>
                            <p>ホームから問題集を追加すると、ここに学習実績が表示されます。</p>
                        </section>
                    ) : (
                        <>
                            <section className="study-insights-section">
                                <div className="study-insights-section-head">
                                    <div>
                                        <h2>学習量の推移</h2>
                                        <p>日別・週別・月別で解答数の変化を確認できます。</p>
                                    </div>
                                    <div className="study-insights-tab-row" role="tablist" aria-label="学習量の期間切替">
                                        {(['daily', 'weekly', 'monthly'] as VolumeRange[]).map((range) => (
                                            <button
                                                key={range}
                                                type="button"
                                                className={`study-insights-tab ${volumeRange === range ? 'active' : ''}`}
                                                onClick={() => setVolumeRange(range)}
                                            >
                                                {VOLUME_RANGE_LABELS[range]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <CountBarChart
                                    points={activeVolumePoints}
                                    emptyMessage="まだ履歴がないため、学習量の推移はこれから表示されます。"
                                />
                            </section>

                            <section className="study-insights-section">
                                <div className="study-insights-section-head">
                                    <div>
                                        <h2>正答率の推移</h2>
                                        <p>日別の傾向と、直近セッションの正答率を確認できます。</p>
                                    </div>
                                </div>
                                <div className="study-insights-dual-grid">
                                    <div className="study-insights-card-block">
                                        <h3>直近30日の日別正答率</h3>
                                        <RateBarChart
                                            points={insights.accuracy.daily}
                                            emptyMessage="まだ学習履歴がないため、日別正答率は表示されません。"
                                        />
                                    </div>
                                    <div className="study-insights-card-block">
                                        <h3>直近10回の学習セッション正答率</h3>
                                        <RateBarChart
                                            points={insights.accuracy.recentSessions}
                                            emptyMessage="学習セッションが増えると、ここに直近の正答率が表示されます。"
                                        />
                                        {hasAnyRecentSessions && (
                                            <p className="study-insights-note">
                                                直近10回のセッションを古い順に並べています。
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </section>

                            <section className="study-insights-section">
                                <div className="study-insights-section-head">
                                    <div>
                                        <h2>カレンダーヒートマップ</h2>
                                        <p>直近12週間の学習量を、日ごとの濃淡で確認できます。</p>
                                    </div>
                                </div>
                                <div className="study-insights-heatmap-wrap">
                                    <div className="study-insights-heatmap-weekdays">
                                        {HEATMAP_WEEKDAY_LABELS.map((label) => (
                                            <span key={label}>{label}</span>
                                        ))}
                                    </div>
                                    <div className="study-insights-heatmap-columns">
                                        {insights.heatmapWeeks.map((week) => (
                                            <div key={week.key} className="study-insights-heatmap-week" aria-label={week.label}>
                                                {week.days.map((day) => renderHeatmapCell(day))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="study-insights-legend">
                                    <span>薄い</span>
                                    <span className="study-insights-legend-cell level-1" />
                                    <span className="study-insights-legend-cell level-2" />
                                    <span className="study-insights-legend-cell level-3" />
                                    <span className="study-insights-legend-cell level-4" />
                                    <span>濃い</span>
                                </div>
                            </section>

                            <section className="study-insights-section">
                                <div className="study-insights-section-head">
                                    <div>
                                        <h2>
                                            <Table2 size={18} />
                                            問題集ごとの実績一覧
                                        </h2>
                                        <p>最近学習した順で、問題集ごとの実績を比較できます。</p>
                                    </div>
                                </div>
                                <p className="study-insights-note">
                                    復習件数は現在の復習対象セットのみ集計しています。アーカイブ済みセットでは 0 件になることがあります。
                                </p>
                                <div className="table-wrapper study-insights-table-wrapper">
                                    <table className="question-table study-insights-table">
                                        <thead>
                                            <tr>
                                                <th>問題集名</th>
                                                <th>種別</th>
                                                <th>累計解答数</th>
                                                <th>累計正答率</th>
                                                <th>最終学習日</th>
                                                <th>未消化復習件数</th>
                                                <th>期限超過復習件数</th>
                                                <th>問題数</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {insights.quizSetRows.map((row: QuizSetPerformanceRow) => (
                                                <tr key={row.quizSetId}>
                                                    <td className="study-insights-set-name-cell">{row.name}</td>
                                                    <td>{getQuizSetTypeLabel(row.type)}</td>
                                                    <td>{formatNumber(row.totalAnswers)}</td>
                                                    <td>{formatPercent(row.accuracyRate)}</td>
                                                    <td>{formatDate(row.lastStudiedAt)}</td>
                                                    <td>{formatNumber(row.dueReviewCount)}</td>
                                                    <td>{formatNumber(row.overdueReviewCount)}</td>
                                                    <td>{formatNumber(row.questionCount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="study-insights-section">
                                <div className="study-insights-dual-grid">
                                    <div className="study-insights-card-block">
                                        <div className="study-insights-section-head">
                                            <div>
                                                <h2>苦手問題集ランキング</h2>
                                                <p>累計解答数 10 件以上の問題集から抽出しています。</p>
                                            </div>
                                        </div>
                                        {hasAnyWeakRows ? (
                                            <ol className="study-insights-ranking-list">
                                                {insights.weakQuizSetRows.map((row, index) => (
                                                    <li key={row.quizSetId} className="study-insights-ranking-item">
                                                        <div className="study-insights-ranking-head">
                                                            <span className="study-insights-ranking-index">{index + 1}</span>
                                                            <div>
                                                                <strong>{row.name}</strong>
                                                                <p>{getQuizSetTypeLabel(row.type)}</p>
                                                            </div>
                                                        </div>
                                                        <div className="study-insights-ranking-metrics">
                                                            <span>{formatPercent(row.accuracyRate)}</span>
                                                            <span>{formatNumber(row.totalAnswers)}問</span>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ol>
                                        ) : (
                                            <div className="study-insights-card-empty">
                                                サンプル数が十分な問題集がまだないため、ランキングは表示されません。
                                            </div>
                                        )}
                                    </div>

                                    <div className="study-insights-card-block">
                                        <div className="study-insights-section-head">
                                            <div>
                                                <h2>
                                                    <CalendarCheck2 size={18} />
                                                    復習状況の要約
                                                </h2>
                                                <p>復習ボードの詳細とは分け、ここでは全体の件数だけを表示します。</p>
                                            </div>
                                        </div>
                                        <div className="study-insights-review-grid">
                                            <article className="study-insights-review-card">
                                                <span>今日時点の未消化復習件数</span>
                                                <strong>{formatNumber(insights.reviewOverview.dueReviewCount)}件</strong>
                                            </article>
                                            <article className="study-insights-review-card">
                                                <span>期限超過復習件数</span>
                                                <strong className="is-danger">{formatNumber(insights.reviewOverview.overdueReviewCount)}件</strong>
                                            </article>
                                            <article className="study-insights-review-card">
                                                <span>今後 7 日以内の復習予定件数</span>
                                                <strong>{formatNumber(insights.reviewOverview.upcomingReviewCount)}件</strong>
                                            </article>
                                            <article className="study-insights-review-card">
                                                <span>復習対象セット数</span>
                                                <strong>{formatNumber(insights.reviewOverview.targetSetCount)}セット</strong>
                                            </article>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </>
                    )}
                </>
            )}
        </main>
    );
};
