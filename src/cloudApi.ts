import type { Question, QuizSet, QuizHistory, ReviewSchedule, ReviewLog, QuizSetType, HomeOnboardingState, HomeOnboardingFlowStage } from './types';
import type { SuspendedSession } from './utils/quizSettings';

export class ApiError extends Error {
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

// Helper to handle API responses
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
    const fetchOptions: RequestInit = {
        ...options,
        credentials: 'same-origin' // Send the HttpOnly cookie
    };

    const res = await fetch(url, fetchOptions);
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({} as { error?: string; code?: string }));
        const fallbackMessage = `HTTP error! status: ${res.status}`;
        const message = typeof errorData.error === 'string' && errorData.error.length > 0
            ? errorData.error
            : (res.status === 401 ? 'UNAUTHORIZED' : fallbackMessage);
        const code = typeof errorData.code === 'string' ? errorData.code : undefined;

        throw new ApiError(message, res.status, code);
    }
    return res.json() as Promise<T>;
}

// Auth types
export interface AuthUser {
    id: number;
    username: string;
    isAdmin: boolean;
}

export interface AdminSummary {
    generatedAt: string;
    summary: {
        totalUsers: number;
        activeSessions: number;
        totalQuizSets: number;
        totalQuestions: number;
        totalHistories: number;
        totalReviewSchedules: number;
        totalReviewLogs: number;
        dueReviewItems: number;
    };
}

export interface AdminUser {
    id: number;
    username: string;
    createdAt: string;
    lastLoginAt: string | null;
    lastAccessedAt: string | null;
    activeSessionCount: number;
    quizSetCount: number;
    memorizationCardCount: number;
    isAdmin: boolean;
}

