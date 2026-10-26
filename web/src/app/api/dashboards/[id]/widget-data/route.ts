import { NextResponse } from 'next/server';
import { sessionUserId } from '@/lib/builder/server/access';
import { jsonError, ownerDeps } from '@/lib/builder/server/service';
import { getDashboard, StoreError } from '@/lib/builder/server/store';
import { v1WidgetData } from '@/lib/builder/server/v1compat';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/[id]/widget-data?range=30d (v1, deprecated): kept for one release as a thin
 * adapter over the v2 engine. It used to fire 15 GA4 reports and 6 GSC queries for any
 * dashboard and ignored the range for Search Console; now it asks only for what the widgets need.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    try {
        const row = await getDashboard(userId, id);
        if (!row) return jsonError(404, 'Dashboard not found');
        const range = new URL(req.url).searchParams.get('range') ?? '30d';
        return NextResponse.json(await v1WidgetData(row, range, ownerDeps(userId, 'owner')));
    } catch (err) {
        console.error('[dashboards] v1 widget-data failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Internal server error');
    }
}
