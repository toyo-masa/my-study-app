import type { QuizHistory, QuizSetType, QuizSetWithMeta, ReviewSchedule, SuspendedSession } from '../../types';
import { normalizeDailyStudyStats } from '../../utils/dailyStudyStats';

export interface StudyInsightsSummary {
    todayAnswers: number;
    weekAnswers: number;
    monthAnswers: number;
    totalAnswers: number;
    totalAccuracyRate: number | null;
    streakDays: number;
    dueReviewCount: number;
    overdueReviewCount: number;
}

export interface CountSeriesPoint {
    key: string;
    label: string;
    value: number;
    tooltip: string;
}

export interface RateSeriesPoint {
    key: string;
    label: string;
    value: number | null;
    answeredCount: number;
    tooltip: string;
}

export interface RecentSessionRatePoint {
    key: string;
    label: string;
    value: number | null;
    answeredCount: number;
    quizSetId: number;
    quizSetName: string;
    tooltip: string;
}

export interface HeatmapDayCell {
    date: string;
    label: string;
    count: number;
    intensity: number;
    isToday: boolean;
    isFuture: boolean;
}

export interface HeatmapWeekColumn {
    key: string;
    label: string;
    days: HeatmapDayCell[];
}

export interface QuizSetPerformanceRow {
    quizSetId: number;
    name: string;
    type: QuizSetType;
    questionCount: number;
    totalAnswers: number;
    accuracyRate: number | null;
    lastStudiedAt: Date | null;
    dueReviewCount: number;
    overdueReviewCount: number;
}

export interface WeakQuizSetRow {
    quizSetId: number;
    name: string;
    type: QuizSetType;
    totalAnswers: number;
    accuracyRate: number;
}

export interface ReviewOverview {
    dueReviewCount: number;
    overdueReviewCount: number;
    upcomingReviewCount: number;
    targetSetCount: number;
}

export interface StudyInsightsData {
    summary: StudyInsightsSummary;
    answerVolume: {
        daily: CountSeriesPoint[];
        weekly: CountSeriesPoint[];
        monthly: CountSeriesPoint[];
    };
    accuracy: {
        daily: RateSeriesPoint[];
        recentSessions: RecentSessionRatePoint[];
    };
    heatmapWeeks: HeatmapWeekColumn[];
    quizSetRows: QuizSetPerformanceRow[];
    weakQuizSetRows: WeakQuizSetRow[];
    reviewOverview: ReviewOverview;
    hasAnyHistory: boolean;
}

type HistoryTotals = {
    totalCount: number;
    correctCount: number;
};

type SetAggregate = {
    totalAnswers: number;
    totalCorrect: number;
    lastStudiedAt: Date | null;
    dueReviewCount: number;
    overdueReviewCount: number;
};

type DailyTotalsEntry = {
    date: Date;
    dateKey: string;
    totalCount: number;
    correctCount: number;
};

type RecentSessionEntry = {
    history: QuizHistory;
    totalCount: number;
    correctCount: number;
};

const HEATMAP_INTENSITY_LEVELS = 4;

function toSafeDate(input: Date): Date {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate(), input.getHours(), input.getMinutes(), input.getSeconds(), input.getMilliseconds());
}

export function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateString: string): Date | null {
    const parts = dateString.split('-').map(Number);
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
}

