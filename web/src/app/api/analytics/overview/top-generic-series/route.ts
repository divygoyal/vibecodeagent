import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import {
    buildAnalyticsOverviewCacheKey,
    getAnalyticsOverviewContext,
    parseOverviewRequest,
    SHARE_OVERVIEW_CACHE_TTL,
} from '@/lib/analyticsOverviewServer';
import { getDemoOverviewTopGenericSeries } from '@/lib/demoWorkspaceData';
import { fetchShareOverviewTopGenericSeries } from '@/lib/shareOverviewData';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const context = await getAnalyticsOverviewContext(req);
    const request = parseOverviewRequest(req);
    if (!request.column) {
        return NextResponse.json({ error: 'column parameter required' }, { status: 400 });
    }
    if (context.isDemoWorkspace) {
        return NextResponse.json(
            getDemoOverviewTopGenericSeries(request.column, (request.interval as 'hour' | 'day' | 'week' | 'month') || 'day'),
            { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' } },
        );
    }
    if (context.error || !context.userId || !context.propertyId || !context.accessToken) {
        return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const cacheKey = buildAnalyticsOverviewCacheKey('topGenericSeries', context.userId, context.propertyId, [
        request.column,
        request.range,
        request.interval,
        request.startDate || '',
        request.endDate || '',
        request.filters,
        request.events,
    ]);
    const data = await cachedFetch(cacheKey, SHARE_OVERVIEW_CACHE_TTL.topGenericSeries, () => fetchShareOverviewTopGenericSeries({
        accessToken: context.accessToken!,
        propertyId: context.propertyId!,
        range: request.range,
        interval: (request.interval as 'hour' | 'day' | 'week' | 'month') || 'day',
        startDate: request.startDate,
        endDate: request.endDate,
        column: request.column!,
        filters: request.filters,
        events: request.events,
    }));

    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' } });
}
