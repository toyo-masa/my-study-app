import { parse } from 'cookie';
import { neon } from '@neondatabase/serverless';

/**
 * Extracts the session token from the request's cookie without calling the database.
 * Returns the token string if present, or null.
 */
export function getSessionToken(req: any): string | null {
    const cookies = parse(req.headers.cookie || '');
    return cookies['auth_session'] || null;
}

/**
 * Extracts the authenticated user ID from the request's session cookie.
 * Returns the user_id if valid, or null if not authenticated.
 */
export async function getAuthenticatedUserId(req: any): Promise<number | null> {
    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return null;

    const sessionToken = getSessionToken(req);
    if (!sessionToken) return null;

    try {
        const sql = neon(databaseUrl);
        const rows = await sql`
            SELECT user_id FROM sessions 
            WHERE token = ${sessionToken} 
              AND expires_at > NOW()
            LIMIT 1
        `;
        if (rows.length === 0) return null;
        return rows[0].user_id as number;
    } catch (err) {
        console.error('Auth check failed:', err);
        return null;
    }
}