export const cloudApi = {
    // === Auth ===
    async login(username: string, password: string): Promise<{ success: boolean; user: AuthUser }> {
        return fetchApi('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
    },

    async register(username: string, password: string): Promise<{ success: boolean; user: AuthUser }> {
        return fetchApi('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
    },

    async logout(): Promise<void> {
        await fetchApi('/api/session?action=logout', { method: 'POST' });
    },

    async getCurrentUser(): Promise<AuthUser | null> {
        try {
            return await fetchApi<AuthUser>('/api/session?action=me');
        } catch {
            return null;
        }
    },

    async getAdminSummary(): Promise<AdminSummary> {
        return fetchApi<AdminSummary>('/api/session?action=adminSummary');
    },

    async getAdminUsers(): Promise<AdminUser[]> {
        const response = await fetchApi<{ users: AdminUser[] }>('/api/session?action=adminUsers');
        return response.users;
    },

    async resetAdminUserPassword(targetUserId: number, newPassword: string): Promise<void> {
        await fetchApi('/api/session?action=adminResetPassword', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId, newPassword })
        });
    },

    async deleteAdminUser(targetUserId: number): Promise<void> {
        await fetchApi('/api/session?action=adminDeleteUser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId })
        });
    },

    // === Quiz Sets ===
    async getQuizSets(options?: { includeDeleted?: boolean; archivedOnly?: boolean; all?: boolean }): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
        const params = new URLSearchParams();
        if (options?.includeDeleted) params.append('includeDeleted', 'true');
        if (options?.archivedOnly) params.append('archivedOnly', 'true');
        if (options?.all) params.append('all', 'true');
        return fetchApi(`/api/quizSets?${params.toString()}`);
    },

    async addQuizSet(name: string, type: QuizSetType, questions: Omit<Question, 'id' | 'quizSetId'>[]): Promise<number> {
        const res = await fetchApi<{ id: number }>('/api/quizSets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, questions })
        });
        return res.id;
    },

    async updateQuizSet(id: number, changes: Partial<QuizSet>): Promise<void> {
        await fetchApi(`/api/quizSets?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changes)
        });
    },

    async deleteQuizSet(id: number): Promise<void> {
        await fetchApi(`/api/quizSets?id=${id}`, { method: 'DELETE' });
    },

    // Questions
    async getQuestions(quizSetId: number): Promise<Question[]> {
        return fetchApi(`/api/questions?quizSetId=${quizSetId}`);
    },

    async addQuestion(question: Omit<Question, 'id'>): Promise<number> {
        const res = await fetchApi<{ id: number }>('/api/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(question)
        });
        return res.id;
    },

    async addQuestionsBulk(questions: Omit<Question, 'id' | 'quizSetId'>[] & { quizSetId?: number }[]): Promise<number[]> {
        const res = await fetchApi<{ ids: number[] }>('/api/questionsBulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questions })
        });
        return res.ids;
    },

    async updateQuestion(id: number, changes: Partial<Question>): Promise<void> {
        await fetchApi(`/api/questions?id=${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changes)
        });
    },

    async deleteQuestion(id: number): Promise<void> {
        await fetchApi(`/api/questions?id=${id}`, { method: 'DELETE' });
    },

    // Histories
    async getHistories(quizSetId: number): Promise<QuizHistory[]> {
        type QuizHistoryResponse = Omit<QuizHistory, 'date'> & { date: string };
        const data = await fetchApi<QuizHistoryResponse[]>(`/api/histories?quizSetId=${quizSetId}`);
        return data.map(h => ({
            ...h,
            date: new Date(h.date) // Convert string back to Date
        }));
    },

    async addHistory(history: Omit<QuizHistory, 'id'>): Promise<number> {
        const res = await fetchApi<{ id: number }>('/api/histories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(history)
        });
        return res.id;
    },

    // Review Schedules
    async getDueReviews(quizSetId?: number): Promise<ReviewSchedule[]> {
        const params = new URLSearchParams();
        if (quizSetId) params.append('quizSetId', quizSetId.toString());
        return fetchApi(`/api/reviewSchedules?${params.toString()}`);
    },

    async upsertReviewSchedulesBulk(schedules: (Partial<ReviewSchedule> & { questionId: number, quizSetId: number })[]): Promise<{ updated: number, inserted: number }> {
        const res = await fetchApi<{ success: boolean, updated: number, inserted: number }>('/api/reviewSchedules?bulk=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedules })
        });
        return { updated: res.updated, inserted: res.inserted };
    },

    async getReviewLogsByQuizSet(quizSetId: number, options?: { latestByQuestion?: boolean }): Promise<ReviewLog[]> {
        const params = new URLSearchParams({ quizSetId: quizSetId.toString() });
        if (options?.latestByQuestion) {
            params.append('latest', 'true');
        }
        return fetchApi(`/api/reviewLogs?${params.toString()}`);
    },

    // Suspended Sessions
    async getSuspendedSession(quizSetId: number): Promise<SuspendedSession | null> {
        const params = new URLSearchParams({ quizSetId: quizSetId.toString() });
        return fetchApi(`/api/suspendedSession?${params.toString()}`, { cache: 'no-store' });
    },

    async upsertSuspendedSession(quizSetId: number, session: SuspendedSession): Promise<void> {
        await fetchApi('/api/suspendedSession', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quizSetId, session }),
            keepalive: true
        });
    },

    async clearSuspendedSession(quizSetId: number): Promise<void> {
        await fetchApi(`/api/suspendedSession?quizSetId=${quizSetId}`, {
            method: 'DELETE',
            keepalive: true
        });
    },

    async getHomeOnboardingState(): Promise<HomeOnboardingState> {
        return fetchApi('/api/onboardingState');
    },

    async updateHomeOnboardingState(patch: {
        homeTutorialCompleted?: boolean;
        flowStage?: HomeOnboardingFlowStage;
        manageQuizSetId?: number | null;
    }): Promise<HomeOnboardingState> {
        return fetchApi('/api/onboardingState', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
    },

    async completeHomeOnboarding(): Promise<HomeOnboardingState> {
        return this.updateHomeOnboardingState({
            homeTutorialCompleted: true,
            flowStage: 'completed',
            manageQuizSetId: null,
        });
    },

    async advanceHomeOnboardingToManage(quizSetId: number): Promise<HomeOnboardingState> {
        return this.updateHomeOnboardingState({
            homeTutorialCompleted: false,
            flowStage: 'manage',
            manageQuizSetId: quizSetId,
        });
    }
};
