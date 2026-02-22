import { getSessionToken } from './_auth.js';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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
    } catch (err: any) {
        console.error('Me error:', err);
        return res.status(500).json({ error: 'ユーザー情報の取得に失敗しました' });
    }
}
