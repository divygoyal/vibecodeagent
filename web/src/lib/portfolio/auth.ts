/**
 * Server-only: who is asking, and a Google access token for them.
 * Same order as the other Google routes: JWT tokens first, then the tokens
 * stored in the admin DB (users who signed in with GitHub).
 */
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';
import { ensureAdminUserSynced, type AdminSyncSession } from '@/lib/adminUserSync';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';

export async function sessionIdentifier(): Promise<string | null> {
    const session = await getServerSession(authOptions);
    const id = (session?.user as { id?: string } | undefined)?.id;
    return id ? String(id) : null;
}

export type GoogleAccess =
    | { ok: true; token: string }
    | { ok: false; reason: 'not_connected' | 'refresh_failed' };

export async function googleAccessFor(identifier: string, req?: NextRequest | Request): Promise<GoogleAccess> {
    let access: string | undefined;
    let refresh: string | undefined;
    if (req) {
        try {
            const jwt = (await getToken({ req: req as never })) as { googleAccessToken?: string; googleRefreshToken?: string } | null;
            access = jwt?.googleAccessToken || undefined;
            refresh = jwt?.googleRefreshToken || undefined;
        } catch {
            /* fall through to the DB */
        }
    }
    if (!access && !refresh) {
        const stored = await fetchGoogleTokensFromDb(identifier);
        access = stored?.accessToken || undefined;
        refresh = stored?.refreshToken || undefined;
    }
    if (!access && !refresh) return { ok: false, reason: 'not_connected' };
    try {
        return { ok: true, token: await getValidAccessToken(access, refresh) };
    } catch {
        return { ok: false, reason: 'refresh_failed' };
    }
}

/**
 * A callback that registers the signed-in user with the admin (the same upsert
 * as /api/auth/register-provider). The session and JWT are read now, inside the
 * request, so the callback also works from a background sync.
 */
export async function sessionUserRegistrar(req?: NextRequest | Request): Promise<() => Promise<boolean>> {
    const session = (await getServerSession(authOptions)) as AdminSyncSession;
    let googleRefreshToken: string | undefined;
    if (req) {
        try {
            const jwt = (await getToken({ req: req as never })) as { googleRefreshToken?: string } | null;
            googleRefreshToken = jwt?.googleRefreshToken || undefined;
        } catch {
            /* the session copy is enough */
        }
    }
    return async () => {
        if (!session?.user) return false;
        const res = await ensureAdminUserSynced(session, undefined, { googleRefreshToken });
        if (!res.synced) console.warn('[portfolio] could not register the user before the first sync:', res.reason);
        return res.synced;
    };
}
