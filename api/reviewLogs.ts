import { neon } from '@neondatabase/serverless';
import { getSessionToken, getAuthenticatedUserId } from './_auth.js';

async function hasOwnedQuestion(
    sql: ReturnType<typeof neon>,
    userId: number,
    questionId: number,
    quizSetId: number
): Promise<boolean> {
    const rows = await sql`
        SELECT q.id
        FROM questions q
        JOIN quiz_sets qs ON q.quiz_set_id = qs.id
        WHERE q.id = ${questionId} AND qs.id = ${quizSetId} AND qs.user_id = ${userId}
        LIMIT 1
    `;
    return rows.length > 0;
}

export default async function handler(req: any, res: any) {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
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
                    WITH valid_session AS (
                        SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                    )
                    SELECT rl.* FROM review_logs rl
                    JOIN valid_session vs ON rl.user_id = vs.user_id
                    WHERE rl.question_id = ${questionId}
                    ORDER BY rl.reviewed_at DESC
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

        } else {
            const userId = await getAuthenticatedUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            if (method === 'POST') {
                const l = req.body;
                const questionIdNum = Number(l?.questionId);
                const quizSetIdNum = Number(l?.quizSetId);
                if (!Number.isInteger(questionIdNum) || questionIdNum <= 0 || !Number.isInteger(quizSetIdNum) || quizSetIdNum <= 0) {
                    return res.status(400).json({ error: 'Missing or invalid questionId/quizSetId' });
                }

                const ownedQuestion = await hasOwnedQuestion(sql, userId, questionIdNum, quizSetIdNum);
                if (!ownedQuestion) {
                    return res.status(404).json({ error: 'Question not found' });
                }

                const reviewedAt = l.reviewedAt || new Date().toISOString();
                const result = await sql`
                INSERT INTO review_logs (
                    question_id, quiz_set_id, reviewed_at, is_correct, confidence,
                    interval_days, next_due, memo, duration_seconds, session_id, user_id
                ) VALUES (
                    ${questionIdNum}, ${quizSetIdNum}, ${reviewedAt}, ${l.isCorrect}, ${l.confidence},
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
        } // Close else block

        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: any) {
        console.error('reviewLogs API error:', err);
        return res.status(500).json({ error: err.message });
    }
}
