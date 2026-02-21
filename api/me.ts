import { getAuthenticatedUserId } from './_auth.js';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });

    try {
        const sql = neon(databaseUrl);
        const rows = await sql`SELECT id, username, created_at FROM users WHERE id = ${userId}`;
        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
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
