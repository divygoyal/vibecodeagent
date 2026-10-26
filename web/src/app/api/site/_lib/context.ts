/**
 * Shared request context for the /api/site/* routes (the per-site pages:
 * Overview, Traffic, Search, Pages, Actions).
 *
 * Every route here is read-only against Google (analytics.readonly,
 * webmasters.readonly) and goes through the in-memory cache in lib/apiCache,
 * keyed by (user, asset, report, range), so tabs that show the same data share
 * one Google request.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';

import { authOptions } from '@/lib/auth';
import { cachedFetch } from '@/lib/apiCache';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';

type GoogleJwt = { googleAccessToken?: string; googleRefreshToken?: string };

export interface SiteContext {
    userId: string;
    token: string;
}

const CONTEXT_TTL_MS = 15_000;

export function jsonError(message: string, status: number, code?: string) {
    return NextResponse.json(code ? { error: message, code } : { error: message }, { status });
}

/** Session -> user id + a valid Google access token. Cached briefly per cookie. */
export async function getSiteContext(req: Request): Promise<SiteContext | NextResponse> {
    const cookie = req.headers.get('cookie') || '';
    if (!cookie) return jsonError('Unauthorized', 401);
    const result = await cachedFetch<{ userId?: string; token?: string; error?: string; status?: number; code?: string }>(
        `site-ctx:${cookie}`,
        CONTEXT_TTL_MS,
        async () => {
            const [session, jwt] = await Promise.all([
                getServerSession(authOptions),
                getToken({ req: req as unknown as Parameters<typeof getToken>[0]['req'] }) as Promise<GoogleJwt | null>,
            ]);
            const userId = (session?.user as { id?: string } | undefined)?.id;
            if (!userId) return { error: 'Unauthorized', status: 401 };
            let access = jwt?.googleAccessToken;
            let refresh = jwt?.googleRefreshToken;
            if (!access && !refresh) {
                const db = await fetchGoogleTokensFromDb(userId);
                if (db) {
                    access = db.accessToken;
                    refresh = db.refreshToken;
                }
            }
            if (!access && !refresh) return { error: 'Google not connected', status: 400, code: 'GOOGLE_NOT_CONNECTED' };
            try {
                const token = await getValidAccessToken(access, refresh);
                return { userId, token };
            } catch {
                return { error: 'Google sign-in expired. Sign in again to refresh it.', status: 401, code: 'GOOGLE_AUTH' };
            }
        },
    );
    if (!result.userId || !result.token) {
        return jsonError(result.error || 'Unauthorized', result.status || 401, result.code);
    }
    return { userId: result.userId, token: result.token };
}

/** Logged-in user id only (no Google token): for the admin-backed routes. */
export async function getSessionUserId(): Promise<string | null> {
    const session = await getServerSession(authOptions);
    return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export const PRIVATE_CACHE = { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' };
export const NO_STORE = { 'Cache-Control': 'no-store' };

/** Turn a thrown Google error into a short user-facing message + status. */
export function googleErrorResponse(e: unknown, what: string) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /Google API error (\d{3})/.exec(msg);
    const status = m ? Number(m[1]) : 0;
    if (status === 403) return jsonError(`Google says this account can't read this ${what}. Check your access in Google.`, 403, 'NO_ACCESS');
    if (status === 429) return jsonError('Google rate limit reached. Try again in a minute.', 429, 'RATE_LIMIT');
    if (status === 401) return jsonError('Google sign-in expired. Sign in again to refresh it.', 401, 'GOOGLE_AUTH');
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) return jsonError(`Google took too long to answer for this ${what}. Try again.`, 504, 'TIMEOUT');
    console.error(`[api/site] ${what} error:`, msg.slice(0, 300));
    return jsonError(`Couldn't load ${what} data from Google.`, 502, 'GOOGLE_ERROR');
}
