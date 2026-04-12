import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import {
    buildAnalyticsOverviewCacheKey,
    getAnalyticsOverviewContext,
    parseOverviewRequest,
    SHARE_OVERVIEW_CACHE_TTL,
} from '@/lib/analyticsOverviewServer';
import { fetchShareOverviewTopPages } from '@/lib/shareOverviewData';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const context = await getAnalyticsOverviewContext(req);
    if (context.error || !context.userId || !context.propertyId || !context.accessToken) {
        return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const request = parseOverviewRequest(req);
    const mode = request.mode || 'page';
    const limit = request.limit ? parseInt(request.limit, 10) : undefined;
    const cacheKey = buildAnalyticsOverviewCacheKey('topPages', context.userId, context.propertyId, [
        mode,
        request.range,
        request.startDate || '',
        request.endDate || '',
        request.filters,
        request.events,
        limit || '',
    ]);

    const data = await cachedFetch(cacheKey, SHARE_OVERVIEW_CACHE_TTL.topPages, () => fetchShareOverviewTopPages({
        accessToken: context.accessToken!,
        propertyId: context.propertyId!,
        range: request.range,
        startDate: request.startDate,
        endDate: request.endDate,
        mode,
        filters: request.filters,
        events: request.events,
        limit,
    }));

    return NextResponse.json(data);
}
