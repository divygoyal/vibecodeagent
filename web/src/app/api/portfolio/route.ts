import { NextRequest, NextResponse } from 'next/server';
import { sessionIdentifier } from '@/lib/portfolio/auth';
import { buildDemoPortfolio } from '@/lib/portfolio/demo';
import { parseRange } from '@/lib/portfolio/ranges';
import { loadPortfolio } from '@/lib/portfolio/service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolio?range=7d|28d|3m|12m
 * Every site of the signed-in user from the snapshot store: totals vs the
 * previous period, daily (weekly for 12m) series, pairing, sync status,
 * flags, grand totals, the combined series and alerts. Starts a background
 * sync when the data is older than 6 hours; poll while `syncing` is true.
 *
 * ?demo=1 returns the public demo portfolio (no sign-in).
 */
export async function GET(req: NextRequest) {
    const range = parseRange(req.nextUrl.searchParams.get('range'));
    if (req.nextUrl.searchParams.get('demo') === '1') {
        return NextResponse.json(buildDemoPortfolio({ range }), {
            headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
        });
    }
    const identifier = await sessionIdentifier();
    if (!identifier) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const data = await loadPortfolio(identifier, range, req);
        return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (err) {
        console.error('[portfolio] load failed:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Could not load your portfolio. Try again in a moment.' }, { status: 502 });
    }
}
