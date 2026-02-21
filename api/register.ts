import { serialize } from 'cookie';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, password } = req.body || {};

    // Validation
    if (!username || !password) {
        return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
    }
    if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ error: 'ユーザー名は3〜50文字で入力してください' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'パスワードは6文字以上で入力してください' });
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return res.status(500).json({ error: 'Database URL not found' });

    try {
        const sql = neon(databaseUrl);

        // Check if username already exists
        const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
        if (existing.length > 0) {
            return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const result = await sql`
            INSERT INTO users (username, password_hash) 
            VALUES (${username}, ${passwordHash}) 
            RETURNING id
        `;
        const userId = result[0].id;

        // Auto-login: create session
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await sql`
            INSERT INTO sessions (user_id, token, expires_at) 
            VALUES (${userId}, ${token}, ${expiresAt.toISOString()})
        `;

        // Set cookie
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict' as const,
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
        };

        res.setHeader('Set-Cookie', serialize('auth_session', token, cookieOptions));
        return res.status(201).json({
            success: true,
            user: { id: userId, username }
        });
    } catch (err: any) {
        console.error('Register error:', err);
        return res.status(500).json({ error: '登録処理中にエラーが発生しました' });
    }
}
