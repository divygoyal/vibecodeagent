import { NextResponse } from 'next/server';
import { sessionUserId } from '@/lib/builder/server/access';
import { directoryFor, jsonError } from '@/lib/builder/server/service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/sites: the user's sites for source pickers (the shared inventory and
 * pairing). The owner sees their own asset ids so the editor can pin them.
 */
export async function GET() {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const dir = await directoryFor(userId);
    if (!dir) return NextResponse.json({ connected: false, sites: [] });
    return NextResponse.json({
        connected: true,
        sites: dir.sites.map((s) => ({ siteId: s.siteId, label: s.label, ga4: s.ga4 ?? null, gsc: s.gsc ?? null, ga4Name: s.ga4Name ?? null })),
        errors: dir.errors,
    }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
