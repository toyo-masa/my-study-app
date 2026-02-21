import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUserId } from './_auth.js';

export default async function handler(req: any, res: any) {
    const t0 = performance.now();
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
            const schedules = req.body.schedules;
            if (!Array.isArray(schedules) || schedules.length === 0) {
                return res.status(400).json({ error: 'Invalid or empty schedules array' });
            }

            const questionIds = schedules.map(s => s.questionId);

            // 1. Fetch existing schedules to decide insert vs update
            const existingRows = await sql`
                SELECT id, question_id FROM review_schedules 
                WHERE user_id = ${userId} AND question_id = ANY(${questionIds})
            `;

            const existingMap = new Map(existingRows.map(r => [r.question_id, r.id]));

            const inserts: any[] = [];
            const updates: any[] = [];

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

            const t1 = performance.now();
            console.log(`[POST /api/reviewSchedulesBulk] Timing: ms_total=${t1 - t0}, updates=${updates.length}, inserts=${inserts.length}`);

            return res.status(200).json({ success: true, updated: updates.length, inserted: inserts.length });
        }

        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: any) {
        console.error('reviewSchedulesBulk API error:', err);
        return res.status(500).json({ error: err.message });
    }
}
