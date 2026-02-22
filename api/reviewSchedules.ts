import { neon } from '@neondatabase/serverless';
import { getSessionToken, getAuthenticatedUserId } from './_auth.js';

async function hasOwnedQuestion(
  sql: ReturnType<typeof neon>,
  userId: number,
  questionId: number,
  quizSetId?: number
): Promise<boolean> {
  const rows = quizSetId === undefined
    ? await sql`
        SELECT q.id
        FROM questions q
        JOIN quiz_sets qs ON q.quiz_set_id = qs.id
        WHERE q.id = ${questionId} AND qs.user_id = ${userId}
        LIMIT 1
      `
    : await sql`
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
                    SELECT rs.* FROM review_schedules rs
                    JOIN valid_session vs ON rs.user_id = vs.user_id
                    WHERE rs.question_id = ${questionId}
                    LIMIT 1
                `;
        if (rows.length === 0) return res.status(200).json(null);
        const s = rows[0];
        return res.status(200).json({
          id: s.id,
          questionId: s.question_id,
          quizSetId: s.quiz_set_id,
          intervalDays: s.interval_days,
          nextDue: s.next_due,
          lastReviewedAt: s.last_reviewed_at ? new Date(s.last_reviewed_at).toISOString() : undefined,
          consecutiveCorrect: s.consecutive_correct
        });
      }

      let rows;
      if (quizSetId) {
        rows = await sql`
            WITH valid_session AS (
                SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
            )
            SELECT rs.* FROM review_schedules rs
            JOIN valid_session vs ON rs.user_id = vs.user_id
            WHERE rs.quiz_set_id = ${quizSetId}
        `;
      } else {
        rows = await sql`
                    WITH valid_session AS (
                        SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
                    )
                    SELECT s.* FROM review_schedules s
                    JOIN quiz_sets q ON s.quiz_set_id = q.id
                    JOIN valid_session vs ON s.user_id = vs.user_id
                    WHERE q.is_deleted = false AND q.is_archived = false
                `;
      }

      const schedules = rows.map(s => ({
        id: s.id,
        questionId: s.question_id,
        quizSetId: s.quiz_set_id,
        intervalDays: s.interval_days,
        nextDue: s.next_due ? new Date(s.next_due).toISOString().split('T')[0] : '',
        lastReviewedAt: s.last_reviewed_at ? new Date(s.last_reviewed_at).toISOString() : undefined,
        consecutiveCorrect: s.consecutive_correct
      }));
      return res.status(200).json(schedules);

    } else {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      if (method === 'POST') {
        const s = req.body;
        const questionIdNum = Number(s?.questionId);
        const quizSetIdNum = Number(s?.quizSetId);
        if (!Number.isInteger(questionIdNum) || questionIdNum <= 0 || !Number.isInteger(quizSetIdNum) || quizSetIdNum <= 0) {
          return res.status(400).json({ error: 'Missing or invalid questionId/quizSetId' });
        }
        const ownedQuestion = await hasOwnedQuestion(sql, userId, questionIdNum, quizSetIdNum);
        if (!ownedQuestion) {
          return res.status(404).json({ error: 'Question not found' });
        }

        const result = await sql`
                INSERT INTO review_schedules (
                    question_id, quiz_set_id, interval_days, next_due, last_reviewed_at, consecutive_correct, user_id
                ) VALUES (
                    ${questionIdNum}, ${quizSetIdNum}, ${s.intervalDays}, ${s.nextDue}, ${s.lastReviewedAt || null}, ${s.consecutiveCorrect}, ${userId}
                )
                RETURNING id
            `;
        return res.status(201).json({ id: result[0].id });

      } else if (method === 'PUT') {
        const s = req.body;
        if (!s.id && !s.questionId) return res.status(400).json({ error: 'Missing id or questionId' });

        if (s.id) {
          await sql`
                    UPDATE review_schedules SET 
                        interval_days = ${s.intervalDays},
                        next_due = ${s.nextDue},
                        last_reviewed_at = ${s.lastReviewedAt || null},
                        consecutive_correct = ${s.consecutiveCorrect}
                    WHERE id = ${s.id} AND user_id = ${userId}
                `;
          return res.status(200).json({ success: true });
        } else {
          const questionIdNum = Number(s.questionId);
          if (!Number.isInteger(questionIdNum) || questionIdNum <= 0) {
            return res.status(400).json({ error: 'Missing or invalid questionId' });
          }

          const quizSetIdNum = s.quizSetId !== undefined ? Number(s.quizSetId) : undefined;
          if (quizSetIdNum !== undefined && (!Number.isInteger(quizSetIdNum) || quizSetIdNum <= 0)) {
            return res.status(400).json({ error: 'Invalid quizSetId' });
          }

          const ownedQuestion = await hasOwnedQuestion(sql, userId, questionIdNum, quizSetIdNum);
          if (!ownedQuestion) {
            return res.status(404).json({ error: 'Question not found' });
          }

          const existing = await sql`SELECT id FROM review_schedules WHERE question_id = ${questionIdNum} AND user_id = ${userId}`;
          if (existing.length > 0) {
            await sql`
                        UPDATE review_schedules SET 
                            interval_days = ${s.intervalDays},
                            next_due = ${s.nextDue},
                            last_reviewed_at = ${s.lastReviewedAt || null},
                            consecutive_correct = ${s.consecutiveCorrect}
                        WHERE id = ${existing[0].id} AND user_id = ${userId}
                    `;
            return res.status(200).json({ id: existing[0].id });
          } else {
            if (quizSetIdNum === undefined) {
              return res.status(400).json({ error: 'Missing quizSetId for insert' });
            }
            const result = await sql`
                        INSERT INTO review_schedules (
                            question_id, quiz_set_id, interval_days, next_due, last_reviewed_at, consecutive_correct, user_id
                        ) VALUES (
                            ${questionIdNum}, ${quizSetIdNum}, ${s.intervalDays}, ${s.nextDue}, ${s.lastReviewedAt || null}, ${s.consecutiveCorrect}, ${userId}
                        )
                        RETURNING id
                    `;
            return res.status(201).json({ id: result[0].id });
          }
        }
      } else if (method === 'DELETE') {
        if (quizSetId) {
          await sql`DELETE FROM review_schedules WHERE quiz_set_id = ${quizSetId} AND user_id = ${userId}`;
          return res.status(200).json({ deleted: true });
        }
        return res.status(400).json({ error: 'Missing quizSetId for delete' });
      }
    } // Close the extended 'else' block

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err: any) {
    console.error('reviewSchedules API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
