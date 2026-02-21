import Dexie, { type Table } from 'dexie';
import type { Question, QuizSet, QuizHistory, ReviewSchedule, ReviewLog, QuizSetType } from './types';

class StudyAppDB extends Dexie {
    quizSets!: Table<QuizSet>;
    questions!: Table<Question>;
    histories!: Table<QuizHistory>;
    reviewSchedules!: Table<ReviewSchedule>;
    reviewLogs!: Table<ReviewLog>;

    constructor() {
        super('StudyAppDB');
        this.version(1).stores({
            quizSets: '++id, name',
            questions: '++id, quizSetId, category',
        });

        // Version 2: 履歴テーブル追加
        this.version(2).stores({
            histories: '++id, quizSetId, date',
        });

        // Version 3: 復習スケジューラ用テーブル追加
        this.version(3).stores({
            reviewSchedules: '++id, questionId, quizSetId, nextDue, [quizSetId+nextDue]',
            reviewLogs: '++id, questionId, quizSetId, reviewedAt',
        });
    }
}

export const db = new StudyAppDB();

// Helper: Get all active quiz sets with question counts
export async function getQuizSetsWithCounts(includeDeleted: boolean = false): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
    let sets: QuizSet[];
    if (includeDeleted) {
        sets = await db.quizSets.toArray();
    } else {
        sets = await db.quizSets.filter(qs => !qs.isDeleted && !qs.isArchived).toArray();
    }
    const result = [];
    for (const qs of sets) {
        const questions = await db.questions.where('quizSetId').equals(qs.id!).toArray();
        const categories = qs.tags || [];
        result.push({ ...qs, questionCount: questions.length, categories });
    }
    return result;
}

// Helper: Get all deleted quiz sets
export async function getDeletedQuizSets(): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
    const sets = await db.quizSets.filter(qs => !!qs.isDeleted).toArray();
    const result = [];
    for (const qs of sets) {
        const questions = await db.questions.where('quizSetId').equals(qs.id!).toArray();
        const categories = qs.tags || [];
        result.push({ ...qs, questionCount: questions.length, categories });
    }
    return result;
}

// Helper: Get all archived quiz sets
export async function getArchivedQuizSets(): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
    const sets = await db.quizSets.filter(qs => !qs.isDeleted && !!qs.isArchived).toArray();
    const result = [];
    for (const qs of sets) {
        const questions = await db.questions.where('quizSetId').equals(qs.id!).toArray();
        const categories = qs.tags || [];
        result.push({ ...qs, questionCount: questions.length, categories });
    }
    return result;
}

// Helper: Get questions for a quiz set
export async function getQuestionsForQuizSet(quizSetId: number): Promise<Question[]> {
    return db.questions.where('quizSetId').equals(quizSetId).toArray();
}

// Helper: Add a quiz set with questions
export async function addQuizSetWithQuestions(name: string, questions: Omit<Question, 'id' | 'quizSetId'>[], type: QuizSetType = 'quiz'): Promise<number> {
    const quizSetId = await db.quizSets.add({ name, createdAt: new Date(), type });
    const questionsWithSetId = questions.map(q => ({ ...q, quizSetId: quizSetId as number }));
    await db.questions.bulkAdd(questionsWithSetId);
    return quizSetId as number;
}

// Helper: Soft delete a quiz set
export async function softDeleteQuizSet(quizSetId: number): Promise<number> {
    return await db.quizSets.update(quizSetId, { isDeleted: true });
}

// Helper: Restore a quiz set
export async function restoreQuizSet(quizSetId: number): Promise<number> {
    return await db.quizSets.update(quizSetId, { isDeleted: false });
}

// Helper: Archive a quiz set
export async function archiveQuizSet(quizSetId: number): Promise<number> {
    return await db.quizSets.update(quizSetId, { isArchived: true });
}

// Helper: Unarchive a quiz set
export async function unarchiveQuizSet(quizSetId: number): Promise<number> {
    return await db.quizSets.update(quizSetId, { isArchived: false });
}

// Helper: Hard delete a quiz set and its questions
export async function hardDeleteQuizSet(quizSetId: number): Promise<void> {
    await db.questions.where('quizSetId').equals(quizSetId).delete();
    await db.histories.where('quizSetId').equals(quizSetId).delete();
    await db.reviewSchedules.where('quizSetId').equals(quizSetId).delete();
    await db.reviewLogs.where('quizSetId').equals(quizSetId).delete();
    await db.quizSets.delete(quizSetId);
}