function addMonths(date: Date, months: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfWeekMonday(date: Date): Date {
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = target.getDay() === 0 ? -6 : 1 - target.getDay();
    target.setDate(target.getDate() + diff);
    return target;
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDayLabel(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatWeekLabel(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}週`;
}

function formatMonthLabel(date: Date): string {
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatRate(value: number | null): string {
    if (value === null) return '—';
    return `${(value * 100).toFixed(1)}%`;
}

function normalizeCount(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, value);
}

function normalizeRate(correctCount: number, totalCount: number): number | null {
    if (totalCount <= 0) return null;
    return correctCount / totalCount;
}

function accumulateTotals(map: Map<string, HistoryTotals>, key: string, correctCount: number, totalCount: number): void {
    const current = map.get(key) ?? { totalCount: 0, correctCount: 0 };
    current.totalCount += totalCount;
    current.correctCount += correctCount;
    map.set(key, current);
}

function buildHistorySet(quizSets: QuizSetWithMeta[]): Map<number, SetAggregate> {
    const map = new Map<number, SetAggregate>();
    for (const quizSet of quizSets) {
        if (quizSet.id === undefined) continue;
        map.set(quizSet.id, {
            totalAnswers: 0,
            totalCorrect: 0,
            lastStudiedAt: null,
            dueReviewCount: 0,
            overdueReviewCount: 0,
        });
    }
    return map;
}

function getHeatmapIntensity(count: number, maxCount: number): number {
    if (count <= 0 || maxCount <= 0) return 0;
    return Math.max(1, Math.ceil((count / maxCount) * HEATMAP_INTENSITY_LEVELS));
}

function getDailyTotalsEntries(rawDailyStudyStats: QuizHistory['dailyStudyStats'] | SuspendedSession['dailyStudyStats']): DailyTotalsEntry[] {
    const normalizedDailyStudyStats = normalizeDailyStudyStats(rawDailyStudyStats);

    return Object.entries(normalizedDailyStudyStats)
        .flatMap(([dateKey, entry]) => {
            const date = parseLocalDate(dateKey);
            if (!date) {
                return [];
            }

            const totalCount = entry.answeredQuestionIds.length;
            const correctCount = Math.min(totalCount, entry.correctQuestionIds.length);

            return [{
                date,
                dateKey: toLocalDateString(date),
                totalCount,
                correctCount,
            }];
        })
        .sort((left, right) => left.date.getTime() - right.date.getTime());
}

export function buildStudyInsightsData(params: {
    quizSets: QuizSetWithMeta[];
    historiesBySetId: Record<number, QuizHistory[]>;
    reviewSchedules: ReviewSchedule[];
    suspendedSessions?: SuspendedSession[];
    today?: Date;
}): StudyInsightsData {
    const todayDate = params.today ? toSafeDate(params.today) : new Date();
    const todayKey = toLocalDateString(todayDate);
    const weekStartKey = toLocalDateString(startOfWeekMonday(todayDate));
    const monthStartKey = toLocalDateString(startOfMonth(todayDate));
    const upcomingLimitKey = toLocalDateString(addDays(todayDate, 6));

    const dailyTotals = new Map<string, HistoryTotals>();
    const weeklyTotals = new Map<string, HistoryTotals>();
    const monthlyTotals = new Map<string, HistoryTotals>();
    const setAggregates = buildHistorySet(params.quizSets);
    const quizSetNameById = new Map<number, string>();
    const allHistories: RecentSessionEntry[] = [];

    let todayAnswers = 0;
    let weekAnswers = 0;
    let monthAnswers = 0;
    let totalAnswers = 0;
    let totalCorrect = 0;

    const accumulateStudyTotals = (quizSetId: number, date: Date, correctCount: number, totalCount: number) => {
        const safeTotalCount = normalizeCount(totalCount);
        const safeCorrectCount = Math.min(safeTotalCount, normalizeCount(correctCount));
        const dayKey = toLocalDateString(date);
        const weekKey = toLocalDateString(startOfWeekMonday(date));
        const monthKey = toLocalDateString(startOfMonth(date));

        accumulateTotals(dailyTotals, dayKey, safeCorrectCount, safeTotalCount);
        accumulateTotals(weeklyTotals, weekKey, safeCorrectCount, safeTotalCount);
        accumulateTotals(monthlyTotals, monthKey, safeCorrectCount, safeTotalCount);

        if (dayKey === todayKey) {
            todayAnswers += safeTotalCount;
        }
        if (dayKey >= weekStartKey && dayKey <= todayKey) {
            weekAnswers += safeTotalCount;
        }
        if (dayKey >= monthStartKey && dayKey <= todayKey) {
            monthAnswers += safeTotalCount;
        }

        totalAnswers += safeTotalCount;
        totalCorrect += safeCorrectCount;

        const currentSet = setAggregates.get(quizSetId);
        if (currentSet) {
            currentSet.totalAnswers += safeTotalCount;
            currentSet.totalCorrect += safeCorrectCount;
        }
    };

    const updateSetLastStudiedAt = (quizSetId: number, studiedAt: Date | null) => {
        if (!studiedAt || Number.isNaN(studiedAt.getTime())) {
            return;
        }

        const currentSet = setAggregates.get(quizSetId);
        if (!currentSet) {
            return;
        }

        if (!currentSet.lastStudiedAt || studiedAt.getTime() > currentSet.lastStudiedAt.getTime()) {
            currentSet.lastStudiedAt = studiedAt;
        }
    };

    for (const quizSet of params.quizSets) {
        if (quizSet.id === undefined) continue;
        quizSetNameById.set(quizSet.id, quizSet.name);
        const histories = params.historiesBySetId[quizSet.id] ?? [];

        for (const history of histories) {
            const historyDate = new Date(history.date);
            const hasValidHistoryDate = !Number.isNaN(historyDate.getTime());
            const dailyEntries = getDailyTotalsEntries(history.dailyStudyStats);
            const hasDailyBreakdown = dailyEntries.length > 0;

            if (hasDailyBreakdown) {
                dailyEntries.forEach((entry) => {
                    accumulateStudyTotals(history.quizSetId, entry.date, entry.correctCount, entry.totalCount);
                });
            } else if (hasValidHistoryDate) {
                accumulateStudyTotals(history.quizSetId, historyDate, history.correctCount, history.totalCount);
            }

            const latestBreakdownDate = dailyEntries.length > 0 ? dailyEntries[dailyEntries.length - 1].date : null;
            updateSetLastStudiedAt(
                history.quizSetId,
                hasValidHistoryDate ? historyDate : latestBreakdownDate
            );

            const historyTotalCount = hasDailyBreakdown
                ? dailyEntries.reduce((sum, entry) => sum + entry.totalCount, 0)
                : normalizeCount(history.totalCount);
            const historyCorrectCount = hasDailyBreakdown
                ? dailyEntries.reduce((sum, entry) => sum + entry.correctCount, 0)
                : Math.min(historyTotalCount, normalizeCount(history.correctCount));

            if (hasValidHistoryDate) {
                allHistories.push({
                    history,
                    totalCount: historyTotalCount,
                    correctCount: historyCorrectCount,
                });
            }
        }
    }

    (params.suspendedSessions || []).forEach((session) => {
        const quizSetId = session.questions.find((question) => question.quizSetId !== undefined)?.quizSetId;
        if (typeof quizSetId !== 'number' || !Number.isInteger(quizSetId) || quizSetId <= 0) {
            return;
        }
        const safeQuizSetId = quizSetId;

        const dailyEntries = getDailyTotalsEntries(session.dailyStudyStats);
        if (dailyEntries.length === 0) {
            return;
        }
        dailyEntries.forEach((entry) => {
            accumulateStudyTotals(safeQuizSetId, entry.date, entry.correctCount, entry.totalCount);
        });

        const latestBreakdownDate = dailyEntries.length > 0 ? dailyEntries[dailyEntries.length - 1].date : null;
        updateSetLastStudiedAt(
            safeQuizSetId,
            session.updatedAt && !Number.isNaN(session.updatedAt.getTime())
                ? session.updatedAt
                : latestBreakdownDate
        );
    });

    let dueReviewCount = 0;
    let overdueReviewCount = 0;
    let upcomingReviewCount = 0;
    const reviewTargetSetIds = new Set<number>();

    for (const schedule of params.reviewSchedules) {
        reviewTargetSetIds.add(schedule.quizSetId);
        if (schedule.nextDue <= todayKey) {
            dueReviewCount += 1;
            const setAggregate = setAggregates.get(schedule.quizSetId);
            if (setAggregate) {
                setAggregate.dueReviewCount += 1;
            }
        }
        if (schedule.nextDue < todayKey) {
            overdueReviewCount += 1;
            const setAggregate = setAggregates.get(schedule.quizSetId);
            if (setAggregate) {
                setAggregate.overdueReviewCount += 1;
            }
        }
        if (schedule.nextDue >= todayKey && schedule.nextDue <= upcomingLimitKey) {
            upcomingReviewCount += 1;
        }
    }

    const studiedDayKeys = new Set<string>();
    for (const [dayKey, totals] of dailyTotals.entries()) {
        if (totals.totalCount > 0) {
            studiedDayKeys.add(dayKey);
        }
    }

    let streakDays = 0;
    for (let cursor = toSafeDate(todayDate);; cursor = addDays(cursor, -1)) {
        const cursorKey = toLocalDateString(cursor);
        if (!studiedDayKeys.has(cursorKey)) {
            break;
        }
        streakDays += 1;
    }

    const dailyVolumeSeries: CountSeriesPoint[] = [];
    for (let index = 29; index >= 0; index -= 1) {
        const date = addDays(todayDate, -index);
        const key = toLocalDateString(date);
        const totalCount = dailyTotals.get(key)?.totalCount ?? 0;
        dailyVolumeSeries.push({
            key,
            label: formatDayLabel(date),
            value: totalCount,
            tooltip: `${key}: ${totalCount}問`,
        });
    }

    const weeklyVolumeSeries: CountSeriesPoint[] = [];
    const currentWeekStart = startOfWeekMonday(todayDate);
    for (let index = 11; index >= 0; index -= 1) {
        const weekStart = addDays(currentWeekStart, -index * 7);
        const key = toLocalDateString(weekStart);
        const totalCount = weeklyTotals.get(key)?.totalCount ?? 0;
        weeklyVolumeSeries.push({
            key,
            label: formatWeekLabel(weekStart),
            value: totalCount,
            tooltip: `${formatWeekLabel(weekStart)}: ${totalCount}問`,
        });
    }

    const monthlyVolumeSeries: CountSeriesPoint[] = [];
    const currentMonthStart = startOfMonth(todayDate);
    for (let index = 11; index >= 0; index -= 1) {
        const monthStart = addMonths(currentMonthStart, -index);
        const key = toLocalDateString(monthStart);
        const monthTotals = monthlyTotals.get(key);
        const totalCount = monthTotals?.totalCount ?? 0;
        monthlyVolumeSeries.push({
            key,
            label: formatMonthLabel(monthStart),
            value: totalCount,
            tooltip: `${formatMonthLabel(monthStart)}: ${totalCount}問`,
        });
    }

    const dailyAccuracySeries: RateSeriesPoint[] = [];
    for (let index = 29; index >= 0; index -= 1) {
        const date = addDays(todayDate, -index);
        const key = toLocalDateString(date);
        const totals = dailyTotals.get(key);
        const value = totals ? normalizeRate(totals.correctCount, totals.totalCount) : null;
        dailyAccuracySeries.push({
            key,
            label: formatDayLabel(date),
            value,
            answeredCount: totals?.totalCount ?? 0,
            tooltip: totals
                ? `${key}: ${formatRate(value)} (${totals.correctCount}/${totals.totalCount})`
                : `${key}: データなし`,
        });
    }

    const recentSessions = [...allHistories]
        .sort((left, right) => new Date(right.history.date).getTime() - new Date(left.history.date).getTime())
        .slice(0, 10)
        .reverse()
        .map((entry): RecentSessionRatePoint => {
            const totalCount = normalizeCount(entry.totalCount);
            const correctCount = Math.min(totalCount, normalizeCount(entry.correctCount));
            const value = normalizeRate(correctCount, totalCount);
            const history = entry.history;
            const historyDate = new Date(history.date);
            const dateLabel = historyDate.toLocaleString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
            const quizSetName = quizSetNameById.get(history.quizSetId) ?? `セット #${history.quizSetId}`;
            return {
                key: `${history.quizSetId}-${history.id ?? historyDate.getTime()}`,
                label: formatDayLabel(historyDate),
                value,
                answeredCount: totalCount,
                quizSetId: history.quizSetId,
                quizSetName,
                tooltip: `${dateLabel} ${quizSetName}: ${formatRate(value)} (${correctCount}/${totalCount})`,
            };
        });

    const heatmapWeekColumns: HeatmapWeekColumn[] = [];
    const firstHeatmapWeekStart = addDays(currentWeekStart, -11 * 7);
    const heatmapCounts: number[] = [];
    for (let weekIndex = 0; weekIndex < 12; weekIndex += 1) {
        const weekStart = addDays(firstHeatmapWeekStart, weekIndex * 7);
        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
            const date = addDays(weekStart, dayIndex);
            const key = toLocalDateString(date);
            if (key > todayKey) continue;
            heatmapCounts.push(dailyTotals.get(key)?.totalCount ?? 0);
        }
    }
    const maxHeatmapCount = heatmapCounts.reduce((max, value) => Math.max(max, value), 0);

    for (let weekIndex = 0; weekIndex < 12; weekIndex += 1) {
        const weekStart = addDays(firstHeatmapWeekStart, weekIndex * 7);
        const weekKey = toLocalDateString(weekStart);
        const days: HeatmapDayCell[] = [];
        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
            const date = addDays(weekStart, dayIndex);
            const key = toLocalDateString(date);
            const isFuture = key > todayKey;
            const count = isFuture ? 0 : dailyTotals.get(key)?.totalCount ?? 0;
            days.push({
                date: key,
                label: formatDayLabel(date),
                count,
                intensity: isFuture ? 0 : getHeatmapIntensity(count, maxHeatmapCount),
                isToday: key === todayKey,
                isFuture,
            });
        }

        heatmapWeekColumns.push({
            key: weekKey,
            label: formatWeekLabel(weekStart),
            days,
        });
    }

    const quizSetRows = params.quizSets
        .filter((quizSet): quizSet is QuizSetWithMeta & { id: number } => quizSet.id !== undefined)
        .map((quizSet): QuizSetPerformanceRow => {
            const setAggregate = setAggregates.get(quizSet.id) ?? {
                totalAnswers: 0,
                totalCorrect: 0,
                lastStudiedAt: null,
                dueReviewCount: 0,
                overdueReviewCount: 0,
            };
            return {
                quizSetId: quizSet.id,
                name: quizSet.name,
                type: quizSet.type ?? 'quiz',
                questionCount: quizSet.questionCount,
                totalAnswers: setAggregate.totalAnswers,
                accuracyRate: normalizeRate(setAggregate.totalCorrect, setAggregate.totalAnswers),
                lastStudiedAt: setAggregate.lastStudiedAt,
                dueReviewCount: setAggregate.dueReviewCount,
                overdueReviewCount: setAggregate.overdueReviewCount,
            };
        })
        .sort((left, right) => {
            if (left.lastStudiedAt && right.lastStudiedAt) {
                const lastStudiedDiff = right.lastStudiedAt.getTime() - left.lastStudiedAt.getTime();
                if (lastStudiedDiff !== 0) return lastStudiedDiff;
            } else if (left.lastStudiedAt) {
                return -1;
            } else if (right.lastStudiedAt) {
                return 1;
            }

            if (right.totalAnswers !== left.totalAnswers) {
                return right.totalAnswers - left.totalAnswers;
            }
            return left.name.localeCompare(right.name, 'ja');
        });

    const weakQuizSetRows = quizSetRows
        .filter((row): row is QuizSetPerformanceRow & { accuracyRate: number } => row.totalAnswers >= 10 && row.accuracyRate !== null)
        .sort((left, right) => {
            if (left.accuracyRate !== right.accuracyRate) {
                return left.accuracyRate - right.accuracyRate;
            }
            if (right.totalAnswers !== left.totalAnswers) {
                return right.totalAnswers - left.totalAnswers;
            }
            return left.name.localeCompare(right.name, 'ja');
        })
        .slice(0, 5)
        .map((row) => ({
            quizSetId: row.quizSetId,
            name: row.name,
            type: row.type,
            totalAnswers: row.totalAnswers,
            accuracyRate: row.accuracyRate,
        }));

    return {
        summary: {
            todayAnswers,
            weekAnswers,
            monthAnswers,
            totalAnswers,
            totalAccuracyRate: normalizeRate(totalCorrect, totalAnswers),
            streakDays,
            dueReviewCount,
            overdueReviewCount,
        },
        answerVolume: {
            daily: dailyVolumeSeries,
            weekly: weeklyVolumeSeries,
            monthly: monthlyVolumeSeries,
        },
        accuracy: {
            daily: dailyAccuracySeries,
            recentSessions,
        },
        heatmapWeeks: heatmapWeekColumns,
        quizSetRows,
        weakQuizSetRows,
        reviewOverview: {
            dueReviewCount,
            overdueReviewCount,
            upcomingReviewCount,
            targetSetCount: reviewTargetSetIds.size,
        },
        hasAnyHistory: totalAnswers > 0,
    };
}
