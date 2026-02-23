import { neon } from '@neondatabase/serverless';
import { getSessionToken, getAuthenticatedUserId } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

type HistoryBody = {
    quizSetId?: number | string;
    date?: string;
    correctCount?: number;
    totalCount?: number;
    durationSeconds?: number;
    answers?: unknown;
    markedQuestionIds?: unknown;
    memos?: unknown;
    confidences?: unknown;
    questionIds?: unknown;
    mode?: string;
    feedbackTimingMode?: string;
    memorizationDetail?: unknown;
};

export default async function handler(req: ApiHandlerRequest<HistoryBody>, res: ApiHandlerResponse) {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
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

            // 1 query to fetch histories belonging to this valid session
            const rows = await sql`
                WITH valid_session AS (
                    SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                )
                SELECT h.* FROM histories h
                JOIN valid_session vs ON h.user_id = vs.user_id
                WHERE h.quiz_set_id = ${quizSetId}
                ORDER BY h.date DESC
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
                feedbackTimingMode: h.feedback_mode,
                memorizationDetail: h.memorization_detail
            }));
            return res.status(200).json(histories);
        } else {
            const userId = await getAuthenticatedUserId(req);
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            if (method === 'POST') {
                const h = req.body || {};
                const targetQuizSetId = Number(h?.quizSetId);
                if (!Number.isInteger(targetQuizSetId) || targetQuizSetId <= 0) {
                    return res.status(400).json({ error: 'Missing or invalid quizSetId' });
                }

                const ownedSet = await sql`
                    SELECT id FROM quiz_sets
                    WHERE id = ${targetQuizSetId} AND user_id = ${userId}
                    LIMIT 1
                `;
                if (ownedSet.length === 0) {
                    return res.status(404).json({ error: 'Quiz set not found' });
                }

                const dateStr = h.date ? new Date(h.date).toISOString() : new Date().toISOString();
                const insertHistory = async () => sql`
                    INSERT INTO histories (
                        quiz_set_id, date, correct_count, total_count, duration_seconds,
                        answers, marked_question_ids, memos, confidences, question_ids, mode, feedback_mode, memorization_detail, user_id
                    ) VALUES (
                        ${targetQuizSetId},
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
                        ${h.feedbackTimingMode || 'immediate'},
                        ${JSON.stringify(h.memorizationDetail || [])}::jsonb,
                        ${userId}
                    )
                    RETURNING id
                `;

                let result;
                try {
                    result = await insertHistory();
                } catch (insertErr: unknown) {
                    const errorCode = typeof insertErr === 'object' && insertErr !== null && 'code' in insertErr
                        ? (insertErr as { code?: string }).code
                        : undefined;
                    const errorMessage = typeof insertErr === 'object' && insertErr !== null && 'message' in insertErr
                        ? String((insertErr as { message?: unknown }).message || '')
                        : '';
                    const isMissingHistoryColumn = errorCode === '42703' && (
                        errorMessage.includes('feedback_mode') ||
                        errorMessage.includes('memorization_detail')
                    );

                    if (!isMissingHistoryColumn) {
                        throw insertErr;
                    }

                    await sql`ALTER TABLE histories ADD COLUMN IF NOT EXISTS feedback_mode VARCHAR(30)`;
                    await sql`ALTER TABLE histories ADD COLUMN IF NOT EXISTS memorization_detail JSONB`;
                    result = await insertHistory();
                }

                return res.status(201).json({ id: result[0].id });
            }
        } // Close else block

        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err: unknown) {
        console.error('histories API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
