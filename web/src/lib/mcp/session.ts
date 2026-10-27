import { getServerAuthSession } from '@/lib/serverAuth';

export interface SessionUser {
    /** Primary provider sub: the identifier the admin service resolves. */
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    provider: string | null;
    googleAccessToken: string | null;
    googleRefreshToken: string | null;
}

/**
 * The signed-in user with their Google tokens. Server-only: the tokens come from
 * the session JWT (lib/serverAuth.ts), not the browser session. `session` is the
 * server auth session for lib/adminUserSync ensureAdminUserSynced(); never
 * return it or the user from a route.
 */
export async function getSessionUser(): Promise<{ user: SessionUser; session: Awaited<ReturnType<typeof getServerAuthSession>> } | null> {
    const session = await getServerAuthSession();
    const u = session?.user;
    if (!u || !u.id) return null;
    return {
        session,
        user: {
            id: u.id,
            name: u.name ?? null,
            email: u.email ?? null,
            image: u.image ?? null,
            provider: u.provider ?? null,
            googleAccessToken: u.googleAccessToken || null,
            googleRefreshToken: u.googleRefreshToken || null,
        },
    };
}
