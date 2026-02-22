import { serialize } from 'cookie';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });

    try {
        const sql = neon(databaseUrl);

        const users = await sql`SELECT * FROM users WHERE username = ${username}`;

        if (users.length === 0) {
            return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
        }

        const user = users[0];

        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
        }

        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await sql`
            INSERT INTO sessions (user_id, token, expires_at) 
            VALUES (${user.id}, ${token}, ${expiresAt.toISOString()})
        `;

        // Set cookie
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict' as const,
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
        };

        res.setHeader('Set-Cookie', serialize('auth_session', token, cookieOptions));
        return res.status(200).json({
            success: true,
            user: { id: user.id, username: user.username }
        });
    } catch (err: any) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'ログイン処理中にエラーが発生しました' });
    }
}
