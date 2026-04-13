import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import {
    buildAnalyticsOverviewCacheKey,
    getAnalyticsOverviewContext,
    parseOverviewRequest,
    SHARE_OVERVIEW_CACHE_TTL,
} from '@/lib/analyticsOverviewServer';
import { fetchShareOverviewTopGeneric } from '@/lib/shareOverviewData';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const context = await getAnalyticsOverviewContext(req);
    if (context.error || !context.userId || !context.propertyId || !context.accessToken) {
        return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const request = parseOverviewRequest(req);
    if (!request.column) {
        return NextResponse.json({ error: 'column parameter required' }, { status: 400 });
    }

    const limit = request.limit ? parseInt(request.limit, 10) : undefined;
    const cacheKey = buildAnalyticsOverviewCacheKey('topGeneric', context.userId, context.propertyId, [
        request.column,
        request.range,
        request.startDate || '',
        request.endDate || '',
        request.filters,
        request.events,
        limit || '',
    ]);
    const data = await cachedFetch(cacheKey, SHARE_OVERVIEW_CACHE_TTL.topGeneric, () => fetchShareOverviewTopGeneric({
        accessToken: context.accessToken!,
        propertyId: context.propertyId!,
        range: request.range,
        startDate: request.startDate,
        endDate: request.endDate,
        column: request.column!,
        filters: request.filters,
        events: request.events,
        limit,
    }));

    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' } });
}
