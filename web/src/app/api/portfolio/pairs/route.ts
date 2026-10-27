import { NextResponse } from 'next/server';
import { AdminStoreError, adminStore } from '@/lib/portfolio/adminStore';
import { sessionIdentifier } from '@/lib/portfolio/auth';
import { storedPairs } from '@/lib/sites/pairingStore';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolio/pairs -> { pairs: { "properties/123": "sc-domain:acme.com" | null } }
 * The GA4 -> Search Console pairing as the portfolio stored it (stream-URI
 * host match plus the user's manual overrides), for every GA4 property the
 * portfolio has seen. The app's site directory (switcher, setup, site pages)
 * uses it so it pairs exactly like the portfolio and the MCP tools. Empty
 * before the first portfolio sync.
 */
export async function GET() {
    const identifier = await sessionIdentifier();
    if (!identifier) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const pairs = storedPairs(await adminStore.getAssets(identifier));
        return NextResponse.json({ pairs }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (err) {
        if (err instanceof AdminStoreError && err.status === 404) return NextResponse.json({ pairs: {} });
        console.error('[portfolio] pairs failed:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Could not load the site pairing' }, { status: 502 });
    }
}