// Deprecated: Alias for backward compatibility if needed, but prefer hardDeleteQuizSet or softDeleteQuizSet explicitly
export const deleteQuizSet = hardDeleteQuizSet;

// Helper: Reset review schedules for a quiz set
export async function resetReviewSchedules(quizSetId: number): Promise<number> {
    const deleted = await db.reviewSchedules.where('quizSetId').equals(quizSetId).delete();
    await db.reviewLogs.where('quizSetId').equals(quizSetId).delete();
    return deleted;
}

// Helper: Update a single question
export async function updateQuestion(id: number, changes: Partial<Question>): Promise<void> {
    await db.questions.update(id, changes);
}

// Helper: Update quiz set metadata
export async function updateQuizSet(id: number, changes: Partial<QuizSet>): Promise<void> {
    await db.quizSets.update(id, changes);
}

// Helper: Add a single question
export async function addQuestion(question: Omit<Question, 'id'>): Promise<number> {
    return await db.questions.add(question as Question) as number;
}

// Helper: Delete a single question
export async function deleteQuestion(id: number): Promise<void> {
    await db.questions.delete(id);
}

// Helper: Add history record
export async function addHistory(history: Omit<QuizHistory, 'id'>): Promise<number> {
    return await db.histories.add(history as QuizHistory) as number;
}

// Helper: Get histories for a quiz set
export async function getHistories(quizSetId: number): Promise<QuizHistory[]> {
    return db.histories.where('quizSetId').equals(quizSetId).reverse().sortBy('date');
}

// Helper: Check if DB has been seeded
export async function isDBSeeded(): Promise<boolean> {
    const count = await db.quizSets.count();
    return count > 0;
}

// === 復習スケジューラ用ヘルパー ===

/** 今日の日付を 'YYYY-MM-DD' 形式で取得 */
export function getTodayString(): string {
    const now = new Date();
    return now.toISOString().slice(0, 10);
}

/** 指定した問題集の Due（期限切れ）復習スケジュールを取得 */
export async function getDueReviews(
    quizSetId?: number,
    filters?: {
        overdueOnly?: boolean;
        lowConfidenceOnly?: boolean;
        categories?: string[];
    }
): Promise<(ReviewSchedule & { question?: Question })[]> {
    const today = getTodayString();
    let schedules: ReviewSchedule[];

    if (quizSetId !== undefined) {
        schedules = await db.reviewSchedules
            .where('quizSetId').equals(quizSetId)
            .filter(s => s.nextDue <= today)
            .toArray();
    } else {
        schedules = await db.reviewSchedules
            .filter(s => s.nextDue <= today)
            .toArray();
    }

    // 問題情報を付与
    const results: (ReviewSchedule & { question?: Question })[] = [];
    for (const schedule of schedules) {
        const question = await db.questions.get(schedule.questionId);
        if (!question) continue; // 問題が削除されていたらスキップ

        // カテゴリフィルタ
        if (filters?.categories && filters.categories.length > 0) {
            if (!filters.categories.includes(question.category || 'General')) continue;
        }

        // 期限超過のみフィルタ（today より前の nextDue）
        if (filters?.overdueOnly && schedule.nextDue >= today) continue;

        // 自信なしフィルタ: 直近のログが low confidence
        if (filters?.lowConfidenceOnly) {
            const lastLog = await db.reviewLogs
                .where('questionId').equals(schedule.questionId)
                .reverse().sortBy('reviewedAt');
            if (lastLog.length === 0 || lastLog[0].confidence !== 'low') continue;
        }

        results.push({ ...schedule, question });
    }

    // ソート: nextDue が古い順 → 連続正解数が少ない順（不正解が多い）
    results.sort((a, b) => {
        const dateCmp = a.nextDue.localeCompare(b.nextDue);
        if (dateCmp !== 0) return dateCmp;
        return a.consecutiveCorrect - b.consecutiveCorrect;
    });

    return results;
}

/** 復習スケジュールを作成 or 更新 */
export async function upsertReviewSchedule(schedule: Omit<ReviewSchedule, 'id'> & { id?: number }): Promise<number> {
    // questionId で既存レコードを検索
    const existing = await db.reviewSchedules
        .where('questionId').equals(schedule.questionId)
        .first();

    if (existing) {
        await db.reviewSchedules.update(existing.id!, {
            intervalDays: schedule.intervalDays,
            nextDue: schedule.nextDue,
            lastReviewedAt: schedule.lastReviewedAt,
            consecutiveCorrect: schedule.consecutiveCorrect,
        });
        return existing.id!;
    } else {
        return await db.reviewSchedules.add(schedule as ReviewSchedule) as number;
    }
}

