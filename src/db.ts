import Dexie, { type Table } from 'dexie';
import type { Question, QuizSet, QuizHistory, ReviewSchedule, ReviewLog, QuizSetType, HomeOnboardingState, HomeOnboardingFlowStage } from './types';
import { cloudApi } from './cloudApi';
import { isCloudSyncEnabledInStorage } from './utils/settings';

export function isCloudSyncEnabled(): boolean {
    return isCloudSyncEnabledInStorage();
}

type LocalAppSetting = {
    key: string;
    value: string;
    updatedAt: string;
};

const HOME_ONBOARDING_SETTING_KEY = 'homeOnboardingState';

class StudyAppDB extends Dexie {
    quizSets!: Table<QuizSet>;
    questions!: Table<Question>;
    histories!: Table<QuizHistory>;
    reviewSchedules!: Table<ReviewSchedule>;
    reviewLogs!: Table<ReviewLog>;
    appSettings!: Table<LocalAppSetting, string>;

    constructor() {
        super('StudyAppDB');
        this.version(1).stores({
            quizSets: '++id, name',
            questions: '++id, quizSetId, category',
        });
        this.version(2).stores({
            histories: '++id, quizSetId, date',
        });
        this.version(3).stores({
            reviewSchedules: '++id, questionId, quizSetId, nextDue, [quizSetId+nextDue]',
            reviewLogs: '++id, questionId, quizSetId, reviewedAt',
        });
        this.version(4).stores({
            quizSets: '++id, name',
            questions: '++id, quizSetId, category',
            histories: '++id, quizSetId, date',
            reviewSchedules: '++id, questionId, quizSetId, nextDue, [quizSetId+nextDue], [quizSetId+questionId]',
            reviewLogs: '++id, questionId, quizSetId, reviewedAt',
            appSettings: '&key',
        });
    }
}

const db = new StudyAppDB();

// === Helper Wrappers for Cloud & Local Storage ===

async function buildQuizSetMetasLocal(sets: QuizSet[]): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
    if (sets.length === 0) return [];

    const setIds = sets
        .map(qs => qs.id)
        .filter((id): id is number => typeof id === 'number');

    const countBySetId = new Map<number, number>();
    if (setIds.length > 0) {
        const questions = await db.questions.where('quizSetId').anyOf(setIds).toArray();
        for (const question of questions) {
            const current = countBySetId.get(question.quizSetId) || 0;
            countBySetId.set(question.quizSetId, current + 1);
        }
    }

    return sets.map(qs => ({
        ...qs,
        questionCount: qs.id !== undefined ? (countBySetId.get(qs.id) || 0) : 0,
        categories: qs.tags || []
    }));
}

export async function getAllQuizSets(): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
    if (isCloudSyncEnabled()) return cloudApi.getQuizSets({ all: true });
    const sets = await db.quizSets.toArray();
    return buildQuizSetMetasLocal(sets);
}

export async function getQuizSetsWithCounts(includeDeleted: boolean = false): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
    if (isCloudSyncEnabled()) return cloudApi.getQuizSets({ includeDeleted });
    const sets = includeDeleted ? await db.quizSets.toArray() : await db.quizSets.filter(qs => !qs.isDeleted && !qs.isArchived).toArray();
    return buildQuizSetMetasLocal(sets);
}

export async function getDeletedQuizSets(): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
    if (isCloudSyncEnabled()) {
        const sets = await cloudApi.getQuizSets({ includeDeleted: true });
        return sets.filter(s => !!s.isDeleted);
    }
    const sets = await db.quizSets.filter(qs => !!qs.isDeleted).toArray();
    return buildQuizSetMetasLocal(sets);
}

export async function getArchivedQuizSets(): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
    if (isCloudSyncEnabled()) return cloudApi.getQuizSets({ archivedOnly: true });
    const sets = await db.quizSets.filter(qs => !qs.isDeleted && !!qs.isArchived).toArray();
    return buildQuizSetMetasLocal(sets);
}

export async function getQuestionsForQuizSet(quizSetId: number): Promise<Question[]> {
    if (isCloudSyncEnabled()) return cloudApi.getQuestions(quizSetId);
    return db.questions.where('quizSetId').equals(quizSetId).toArray();
}

