/**
 * Server-only: who is asking, and a Google access token for them.
 * Same order as the other Google routes (lib/serverAuth.ts): JWT tokens first,
 * then the tokens stored in the admin DB (users who signed in with GitHub).
 */
import { getServerSession } from 'next-auth/next';
import type { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';
import { ensureAdminUserSynced } from '@/lib/adminUserSync';
import { getGoogleAccessTokenForRequest, getServerAuthSession, type GoogleAccess } from '@/lib/serverAuth';

export type { GoogleAccess };

export async function sessionIdentifier(): Promise<string | null> {
    const session = await getServerSession(authOptions);
    const id = (session?.user as { id?: string } | undefined)?.id;
    return id ? String(id) : null;
}

/** Without `req` (background syncs) only the admin DB tokens are used. */
export async function googleAccessFor(identifier: string, req?: NextRequest | Request): Promise<GoogleAccess> {
    return getGoogleAccessTokenForRequest(req, identifier);
}

/**
 * A callback that registers the signed-in user with the admin (the same upsert
 * as /api/auth/register-provider). The session and JWT are read now, inside the
 * request, so the callback also works from a background sync.
 */
export async function sessionUserRegistrar(req?: NextRequest | Request): Promise<() => Promise<boolean>> {
    const session = await getServerAuthSession(req);
    return async () => {
        if (!session?.user) return false;
        const res = await ensureAdminUserSynced(session);
        if (!res.synced) console.warn('[portfolio] could not register the user before the first sync:', res.reason);
        return res.synced;
    };
}
