import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import {
    buildAnalyticsOverviewCacheKey,
    getAnalyticsOverviewContext,
    parseOverviewRequest,
    SHARE_OVERVIEW_CACHE_TTL,
} from '@/lib/analyticsOverviewServer';
import { fetchShareOverviewStats } from '@/lib/shareOverviewData';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const context = await getAnalyticsOverviewContext(req);
    if (context.error || !context.userId || !context.propertyId || !context.accessToken) {
        return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const request = parseOverviewRequest(req);
    const cacheKey = buildAnalyticsOverviewCacheKey('stats', context.userId, context.propertyId, [
        request.range,
        request.interval,
        request.startDate || '',
        request.endDate || '',
        request.filters,
        request.events,
    ]);

    const data = await cachedFetch(cacheKey, SHARE_OVERVIEW_CACHE_TTL.stats, () => fetchShareOverviewStats({
        accessToken: context.accessToken!,
        propertyId: context.propertyId!,
        range: request.range,
        interval: (request.interval as 'hour' | 'day' | 'week' | 'month') || 'day',
        startDate: request.startDate,
        endDate: request.endDate,
        filters: request.filters,
        events: request.events,
    }));

    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' } });
}