export async function addQuizSetWithQuestions(name: string, questions: Omit<Question, 'id' | 'quizSetId'>[], type: QuizSetType = 'quiz'): Promise<number> {
    if (isCloudSyncEnabled()) return cloudApi.addQuizSet(name, type, questions);
    const now = new Date();
    const quizSetId = await db.quizSets.add({ name, createdAt: now, updatedAt: now, type });
    const questionsWithSetId = questions.map(q => ({ ...q, quizSetId: quizSetId as number }));
    await db.questions.bulkAdd(questionsWithSetId);
    return quizSetId as number;
}

export async function softDeleteQuizSet(quizSetId: number): Promise<number> {
    if (isCloudSyncEnabled()) { await cloudApi.updateQuizSet(quizSetId, { isDeleted: true }); return 1; }
    return await db.quizSets.update(quizSetId, { isDeleted: true, updatedAt: new Date() });
}

export async function restoreQuizSet(quizSetId: number): Promise<number> {
    if (isCloudSyncEnabled()) { await cloudApi.updateQuizSet(quizSetId, { isDeleted: false }); return 1; }
    return await db.quizSets.update(quizSetId, { isDeleted: false, updatedAt: new Date() });
}

export async function archiveQuizSet(quizSetId: number): Promise<number> {
    if (isCloudSyncEnabled()) { await cloudApi.updateQuizSet(quizSetId, { isArchived: true }); return 1; }
    return await db.quizSets.update(quizSetId, { isArchived: true, updatedAt: new Date() });
}

export async function unarchiveQuizSet(quizSetId: number): Promise<number> {
    if (isCloudSyncEnabled()) { await cloudApi.updateQuizSet(quizSetId, { isArchived: false }); return 1; }
    return await db.quizSets.update(quizSetId, { isArchived: false, updatedAt: new Date() });
}

export async function hardDeleteQuizSet(quizSetId: number): Promise<void> {
    if (isCloudSyncEnabled()) return cloudApi.deleteQuizSet(quizSetId);
    await db.questions.where('quizSetId').equals(quizSetId).delete();
    await db.histories.where('quizSetId').equals(quizSetId).delete();
    await db.reviewSchedules.where('quizSetId').equals(quizSetId).delete();
    await db.reviewLogs.where('quizSetId').equals(quizSetId).delete();
    await db.quizSets.delete(quizSetId);
}

export async function updateQuestion(id: number, changes: Partial<Question>): Promise<void> {
    if (isCloudSyncEnabled()) return cloudApi.updateQuestion(id, changes);
    await db.questions.update(id, changes);
}

export async function updateQuizSet(id: number, changes: Partial<QuizSet>): Promise<void> {
    if (isCloudSyncEnabled()) return cloudApi.updateQuizSet(id, changes);
    await db.quizSets.update(id, { ...changes, updatedAt: new Date() });
}

export async function addQuestion(question: Omit<Question, 'id'>): Promise<number> {
    if (isCloudSyncEnabled()) return cloudApi.addQuestion(question);
    return await db.questions.add(question as Question) as number;
}

export async function addQuestionsBulk(questions: Omit<Question, 'id'>[]): Promise<number[]> {
    if (isCloudSyncEnabled()) return cloudApi.addQuestionsBulk(questions);
    return await Promise.all(questions.map(q => db.questions.add(q as Question))) as number[];
}

export async function deleteQuestion(id: number): Promise<void> {
    if (isCloudSyncEnabled()) return cloudApi.deleteQuestion(id);
    await db.questions.delete(id);
}

export async function addHistory(history: Omit<QuizHistory, 'id'>): Promise<number> {
    if (isCloudSyncEnabled()) return cloudApi.addHistory(history);
    return await db.histories.add(history as QuizHistory) as number;
}

export async function getHistories(quizSetId: number): Promise<QuizHistory[]> {
    if (isCloudSyncEnabled()) return cloudApi.getHistories(quizSetId);
    return db.histories.where('quizSetId').equals(quizSetId).reverse().sortBy('date');
}

function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getTodayString(): string {
    return toLocalDateString(new Date());
}

