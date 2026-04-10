import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { randomBytes } from 'crypto';
import { authOptions, ensureAdminUserSynced } from '@/lib/adminUserSync';
import { ensureUmamiWebsiteProvisioned } from '@/lib/umamiClient';
import {
    normalizeShareConfig,
    OVERVIEW_SHARE_CONFIG,
    type ShareConfig,
    type ShareData,
    type NormalizedShareConfig,
} from '@/lib/shareTypes';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

/* ─── In-memory fallback store (used when ADMIN_API_KEY is not set, i.e. dev mode) ─── */
const inMemoryShares = new Map<string, ShareData>();

function cleanupStaleShares() {
    if (inMemoryShares.size > 1000) {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        for (const [key, share] of inMemoryShares) {
            if (new Date(share.createdAt).getTime() < cutoff) {
                inMemoryShares.delete(key);
            }
        }
    }
}

function normalizeShareData(raw: {
    token: string;
    userId: string;
    propertyId: string;
    siteUrl: string;
    config?: ShareConfig | null;
    views: number;
    createdAt: string;
}): ShareData {
    return {
        ...raw,
        config: normalizeShareConfig(raw.config),
    };
}

function getCreateConfig(config?: ShareConfig | null) {
    return {
        ...OVERVIEW_SHARE_CONFIG,
        ...config,
        layoutMode: config?.layoutMode ?? 'openpanel_overview',
        shareProvider: config?.shareProvider ?? config?.layoutMode ?? 'openpanel_overview',
    };
}

async function hydrateCreatedShareConfig(input: {
    token: string;
    propertyId: string;
    siteUrl?: string;
    config: ShareConfig | NormalizedShareConfig;
}) {
    const normalized = normalizeShareConfig(input.config);
    if (normalized.layoutMode !== 'umami_fork') {
        return normalized;
    }

    try {
        const provisioning = await ensureUmamiWebsiteProvisioned({
            token: input.token,
            propertyId: input.propertyId,
            siteUrl: input.siteUrl,
            existingWebsiteId: normalized.umamiWebsiteId,
            existingShareId: normalized.umamiShareId,
        });

        return normalizeShareConfig({
            ...normalized,
            layoutMode: 'umami_fork',
            shareProvider: 'umami_fork',
            umamiWebsiteId: provisioning.websiteId ?? normalized.umamiWebsiteId,
            umamiShareId: provisioning.shareId ?? normalized.umamiShareId,
            umamiShareUrl: provisioning.shareUrl ?? normalized.umamiShareUrl,
            umamiEnabledAt: provisioning.enabledAt ?? normalized.umamiEnabledAt,
            siteName: provisioning.siteName ?? normalized.siteName,
        });
    } catch (error) {
        console.error('Umami share provisioning failed:', error);
        return normalized;
    }
}

