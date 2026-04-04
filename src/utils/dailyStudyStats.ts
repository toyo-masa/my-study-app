import type { DailyStudyStats } from '../types';

export type DailyStudyRecord = {
    questionId: number;
    isCorrect: boolean;
};

function isValidQuestionId(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function normalizeQuestionIdList(value: unknown): number[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return [...new Set(
        value.filter((questionId): questionId is number => isValidQuestionId(questionId))
    )];
}

export function getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function normalizeDailyStudyStats(raw: unknown): DailyStudyStats {
    if (!raw || typeof raw !== 'object') {
        return {};
    }

    const source = raw as Record<string, unknown>;
    const normalizedEntries = Object.entries(source).flatMap(([dateKey, value]) => {
        if (!value || typeof value !== 'object') {
            return [];
        }

        const entry = value as Record<string, unknown>;
        const answeredQuestionIds = normalizeQuestionIdList(entry.answeredQuestionIds);
        const answeredSet = new Set(answeredQuestionIds);
        const correctQuestionIds = normalizeQuestionIdList(entry.correctQuestionIds)
            .filter((questionId) => answeredSet.has(questionId));

        return [[dateKey, {
            answeredQuestionIds,
            correctQuestionIds,
        }] as const];
    });

    return Object.fromEntries(normalizedEntries);
}

export function buildRecordedQuestionIdSet(stats: DailyStudyStats | undefined): Set<number> {
    const normalized = normalizeDailyStudyStats(stats);
    const recordedQuestionIds = new Set<number>();

    Object.values(normalized).forEach((entry) => {
        entry.answeredQuestionIds.forEach((questionId) => {
            recordedQuestionIds.add(questionId);
        });
    });

    return recordedQuestionIds;
}

export function appendDailyStudyStats(
    currentStats: DailyStudyStats | undefined,
    dateKey: string,
    records: DailyStudyRecord[]
): DailyStudyStats {
    const normalized = normalizeDailyStudyStats(currentStats);
    const recordedQuestionIds = buildRecordedQuestionIdSet(normalized);
    const uniqueRecords: DailyStudyRecord[] = [];

    records.forEach((record) => {
        if (!isValidQuestionId(record.questionId) || recordedQuestionIds.has(record.questionId)) {
            return;
        }

        recordedQuestionIds.add(record.questionId);
        uniqueRecords.push(record);
    });

    if (uniqueRecords.length === 0) {
        return normalized;
    }

    const currentEntry = normalized[dateKey] ?? {
        answeredQuestionIds: [],
        correctQuestionIds: [],
    };

    return {
        ...normalized,
        [dateKey]: {
            answeredQuestionIds: [...currentEntry.answeredQuestionIds, ...uniqueRecords.map((record) => record.questionId)],
            correctQuestionIds: [
                ...currentEntry.correctQuestionIds,
                ...uniqueRecords.filter((record) => record.isCorrect).map((record) => record.questionId),
            ],
        },
    };
}
