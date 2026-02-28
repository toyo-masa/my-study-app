import { serialize } from 'cookie';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { getAuthenticatedUser, getSessionToken, isAdminIdentity } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

type SessionAction = 'me' | 'logout' | 'adminSummary' | 'adminUsers' | 'adminResetPassword' | 'adminDeleteUser';

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

type AdminUserRow = {
    id: number | string;
    username: string;
    created_at: string | Date;
    last_login_at: string | Date | null;
    active_session_count: number | string;
    quiz_set_count: number | string;
    memorization_card_count: number | string;
};

type SessionRequestBody = {
    targetUserId?: unknown;
    newPassword?: unknown;
};

function toNumber(value: number | string): number {
    if (typeof value === 'number') {
        return value;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositiveInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        if (Number.isInteger(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return null;
}

function toIsoDateString(value: string | Date): string {
    if (value instanceof Date) {
        return value.toISOString();
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }
    return parsed.toISOString();
}

function resolveAction(req: ApiHandlerRequest): SessionAction | undefined {
    const rawAction = req.query.action;
    const action = Array.isArray(rawAction) ? rawAction[0] : rawAction;
    if (
        action === 'me' ||
        action === 'logout' ||
        action === 'adminSummary' ||
        action === 'adminUsers' ||
        action === 'adminResetPassword' ||
        action === 'adminDeleteUser'
    ) {
        return action;
    }
    return undefined;
}

async function requireAdminForPrivateAction(req: ApiHandlerRequest, res: ApiHandlerResponse) {
    const user = await getAuthenticatedUser(req);
    if (!user || !user.isAdmin) {
        res.status(404).json({ error: 'Not found' });
        return null;
    }
    return user;
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
    if (!(await requireAdminForPrivateAction(req, res))) {
        return;
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

async function handleAdminUsers(req: ApiHandlerRequest, res: ApiHandlerResponse) {
    if (!(await requireAdminForPrivateAction(req, res))) {
        return;
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) {
        return res.status(500).json({ error: 'Database URL not found' });
    }

    try {
        const sql = neon(databaseUrl);
        const rows = await sql<AdminUserRow[]>`
            SELECT
                u.id,
                u.username,
                u.created_at,
                activity.last_login_at,
                activity.active_session_count,
                sets.quiz_set_count,
                cards.memorization_card_count
            FROM users u
            LEFT JOIN LATERAL (
                SELECT
                    MAX(s.created_at) AS last_login_at,
                    COALESCE(COUNT(s.id) FILTER (WHERE s.expires_at > NOW()), 0)::int AS active_session_count
                FROM sessions s
                WHERE s.user_id = u.id
            ) AS activity ON TRUE
            LEFT JOIN LATERAL (
                SELECT COALESCE(COUNT(*), 0)::int AS quiz_set_count
                FROM quiz_sets qs
                WHERE qs.user_id = u.id
                  AND COALESCE(qs.is_deleted, FALSE) = FALSE
                  AND COALESCE(qs.type, 'quiz') = 'quiz'
            ) AS sets ON TRUE
            LEFT JOIN LATERAL (
                SELECT COALESCE(COUNT(*), 0)::int AS memorization_card_count
                FROM questions q
                INNER JOIN quiz_sets qs ON qs.id = q.quiz_set_id
                WHERE qs.user_id = u.id
                  AND COALESCE(qs.is_deleted, FALSE) = FALSE
                  AND COALESCE(qs.type, 'quiz') = 'memorization'
            ) AS cards ON TRUE
            ORDER BY u.id ASC
        `;

        return res.status(200).json({
            users: rows.map(row => ({
                id: toNumber(row.id),
                username: row.username,
                createdAt: toIsoDateString(row.created_at),
                lastLoginAt: row.last_login_at ? toIsoDateString(row.last_login_at) : null,
                activeSessionCount: toNumber(row.active_session_count),
                quizSetCount: toNumber(row.quiz_set_count),
                memorizationCardCount: toNumber(row.memorization_card_count),
                isAdmin: isAdminIdentity(toNumber(row.id), row.username),
            })),
        });
    } catch (err: unknown) {
        console.error('session adminUsers error:', err);
        return res.status(500).json({ error: 'ユーザー一覧の取得に失敗しました' });
    }
}

async function handleAdminResetPassword(req: ApiHandlerRequest<SessionRequestBody>, res: ApiHandlerResponse) {
    if (!(await requireAdminForPrivateAction(req, res))) {
        return;
    }

    const targetUserId = parsePositiveInt(req.body?.targetUserId);
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!targetUserId) {
        return res.status(400).json({ error: '対象ユーザーIDが不正です' });
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
        return res.status(400).json({ error: '新しいパスワードは6〜128文字で入力してください' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) {
        return res.status(500).json({ error: 'Database URL not found' });
    }

    try {
        const sql = neon(databaseUrl);
        const targetUsers = await sql`SELECT id FROM users WHERE id = ${targetUserId} LIMIT 1`;
        if (targetUsers.length === 0) {
            return res.status(404).json({ error: '対象ユーザーが見つかりません' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${targetUserId}`;
        await sql`DELETE FROM sessions WHERE user_id = ${targetUserId}`;
        return res.status(200).json({ success: true });
    } catch (err: unknown) {
        console.error('session adminResetPassword error:', err);
        return res.status(500).json({ error: 'パスワードリセットに失敗しました' });
    }
}

async function handleAdminDeleteUser(req: ApiHandlerRequest<SessionRequestBody>, res: ApiHandlerResponse) {
    const user = await requireAdminForPrivateAction(req, res);
    if (!user) {
        return;
    }

    const targetUserId = parsePositiveInt(req.body?.targetUserId);
    if (!targetUserId) {
        return res.status(400).json({ error: '対象ユーザーIDが不正です' });
    }
    if (targetUserId === user.id) {
        return res.status(400).json({ error: '自分自身は削除できません' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) {
        return res.status(500).json({ error: 'Database URL not found' });
    }

    try {
        const sql = neon(databaseUrl);
        await sql`
            CREATE TABLE IF NOT EXISTS suspended_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                quiz_set_id INTEGER REFERENCES quiz_sets(id) ON DELETE CASCADE,
                session_data JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `;
        const targetUsers = await sql`SELECT id FROM users WHERE id = ${targetUserId} LIMIT 1`;
        if (targetUsers.length === 0) {
            return res.status(404).json({ error: '対象ユーザーが見つかりません' });
        }

        await sql`DELETE FROM sessions WHERE user_id = ${targetUserId}`;
        await sql`DELETE FROM suspended_sessions WHERE user_id = ${targetUserId}`;
        await sql`DELETE FROM review_logs WHERE user_id = ${targetUserId}`;
        await sql`DELETE FROM review_schedules WHERE user_id = ${targetUserId}`;
        await sql`DELETE FROM histories WHERE user_id = ${targetUserId}`;
        await sql`DELETE FROM quiz_sets WHERE user_id = ${targetUserId}`;
        await sql`DELETE FROM users WHERE id = ${targetUserId}`;

        return res.status(200).json({ success: true });
    } catch (err: unknown) {
        console.error('session adminDeleteUser error:', err);
        return res.status(500).json({ error: 'ユーザー削除に失敗しました' });
    }
}

export default async function handler(req: ApiHandlerRequest<SessionRequestBody>, res: ApiHandlerResponse) {
    res.setHeader('Cache-Control', 'no-store');

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

    if (action === 'adminUsers') {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return handleAdminUsers(req, res);
    }

    if (action === 'adminResetPassword') {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return handleAdminResetPassword(req, res);
    }

    if (action === 'adminDeleteUser') {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return handleAdminDeleteUser(req, res);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
}
