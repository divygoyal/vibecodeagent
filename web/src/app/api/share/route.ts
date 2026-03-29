import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { randomBytes } from 'crypto';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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

/* ─── In-memory store (replace with DB in production) ─── */
const shares = new Map<string, ShareData>();

// Lazy cleanup: cap store size
function cleanupStaleShares() {
    if (shares.size > 1000) {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
        for (const [key, share] of shares) {
            if (new Date(share.createdAt).getTime() < cutoff) {
                shares.delete(key);
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
        const userShares: ShareData[] = [];
        for (const share of shares.values()) {
            if (share.userId === userId) {
                userShares.push(share);
            }
        }

        // Sort by most recent first
        userShares.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return NextResponse.json({ shares: userShares });
    } catch (err) {
        console.error('List shares error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/share — Create a new share link
 * Body: { token, propertyId, siteUrl, config }
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

        // Generate token server-side (cryptographically secure)
        const token = randomBytes(16).toString('hex');

        // Limit shares per user to 10
        const userId = session.user.id;
        let userShareCount = 0;
        for (const share of shares.values()) {
            if (share.userId === userId) userShareCount++;
        }
        if (userShareCount >= 10) {
            return NextResponse.json(
                { error: 'Maximum 10 active shares. Revoke one first.' },
                { status: 400 }
            );
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

        shares.set(token, shareData);
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

        if (revokeAll) {
            let count = 0;
            for (const [key, share] of shares) {
                if (share.userId === userId) {
                    shares.delete(key);
                    count++;
                }
            }
            return NextResponse.json({ revoked: count });
        }

        if (!token) {
            return NextResponse.json({ error: 'token or all=true required' }, { status: 400 });
        }

        const share = shares.get(token);
        if (!share) {
            return NextResponse.json({ error: 'Share not found' }, { status: 404 });
        }
        if (share.userId !== userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        shares.delete(token);
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
 */
export function getShareData(token: string): ShareData | null {
    const share = shares.get(token);
    if (!share) return null;
    share.views++;
    return { ...share };
}
