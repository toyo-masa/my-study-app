import { parse, serialize } from 'cookie';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });

    try {
        const cookies = parse(req.headers.cookie || '');
        const sessionToken = cookies['auth_session'];

        if (sessionToken) {
            const sql = neon(databaseUrl);
            await sql`DELETE FROM sessions WHERE token = ${sessionToken}`;
        }

        // Clear cookie
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict' as const,
            path: '/',
            maxAge: 0, // Expire immediately
        };

        res.setHeader('Set-Cookie', serialize('auth_session', '', cookieOptions));
        return res.status(200).json({ success: true });
    } catch (err: any) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'ログアウト処理中にエラーが発生しました' });
    }
}
