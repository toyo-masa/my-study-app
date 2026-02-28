import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUserId } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';
import { hasValue, isValidDateTime } from './_validation.js';

type ReviewSchedulesBulkBody = {
    schedules?: unknown;
};

type ParsedSchedule = {
    questionId: number;
    quizSetId: number;
    intervalDays: number;
    nextDue: string;
    lastReviewedAt: string | null;
    consecutiveCorrect: number;
};

type UpdateRow = {
    id: number;
    interval_days: number;
    next_due: string;
    last_reviewed_at: string | null;
    consecutive_correct: number;
};

type InsertRow = {
    question_id: number;
    quiz_set_id: number;
    interval_days: number;
    next_due: string;
    last_reviewed_at: string | null;
    consecutive_correct: number;
    user_id: number;
};

function isValidDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

function parseSchedule(raw: unknown): ParsedSchedule | null {
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as Record<string, unknown>;

    const questionId = Number(data.questionId);
    const quizSetId = Number(data.quizSetId);
    const intervalDays = Number(data.intervalDays);
    const consecutiveCorrect = Number(data.consecutiveCorrect ?? 0);
    const nextDue = typeof data.nextDue === 'string' ? data.nextDue : '';
    const rawLastReviewedAt = data.lastReviewedAt;
    const hasLastReviewedAt = hasValue(rawLastReviewedAt);
    const lastReviewedAt = hasLastReviewedAt && typeof rawLastReviewedAt === 'string' ? rawLastReviewedAt : null;

    if (!Number.isInteger(questionId) || questionId <= 0) return null;
    if (!Number.isInteger(quizSetId) || quizSetId <= 0) return null;
    if (!Number.isInteger(intervalDays) || intervalDays <= 0) return null;
    if (!Number.isInteger(consecutiveCorrect) || consecutiveCorrect < 0) return null;
    if (!isValidDate(nextDue)) return null;
    if (hasLastReviewedAt) {
        if (typeof rawLastReviewedAt !== 'string' || !isValidDateTime(rawLastReviewedAt)) {
            return null;
        }
    }

    return {
        questionId,
        quizSetId,
        intervalDays,
        nextDue,
        lastReviewedAt,
        consecutiveCorrect,
    };
}

export default async function handler(req: ApiHandlerRequest<ReviewSchedulesBulkBody>, res: ApiHandlerResponse) {
    const t0 = nowMs();
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });
    const sql = neon(databaseUrl);

    const { method } = req;

    try {
        if (method === 'POST') { // We use POST for bulk upsert action
            const rawSchedules = req.body?.schedules;
            if (!Array.isArray(rawSchedules) || rawSchedules.length === 0) {
                return res.status(400).json({ error: 'Invalid or empty schedules array' });
            }

            const schedules: ParsedSchedule[] = [];
            for (const raw of rawSchedules) {
                const parsed = parseSchedule(raw);
                if (!parsed) {
                    return res.status(400).json({ error: 'Invalid schedule payload' });
                }
                schedules.push(parsed);
            }

            const questionIds = schedules.map(s => s.questionId);
            const uniqueQuestionIds = [...new Set(questionIds)];
            if (uniqueQuestionIds.length !== questionIds.length) {
                return res.status(400).json({ error: 'Duplicate questionId in schedules array' });
            }

            const ownedQuestions = await sql`
                SELECT q.id AS question_id, q.quiz_set_id
                FROM questions q
                JOIN quiz_sets qs ON q.quiz_set_id = qs.id
                WHERE qs.user_id = ${userId}
                  AND q.id = ANY(${questionIds})
            `;
            if (ownedQuestions.length !== uniqueQuestionIds.length) {
                return res.status(404).json({ error: 'Question not found' });
            }
            const ownedQuizSetByQuestionId = new Map(
                ownedQuestions.map(r => [Number(r.question_id), Number(r.quiz_set_id)])
            );
            for (const schedule of schedules) {
                const ownerQuizSetId = ownedQuizSetByQuestionId.get(schedule.questionId);
                if (ownerQuizSetId !== schedule.quizSetId) {
                    return res.status(400).json({ error: 'questionId and quizSetId mismatch' });
                }
            }

            // 1. Fetch existing schedules to decide insert vs update
            const existingRows = await sql`
                SELECT id, question_id FROM review_schedules 
                WHERE user_id = ${userId} AND question_id = ANY(${questionIds})
            `;

            const existingMap = new Map(existingRows.map(r => [Number(r.question_id), Number(r.id)]));

            const inserts: InsertRow[] = [];
            const updates: UpdateRow[] = [];

            for (const s of schedules) {
                const existingId = existingMap.get(s.questionId);
                if (existingId) {
                    updates.push({
                        id: existingId,
                        interval_days: s.intervalDays,
                        next_due: s.nextDue,
                        last_reviewed_at: s.lastReviewedAt || null,
                        consecutive_correct: s.consecutiveCorrect
                    });
                } else {
                    inserts.push({
                        question_id: s.questionId,
                        quiz_set_id: s.quizSetId,
                        interval_days: s.intervalDays,
                        next_due: s.nextDue,
                        last_reviewed_at: s.lastReviewedAt || null,
                        consecutive_correct: s.consecutiveCorrect,
                        user_id: userId
                    });
                }
            }

            // 2. Perform bulk update
            if (updates.length > 0) {
                await sql`
                    UPDATE review_schedules AS rs
                    SET 
                        interval_days = u.interval_days::int,
                        next_due = u.next_due::date,
                        last_reviewed_at = u.last_reviewed_at::timestamptz,
                        consecutive_correct = u.consecutive_correct::int
                    FROM (
                        SELECT * FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) 
                        AS x(id int, interval_days int, next_due date, last_reviewed_at text, consecutive_correct int)
                    ) AS u
                    WHERE rs.id = u.id AND rs.user_id = ${userId}
                `;
            }

            // 3. Perform bulk insert
            if (inserts.length > 0) {
                await sql`
                    INSERT INTO review_schedules (
                        question_id, quiz_set_id, interval_days, next_due, last_reviewed_at, consecutive_correct, user_id
                    )
                    SELECT 
                        question_id, quiz_set_id, interval_days, next_due::date, last_reviewed_at::timestamptz, consecutive_correct, user_id
                    FROM jsonb_to_recordset(${JSON.stringify(inserts)}::jsonb) AS x(
                        question_id int,
                        quiz_set_id int,
                        interval_days int,
                        next_due text,
                        last_reviewed_at text,
                        consecutive_correct int,
                        user_id int
                    )
                `;
            }

            const t1 = nowMs();
            console.log(`[POST /api/reviewSchedulesBulk] Timing: ms_total=${t1 - t0}, updates=${updates.length}, inserts=${inserts.length}`);

            return res.status(200).json({ success: true, updated: updates.length, inserted: inserts.length });
        }

        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: unknown) {
        console.error('reviewSchedulesBulk API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
