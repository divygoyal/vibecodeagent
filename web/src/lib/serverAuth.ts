/**
 * Server-only: the signed-in user and their OAuth tokens.
 *
 * session.user (lib/authSession.ts publicSessionUser) carries no tokens, because
 * /api/auth/session and useSession() hand it to browser JavaScript. Server code
 * that calls Google or GitHub for the user reads the tokens here instead: from
 * the encrypted session JWT cookie first, then from the admin DB.
 *
 * Never return anything from this module in a response, and never pass it to a
 * client component.
 */
import { getToken, type JWT } from 'next-auth/jwt';
import { cookies, headers } from 'next/headers';
import { serverAuthUser, type ServerAuthUser } from '@/lib/authSession';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';

export type { ServerAuthUser };

type RequestLike = Request | { headers: Headers; cookies?: unknown };

function parseCookieHeader(header: string | null): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of (header || '').split(';')) {
        const i = part.indexOf('=');
        if (i <= 0) continue;
        out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
}

/**
 * The decoded session JWT. With `req`, from that request's cookies; without it,
 * from the current request (next/headers), which only works inside a request.
 */
export async function getAuthJwt(req?: RequestLike | null): Promise<JWT | null> {
    try {
        if (req) {
            const c = (req as { cookies?: { getAll?: unknown } }).cookies;
            // NextRequest has cookies.getAll(); a plain Request only has the header.
            const source = c && typeof c.getAll === 'function'
                ? req
                : { headers: req.headers, cookies: parseCookieHeader(req.headers.get('cookie')) };
            return await getToken({ req: source as never });
        }
        const [c, h] = await Promise.all([cookies(), headers()]);
        return await getToken({
            req: { headers: Object.fromEntries(h), cookies: Object.fromEntries(c.getAll().map((x) => [x.name, x.value])) } as never,
        });
    } catch {
        return null;
    }
}

/** The signed-in user with their tokens, or null when signed out. Server-only. */
export async function getServerAuthUser(req?: RequestLike | null): Promise<ServerAuthUser | null> {
    const jwt = await getAuthJwt(req);
    if (!jwt) return null;
    const user = serverAuthUser(jwt);
    return user.id ? user : null;
}

/** `{ user }` in the shape lib/adminUserSync.ts ensureAdminUserSynced() takes. Server-only. */
export async function getServerAuthSession(req?: RequestLike | null): Promise<{ user: ServerAuthUser } | null> {
    const user = await getServerAuthUser(req);
    return user ? { user } : null;
}

export interface GoogleCredentials {
    accessToken?: string;
    refreshToken?: string;
}

/**
 * Google OAuth credentials for `userId`: the request's session JWT first (only
 * when it belongs to that user), then the tokens stored in the admin DB (users
 * who signed in with GitHub, background jobs). Without `req` only the DB is read.
 */
export async function getGoogleCredentialsForRequest(req: RequestLike | null | undefined, userId: string): Promise<GoogleCredentials> {
    let accessToken: string | undefined;
    let refreshToken: string | undefined;
    if (req) {
        const user = await getServerAuthUser(req);
        if (user && user.id === String(userId)) {
            accessToken = user.googleAccessToken;
            refreshToken = user.googleRefreshToken;
        }
    }
    // No refresh token in the JWT (a sign-in that kept the stored one while the admin DB was
    // unreachable, or an older session): the admin DB's stored token fills the gap.
    if (!refreshToken && userId) {
        const db = await fetchGoogleTokensFromDb(String(userId)).catch(() => null);
        accessToken = accessToken || db?.accessToken || undefined;
        refreshToken = db?.refreshToken || undefined;
    }
    return { accessToken, refreshToken };
}

export type GoogleAccess =
    | { ok: true; token: string }
    | { ok: false; reason: 'not_connected' | 'refresh_failed' };

/**
 * A valid Google access token for `userId` (getGoogleCredentialsForRequest, then
 * lib/googleApi getValidAccessToken, which refreshes and caches it).
 */
export async function getGoogleAccessTokenForRequest(req: RequestLike | null | undefined, userId: string): Promise<GoogleAccess> {
    const { accessToken, refreshToken } = await getGoogleCredentialsForRequest(req, userId);
    if (!accessToken && !refreshToken) return { ok: false, reason: 'not_connected' };
    try {
        return { ok: true, token: await getValidAccessToken(accessToken, refreshToken) };
    } catch {
        return { ok: false, reason: 'refresh_failed' };
    }
}
