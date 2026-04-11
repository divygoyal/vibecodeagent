import { authOptions } from '@/lib/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const ADMIN_USER_SYNC_TIMEOUT_MS = 8000;

export type AdminSyncSession = {
    user?: {
        id?: string;
        email?: string | null;
        accessToken?: string;
        provider?: string;
        refreshToken?: string;
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
};

function buildAdminUserSyncPayload(session: AdminSyncSession): AdminUserSyncPayload | null {
    const userId = session?.user?.id;
    const provider = session?.user?.provider;

    if (!userId || !provider) {
        return null;
    }

    const payload: AdminUserSyncPayload = {
        provider,
        provider_id: String(userId),
        access_token: session.user?.accessToken,
        refresh_token: session.user?.refreshToken,
        email: session.user?.email || undefined,
        plan: 'free',
    };

    if (provider === 'github') {
        payload.github_id = String(userId);
    }

    return payload;
}

export async function ensureAdminUserSynced(session: AdminSyncSession) {
    if (!ADMIN_API_KEY) {
        return {
            synced: false,
            skipped: true,
            reason: 'missing-admin-api-key',
        } as const;
    }

    const payload = buildAdminUserSyncPayload(session);
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
