import { parse, serialize } from 'cookie';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { password } = req.body || {};
    const secretToken = process.env.API_SECRET_TOKEN;

    // Compare the provided password with the Vercel Enivronment Variable
    if (!secretToken || password !== secretToken) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    // Set HttpOnly, Secure cookie
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
    };

    const setCookieHeader = serialize('auth_session', secretToken, cookieOptions);

    res.setHeader('Set-Cookie', setCookieHeader);
    return res.status(200).json({ success: true, message: 'Logged in successfully' });
}
