import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import { fetchShareOverviewTopGenericSeries } from '@/lib/shareOverviewData';
import {
    buildShareOverviewCacheKey,
    getShareOverviewContext,
    parseOverviewRequest,
    SHARE_OVERVIEW_CACHE_TTL,
} from '@/lib/shareOverviewServer';

export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    context: { params: Promise<unknown> }
) {
    const { token } = (await context.params) as { token: string };
    const shareContext = await getShareOverviewContext(token);
    if (shareContext.error || !shareContext.share || !shareContext.accessToken) {
        return shareContext.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const request = parseOverviewRequest(req);
    if (!request.column) {
        return NextResponse.json({ error: 'column parameter required' }, { status: 400 });
    }

    const cacheKey = buildShareOverviewCacheKey('topGenericSeries', token, shareContext.share.propertyId, [
        request.column,
        request.range,
        request.interval,
        request.startDate || '',
        request.endDate || '',
        request.filters,
        request.events,
    ]);
    const data = await cachedFetch(cacheKey, SHARE_OVERVIEW_CACHE_TTL.topGenericSeries, () => fetchShareOverviewTopGenericSeries({
        accessToken: shareContext.accessToken!,
        propertyId: shareContext.share!.propertyId,
        range: request.range,
        interval: (request.interval as 'hour' | 'day' | 'week' | 'month') || 'day',
        startDate: request.startDate,
        endDate: request.endDate,
        column: request.column!,
        filters: request.filters,
        events: request.events,
    }));

    return NextResponse.json(data);
}
