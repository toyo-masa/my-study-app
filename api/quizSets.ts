import { neon } from '@neondatabase/serverless';
import { getSessionToken, getAuthenticatedUserId } from './_auth.js';

export default async function handler(req: any, res: any) {
    const t0 = performance.now();
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });
    const sql = neon(databaseUrl);

    const { method } = req;
    const { id, includeDeleted, archivedOnly } = req.query;

    try {
        if (method === 'GET') {
            let result;

            if (id) {
                const t1 = performance.now();
                const rows = await sql`
                    WITH valid_session AS (
                        SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                    )
                    SELECT q.* FROM quiz_sets q
                    JOIN valid_session vs ON q.user_id = vs.user_id
                    WHERE q.id = ${id}
                `;
                const t2 = performance.now();
                if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
                result = rows[0];
                const t3 = performance.now();
                console.log(`[GET /api/quizSets?id=${id}] Timing:`, {
                    ms_total: t3 - t0,
                    ms_before_db: 0, // Optimized out
                    ms_db: t2 - t1,
                    ms_after_db: t3 - t2,
                });
                return res.status(200).json(result);
            } else {
                let rows;
                const t1 = performance.now();
                if (includeDeleted === 'true') {
                    rows = await sql`
                        WITH valid_session AS (
                            SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                        )
                        SELECT q.*, (SELECT COUNT(*) FROM questions WHERE quiz_set_id = q.id) as q_count 
                        FROM quiz_sets q 
                        JOIN valid_session vs ON q.user_id = vs.user_id
                        WHERE q.is_deleted = true
                    `;
                } else if (archivedOnly === 'true') {
                    rows = await sql`
                        WITH valid_session AS (
                            SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                        )
                        SELECT q.*, (SELECT COUNT(*) FROM questions WHERE quiz_set_id = q.id) as q_count 
                        FROM quiz_sets q 
                        JOIN valid_session vs ON q.user_id = vs.user_id
                        WHERE q.is_deleted = false AND q.is_archived = true
                    `;
                } else if (req.query.all === 'true') {
                    rows = await sql`
                        WITH valid_session AS (
                            SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                        )
                        SELECT q.*, (SELECT COUNT(*) FROM questions WHERE quiz_set_id = q.id) as q_count 
                        FROM quiz_sets q 
                        JOIN valid_session vs ON q.user_id = vs.user_id
                    `;
                } else {
                    rows = await sql`
                        WITH valid_session AS (
                            SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                        )
                        SELECT q.*, (SELECT COUNT(*) FROM questions WHERE quiz_set_id = q.id) as q_count 
                        FROM quiz_sets q 
                        JOIN valid_session vs ON q.user_id = vs.user_id
                        WHERE q.is_deleted = false AND q.is_archived = false
                    `;
                }
                const t2 = performance.now();

                result = rows.map((row) => ({
                    id: row.id,
                    name: row.name,
                    createdAt: row.created_at,
                    type: row.type,
                    isDeleted: row.is_deleted,
                    isArchived: row.is_archived,
                    tags: row.tags,
                    questionCount: Number(row.q_count),
                    categories: row.tags || []
                }));
                const t3 = performance.now();
                console.log('[GET /api/quizSets] Timing:', {
                    ms_total: t3 - t0,
                    ms_before_db: 0, // Optimized out
                    ms_db: t2 - t1,
                    ms_after_db: t3 - t2,
                });
                return res.status(200).json(result);
            }
        } else {
            // Processing mutations (POST, PUT, DELETE) - fetch userId explicitly for simpler logic
            const userId = await getAuthenticatedUserId(req);
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            if (method === 'POST') {
                const { name, type, questions } = req.body;
                const createdAt = new Date().toISOString();
                const insertSet = await sql`
                INSERT INTO quiz_sets (name, type, created_at, is_deleted, is_archived, tags, user_id) 
                VALUES (${name}, ${type || 'quiz'}, ${createdAt}, false, false, '[]'::jsonb, ${userId}) 
                RETURNING id
            `;
                const setId = insertSet[0].id;

                if (questions && questions.length > 0) {
                    for (const q of questions) {
                        await sql`
                        INSERT INTO questions (quiz_set_id, category, text, options, correct_answers, explanation)
                        VALUES (
                            ${setId}, 
                            ${q.category}, 
                            ${q.text}, 
                            ${JSON.stringify(q.options)}::jsonb, 
                            ${JSON.stringify(q.correctAnswers)}::jsonb, 
                            ${q.explanation || ''}
                        )
                    `;
                    }
                }
                return res.status(201).json({ id: setId });
            } else if (method === 'PUT') {
                if (!id) return res.status(400).json({ error: 'Missing id' });
                const { name, isDeleted, isArchived, tags } = req.body;

                const current = await sql`SELECT * FROM quiz_sets WHERE id = ${id} AND user_id = ${userId}`;
                if (current.length === 0) return res.status(404).json({ error: 'Not found' });

                if (name !== undefined) await sql`UPDATE quiz_sets SET name = ${name} WHERE id = ${id} AND user_id = ${userId}`;
                if (isDeleted !== undefined) await sql`UPDATE quiz_sets SET is_deleted = ${isDeleted} WHERE id = ${id} AND user_id = ${userId}`;
                if (isArchived !== undefined) await sql`UPDATE quiz_sets SET is_archived = ${isArchived} WHERE id = ${id} AND user_id = ${userId}`;
                if (tags !== undefined) await sql`UPDATE quiz_sets SET tags = ${JSON.stringify(tags)}::jsonb WHERE id = ${id} AND user_id = ${userId}`;

                return res.status(200).json({ success: true });
            } else if (method === 'DELETE') {
                if (!id) return res.status(400).json({ error: 'Missing id' });
                await sql`DELETE FROM quiz_sets WHERE id = ${id} AND user_id = ${userId}`;
                return res.status(200).json({ success: true });
            }
        } // Close the `else {` block here

        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: any) {
        console.error('quizSets API error:', err);
        return res.status(500).json({ error: err.message });
    }
}
