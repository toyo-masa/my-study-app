import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUserId } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

type QuestionInput = {
    quizSetId?: number | string;
    category?: string;
    text?: string;
    options?: unknown;
    correctAnswers?: unknown;
    explanation?: string;
};

type QuestionsBulkBody = {
    questions?: QuestionInput[];
};

export default async function handler(req: ApiHandlerRequest<QuestionsBulkBody>, res: ApiHandlerResponse) {
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
        if (method === 'POST') {
            const questions = req.body?.questions;
            if (!Array.isArray(questions) || questions.length === 0) {
                return res.status(400).json({ error: 'Invalid or empty questions array' });
            }

            // Verify quiz set belongs to user (assuming all questions belong to the same quiz set for bulk insert)
            const quizSetId = questions[0].quizSetId;
            const setCheck = await sql`SELECT id FROM quiz_sets WHERE id = ${quizSetId} AND user_id = ${userId}`;
            if (setCheck.length === 0) return res.status(404).json({ error: 'Quiz set not found or unauthorized' });

            // Ensure all questions are for the same quiz set
            if (!questions.every(q => q.quizSetId === quizSetId)) {
                return res.status(400).json({ error: 'All questions must belong to the same quizSetId' });
            }

            // Perform bulk insert using a single transaction/query
            // neon driver handles arrays nicely for multiple rows if formatted correctly, but we can also build the values query string, or loop within a transaction. 
            // Since neon is serverless, multiple inserts might be best done by generating the query parameters.
            // Wait, we can use sql`INSERT ... SELECT * FROM json_populate_recordset(...)` or similar, 
            // but the easiest way is to build the query dynamically.
            // Actually, `@neondatabase/serverless` using postgres-like syntax supports array of objects, or we can use unnest.

            // To be safe and standard with postgres.js / neon, we can construct the values string or just do them one by one if it's in the same connection? 
            // neon() function returns a connectionless driver, so doing it in a loop with Promise.all won't be a single SQL query but parallel HTTP requests... wait, neon over HTTP supports transactions using `neon(url)`? No, HTTP doesn't support interactive transactions well.
            // But we want to do ONE query. 

            // Fortunately, postgres "INSERT INTO table (cols) VALUES (...), (...)" can be constructed.
            // With neon, we can pass arrays to format.
            // Actually `postgres` library (which neon is based on for the template tag) supports inserting arrays of objects!
            // const result = await sql`INSERT INTO questions ${sql(questions, 'quiz_set_id', 'category', 'text', 'options', 'correct_answers', 'explanation')} RETURNING id`;
            // Let's format the input array specifically:

            const insertData = questions.map(q => ({
                quiz_set_id: q.quizSetId,
                category: q.category,
                text: q.text,
                options: JSON.stringify(q.options),
                correct_answers: JSON.stringify(q.correctAnswers),
                explanation: q.explanation || ''
            }));

            const result = await sql`
                INSERT INTO questions (quiz_set_id, category, text, options, correct_answers, explanation)
                SELECT quiz_set_id, category, text, options::jsonb, correct_answers::jsonb, explanation
                FROM jsonb_to_recordset(${JSON.stringify(insertData)}::jsonb) AS x(
                    quiz_set_id int, 
                    category text, 
                    text text, 
                    options text, 
                    correct_answers text, 
                    explanation text
                )
                RETURNING id
            `;

            const t1 = performance.now();
            console.log(`[POST /api/questionsBulk] Timing: ms_total=${t1 - t0}`);

            return res.status(201).json({ ids: result.map(r => r.id) });
        }

        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: unknown) {
        console.error('questionsBulk API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
