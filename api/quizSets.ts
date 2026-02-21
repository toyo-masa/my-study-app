import { neon } from '@neondatabase/serverless';
import { isAuthorized } from './_auth';

export default async function handler(req: any, res: any) {
    if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });
    const sql = neon(databaseUrl);

    const { method } = req;
    const { id, action, includeDeleted, archivedOnly } = req.query;

    try {
        if (method === 'GET') {
            if (id) {
                // Get single quiz set
                const rows = await sql`SELECT * FROM quiz_sets WHERE id = ${id}`;
                if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

                // Count questions manually or via join, but simpler is returning just the set
                return res.status(200).json(rows[0]);
            } else {
                // Get list
                let rows;
                if (includeDeleted === 'true') {
                    rows = await sql`SELECT * FROM quiz_sets`;
                } else if (archivedOnly === 'true') {
                    rows = await sql`SELECT * FROM quiz_sets WHERE is_deleted = false AND is_archived = true`;
                } else {
                    rows = await sql`SELECT * FROM quiz_sets WHERE is_deleted = false AND is_archived = false`;
                }

                // We also need question counts (or we can just fetch them later)
                // A joined query to get questionCount
                const result = await Promise.all(rows.map(async (row) => {
                    const countRes = await sql`SELECT COUNT(*) as count FROM questions WHERE quiz_set_id = ${row.id}`;
                    return {
                        id: row.id,
                        name: row.name,
                        createdAt: row.created_at,
                        type: row.type,
                        isDeleted: row.is_deleted,
                        isArchived: row.is_archived,
                        tags: row.tags,
                        questionCount: Number(countRes[0].count),
                        categories: row.tags || []
                    };
                }));

                return res.status(200).json(result);
            }
        } else if (method === 'POST') {
            const { name, type, questions } = req.body;
            const createdAt = new Date().toISOString();
            const insertSet = await sql`
        INSERT INTO quiz_sets (name, type, created_at, is_deleted, is_archived, tags) 
        VALUES (${name}, ${type || 'quiz'}, ${createdAt}, false, false, '[]'::jsonb) 
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

            const current = await sql`SELECT * FROM quiz_sets WHERE id = ${id}`;
            if (current.length === 0) return res.status(404).json({ error: 'Not found' });

            // Build update query manually or piecewise
            if (name !== undefined) await sql`UPDATE quiz_sets SET name = ${name} WHERE id = ${id}`;
            if (isDeleted !== undefined) await sql`UPDATE quiz_sets SET is_deleted = ${isDeleted} WHERE id = ${id}`;
            if (isArchived !== undefined) await sql`UPDATE quiz_sets SET is_archived = ${isArchived} WHERE id = ${id}`;
            if (tags !== undefined) await sql`UPDATE quiz_sets SET tags = ${JSON.stringify(tags)}::jsonb WHERE id = ${id}`;

            return res.status(200).json({ success: true });
        } else if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id' });

            // cascading delete is handled by DB schema
            await sql`DELETE FROM quiz_sets WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        }

        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: any) {
        console.error('quizSets API error:', err);
        return res.status(500).json({ error: err.message });
    }
}
