import type { Question, QuizSet, QuizHistory, ReviewSchedule, ReviewLog, QuizSetType } from './types';

// Helper to handle API responses
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
    const token = import.meta.env.VITE_API_TOKEN || '';
    const headers = {
        'x-sync-token': token,
        ...(options?.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const cloudApi = {
    // Quiz Sets
    async getQuizSets(options?: { includeDeleted?: boolean; archivedOnly?: boolean }): Promise<(QuizSet & { questionCount: number; categories: string[] })[]> {
        const params = new URLSearchParams();
        if (options?.includeDeleted) params.append('includeDeleted', 'true');
        if (options?.archivedOnly) params.append('archivedOnly', 'true');
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
        const data = await fetchApi<any[]>(`/api/histories?quizSetId=${quizSetId}`);
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

    async getReviewSchedule(questionId: number): Promise<ReviewSchedule | null> {
        return fetchApi(`/api/reviewSchedules?questionId=${questionId}`);
    },

    async upsertReviewSchedule(schedule: Partial<ReviewSchedule> & { questionId: number, quizSetId: number }): Promise<number> {
        const res = await fetchApi<{ id: number }>('/api/reviewSchedules', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(schedule)
        });
        return res.id;
    },

    async resetReviewSchedules(quizSetId: number): Promise<void> {
        await fetchApi(`/api/reviewSchedules?quizSetId=${quizSetId}`, { method: 'DELETE' });
        await fetchApi(`/api/reviewLogs?quizSetId=${quizSetId}`, { method: 'DELETE' });
    },

    // Review Logs
    async getReviewLogs(questionId: number): Promise<ReviewLog[]> {
        return fetchApi(`/api/reviewLogs?questionId=${questionId}`);
    },

    async addReviewLog(log: Omit<ReviewLog, 'id'>): Promise<number> {
        const res = await fetchApi<{ id: number }>('/api/reviewLogs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log)
        });
        return res.id;
    }
};
