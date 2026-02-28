import { neon } from '@neondatabase/serverless';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { getAuthenticatedUserId } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';
import { hasValue, isValidDateTime, isValidLocalDateString, parseNonNegativeInt, parsePositiveInt, parseQueryPositiveInt } from './_validation.js';

async function hasOwnedQuestion(
  sql: NeonQueryFunction<false, false>,
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

type ReviewScheduleBody = {
  id?: number | string;
  questionId?: number | string;
  quizSetId?: number | string;
  intervalDays?: number | string;
  nextDue?: string;
  lastReviewedAt?: string | null;
  consecutiveCorrect?: number | string;
};

type ParsedScheduleMutation = {
  intervalDays: number;
  nextDue: string;
  lastReviewedAt: string | null;
  consecutiveCorrect: number;
};

function parseScheduleMutation(data: ReviewScheduleBody): { value: ParsedScheduleMutation | null; error: string | null } {
  const intervalDays = parsePositiveInt(data.intervalDays);
  if (!intervalDays) {
    return { value: null, error: 'Missing or invalid intervalDays' };
  }

  const nextDue = typeof data.nextDue === 'string' ? data.nextDue : '';
  if (!isValidLocalDateString(nextDue)) {
    return { value: null, error: 'Missing or invalid nextDue (YYYY-MM-DD)' };
  }

  const rawLastReviewedAt = data.lastReviewedAt;
  let lastReviewedAt: string | null = null;
  if (hasValue(rawLastReviewedAt)) {
    if (typeof rawLastReviewedAt !== 'string' || !isValidDateTime(rawLastReviewedAt)) {
      return { value: null, error: 'Invalid lastReviewedAt' };
    }
    lastReviewedAt = rawLastReviewedAt;
  }

  const consecutiveCorrectRaw = hasValue(data.consecutiveCorrect) ? data.consecutiveCorrect : 0;
  const consecutiveCorrect = parseNonNegativeInt(consecutiveCorrectRaw);
  if (consecutiveCorrect === null) {
    return { value: null, error: 'Invalid consecutiveCorrect' };
  }

  return {
    value: {
      intervalDays,
      nextDue,
      lastReviewedAt,
      consecutiveCorrect,
    },
    error: null,
  };
}

export default async function handler(req: ApiHandlerRequest<ReviewScheduleBody>, res: ApiHandlerResponse) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });
  const sql = neon(databaseUrl);

  const { method } = req;
  const { quizSetId, questionId } = req.query;
  const parsedQuestionId = parseQueryPositiveInt(questionId);
  const parsedQuizSetId = parseQueryPositiveInt(quizSetId);

  try {
    if (method === 'GET') {
      if (parsedQuestionId.exists) {
        if (!parsedQuestionId.value) {
          return res.status(400).json({ error: 'Invalid questionId parameter' });
        }

        const rows = await sql`
                    SELECT rs.* FROM review_schedules rs
                    JOIN quiz_sets q ON rs.quiz_set_id = q.id
                    WHERE rs.user_id = ${userId}
                      AND rs.question_id = ${parsedQuestionId.value}
                      AND q.is_deleted = false
                      AND q.is_archived = false
                      AND COALESCE(q.exclude_from_review, false) = false
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
      if (parsedQuizSetId.exists) {
        if (!parsedQuizSetId.value) {
          return res.status(400).json({ error: 'Invalid quizSetId parameter' });
        }

        rows = await sql`
            SELECT rs.* FROM review_schedules rs
            JOIN quiz_sets q ON rs.quiz_set_id = q.id
            WHERE rs.user_id = ${userId}
              AND rs.quiz_set_id = ${parsedQuizSetId.value}
              AND q.is_deleted = false
              AND q.is_archived = false
              AND COALESCE(q.exclude_from_review, false) = false
        `;
      } else {
        rows = await sql`
                    SELECT s.* FROM review_schedules s
                    JOIN quiz_sets q ON s.quiz_set_id = q.id
                    WHERE s.user_id = ${userId}
                      AND q.is_deleted = false
                      AND q.is_archived = false
                      AND COALESCE(q.exclude_from_review, false) = false
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
      if (method === 'POST') {
        const s = req.body || {};
        const questionIdNum = parsePositiveInt(s.questionId);
        const quizSetIdNum = parsePositiveInt(s.quizSetId);
        if (!questionIdNum || !quizSetIdNum) {
          return res.status(400).json({ error: 'Missing or invalid questionId/quizSetId' });
        }

        const parsedSchedule = parseScheduleMutation(s);
        if (!parsedSchedule.value) {
          return res.status(400).json({ error: parsedSchedule.error || 'Invalid schedule payload' });
        }

        const ownedQuestion = await hasOwnedQuestion(sql, userId, questionIdNum, quizSetIdNum);
        if (!ownedQuestion) {
          return res.status(404).json({ error: 'Question not found' });
        }

        const result = await sql`
                INSERT INTO review_schedules (
                    question_id, quiz_set_id, interval_days, next_due, last_reviewed_at, consecutive_correct, user_id
                ) VALUES (
                    ${questionIdNum}, ${quizSetIdNum}, ${parsedSchedule.value.intervalDays}, ${parsedSchedule.value.nextDue}, ${parsedSchedule.value.lastReviewedAt}, ${parsedSchedule.value.consecutiveCorrect}, ${userId}
                )
                RETURNING id
            `;
        return res.status(201).json({ id: result[0].id });

      } else if (method === 'PUT') {
        const s = req.body || {};
        const parsedSchedule = parseScheduleMutation(s);
        if (!parsedSchedule.value) {
          return res.status(400).json({ error: parsedSchedule.error || 'Invalid schedule payload' });
        }

        if (hasValue(s.id)) {
          const idNum = parsePositiveInt(s.id);
          if (!idNum) {
            return res.status(400).json({ error: 'Invalid id' });
          }

          await sql`
                    UPDATE review_schedules SET 
                        interval_days = ${parsedSchedule.value.intervalDays},
                        next_due = ${parsedSchedule.value.nextDue},
                        last_reviewed_at = ${parsedSchedule.value.lastReviewedAt},
                        consecutive_correct = ${parsedSchedule.value.consecutiveCorrect}
                    WHERE id = ${idNum} AND user_id = ${userId}
                `;
          return res.status(200).json({ success: true });
        } else {
          const questionIdNum = parsePositiveInt(s.questionId);
          if (!questionIdNum) {
            return res.status(400).json({ error: 'Missing or invalid questionId' });
          }

          let quizSetIdNum: number | undefined;
          if (hasValue(s.quizSetId)) {
            const parsedQuizSetIdNum = parsePositiveInt(s.quizSetId);
            if (!parsedQuizSetIdNum) {
              return res.status(400).json({ error: 'Invalid quizSetId' });
            }
            quizSetIdNum = parsedQuizSetIdNum;
          }

          const ownedQuestion = await hasOwnedQuestion(sql, userId, questionIdNum, quizSetIdNum);
          if (!ownedQuestion) {
            return res.status(404).json({ error: 'Question not found' });
          }

          const existing = await sql`SELECT id FROM review_schedules WHERE question_id = ${questionIdNum} AND user_id = ${userId}`;
          if (existing.length > 0) {
            await sql`
                        UPDATE review_schedules SET 
                            interval_days = ${parsedSchedule.value.intervalDays},
                            next_due = ${parsedSchedule.value.nextDue},
                            last_reviewed_at = ${parsedSchedule.value.lastReviewedAt},
                            consecutive_correct = ${parsedSchedule.value.consecutiveCorrect}
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
                            ${questionIdNum}, ${quizSetIdNum}, ${parsedSchedule.value.intervalDays}, ${parsedSchedule.value.nextDue}, ${parsedSchedule.value.lastReviewedAt}, ${parsedSchedule.value.consecutiveCorrect}, ${userId}
                        )
                        RETURNING id
                    `;
            return res.status(201).json({ id: result[0].id });
          }
        }
      } else if (method === 'DELETE') {
        if (parsedQuizSetId.exists && parsedQuizSetId.value) {
          await sql`DELETE FROM review_schedules WHERE quiz_set_id = ${parsedQuizSetId.value} AND user_id = ${userId}`;
          return res.status(200).json({ deleted: true });
        }
        if (parsedQuizSetId.exists && !parsedQuizSetId.value) {
          return res.status(400).json({ error: 'Missing or invalid quizSetId for delete' });
        }
        return res.status(400).json({ error: 'Missing quizSetId for delete' });
      }
    } // Close the extended 'else' block

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err: unknown) {
    console.error('reviewSchedules API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