export async function getDueReviews(
    quizSetId?: number,
    filters?: { overdueOnly?: boolean; lowConfidenceOnly?: boolean; categories?: string[]; }
): Promise<(ReviewSchedule & { question?: Question })[]> {
    const today = getTodayString();
    const cloud = isCloudSyncEnabled();
    let schedules: ReviewSchedule[];

    if (cloud) {
        schedules = await cloudApi.getDueReviews(quizSetId);
        schedules = schedules.filter(s => s.nextDue <= today);
    } else {
        if (quizSetId !== undefined) {
            const targetSet = await db.quizSets.get(quizSetId);
            if (!targetSet || targetSet.isDeleted || targetSet.isArchived || targetSet.isReviewExcluded) {
                return [];
            }
            schedules = await db.reviewSchedules.where('quizSetId').equals(quizSetId).filter(s => s.nextDue <= today).toArray();
        } else {
            const activeSetIds = (await db.quizSets
                .filter((set) => !set.isDeleted && !set.isArchived && !set.isReviewExcluded)
                .primaryKeys()) as number[];
            if (activeSetIds.length === 0) {
                return [];
            }
            schedules = await db.reviewSchedules
                .where('quizSetId')
                .anyOf(activeSetIds)
                .filter(s => s.nextDue <= today)
                .toArray();
        }
    }

    const questionIds = [...new Set(schedules.map(s => s.questionId))];
    const questionMap = new Map<number, Question>();

    if (questionIds.length > 0) {
        if (cloud) {
            const quizSetIds = [...new Set(schedules.map(s => s.quizSetId))];
            const questionsBySet = await Promise.all(quizSetIds.map(setId => cloudApi.getQuestions(setId)));
            for (const questions of questionsBySet) {
                for (const question of questions) {
                    if (question.id !== undefined) {
                        questionMap.set(question.id, question);
                    }
                }
            }
        } else {
            const questions = await db.questions.where('id').anyOf(questionIds).toArray();
            for (const question of questions) {
                if (question.id !== undefined) {
                    questionMap.set(question.id, question);
                }
            }
        }
    }

    let latestConfidenceByQuestion: Map<number, ReviewLog['confidence']> | null = null;
    if (filters?.lowConfidenceOnly) {
        latestConfidenceByQuestion = new Map<number, ReviewLog['confidence']>();

        if (questionIds.length > 0) {
            if (cloud) {
                const quizSetIds = [...new Set(schedules.map(s => s.quizSetId))];
                const logsBySet = await Promise.all(
                    quizSetIds.map(setId => cloudApi.getReviewLogsByQuizSet(setId, { latestByQuestion: true }))
                );
                for (const logs of logsBySet) {
                    for (const log of logs) {
                        if (!latestConfidenceByQuestion.has(log.questionId)) {
                            latestConfidenceByQuestion.set(log.questionId, log.confidence);
                        }
                    }
                }
            } else {
                const logs = await db.reviewLogs.where('questionId').anyOf(questionIds).toArray();
                logs.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
                for (const log of logs) {
                    if (!latestConfidenceByQuestion.has(log.questionId)) {
                        latestConfidenceByQuestion.set(log.questionId, log.confidence);
                    }
                }
            }
        }
    }

    const results: (ReviewSchedule & { question?: Question })[] = [];
    for (const schedule of schedules) {
        const question = questionMap.get(schedule.questionId);
        if (!question) continue;

        if (filters?.categories && filters.categories.length > 0) {
            if (!filters.categories.includes(question.category || 'General')) continue;
        }
        if (filters?.overdueOnly && schedule.nextDue >= today) continue;

        if (filters?.lowConfidenceOnly) {
            const latestConfidence = latestConfidenceByQuestion?.get(schedule.questionId);
            if (latestConfidence !== 'low') continue;
        }

        results.push({ ...schedule, question });
    }

    results.sort((a, b) => {
        const dateCmp = a.nextDue.localeCompare(b.nextDue);
        if (dateCmp !== 0) return dateCmp;
        return a.consecutiveCorrect - b.consecutiveCorrect;
    });

    return results;
}

export async function getReviewSchedulesForQuizSet(quizSetId: number): Promise<ReviewSchedule[]> {
    if (isCloudSyncEnabled()) return cloudApi.getDueReviews(quizSetId);
    return db.reviewSchedules.where('quizSetId').equals(quizSetId).toArray();
}

export async function getAllReviewSchedules(): Promise<ReviewSchedule[]> {
    if (isCloudSyncEnabled()) return cloudApi.getDueReviews();
    const activeSetIds = (await db.quizSets
        .filter((set) => !set.isDeleted && !set.isArchived && !set.isReviewExcluded)
        .primaryKeys()) as number[];
    if (activeSetIds.length === 0) {
        return [];
    }
    return db.reviewSchedules.where('quizSetId').anyOf(activeSetIds).toArray();
}

