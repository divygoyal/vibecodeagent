import { authOptions } from '@/lib/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const ADMIN_USER_SYNC_TIMEOUT_MS = 8000;

export type AdminSyncSession = {
    user?: {
        id?: string;
        email?: string | null;
        accessToken?: string;
        provider?: string;             // PRIMARY provider (display identity)
        refreshToken?: string;
        // Per-provider data kept in the JWT so we can sync EITHER provider's tokens
        // without flipping the primary identity.
        githubAccessToken?: string;
        googleAccessToken?: string;
        githubAccountId?: string;
        googleAccountId?: string;
        githubLogin?: string;
        googleRefreshToken?: string;
    };
} | null;

type AdminUserSyncPayload = {
    provider: string;
    provider_id: string;
    access_token?: string;
    refresh_token?: string;
    email?: string;
    plan: 'free';
    github_id?: string;
    github_username?: string;
};

/**
 * Build the upsert payload for a SPECIFIC target provider.
 * If targetProvider is omitted, falls back to the primary provider (legacy first-sign-in path).
 *
 * Critical: never lets the secondary provider's identity overwrite the primary's display identity.
 * Admin's get_user_by_identifier() resolves the row by github_id OR google account id OR email,
 * so passing email lets it find the existing primary user.
 */
function buildAdminUserSyncPayload(
    session: AdminSyncSession,
    targetProvider?: 'github' | 'google',
): AdminUserSyncPayload | null {
    const u = session?.user;
    if (!u) return null;

    const provider = targetProvider || u.provider;
    if (!provider) return null;

    const email = u.email || undefined;

    if (provider === 'github') {
        const providerId = u.githubAccountId || (u.provider === 'github' ? u.id : undefined);
        const accessToken = u.githubAccessToken || (u.provider === 'github' ? u.accessToken : undefined);
        if (!providerId || !accessToken) return null;
        return {
            provider: 'github',
            provider_id: String(providerId),
            access_token: accessToken,
            email,
            plan: 'free',
            github_id: String(providerId),
            github_username: u.githubLogin || undefined,
        };
    }

    if (provider === 'google') {
        const providerId = u.googleAccountId || (u.provider === 'google' ? u.id : undefined);
        const accessToken = u.googleAccessToken || (u.provider === 'google' ? u.accessToken : undefined);
        const refreshToken = u.googleRefreshToken || (u.provider === 'google' ? u.refreshToken : undefined);
        if (!providerId || !accessToken) return null;
        return {
            provider: 'google',
            provider_id: String(providerId),
            access_token: accessToken,
            refresh_token: refreshToken,
            email,
            plan: 'free',
        };
    }

    return null;
}

export async function ensureAdminUserSynced(
    session: AdminSyncSession,
    targetProvider?: 'github' | 'google',
) {
    if (!ADMIN_API_KEY) {
        return {
            synced: false,
            skipped: true,
            reason: 'missing-admin-api-key',
        } as const;
    }

    const payload = buildAdminUserSyncPayload(session, targetProvider);
    if (!payload) {
        return {
            synced: false,
            skipped: true,
            reason: 'missing-session-data',
        } as const;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ADMIN_USER_SYNC_TIMEOUT_MS);

    try {
        const response = await fetch(`${ADMIN_API_URL}/api/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                synced: false,
                skipped: false,
                status: response.status,
                reason: data.detail || data.error || 'Admin user sync failed',
            } as const;
        }

        return {
            synced: true,
            skipped: false,
            data,
        } as const;
    } catch (error) {
        const reason =
            error instanceof Error && error.name === 'AbortError'
                ? 'Admin provider sync timed out'
                : error instanceof Error
                    ? error.message
                    : 'Admin user sync failed';

        return {
            synced: false,
            skipped: false,
            reason,
        } as const;
    } finally {
        clearTimeout(timeout);
    }
}

export { authOptions };
