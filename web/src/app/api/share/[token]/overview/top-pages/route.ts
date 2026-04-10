import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import { fetchShareOverviewTopPages } from '@/lib/shareOverviewData';
import {
    buildShareOverviewCacheKey,
    getShareOverviewContext,
    parseOverviewRequest,
    SHARE_OVERVIEW_CACHE_TTL,
} from '@/lib/shareOverviewServer';

export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const context = await getShareOverviewContext(token);
    if (context.error || !context.share || !context.accessToken) {
        return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const request = parseOverviewRequest(req);
    const mode = request.mode || 'page';
    const limit = request.limit ? parseInt(request.limit, 10) : undefined;
    const cacheKey = buildShareOverviewCacheKey('topPages', token, context.share.propertyId, [
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
        propertyId: context.share!.propertyId,
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
