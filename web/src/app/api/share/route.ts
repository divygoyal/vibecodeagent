import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { randomBytes } from 'crypto';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/* ─── Types ─── */
interface ShareConfig {
    traffic: boolean;
    sources: boolean;
    pages: boolean;
    geo: boolean;
    seo: boolean;
}

interface ShareData {
    token: string;
    userId: string;
    propertyId: string;
    siteUrl: string;
    config: ShareConfig;
    views: number;
    createdAt: string;
}

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
            const res = await fetch(`${ADMIN_API_URL}/api/shared-dashboards?user_identifier=${userId}`, {
                headers: { 'X-API-Key': ADMIN_API_KEY },
            });
            if (!res.ok) {
                console.error('Admin API list shares error:', res.status, await res.text());
                return NextResponse.json({ shares: [] });
            }
            const shares = await res.json();
            return NextResponse.json({ shares: Array.isArray(shares) ? shares : shares.shares || [] });
        }

        // Dev fallback: in-memory store
        const userShares: ShareData[] = [];
        for (const share of inMemoryShares.values()) {
            if (share.userId === userId) userShares.push(share);
        }
        userShares.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return NextResponse.json({ shares: userShares });
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

        const userId = session.user.id;

        // Production: use admin DB
        if (ADMIN_API_KEY) {
            const res = await fetch(`${ADMIN_API_URL}/api/shared-dashboards`, {
                method: 'POST',
                headers: { 'X-API-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_identifier: userId,
                    property_id: propertyId,
                    site_url: siteUrl || '',
                    config: config || { traffic: true, sources: true, pages: true, geo: true, seo: false },
                }),
            });
            if (!res.ok) {
                const errText = await res.text();
                console.error('Admin API create share error:', res.status, errText);
                return NextResponse.json({ error: 'Failed to create share' }, { status: res.status });
            }
            const share = await res.json();
            return NextResponse.json({ share });
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

        const shareData: ShareData = {
            token,
            userId,
            propertyId: propertyId || '',
            siteUrl: siteUrl || '',
            config: {
                traffic: config?.traffic ?? true,
                sources: config?.sources ?? true,
                pages: config?.pages ?? true,
                geo: config?.geo ?? true,
                seo: config?.seo ?? false,
            },
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
export async function getShareData(token: string): Promise<ShareData | null> {
    // Production: use admin DB
    if (ADMIN_API_KEY) {
        try {
            const res = await fetch(`${ADMIN_API_URL}/api/shared-dashboards/${token}/view`);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    // Dev fallback: in-memory store
    const share = inMemoryShares.get(token);
    if (!share) return null;
    share.views++;
    return { ...share };
}