/** 復習ログを保存 */
export async function addReviewLog(log: Omit<ReviewLog, 'id'>): Promise<number> {
    return await db.reviewLogs.add(log as ReviewLog) as number;
}

/** 問題集の全問題に初期スケジュールを作成（未登録の問題のみ） */
export async function initializeReviewSchedules(quizSetId: number): Promise<number> {
    const questions = await db.questions.where('quizSetId').equals(quizSetId).toArray();
    const today = getTodayString();
    let addedCount = 0;

    for (const q of questions) {
        if (!q.id) continue;
        const existing = await db.reviewSchedules
            .where('questionId').equals(q.id)
            .first();
        if (!existing) {
            await db.reviewSchedules.add({
                questionId: q.id,
                quizSetId,
                intervalDays: 1,
                nextDue: today,
                consecutiveCorrect: 0,
            });
            addedCount++;
        }
    }
    return addedCount;
}

/** 指定した問題集のスケジュール済み件数・Due件数を取得 */
export async function getReviewCounts(quizSetId?: number): Promise<{ total: number; due: number }> {
    const today = getTodayString();
    let allSchedules: ReviewSchedule[];

    if (quizSetId !== undefined) {
        allSchedules = await db.reviewSchedules
            .where('quizSetId').equals(quizSetId)
            .toArray();
    } else {
        // 全体の場合は、削除されていない問題集のスケジュールのみ対象にする
        // Dexie doesn't support complex joins in one query easily, so we might fetch active sets first
        const activeSetIds = (await db.quizSets.filter(qs => !qs.isDeleted).keys()); // keys() returns primary keys

        allSchedules = await db.reviewSchedules
            .where('quizSetId').anyOf(activeSetIds as number[])
            .toArray();
    }

    const due = allSchedules.filter(s => s.nextDue <= today).length;
    return { total: allSchedules.length, due };
}

/** 問題集の全カテゴリ一覧を取得 */
export async function getCategoriesForQuizSet(quizSetId: number): Promise<string[]> {
    const questions = await db.questions.where('quizSetId').equals(quizSetId).toArray();
    return [...new Set(questions.map(q => q.category || 'General'))];
}

/** Due の一部を翌日に先送り（最大 maxPercent% まで） */
export async function postponeReviews(
    quizSetId: number,
    maxPercent: number = 20
): Promise<number> {
    const dueReviews = await getDueReviews(quizSetId);
    const maxPostpone = Math.max(1, Math.floor(dueReviews.length * maxPercent / 100));

    // 連続正解数が多い順（優先度が低い）から先送り
    const sorted = [...dueReviews].sort((a, b) => b.consecutiveCorrect - a.consecutiveCorrect);
    const toPostpone = sorted.slice(0, maxPostpone);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    for (const schedule of toPostpone) {
        if (schedule.id) {
            await db.reviewSchedules.update(schedule.id, { nextDue: tomorrowStr });
        }
    }
    return toPostpone.length;
}
/** 苦手問題（連続正解数が少ない、間隔が短い）を取得 */
export async function getWeakestQuestions(
    quizSetId: number,
    limit: number = 10
): Promise<(ReviewSchedule & { question?: Question })[]> {
    // 復習スケジュールがある問題の中から
    let schedules = await db.reviewSchedules
        .where('quizSetId').equals(quizSetId)
        .toArray();

    // ソート: 連続正解数が少ない順 > 間隔が短い順 > 最終復習日が古い順
    schedules.sort((a, b) => {
        if (a.consecutiveCorrect !== b.consecutiveCorrect) {
            return a.consecutiveCorrect - b.consecutiveCorrect;
        }
        if (a.intervalDays !== b.intervalDays) {
            return a.intervalDays - b.intervalDays;
        }
        // lastReviewedAt がない場合（undefined）の比較も考慮
        const aDate = a.lastReviewedAt || '';
        const bDate = b.lastReviewedAt || '';
        return aDate.localeCompare(bDate);
    });

    const results: (ReviewSchedule & { question?: Question })[] = [];
    // 上位 limit 件を取得（問題データが存在するもののみ）
    for (const schedule of schedules) {
        if (results.length >= limit) break;
        const question = await db.questions.get(schedule.questionId);
        if (question) {
            results.push({ ...schedule, question });
        }
    }
    return results;
}