export async function upsertReviewSchedulesBulk(schedules: (Omit<ReviewSchedule, 'id'> & { id?: number })[]): Promise<{ updated: number, inserted: number }> {
    if (isCloudSyncEnabled()) return cloudApi.upsertReviewSchedulesBulk(schedules);
    let updated = 0;
    let inserted = 0;
    for (const s of schedules) {
        const existing = await db.reviewSchedules
            .where('[quizSetId+questionId]')
            .equals([s.quizSetId, s.questionId])
            .first();
        if (existing) {
            await db.reviewSchedules.update(existing.id!, {
                intervalDays: s.intervalDays,
                nextDue: s.nextDue,
                lastReviewedAt: s.lastReviewedAt,
                consecutiveCorrect: s.consecutiveCorrect,
            });
            updated++;
        } else {
            await db.reviewSchedules.add(s as ReviewSchedule);
            inserted++;
        }
    }
    return { updated, inserted };
}

function normalizeHomeOnboardingState(raw: unknown): HomeOnboardingState {
    if (!raw || typeof raw !== 'object') {
        return {
            homeTutorialCompleted: false,
            completedAt: null,
            flowStage: 'home',
            manageQuizSetId: null,
        };
    }
    const record = raw as Record<string, unknown>;
    const flowStage = record.flowStage;
    const normalizedFlowStage: HomeOnboardingFlowStage =
        flowStage === 'manage' || flowStage === 'completed' || flowStage === 'home'
            ? flowStage
            : 'home';
    const manageQuizSetIdRaw = record.manageQuizSetId;
    const normalizedManageQuizSetId =
        typeof manageQuizSetIdRaw === 'number' && Number.isInteger(manageQuizSetIdRaw) && manageQuizSetIdRaw > 0
            ? manageQuizSetIdRaw
            : null;
    const homeTutorialCompleted = record.homeTutorialCompleted === true;
    if (homeTutorialCompleted) {
        return {
            homeTutorialCompleted: true,
            completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
            flowStage: 'completed',
            manageQuizSetId: null,
        };
    }

    return {
        homeTutorialCompleted: record.homeTutorialCompleted === true,
        completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
        flowStage: normalizedFlowStage,
        manageQuizSetId: normalizedManageQuizSetId,
    };
}

export async function getHomeOnboardingState(): Promise<HomeOnboardingState> {
    if (isCloudSyncEnabled()) {
        return cloudApi.getHomeOnboardingState();
    }

    const stored = await db.appSettings.get(HOME_ONBOARDING_SETTING_KEY);
    if (!stored) {
        return {
            homeTutorialCompleted: false,
            completedAt: null,
            flowStage: 'home',
            manageQuizSetId: null,
        };
    }

    try {
        const parsed = JSON.parse(stored.value);
        return normalizeHomeOnboardingState(parsed);
    } catch {
        return {
            homeTutorialCompleted: false,
            completedAt: null,
            flowStage: 'home',
            manageQuizSetId: null,
        };
    }
}

export async function updateHomeOnboardingState(patch: {
    homeTutorialCompleted?: boolean;
    flowStage?: HomeOnboardingFlowStage;
    manageQuizSetId?: number | null;
}): Promise<HomeOnboardingState> {
    if (isCloudSyncEnabled()) {
        return cloudApi.updateHomeOnboardingState(patch);
    }

    const current = await getHomeOnboardingState();
    const next: HomeOnboardingState = {
        homeTutorialCompleted: patch.homeTutorialCompleted ?? current.homeTutorialCompleted,
        completedAt: current.completedAt,
        flowStage: patch.flowStage ?? current.flowStage,
        manageQuizSetId: patch.manageQuizSetId === undefined ? current.manageQuizSetId : patch.manageQuizSetId,
    };

    if (next.homeTutorialCompleted || next.flowStage === 'completed') {
        next.homeTutorialCompleted = true;
        next.flowStage = 'completed';
        next.manageQuizSetId = null;
        next.completedAt = next.completedAt || new Date().toISOString();
    } else {
        if (next.flowStage === 'home') {
            next.manageQuizSetId = null;
        }
        next.completedAt = null;
    }

    await db.appSettings.put({
        key: HOME_ONBOARDING_SETTING_KEY,
        value: JSON.stringify(next),
        updatedAt: new Date().toISOString(),
    });

    return next;
}

export async function completeHomeOnboarding(): Promise<HomeOnboardingState> {
    return updateHomeOnboardingState({
        homeTutorialCompleted: true,
        flowStage: 'completed',
        manageQuizSetId: null,
    });
}

export async function advanceHomeOnboardingToManage(quizSetId: number): Promise<HomeOnboardingState> {
    return updateHomeOnboardingState({
        homeTutorialCompleted: false,
        flowStage: 'manage',
        manageQuizSetId: quizSetId,
    });
}
