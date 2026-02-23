import { parse } from 'cookie';
import { neon } from '@neondatabase/serverless';
import type { ApiHandlerRequest } from './_http.js';

export interface AuthenticatedUser {
    id: number;
    username: string;
    isAdmin: boolean;
}

function parseAdminUserIdSet(): Set<number> {
    const raw = process.env.ADMIN_USER_IDS || '';
    return new Set(
        raw
            .split(',')
            .map(value => Number.parseInt(value.trim(), 10))
            .filter(value => Number.isInteger(value) && value > 0)
    );
}

function parseAdminUsernameSet(): Set<string> {
    const raw = process.env.ADMIN_USERNAMES || '';
    return new Set(
        raw
            .split(',')
            .map(value => value.trim().toLowerCase())
            .filter(Boolean)
    );
}

export function isAdminIdentity(userId: number, username: string): boolean {
    if (parseAdminUserIdSet().has(userId)) {
        return true;
    }
    return parseAdminUsernameSet().has(username.trim().toLowerCase());
}

/**
 * Extracts the session token from the request's cookie without calling the database.
 * Returns the token string if present, or null.
 */
export function getSessionToken(req: ApiHandlerRequest): string | null {
    const rawCookieHeader = req.headers.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader) ? (rawCookieHeader[0] || '') : (rawCookieHeader || '');
    const cookies = parse(cookieHeader);
    return cookies['auth_session'] || null;
}

/**
 * Extracts the authenticated user from the request's session cookie.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedUser(req: ApiHandlerRequest): Promise<AuthenticatedUser | null> {
    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!databaseUrl) return null;

    const sessionToken = getSessionToken(req);
    if (!sessionToken) return null;

    try {
        const sql = neon(databaseUrl);
        const rows = await sql`
            SELECT u.id, u.username
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ${sessionToken}
              AND s.expires_at > NOW()
            LIMIT 1
        `;
        if (rows.length === 0) return null;

        const userId = rows[0].id as number;
        const username = rows[0].username as string;
        return {
            id: userId,
            username,
            isAdmin: isAdminIdentity(userId, username),
        };
    } catch (err) {
        console.error('Auth check failed:', err);
        return null;
    }
}

/**
 * Extracts the authenticated user ID from the request's session cookie.
 * Returns the user_id if valid, or null if not authenticated.
 */
export async function getAuthenticatedUserId(req: ApiHandlerRequest): Promise<number | null> {
    const user = await getAuthenticatedUser(req);
    return user ? user.id : null;
}
