import { serialize } from 'cookie';
import { neon } from '@neondatabase/serverless';
import { getSessionToken } from './_auth.js';
import type { ApiHandlerRequest, ApiHandlerResponse } from './_http.js';

type SessionAction = 'me' | 'logout';

function resolveAction(req: ApiHandlerRequest): SessionAction | undefined {
    const rawAction = req.query.action;
    const action = Array.isArray(rawAction) ? rawAction[0] : rawAction;
    if (action === 'me' || action === 'logout') {
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

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
}
