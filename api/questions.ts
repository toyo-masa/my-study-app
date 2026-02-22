import { neon } from '@neondatabase/serverless';
import { getSessionToken, getAuthenticatedUserId } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

type QuestionBody = {
    quizSetId?: number | string;
    category?: string;
    text?: string;
    options?: unknown;
    correctAnswers?: unknown;
    explanation?: string;
};

export default async function handler(req: ApiHandlerRequest<QuestionBody>, res: ApiHandlerResponse) {
    const t0 = performance.now();
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });
    const sql = neon(databaseUrl);

    const { method } = req;
    const { id, quizSetId } = req.query;

    try {
        if (method === 'GET') {
            if (id) {
                const t1 = performance.now();
                // Verify the question belongs to user's quiz set
                const rows = await sql`
                    WITH valid_session AS (
                        SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                    )
                    SELECT q.* FROM questions q
                    JOIN quiz_sets qs ON q.quiz_set_id = qs.id
                    JOIN valid_session vs ON qs.user_id = vs.user_id
                    WHERE q.id = ${id}
                `;
                const t2 = performance.now();
                if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
                const q = rows[0];
                const result = {
                    id: q.id,
                    quizSetId: q.quiz_set_id,
                    category: q.category,
                    text: q.text,
                    options: q.options,
                    correctAnswers: q.correct_answers,
                    explanation: q.explanation
                };
                const t3 = performance.now();
                console.log(`[GET /api/questions?id=${id}] Timing:`, {
                    ms_total: t3 - t0,
                    ms_before_db: 0, // Optimized out
                    ms_db: t2 - t1,
                    ms_after_db: t3 - t2,
                });
                return res.status(200).json(result);
            } else if (quizSetId) {
                const t1 = performance.now();
                // To maintain 404 on invalid set vs [] on empty set, we can check quiz_set specifically, 
                // but directly joining is faster and returns [] if not authorized or doesn't exist.
                // If returning [] instead of 404 is acceptable for unauthorized/non-existent sets, we do 1 query.
                // Let's do 1 query that checks both or just rely on the JOIN returning [].
                const rows = await sql`
                    WITH valid_session AS (
                        SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                    )
                    SELECT q.* FROM questions q
                    JOIN quiz_sets qs ON q.quiz_set_id = qs.id
                    JOIN valid_session vs ON qs.user_id = vs.user_id
                    WHERE q.quiz_set_id = ${quizSetId}
                    ORDER BY q.id ASC
                `;
                const t2 = performance.now();
                const questions = rows.map(q => ({
                    id: q.id,
                    quizSetId: q.quiz_set_id,
                    category: q.category,
                    text: q.text,
                    options: q.options,
                    correctAnswers: q.correct_answers,
                    explanation: q.explanation
                }));
                const t3 = performance.now();
                console.log(`[GET /api/questions?quizSetId=${quizSetId}] Timing:`, {
                    ms_total: t3 - t0,
                    ms_before_db: 0, // Optimized out
                    ms_db: t2 - t1,
                    ms_after_db: t3 - t2,
                });
                return res.status(200).json(questions);
            } else {
                return res.status(400).json({ error: 'Missing id or quizSetId' });
            }
        } else {
            // Setup strict user check for POST, PUT, DELETE
            const userId = await getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            if (method === 'POST') {
                const q = req.body || {};
                // Verify quiz set belongs to user
                const setCheck = await sql`SELECT id FROM quiz_sets WHERE id = ${q.quizSetId} AND user_id = ${userId}`;
                if (setCheck.length === 0) return res.status(404).json({ error: 'Quiz set not found' });

                const result = await sql`
                INSERT INTO questions (quiz_set_id, category, text, options, correct_answers, explanation)
                VALUES (
                    ${q.quizSetId}, 
                    ${q.category}, 
                    ${q.text}, 
                    ${JSON.stringify(q.options)}::jsonb, 
                    ${JSON.stringify(q.correctAnswers)}::jsonb, 
                    ${q.explanation || ''}
                )
                RETURNING id
            `;
                return res.status(201).json({ id: result[0].id });
            } else if (method === 'PUT') {
                if (!id) return res.status(400).json({ error: 'Missing id' });
                const q = req.body || {};

                // Verify question belongs to user's quiz set
                const current = await sql`
                SELECT q.* FROM questions q
                JOIN quiz_sets qs ON q.quiz_set_id = qs.id
                WHERE q.id = ${id} AND qs.user_id = ${userId}
            `;
                if (current.length === 0) return res.status(404).json({ error: 'Not found' });

                if (q.category !== undefined) await sql`UPDATE questions SET category = ${q.category} WHERE id = ${id}`;
                if (q.text !== undefined) await sql`UPDATE questions SET text = ${q.text} WHERE id = ${id}`;
                if (q.options !== undefined) await sql`UPDATE questions SET options = ${JSON.stringify(q.options)}::jsonb WHERE id = ${id}`;
                if (q.correctAnswers !== undefined) await sql`UPDATE questions SET correct_answers = ${JSON.stringify(q.correctAnswers)}::jsonb WHERE id = ${id}`;
                if (q.explanation !== undefined) await sql`UPDATE questions SET explanation = ${q.explanation} WHERE id = ${id}`;

                return res.status(200).json({ success: true });
            } else if (method === 'DELETE') {
                if (!id) return res.status(400).json({ error: 'Missing id' });
                // Verify question belongs to user's quiz set
                const check = await sql`
                SELECT q.id FROM questions q
                JOIN quiz_sets qs ON q.quiz_set_id = qs.id
                WHERE q.id = ${id} AND qs.user_id = ${userId}
            `;
                if (check.length === 0) return res.status(404).json({ error: 'Not found' });

                await sql`DELETE FROM questions WHERE id = ${id}`;
                return res.status(200).json({ success: true });
            }
        } // Close the unified `else {` block

        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: unknown) {
        console.error('questions API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
