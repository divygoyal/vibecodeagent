import { getServerAuthUser, getGoogleCredentialsForRequest } from '@/lib/serverAuth';

export interface LeaderboardUser {
    /** OAuth provider id string (what the admin API calls `user_identifier`). */
    userId: string;
    name: string | null;
    email: string | null;
    accessToken: string | undefined;
    refreshToken: string | undefined;
}

/**
 * The signed-in user plus their Google tokens, or null. Server-only: the tokens
 * come from the session JWT (lib/serverAuth.ts), then the admin DB.
 */
export async function getLeaderboardUser(req?: Request): Promise<LeaderboardUser | null> {
    const user = await getServerAuthUser(req);
    if (!user) return null;
    const userId = user.id;
    let accessToken = user.googleAccessToken;
    let refreshToken = user.googleRefreshToken;
    if (!accessToken && !refreshToken) {
        const stored = await getGoogleCredentialsForRequest(null, userId);
        accessToken = stored.accessToken;
        refreshToken = stored.refreshToken;
    }
    return { userId, name: user.name ?? null, email: user.email ?? null, accessToken, refreshToken };
}
