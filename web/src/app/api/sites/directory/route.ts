import { NextRequest, NextResponse } from 'next/server';

import { googleAccessFor, sessionIdentifier } from '@/lib/portfolio/auth';
import { loadLiveDirectory, loadStoreDirectory } from '@/lib/sites/directoryServer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sites/directory[?source=store]
 * The user's Search Console sites, GA4 properties and stored GA4 -> Search Console pairing in one answer
 * (see lib/sites/directoryServer.ts). The app builds its site directory (switcher, /dashboard/s/[host])
 * from it. `source=store` answers from the portfolio store alone, without waiting for Google.
 * `refresh=1` skips the cached Google lists (the setup page's "Check again").
 */
export async function GET(req: NextRequest) {
    const identifier = await sessionIdentifier();
    if (!identifier) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const store = req.nextUrl.searchParams.get('source') === 'store';
        const data = store ? await loadStoreDirectory(identifier) : await loadLiveDirectory(identifier, () => googleAccessFor(identifier, req), { refresh: req.nextUrl.searchParams.get('refresh') === '1' });
        return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (err) {
        console.error('[sites-directory] failed:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Could not load your sites. Try again in a moment.' }, { status: 502 });
    }
}
