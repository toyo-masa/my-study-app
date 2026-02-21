import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
    const secretToken = process.env.API_SECRET_TOKEN;
    const clientToken = req.headers['x-sync-token'];

    if (secretToken && clientToken !== secretToken) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });
    const sql = neon(databaseUrl);

    const { method } = req;
    const { id, quizSetId } = req.query;

    try {
        if (method === 'GET') {
            if (id) {
                const rows = await sql`SELECT * FROM questions WHERE id = ${id}`;
                if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
                const q = rows[0];
                return res.status(200).json({
                    id: q.id,
                    quizSetId: q.quiz_set_id,
                    category: q.category,
                    text: q.text,
                    options: q.options,
                    correctAnswers: q.correct_answers,
                    explanation: q.explanation
                });
            } else if (quizSetId) {
                const rows = await sql`SELECT * FROM questions WHERE quiz_set_id = ${quizSetId}`;
                const questions = rows.map(q => ({
                    id: q.id,
                    quizSetId: q.quiz_set_id,
                    category: q.category,
                    text: q.text,
                    options: q.options,
                    correctAnswers: q.correct_answers,
                    explanation: q.explanation
                }));
                return res.status(200).json(questions);
            } else {
                return res.status(400).json({ error: 'Missing id or quizSetId' });
            }
        } else if (method === 'POST') {
            const q = req.body;
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
            const q = req.body;
            let updateFields = [];
            let queryValIdx = 1;

            const current = await sql`SELECT * FROM questions WHERE id = ${id}`;
            if (current.length === 0) return res.status(404).json({ error: 'Not found' });

            // Build updates safely
            if (q.category !== undefined) await sql`UPDATE questions SET category = ${q.category} WHERE id = ${id}`;
            if (q.text !== undefined) await sql`UPDATE questions SET text = ${q.text} WHERE id = ${id}`;
            if (q.options !== undefined) await sql`UPDATE questions SET options = ${JSON.stringify(q.options)}::jsonb WHERE id = ${id}`;
            if (q.correctAnswers !== undefined) await sql`UPDATE questions SET correct_answers = ${JSON.stringify(q.correctAnswers)}::jsonb WHERE id = ${id}`;
            if (q.explanation !== undefined) await sql`UPDATE questions SET explanation = ${q.explanation} WHERE id = ${id}`;

            return res.status(200).json({ success: true });
        } else if (method === 'DELETE') {
            if (!id) return res.status(400).json({ error: 'Missing id' });
            await sql`DELETE FROM questions WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        }

        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: any) {
        console.error('questions API error:', err);
        return res.status(500).json({ error: err.message });
    }
}
