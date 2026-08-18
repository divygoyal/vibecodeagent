import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import {
    buildAnalyticsOverviewCacheKey,
    getAnalyticsOverviewContext,
    parseOverviewRequest,
    SHARE_OVERVIEW_CACHE_TTL,
} from '@/lib/analyticsOverviewServer';
import { getDemoOverviewLive } from '@/lib/demoWorkspaceData';
import { fetchShareOverviewLiveVisitors } from '@/lib/shareOverviewData';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const request = parseOverviewRequest(req);
    const context = await getAnalyticsOverviewContext(req);
    if (context.isDemoWorkspace) {
        return NextResponse.json({ activeUsers: getDemoOverviewLive().activeUsers }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
    }
    if (context.error || !context.userId || !context.propertyId || !context.accessToken) {
        return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const cacheKey = buildAnalyticsOverviewCacheKey('liveVisitors', context.userId, context.propertyId, [
        request.filters,
        request.events,
    ]);
    const data = await cachedFetch(cacheKey, SHARE_OVERVIEW_CACHE_TTL.liveVisitors, () => fetchShareOverviewLiveVisitors({
        accessToken: context.accessToken!,
        propertyId: context.propertyId!,
        filters: request.filters,
        events: request.events,
    }));

    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
