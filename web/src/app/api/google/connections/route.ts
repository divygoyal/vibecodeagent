import { NextResponse, type NextRequest } from 'next/server';

import { demoDataAllowed } from '@/lib/demo/gate';
import { PRIMARY_CONNECTION } from '@/lib/googleAccounts';
import { getServerAuthUser, getUserGoogleInventory } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const adminUrl = () => (process.env.ADMIN_API_URL || 'http://admin-api:8000').replace(/\/+$/, '');

export interface GoogleConnectionView {
    /** 'primary' or the linked account's Google sub (used by Disconnect / Reconnect). */
    id: string;
    primary: boolean;
    email: string | null;
    name: string | null;
    status: 'connected' | 'needs_reconnect';
    /** GA4 properties and Search Console sites read through this account (each asset counted once). */
    ga4: number;
    gsc: number;
    /** Newest portfolio sync of an asset of this account (unix seconds), or null. */
    lastSyncedAt: number | null;
}

interface AdminConnection {
    connection_id: string;
    primary: boolean;
    email: string | null;
    name: string | null;
    status: string;
    ga4_count: number;
    gsc_count: number;
    last_synced_at: number | null;
}

/**
 * GET /api/google/connections: the signed-in user's Google connections for Settings -> Google.
 * Metadata only (never a token). Counts come from the live inventory (lib/googleAccounts.ts), or
 * from the portfolio store when Google could not be asked.
 */
export async function GET(req: NextRequest) {
    const user = await getServerAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let stored: AdminConnection[] = [];
    let maxLinked = 10;
    try {
        const res = await fetch(`${adminUrl()}/api/users/${encodeURIComponent(user.id)}/google/connections`, {
            headers: { 'X-API-Key': process.env.ADMIN_API_KEY || '' },
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
            const data = await res.json() as { connections?: AdminConnection[]; max_linked?: number };
            stored = data.connections ?? [];
            maxLinked = data.max_linked ?? maxLinked;
        }
    } catch { /* admin busy: the primary row below still shows */ }

    const inv = await getUserGoogleInventory(req, user.id).catch(() => null);
    const live = new Map((inv?.connections ?? []).map((c) => [c.connectionId, c]));

    const views: GoogleConnectionView[] = [];
    const primaryStored = stored.find((c) => c.primary);
    const primaryLive = live.get(PRIMARY_CONNECTION);
    const hasPrimary = Boolean(primaryStored) || user.hasGoogle || (primaryLive && primaryLive.state !== 'not_connected');
    if (hasPrimary) {
        views.push({
            id: PRIMARY_CONNECTION,
            primary: true,
            email: primaryStored?.email ?? (user.provider === 'google' ? user.email ?? null : null),
            name: primaryStored?.name ?? (user.provider === 'google' ? user.name ?? null : null),
            status: primaryLive?.state === 'needs_reconnect' ? 'needs_reconnect' : 'connected',
            ga4: primaryLive && primaryLive.state === 'ok' ? primaryLive.ownProperties : primaryStored?.ga4_count ?? 0,
            gsc: primaryLive && primaryLive.state === 'ok' ? primaryLive.ownSites : primaryStored?.gsc_count ?? 0,
            lastSyncedAt: primaryStored?.last_synced_at ?? null,
        });
    }
    for (const c of stored.filter((x) => !x.primary)) {
        const l = live.get(c.connection_id);
        const needs = c.status === 'needs_reconnect' || l?.state === 'needs_reconnect' || l?.state === 'not_connected';
        views.push({
            id: c.connection_id,
            primary: false,
            email: c.email,
            name: c.name,
            status: needs ? 'needs_reconnect' : 'connected',
            ga4: l && l.state === 'ok' ? l.ownProperties : c.ga4_count,
            gsc: l && l.state === 'ok' ? l.ownSites : c.gsc_count,
            lastSyncedAt: c.last_synced_at,
        });
    }
    return NextResponse.json(
        { connections: views, maxLinked, demo: demoDataAllowed() },
        { headers: { 'Cache-Control': 'private, no-store' } },
    );
}
