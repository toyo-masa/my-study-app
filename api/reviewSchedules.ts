import { neon } from '@neondatabase/serverless';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { getAuthenticatedUserId } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';
import { hasValue, isValidDateTime, isValidLocalDateString, parseNonNegativeInt, parsePositiveInt, parseQueryPositiveInt } from './_validation.js';

async function hasOwnedQuestion(
  sql: ReturnType<typeof neon>,
  userId: number,
  questionId: number,
  quizSetId?: number
): Promise<boolean> {
  const rows = (quizSetId === undefined
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
      `) as Record<string, unknown>[];
  return rows.length > 0;
}

type ReviewLogRow = {
  id: number;
  question_id: number;
  quiz_set_id: number;
  reviewed_at: string | Date;
  is_correct: boolean;
  confidence: number;
  interval_days: number;
  next_due: string | Date | null;
  memo: string | null;
  duration_seconds: number | null;
  session_id: string | null;
};

type ReviewLogBody = {
  questionId?: unknown;
  quizSetId?: unknown;
  reviewedAt?: unknown;
  isCorrect?: unknown;
  confidence?: unknown;
  intervalDays?: unknown;
  nextDue?: unknown;
  memo?: unknown;
  durationSeconds?: unknown;
  sessionId?: unknown;
};

function toReviewLogResponse(r: ReviewLogRow) {
  return {
    id: r.id,
    questionId: r.question_id,
    quizSetId: r.quiz_set_id,
    reviewedAt: new Date(r.reviewed_at).toISOString(),
    isCorrect: r.is_correct,
    confidence: r.confidence,
    intervalDays: r.interval_days,
    nextDue: r.next_due ? new Date(r.next_due).toISOString().split('T')[0] : '',
    memo: r.memo,
    durationSeconds: r.duration_seconds,
    sessionId: r.session_id
  };
}

async function handleReviewLogsRequest(
  sql: NeonQueryFunction<false, false>,
  userId: number,
  req: ApiHandlerRequest<ReviewLogBody>,
  res: ApiHandlerResponse
) {
  const { method } = req;
  const { quizSetId, questionId, latest } = req.query;

  if (method === 'GET') {
    if (questionId) {
      const questionIdNum = parseQueryPositiveInt(questionId).value;
      if (!questionIdNum) {
        return res.status(400).json({ error: 'Invalid questionId parameter' });
      }

      const rows = await sql`
        SELECT rl.* FROM review_logs rl
        WHERE rl.user_id = ${userId}
          AND rl.question_id = ${questionIdNum}
        ORDER BY rl.reviewed_at DESC
      `;
      return res.status(200).json((rows as ReviewLogRow[]).map(toReviewLogResponse));
    }

    if (quizSetId) {
      const latestValue = Array.isArray(latest) ? latest[0] : latest;
      const quizSetIdNum = parseQueryPositiveInt(quizSetId).value;
      if (!quizSetIdNum) {
        return res.status(400).json({ error: 'Invalid quizSetId parameter' });
      }

      const rows = latestValue === 'true'
        ? await sql`
            SELECT * FROM (
              SELECT DISTINCT ON (rl.question_id) rl.*
              FROM review_logs rl
              WHERE rl.user_id = ${userId}
                AND rl.quiz_set_id = ${quizSetIdNum}
              ORDER BY rl.question_id, rl.reviewed_at DESC
            ) latest_logs
            ORDER BY latest_logs.reviewed_at DESC
          `
        : await sql`
            SELECT rl.* FROM review_logs rl
            WHERE rl.user_id = ${userId}
              AND rl.quiz_set_id = ${quizSetIdNum}
            ORDER BY rl.reviewed_at DESC
          `;
      return res.status(200).json((rows as ReviewLogRow[]).map(toReviewLogResponse));
    }

    return res.status(400).json({ error: 'Missing questionId or quizSetId parameter' });
  }

  if (method === 'POST') {
    const body = req.body || {};
    const questionIdNum = Number(body.questionId);
    const quizSetIdNum = Number(body.quizSetId);
    if (!Number.isInteger(questionIdNum) || questionIdNum <= 0 || !Number.isInteger(quizSetIdNum) || quizSetIdNum <= 0) {
      return res.status(400).json({ error: 'Missing or invalid questionId/quizSetId' });
    }

    const ownedQuestion = await hasOwnedQuestion(sql, userId, questionIdNum, quizSetIdNum);
    if (!ownedQuestion) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const reviewedAt = typeof body.reviewedAt === 'string' ? body.reviewedAt : new Date().toISOString();
    const result = await sql`
      INSERT INTO review_logs (
        question_id, quiz_set_id, reviewed_at, is_correct, confidence,
        interval_days, next_due, memo, duration_seconds, session_id, user_id
      ) VALUES (
        ${questionIdNum}, ${quizSetIdNum}, ${reviewedAt}, ${body.isCorrect}, ${body.confidence},
        ${body.intervalDays}, ${body.nextDue}, ${body.memo || null}, ${body.durationSeconds || null}, ${body.sessionId || null}, ${userId}
      )
      RETURNING id
    `;
    return res.status(201).json({ id: result[0].id });
  }

  if (method === 'DELETE') {
    const quizSetIdNum = parseQueryPositiveInt(quizSetId).value;
    if (!quizSetIdNum) {
      return res.status(400).json({ error: 'Missing quizSetId' });
    }
    await sql`DELETE FROM review_logs WHERE quiz_set_id = ${quizSetIdNum} AND user_id = ${userId}`;
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}

// ---- Bulk upsert types ----
type BulkParsedSchedule = {
  questionId: number;
  quizSetId: number;
  intervalDays: number;
  nextDue: string;
  lastReviewedAt: string | null;
  consecutiveCorrect: number;
};

type BulkUpdateRow = {
  id: number;
  interval_days: number;
  next_due: string;
  last_reviewed_at: string | null;
  consecutive_correct: number;
};

type BulkInsertRow = {
  question_id: number;
  quiz_set_id: number;
  interval_days: number;
  next_due: string;
  last_reviewed_at: string | null;
  consecutive_correct: number;
  user_id: number;
};

function isValidBulkDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseBulkSchedule(raw: unknown): BulkParsedSchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const questionId = Number(data.questionId);
  const quizSetId = Number(data.quizSetId);
  const intervalDays = Number(data.intervalDays);
  const consecutiveCorrect = Number(data.consecutiveCorrect ?? 0);
  const nextDue = typeof data.nextDue === 'string' ? data.nextDue : '';
  const rawLastReviewedAt = data.lastReviewedAt;
  const hasLastReviewedAt = hasValue(rawLastReviewedAt);
  const lastReviewedAt = hasLastReviewedAt && typeof rawLastReviewedAt === 'string' ? rawLastReviewedAt : null;

  if (!Number.isInteger(questionId) || questionId <= 0) return null;
  if (!Number.isInteger(quizSetId) || quizSetId <= 0) return null;
  if (!Number.isInteger(intervalDays) || intervalDays <= 0) return null;
  if (!Number.isInteger(consecutiveCorrect) || consecutiveCorrect < 0) return null;
  if (!isValidBulkDate(nextDue)) return null;
  if (hasLastReviewedAt) {
    if (typeof rawLastReviewedAt !== 'string' || !isValidDateTime(rawLastReviewedAt)) {
      return null;
    }
  }

  return { questionId, quizSetId, intervalDays, nextDue, lastReviewedAt, consecutiveCorrect };
}

async function handleBulkUpsert(
  sql: ReturnType<typeof neon>,
  userId: number,
  rawSchedules: unknown,
  res: ApiHandlerResponse
) {
  if (!Array.isArray(rawSchedules) || rawSchedules.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty schedules array' });
  }

  const schedules: BulkParsedSchedule[] = [];
  for (const raw of rawSchedules) {
    const parsed = parseBulkSchedule(raw);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid schedule payload' });
    }
    schedules.push(parsed);
  }

  const questionIds = schedules.map(s => s.questionId);
  const uniqueQuestionIds = Array.from(new Set(questionIds));
  if (uniqueQuestionIds.length !== questionIds.length) {
    return res.status(400).json({ error: 'Duplicate questionId in schedules array' });
  }

  const ownedQuestions = (await sql`
    SELECT q.id AS question_id, q.quiz_set_id
    FROM questions q
    JOIN quiz_sets qs ON q.quiz_set_id = qs.id
    WHERE qs.user_id = ${userId}
      AND q.id = ANY(${questionIds})
  `) as Record<string, unknown>[];

  if (ownedQuestions.length !== uniqueQuestionIds.length) {
    return res.status(404).json({ error: 'Question not found' });
  }
  const ownedQuizSetByQuestionId = new Map(
    ownedQuestions.map(r => [Number(r.question_id), Number(r.quiz_set_id)])
  );
  for (const schedule of schedules) {
    const ownerQuizSetId = ownedQuizSetByQuestionId.get(schedule.questionId);
    if (ownerQuizSetId !== schedule.quizSetId) {
      return res.status(400).json({ error: 'questionId and quizSetId mismatch' });
    }
  }

  const existingRows = (await sql`
    WITH ranked AS (
      SELECT
        id,
        question_id,
        ROW_NUMBER() OVER (
          PARTITION BY question_id
          ORDER BY COALESCE(last_reviewed_at, to_timestamp(0)) DESC, id DESC
        ) AS rn
      FROM review_schedules
      WHERE user_id = ${userId} AND question_id = ANY(${questionIds})
    )
    SELECT id, question_id
    FROM ranked
    WHERE rn = 1
  `) as Record<string, unknown>[];

  const existingMap = new Map(existingRows.map(r => [Number(r.question_id), Number(r.id)]));

  const inserts: BulkInsertRow[] = [];
  const updates: BulkUpdateRow[] = [];

  for (const s of schedules) {
    const existingId = existingMap.get(s.questionId);
    if (existingId) {
      updates.push({
        id: existingId,
        interval_days: s.intervalDays,
        next_due: s.nextDue,
        last_reviewed_at: s.lastReviewedAt || null,
        consecutive_correct: s.consecutiveCorrect,
      });
    } else {
      inserts.push({
        question_id: s.questionId,
        quiz_set_id: s.quizSetId,
        interval_days: s.intervalDays,
        next_due: s.nextDue,
        last_reviewed_at: s.lastReviewedAt || null,
        consecutive_correct: s.consecutiveCorrect,
        user_id: userId,
      });
    }
  }

  if (updates.length > 0) {
    await sql`
      UPDATE review_schedules AS rs
      SET
        interval_days = u.interval_days::int,
        next_due = u.next_due::date,
        last_reviewed_at = u.last_reviewed_at::timestamptz,
        consecutive_correct = u.consecutive_correct::int
      FROM (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
        AS x(id int, interval_days int, next_due date, last_reviewed_at text, consecutive_correct int)
      ) AS u
      WHERE rs.id = u.id AND rs.user_id = ${userId}
    `;
  }

  if (inserts.length > 0) {
    await sql`
      INSERT INTO review_schedules (
        question_id, quiz_set_id, interval_days, next_due, last_reviewed_at, consecutive_correct, user_id
      )
      SELECT
        question_id, quiz_set_id, interval_days, next_due::date, last_reviewed_at::timestamptz, consecutive_correct, user_id
      FROM jsonb_to_recordset(${JSON.stringify(inserts)}::jsonb) AS x(
        question_id int,
        quiz_set_id int,
        interval_days int,
        next_due text,
        last_reviewed_at text,
        consecutive_correct int,
        user_id int
      )
    `;
  }

  return res.status(200).json({ success: true, updated: updates.length, inserted: inserts.length });
}

// ---- Single-schedule types ----
type ReviewScheduleBody = {
  id?: number | string;
  questionId?: number | string;
  quizSetId?: number | string;
  intervalDays?: number | string;
  nextDue?: string;
  lastReviewedAt?: string | null;
  consecutiveCorrect?: number | string;
  schedules?: unknown; // for bulk POST
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
  const { quizSetId, questionId, bulk, action, resource } = req.query;
  const parsedQuestionId = parseQueryPositiveInt(questionId);
  const parsedQuizSetId = parseQueryPositiveInt(quizSetId);
  const queryAction = Array.isArray(action) ? action[0] : action;
  const queryResource = Array.isArray(resource) ? resource[0] : resource;
  const isReviewLogsRequest = queryAction === 'logs' || queryResource === 'logs';

  // Handle bulk upsert via POST ?bulk=true
  if (method === 'POST' && bulk === 'true') {
    try {
      return await handleBulkUpsert(sql, userId, req.body?.schedules, res);
    } catch (err: unknown) {
      console.error('reviewSchedules bulk API error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  try {
    if (isReviewLogsRequest) {
      return await handleReviewLogsRequest(sql, userId, req as ApiHandlerRequest<ReviewLogBody>, res);
    }

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
                    ORDER BY COALESCE(rs.last_reviewed_at, to_timestamp(0)) DESC, rs.id DESC
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
          lastReviewedAt: s.last_reviewed_at ? new Date(s.last_reviewed_at as string).toISOString() : undefined,
          consecutiveCorrect: s.consecutive_correct
        });
      }

      let rows;
      if (parsedQuizSetId.exists) {
        if (!parsedQuizSetId.value) {
          return res.status(400).json({ error: 'Invalid quizSetId parameter' });
        }

        rows = await sql`
            WITH ranked AS (
              SELECT
                rs.*,
                ROW_NUMBER() OVER (
                  PARTITION BY rs.question_id
                  ORDER BY COALESCE(rs.last_reviewed_at, to_timestamp(0)) DESC, rs.id DESC
                ) AS rn
              FROM review_schedules rs
              JOIN quiz_sets q ON rs.quiz_set_id = q.id
              WHERE rs.user_id = ${userId}
                AND rs.quiz_set_id = ${parsedQuizSetId.value}
                AND q.is_deleted = false
                AND q.is_archived = false
                AND COALESCE(q.exclude_from_review, false) = false
            )
            SELECT * FROM ranked
            WHERE rn = 1
        `;
      } else {
        rows = await sql`
                    WITH ranked AS (
                      SELECT
                        s.*,
                        ROW_NUMBER() OVER (
                          PARTITION BY s.question_id
                          ORDER BY COALESCE(s.last_reviewed_at, to_timestamp(0)) DESC, s.id DESC
                        ) AS rn
                      FROM review_schedules s
                      JOIN quiz_sets q ON s.quiz_set_id = q.id
                      WHERE s.user_id = ${userId}
                        AND q.is_deleted = false
                        AND q.is_archived = false
                        AND COALESCE(q.exclude_from_review, false) = false
                    )
                    SELECT * FROM ranked
                    WHERE rn = 1
                `;
      }

      const schedules = rows.map(s => ({
        id: s.id,
        questionId: s.question_id,
        quizSetId: s.quiz_set_id,
        intervalDays: s.interval_days,
        nextDue: s.next_due ? new Date(s.next_due as string).toISOString().split('T')[0] : '',
        lastReviewedAt: s.last_reviewed_at ? new Date(s.last_reviewed_at as string).toISOString() : undefined,
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

          const existing = await sql`
            SELECT id
            FROM review_schedules
            WHERE question_id = ${questionIdNum} AND user_id = ${userId}
            ORDER BY COALESCE(last_reviewed_at, to_timestamp(0)) DESC, id DESC
            LIMIT 1
          `;
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
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err: unknown) {
    console.error('reviewSchedules API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
