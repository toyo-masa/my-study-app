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
    const { quizSetId } = req.query;

    try {
        if (method === 'GET') {
            if (!quizSetId) return res.status(400).json({ error: 'Missing quizSetId' });

            // Verify quiz set belongs to user
            const setCheck = await sql`SELECT id FROM quiz_sets WHERE id = ${quizSetId} AND user_id = ${userId}`;
            if (setCheck.length === 0) return res.status(404).json({ error: 'Quiz set not found' });

            const rows = await sql`
                SELECT * FROM histories 
                WHERE quiz_set_id = ${quizSetId} AND user_id = ${userId}
                ORDER BY date DESC
            `;
            const histories = rows.map(h => ({
                id: h.id,
                quizSetId: h.quiz_set_id,
                date: new Date(h.date),
                correctCount: h.correct_count,
                totalCount: h.total_count,
                durationSeconds: h.duration_seconds,
                answers: h.answers,
                markedQuestionIds: h.marked_question_ids,
                memos: h.memos,
                confidences: h.confidences,
                questionIds: h.question_ids,
                mode: h.mode,
                memorizationDetail: h.memorization_detail
            }));
            return res.status(200).json(histories);
        } else if (method === 'POST') {
            const h = req.body;
            const dateStr = h.date ? new Date(h.date).toISOString() : new Date().toISOString();
            const result = await sql`
                INSERT INTO histories (
                    quiz_set_id, date, correct_count, total_count, duration_seconds,
                    answers, marked_question_ids, memos, confidences, question_ids, mode, memorization_detail, user_id
                ) VALUES (
                    ${h.quizSetId},
                    ${dateStr},
                    ${h.correctCount},
                    ${h.totalCount},
                    ${h.durationSeconds || 0},
                    ${JSON.stringify(h.answers || {})}::jsonb,
                    ${JSON.stringify(h.markedQuestionIds || [])}::jsonb,
                    ${JSON.stringify(h.memos || {})}::jsonb,
                    ${JSON.stringify(h.confidences || {})}::jsonb,
                    ${JSON.stringify(h.questionIds || [])}::jsonb,
                    ${h.mode || 'normal'},
                    ${JSON.stringify(h.memorizationDetail || [])}::jsonb,
                    ${userId}
                )
                RETURNING id
            `;
            return res.status(201).json({ id: result[0].id });
        }

        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: any) {
        console.error('histories API error:', err);
        return res.status(500).json({ error: err.message });
    }
}
