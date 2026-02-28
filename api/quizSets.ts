import { neon } from '@neondatabase/serverless';
import { getSessionToken, getAuthenticatedUserId } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

type BulkQuestionRow = {
    quiz_set_id: number;
    category: string;
    text: string;
    options: string;
    correct_answers: string;
    explanation: string;
};

type QuizSetQuestionInput = {
    category?: string;
    text?: string;
    options?: unknown;
    correctAnswers?: unknown;
    explanation?: string;
};

type QuizSetMutationBody = {
    name?: string;
    type?: string;
    questions?: QuizSetQuestionInput[];
    isDeleted?: boolean;
    isArchived?: boolean;
    isReviewExcluded?: boolean;
    tags?: unknown;
};

export default async function handler(req: ApiHandlerRequest<QuizSetMutationBody>, res: ApiHandlerResponse) {
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
                        SELECT q.*, COUNT(qq.id) AS q_count
                        FROM quiz_sets q 
                        JOIN valid_session vs ON q.user_id = vs.user_id
                        LEFT JOIN questions qq ON qq.quiz_set_id = q.id
                        WHERE q.is_deleted = true
                        GROUP BY q.id
                    `;
                } else if (archivedOnly === 'true') {
                    rows = await sql`
                        WITH valid_session AS (
                            SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                        )
                        SELECT q.*, COUNT(qq.id) AS q_count
                        FROM quiz_sets q 
                        JOIN valid_session vs ON q.user_id = vs.user_id
                        LEFT JOIN questions qq ON qq.quiz_set_id = q.id
                        WHERE q.is_deleted = false AND q.is_archived = true
                        GROUP BY q.id
                    `;
                } else if (req.query.all === 'true') {
                    rows = await sql`
                        WITH valid_session AS (
                            SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                        )
                        SELECT q.*, COUNT(qq.id) AS q_count
                        FROM quiz_sets q 
                        JOIN valid_session vs ON q.user_id = vs.user_id
                        LEFT JOIN questions qq ON qq.quiz_set_id = q.id
                        GROUP BY q.id
                    `;
                } else {
                    rows = await sql`
                        WITH valid_session AS (
                            SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                        )
                        SELECT q.*, COUNT(qq.id) AS q_count
                        FROM quiz_sets q 
                        JOIN valid_session vs ON q.user_id = vs.user_id
                        LEFT JOIN questions qq ON qq.quiz_set_id = q.id
                        WHERE q.is_deleted = false AND q.is_archived = false
                        GROUP BY q.id
                    `;
                }
                const t2 = performance.now();

                result = rows.map((row) => ({
                    id: row.id,
                    name: row.name,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    type: row.type,
                    isDeleted: row.is_deleted,
                    isArchived: row.is_archived,
                    isReviewExcluded: row.exclude_from_review,
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
                const { name, type, questions } = req.body || {};
                const createdAt = new Date().toISOString();
                const insertSet = await sql`
                INSERT INTO quiz_sets (name, type, created_at, updated_at, is_deleted, is_archived, tags, user_id) 
                VALUES (${name}, ${type || 'quiz'}, ${createdAt}, ${createdAt}, false, false, '[]'::jsonb, ${userId}) 
                RETURNING id
            `;
                const setId = insertSet[0].id;

                if (Array.isArray(questions) && questions.length > 0) {
                    const bulkRows: BulkQuestionRow[] = [];
                    for (const raw of questions as Array<Record<string, unknown>>) {
                        const text = typeof raw.text === 'string' ? raw.text.trim() : '';
                        const category = typeof raw.category === 'string' ? raw.category : '';
                        const explanation = typeof raw.explanation === 'string' ? raw.explanation : '';
                        if (!text || !Array.isArray(raw.options) || !Array.isArray(raw.correctAnswers)) {
                            return res.status(400).json({ error: 'Invalid question payload' });
                        }

                        bulkRows.push({
                            quiz_set_id: setId,
                            category,
                            text,
                            options: JSON.stringify(raw.options),
                            correct_answers: JSON.stringify(raw.correctAnswers),
                            explanation,
                        });
                    }

                    await sql`
                        INSERT INTO questions (quiz_set_id, category, text, options, correct_answers, explanation)
                        SELECT quiz_set_id, category, text, options::jsonb, correct_answers::jsonb, explanation
                        FROM jsonb_to_recordset(${JSON.stringify(bulkRows)}::jsonb) AS x(
                            quiz_set_id int,
                            category text,
                            text text,
                            options text,
                            correct_answers text,
                            explanation text
                        )
                    `;
                }
                return res.status(201).json({ id: setId });
            } else if (method === 'PUT') {
                if (!id) return res.status(400).json({ error: 'Missing id' });
                const { name, isDeleted, isArchived, isReviewExcluded, tags } = req.body || {};

                const current = await sql`SELECT * FROM quiz_sets WHERE id = ${id} AND user_id = ${userId}`;
                if (current.length === 0) return res.status(404).json({ error: 'Not found' });

                if (name !== undefined) await sql`UPDATE quiz_sets SET name = ${name}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} AND user_id = ${userId}`;
                if (isDeleted !== undefined) await sql`UPDATE quiz_sets SET is_deleted = ${isDeleted}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} AND user_id = ${userId}`;
                if (isArchived !== undefined) await sql`UPDATE quiz_sets SET is_archived = ${isArchived}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} AND user_id = ${userId}`;
                if (isReviewExcluded !== undefined) {
                    try {
                        await sql`UPDATE quiz_sets SET exclude_from_review = ${isReviewExcluded} WHERE id = ${id} AND user_id = ${userId}`;
                    } catch (updateErr: unknown) {
                        const errorCode = typeof updateErr === 'object' && updateErr !== null && 'code' in updateErr
                            ? (updateErr as { code?: string }).code
                            : undefined;
                        const errorMessage = typeof updateErr === 'object' && updateErr !== null && 'message' in updateErr
                            ? String((updateErr as { message?: unknown }).message || '')
                            : '';
                        const isMissingColumn = errorCode === '42703' && errorMessage.includes('exclude_from_review');
                        if (!isMissingColumn) {
                            throw updateErr;
                        }
                        await sql`ALTER TABLE quiz_sets ADD COLUMN IF NOT EXISTS exclude_from_review BOOLEAN DEFAULT FALSE`;
                        await sql`UPDATE quiz_sets SET exclude_from_review = ${isReviewExcluded}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} AND user_id = ${userId}`;
                    }
                }
                if (tags !== undefined) await sql`UPDATE quiz_sets SET tags = ${JSON.stringify(tags)}::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} AND user_id = ${userId}`;

                return res.status(200).json({ success: true });
            } else if (method === 'DELETE') {
                if (!id) return res.status(400).json({ error: 'Missing id' });
                await sql`DELETE FROM quiz_sets WHERE id = ${id} AND user_id = ${userId}`;
                return res.status(200).json({ success: true });
            }
        } // Close the `else {` block here

        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: unknown) {
        console.error('quizSets API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
