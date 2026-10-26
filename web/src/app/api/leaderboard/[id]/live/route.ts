import { NextResponse } from 'next/server';
import { getLiveNow, resolveEntryId } from '@/lib/leaderboard/live';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leaderboard/[id]/live: GA4 realtime active users for a listed site, only
 * if the owner opted in. Cached 60 s on the server and at the edge.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const entryId = await resolveEntryId(id);
    if (!entryId) return NextResponse.json({ enabled: false, active_users: null, updated_at: null }, { status: 404 });
    const live = await getLiveNow(entryId);
    return NextResponse.json(live, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });
}
