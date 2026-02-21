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
  const { quizSetId, questionId } = req.query;

  try {
    if (method === 'GET') {
      if (questionId) {
        const rows = await sql`
          SELECT * FROM review_schedules 
          WHERE question_id = ${questionId} LIMIT 1
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
        rows = await sql`SELECT * FROM review_schedules WHERE quiz_set_id = ${quizSetId}`;
      } else {
        // Find all active quiz sets and get their schedules
        rows = await sql`
          SELECT s.* FROM review_schedules s
          JOIN quiz_sets q ON s.quiz_set_id = q.id
          WHERE q.is_deleted = false AND q.is_archived = false
        `;
      }

      const schedules = rows.map(s => ({
        id: s.id,
        questionId: s.question_id,
        quizSetId: s.quiz_set_id,
        intervalDays: s.interval_days,
        nextDue: s.next_due ? new Date(s.next_due).toISOString().split('T')[0] : '', // YYYY-MM-DD
        lastReviewedAt: s.last_reviewed_at ? new Date(s.last_reviewed_at).toISOString() : undefined,
        consecutiveCorrect: s.consecutive_correct
      }));
      return res.status(200).json(schedules);

    } else if (method === 'POST') {
      const s = req.body;
      const result = await sql`
        INSERT INTO review_schedules (
          question_id, quiz_set_id, interval_days, next_due, last_reviewed_at, consecutive_correct
        ) VALUES (
          ${s.questionId}, ${s.quizSetId}, ${s.intervalDays}, ${s.nextDue}, ${s.lastReviewedAt || null}, ${s.consecutiveCorrect}
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
          WHERE id = ${s.id}
        `;
        return res.status(200).json({ success: true });
      } else {
        // Upsert by questionId
        const existing = await sql`SELECT id FROM review_schedules WHERE question_id = ${s.questionId}`;
        if (existing.length > 0) {
          await sql`
            UPDATE review_schedules SET 
              interval_days = ${s.intervalDays},
              next_due = ${s.nextDue},
              last_reviewed_at = ${s.lastReviewedAt || null},
              consecutive_correct = ${s.consecutiveCorrect}
            WHERE id = ${existing[0].id}
          `;
          return res.status(200).json({ id: existing[0].id });
        } else {
          const result = await sql`
            INSERT INTO review_schedules (
              question_id, quiz_set_id, interval_days, next_due, last_reviewed_at, consecutive_correct
            ) VALUES (
              ${s.questionId}, ${s.quizSetId}, ${s.intervalDays}, ${s.nextDue}, ${s.lastReviewedAt || null}, ${s.consecutiveCorrect}
            )
            RETURNING id
          `;
          return res.status(201).json({ id: result[0].id });
        }
      }
    } else if (method === 'DELETE') {
      if (quizSetId) {
        const result = await sql`DELETE FROM review_schedules WHERE quiz_set_id = ${quizSetId}`;
        return res.status(200).json({ deleted: true });
      }
      return res.status(400).json({ error: 'Missing quizSetId for delete' });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (err: any) {
    console.error('reviewSchedules API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
