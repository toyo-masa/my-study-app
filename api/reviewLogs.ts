import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUserId } from './_auth.js';

export default async function handler(req: any, res: any) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });
    const sql = neon(databaseUrl);

    const { method } = req;
    const { quizSetId, questionId } = req.query;

    try {
        if (method === 'GET') {
            if (questionId) {
                const rows = await sql`
                    SELECT * FROM review_logs 
                    WHERE question_id = ${questionId} AND user_id = ${userId}
                    ORDER BY reviewed_at DESC
                `;
                return res.status(200).json(rows.map(r => ({
                    id: r.id,
                    questionId: r.question_id,
                    quizSetId: r.quiz_set_id,
                    reviewedAt: new Date(r.reviewed_at).toISOString(),
                    isCorrect: r.is_correct,
                    confidence: r.confidence,
                    intervalDays: r.interval_days,
                    nextDue: r.next_due ? new Date(r.next_due).toISOString().split('T')[0] : '',
                    memo: r.memo,
                    durationSeconds: r.duration_seconds,
                    sessionId: r.session_id
                })));
            }
            return res.status(400).json({ error: 'Missing questionId parameter' });

        } else if (method === 'POST') {
            const l = req.body;
            const reviewedAt = l.reviewedAt || new Date().toISOString();
            const result = await sql`
                INSERT INTO review_logs (
                    question_id, quiz_set_id, reviewed_at, is_correct, confidence,
                    interval_days, next_due, memo, duration_seconds, session_id, user_id
                ) VALUES (
                    ${l.questionId}, ${l.quizSetId}, ${reviewedAt}, ${l.isCorrect}, ${l.confidence},
                    ${l.intervalDays}, ${l.nextDue}, ${l.memo || null}, ${l.durationSeconds || null}, ${l.sessionId || null}, ${userId}
                )
                RETURNING id
            `;
            return res.status(201).json({ id: result[0].id });

        } else if (method === 'DELETE') {
            if (quizSetId) {
                await sql`DELETE FROM review_logs WHERE quiz_set_id = ${quizSetId} AND user_id = ${userId}`;
                return res.status(200).json({ success: true });
            }
            return res.status(400).json({ error: 'Missing quizSetId' });
        }

        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: any) {
        console.error('reviewLogs API error:', err);
        return res.status(500).json({ error: err.message });
    }
}
