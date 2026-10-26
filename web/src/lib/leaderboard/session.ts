import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { fetchGoogleTokensFromDb } from '@/lib/googleApi';

export interface LeaderboardUser {
    /** OAuth provider id string (what the admin API calls `user_identifier`). */
    userId: string;
    name: string | null;
    email: string | null;
    accessToken: string | undefined;
    refreshToken: string | undefined;
}

/** The signed-in user plus their Google tokens, or null. */
export async function getLeaderboardUser(): Promise<LeaderboardUser | null> {
    const session = await getServerSession(authOptions);
    const user = session?.user as
        | { id?: string | number; name?: string | null; email?: string | null; googleAccessToken?: string; refreshToken?: string }
        | undefined;
    if (!user?.id) return null;
    const userId = String(user.id);
    let accessToken = user.googleAccessToken;
    let refreshToken = user.refreshToken;
    if (!accessToken && !refreshToken) {
        const stored = await fetchGoogleTokensFromDb(userId);
        accessToken = stored?.accessToken;
        refreshToken = stored?.refreshToken;
    }
    return { userId, name: user.name ?? null, email: user.email ?? null, accessToken, refreshToken };
}
