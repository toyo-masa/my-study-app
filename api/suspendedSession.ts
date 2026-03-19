import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUserId } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

type SuspendedSessionBody = {
    quizSetId?: number | string;
    slotKey?: string;
    session?: unknown;
};

let suspendedSessionSchemaEnsured = false;
const DEFAULT_SLOT_KEY = 'default';
const ALLOWED_SLOT_KEYS = new Set(['default', 'review_due']);

export default async function handler(req: ApiHandlerRequest<SuspendedSessionBody>, res: ApiHandlerResponse) {
    res.setHeader('Cache-Control', 'no-store');

    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });
    const sql = neon(databaseUrl);

    const method = req.method;
    const rawQuizSetId = req.query.quizSetId ?? req.body?.quizSetId;
    const quizSetId = Number(rawQuizSetId);
    const rawSlotKey = req.query.slotKey ?? req.body?.slotKey;
    const slotKey = typeof rawSlotKey === 'string' && rawSlotKey.length > 0 ? rawSlotKey : DEFAULT_SLOT_KEY;

    if (!Number.isInteger(quizSetId) || quizSetId <= 0) {
        return res.status(400).json({ error: 'Missing or invalid quizSetId' });
    }
    if (!ALLOWED_SLOT_KEYS.has(slotKey)) {
        return res.status(400).json({ error: 'Missing or invalid slotKey' });
    }

    try {
        if (!suspendedSessionSchemaEnsured) {
            await sql`
                CREATE TABLE IF NOT EXISTS suspended_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    quiz_set_id INTEGER REFERENCES quiz_sets(id) ON DELETE CASCADE,
                    session_key VARCHAR(50) DEFAULT 'default',
                    session_data JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `;
            await sql`
                ALTER TABLE suspended_sessions
                ADD COLUMN IF NOT EXISTS session_key VARCHAR(50) DEFAULT 'default'
            `;
            await sql`
                UPDATE suspended_sessions
                SET session_key = 'default'
                WHERE session_key IS NULL OR session_key = ''
            `;
            await sql`DROP INDEX IF EXISTS suspended_sessions_user_quiz_unique_idx`;
            await sql`
                CREATE UNIQUE INDEX IF NOT EXISTS suspended_sessions_user_quiz_session_unique_idx
                ON suspended_sessions (user_id, quiz_set_id, session_key)
            `;
            suspendedSessionSchemaEnsured = true;
        }

        const ownedQuizSet = await sql`
            SELECT id
            FROM quiz_sets
            WHERE id = ${quizSetId} AND user_id = ${userId}
            LIMIT 1
        `;
        if (ownedQuizSet.length === 0) {
            return res.status(404).json({ error: 'Quiz set not found' });
        }

        if (method === 'GET') {
            const rows = await sql`
                SELECT session_data
                FROM suspended_sessions
                WHERE user_id = ${userId} AND quiz_set_id = ${quizSetId} AND session_key = ${slotKey}
                LIMIT 1
            `;

            if (rows.length === 0) {
                return res.status(200).json(null);
            }

            return res.status(200).json(rows[0].session_data);
        }

        if (method === 'PUT') {
            const session = req.body?.session;
            if (!session || typeof session !== 'object') {
                return res.status(400).json({ error: 'Missing session payload' });
            }

            await sql`
                INSERT INTO suspended_sessions (user_id, quiz_set_id, session_key, session_data, updated_at)
                VALUES (${userId}, ${quizSetId}, ${slotKey}, ${JSON.stringify(session)}::jsonb, NOW())
                ON CONFLICT (user_id, quiz_set_id, session_key)
                DO UPDATE SET session_data = EXCLUDED.session_data, updated_at = NOW()
            `;

            return res.status(200).json({ success: true });
        }

        if (method === 'DELETE') {
            await sql`
                DELETE FROM suspended_sessions
                WHERE user_id = ${userId} AND quiz_set_id = ${quizSetId} AND session_key = ${slotKey}
            `;
            return res.status(200).json({ success: true });
        }

        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).end(`Method ${method} Not Allowed`);
    } catch (err) {
        console.error('suspendedSession API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
