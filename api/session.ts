import { serialize } from 'cookie';
import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUser, getSessionToken, isAdminIdentity } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

type SessionAction = 'me' | 'logout' | 'adminSummary';

type AdminSummaryRow = {
    total_users: number | string;
    active_sessions: number | string;
    total_quiz_sets: number | string;
    total_questions: number | string;
    total_histories: number | string;
    total_review_schedules: number | string;
    total_review_logs: number | string;
    due_review_items: number | string;
};

function toNumber(value: number | string): number {
    if (typeof value === 'number') {
        return value;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function resolveAction(req: ApiHandlerRequest): SessionAction | undefined {
    const rawAction = req.query.action;
    const action = Array.isArray(rawAction) ? rawAction[0] : rawAction;
    if (action === 'me' || action === 'logout' || action === 'adminSummary') {
        return action;
    }
    return undefined;
}

async function handleMe(req: ApiHandlerRequest, res: ApiHandlerResponse) {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });

    try {
        const sql = neon(databaseUrl);
        const rows = await sql`
            WITH valid_session AS (
                SELECT user_id FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW() LIMIT 1
            )
            SELECT u.id, u.username, u.created_at FROM users u
            JOIN valid_session vs ON u.id = vs.user_id
        `;
        if (rows.length === 0) {
            return res.status(401).json({ error: 'User not found or session invalid' });
        }

        return res.status(200).json({
            id: rows[0].id,
            username: rows[0].username,
            isAdmin: isAdminIdentity(rows[0].id as number, rows[0].username as string),
            createdAt: rows[0].created_at,
        });
    } catch (err: unknown) {
        console.error('session me error:', err);
        return res.status(500).json({ error: 'ユーザー情報の取得に失敗しました' });
    }
}

async function handleLogout(req: ApiHandlerRequest, res: ApiHandlerResponse) {
    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });

    try {
        const sessionToken = getSessionToken(req);
        if (sessionToken) {
            const sql = neon(databaseUrl);
            await sql`DELETE FROM sessions WHERE token = ${sessionToken}`;
        }

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict' as const,
            path: '/',
            maxAge: 0,
        };

        res.setHeader('Set-Cookie', [serialize('auth_session', '', cookieOptions)]);
        return res.status(200).json({ success: true });
    } catch (err: unknown) {
        console.error('session logout error:', err);
        return res.status(500).json({ error: 'ログアウト処理中にエラーが発生しました' });
    }
}

async function handleAdminSummary(req: ApiHandlerRequest, res: ApiHandlerResponse) {
    const user = await getAuthenticatedUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!user.isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) {
        return res.status(500).json({ error: 'Database URL not found' });
    }

    try {
        const sql = neon(databaseUrl);
        const rows = await sql<AdminSummaryRow[]>`
            SELECT
                (SELECT COUNT(*)::int FROM users) AS total_users,
                (SELECT COUNT(*)::int FROM sessions WHERE expires_at > NOW()) AS active_sessions,
                (SELECT COUNT(*)::int FROM quiz_sets WHERE COALESCE(is_deleted, FALSE) = FALSE) AS total_quiz_sets,
                (SELECT COUNT(*)::int FROM questions) AS total_questions,
                (SELECT COUNT(*)::int FROM histories) AS total_histories,
                (SELECT COUNT(*)::int FROM review_schedules) AS total_review_schedules,
                (SELECT COUNT(*)::int FROM review_logs) AS total_review_logs,
                (SELECT COUNT(*)::int FROM review_schedules WHERE next_due <= CURRENT_DATE) AS due_review_items
        `;

        const row = rows[0];
        return res.status(200).json({
            generatedAt: new Date().toISOString(),
            summary: {
                totalUsers: toNumber(row.total_users),
                activeSessions: toNumber(row.active_sessions),
                totalQuizSets: toNumber(row.total_quiz_sets),
                totalQuestions: toNumber(row.total_questions),
                totalHistories: toNumber(row.total_histories),
                totalReviewSchedules: toNumber(row.total_review_schedules),
                totalReviewLogs: toNumber(row.total_review_logs),
                dueReviewItems: toNumber(row.due_review_items),
            },
        });
    } catch (err: unknown) {
        console.error('session adminSummary error:', err);
        return res.status(500).json({ error: '管理情報の取得に失敗しました' });
    }
}

export default async function handler(req: ApiHandlerRequest, res: ApiHandlerResponse) {
    const action = resolveAction(req);

    if (action === 'me' || (!action && req.method === 'GET')) {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return handleMe(req, res);
    }

    if (action === 'logout' || (!action && req.method === 'POST')) {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return handleLogout(req, res);
    }

    if (action === 'adminSummary') {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return handleAdminSummary(req, res);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
}
