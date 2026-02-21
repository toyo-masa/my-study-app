import { parse } from 'cookie';

export function isAuthorized(req: any): boolean {
    const secretToken = process.env.API_SECRET_TOKEN;
    if (!secretToken) return true; // If no secret is set, it's open (dev mode scenario)

    // Parse cookies from the request headers
    const cookies = parse(req.headers.cookie || '');
    const sessionToken = cookies['auth_session'];

    // Validate the token
    return sessionToken === secretToken;
}