async function updateAdminShareConfig(input: {
    token: string;
    userId: string;
    siteUrl?: string;
    config: NormalizedShareConfig;
}) {
    if (!ADMIN_API_KEY) {
        return;
    }

    const response = await fetch(`${ADMIN_API_URL}/api/shared-dashboards/${input.token}`, {
        method: 'PATCH',
        headers: {
            'X-API-Key': ADMIN_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            user_identifier: input.userId,
            site_url: input.siteUrl || '',
            config: input.config,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed to update share config (${response.status}): ${errorText}`);
    }
}

/**
 * GET /api/share — List the current user's active shares
 * Authenticated endpoint.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        // Production: use admin DB
        if (ADMIN_API_KEY) {
            const sync = await ensureAdminUserSynced(session);
            if (!sync.synced && !sync.skipped) {
                console.warn('Admin user sync before share list failed:', sync.reason);
            }

            const res = await fetch(`${ADMIN_API_URL}/api/shared-dashboards?user_identifier=${userId}`, {
                headers: { 'X-API-Key': ADMIN_API_KEY },
            });
            if (!res.ok) {
                console.error('Admin API list shares error:', res.status, await res.text());
                return NextResponse.json({ shares: [] });
            }
            const shares = await res.json();
            const normalizedShares = (Array.isArray(shares) ? shares : shares.shares || []).map(normalizeShareData);
            return NextResponse.json({ shares: normalizedShares });
        }

        // Dev fallback: in-memory store
        const userShares: ShareData[] = [];
        for (const share of inMemoryShares.values()) {
            if (share.userId === userId) userShares.push(share);
        }
        userShares.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return NextResponse.json({ shares: userShares.map(normalizeShareData) });
    } catch (err) {
        console.error('List shares error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/share — Create a new share link
 * Body: { propertyId, siteUrl, config }
 * Authenticated endpoint.
 */
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { propertyId, siteUrl, config } = body;

        if (!propertyId || typeof propertyId !== 'string') {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
        }

        const createConfig = getCreateConfig(config);

        const userId = session.user.id;

        // Production: use admin DB
        if (ADMIN_API_KEY) {
            const sync = await ensureAdminUserSynced(session);
            if (!sync.synced) {
                console.error('Admin user sync before share create failed:', sync.reason);
            }

            const res = await fetch(`${ADMIN_API_URL}/api/shared-dashboards`, {
                method: 'POST',
                headers: { 'X-API-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_identifier: userId,
                    property_id: propertyId,
                    site_url: siteUrl || '',
                    config: createConfig,
                }),
            });
            if (!res.ok) {
                const errText = await res.text();
                console.error('Admin API create share error:', res.status, errText);
                const message = res.status === 404
                    ? 'Local user is not synced with the admin backend yet. Reload the dashboard and try again.'
                    : 'Failed to create share';
                return NextResponse.json({ error: message }, { status: res.status });
            }
            const share = await res.json();
            const hydratedConfig = await hydrateCreatedShareConfig({
                token: share.token,
                propertyId,
                siteUrl,
                config: share.config || createConfig,
            });

            try {
                await updateAdminShareConfig({
                    token: share.token,
                    userId,
                    siteUrl,
                    config: hydratedConfig,
                });
            } catch (error) {
                console.error('Admin API patch share config error:', error);
            }

            return NextResponse.json({
                share: normalizeShareData({
                    ...share,
                    config: hydratedConfig,
                }),
            });
        }

        // Dev fallback: in-memory store
        const token = randomBytes(16).toString('hex');
        let userShareCount = 0;
        for (const share of inMemoryShares.values()) {
            if (share.userId === userId) userShareCount++;
        }
        if (userShareCount >= 10) {
            return NextResponse.json({ error: 'Maximum 10 active shares. Revoke one first.' }, { status: 400 });
        }

        const hydratedConfig = await hydrateCreatedShareConfig({
            token,
            propertyId,
            siteUrl,
            config: createConfig,
        });

        const shareData: ShareData = {
            token,
            userId,
            propertyId: propertyId || '',
            siteUrl: siteUrl || '',
            config: hydratedConfig,
            views: 0,
            createdAt: new Date().toISOString(),
        };
        inMemoryShares.set(token, shareData);
        cleanupStaleShares();
        return NextResponse.json({ share: shareData });
    } catch (err) {
        console.error('Create share error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/share — Revoke share(s)
 * Query params: ?token=xxx (single) or ?all=true (all user shares)
 * Authenticated endpoint.
 */
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const token = searchParams.get('token');
        const revokeAll = searchParams.get('all') === 'true';
        const userId = session.user.id;

        // Production: use admin DB
        if (ADMIN_API_KEY) {
            const sync = await ensureAdminUserSynced(session);
            if (!sync.synced && !sync.skipped) {
                console.warn('Admin user sync before share revoke failed:', sync.reason);
            }

            if (revokeAll) {
                const res = await fetch(`${ADMIN_API_URL}/api/shared-dashboards/user/${userId}`, {
                    method: 'DELETE',
                    headers: { 'X-API-Key': ADMIN_API_KEY },
                });
                const data = await res.json();
                return NextResponse.json(data);
            }

            if (!token) {
                return NextResponse.json({ error: 'token or all=true required' }, { status: 400 });
            }

            const res = await fetch(`${ADMIN_API_URL}/api/shared-dashboards/${token}?user_identifier=${userId}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': ADMIN_API_KEY },
            });
            const data = await res.json();
            return NextResponse.json(data);
        }

        // Dev fallback: in-memory store
        if (revokeAll) {
            let count = 0;
            for (const [key, share] of inMemoryShares) {
                if (share.userId === userId) {
                    inMemoryShares.delete(key);
                    count++;
                }
            }
            return NextResponse.json({ revoked: count });
        }

        if (!token) {
            return NextResponse.json({ error: 'token or all=true required' }, { status: 400 });
        }

        const share = inMemoryShares.get(token);
        if (!share) {
            return NextResponse.json({ error: 'Share not found' }, { status: 404 });
        }
        if (share.userId !== userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        inMemoryShares.delete(token);
        return NextResponse.json({ revoked: 1 });
    } catch (err) {
        console.error('Revoke share error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/* ─── Public endpoint: get share data + increment views ─── */
/**
 * This is exported for the public share page to import directly.
 * Not an HTTP handler — used via direct function call from the server component.
 * In production, calls the admin API. In dev, uses the in-memory store.
 */
export async function getShareData(
    token: string,
    options?: { incrementView?: boolean }
): Promise<ShareData | null> {
    const incrementView = options?.incrementView ?? true;

    // Production: use admin DB
    if (ADMIN_API_KEY) {
        try {
            const path = incrementView
                ? `${ADMIN_API_URL}/api/shared-dashboards/${token}/view`
                : `${ADMIN_API_URL}/api/shared-dashboards/${token}`;
            const res = await fetch(path);
            if (!res.ok) return null;
            return normalizeShareData(await res.json());
        } catch {
            return null;
        }
    }

    // Dev fallback: in-memory store
    const share = inMemoryShares.get(token);
    if (!share) return null;
    if (incrementView) {
        share.views++;
    }
    return normalizeShareData({ ...share });
}
