import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import { fetchShareOverviewLiveVisitors } from '@/lib/shareOverviewData';
import {
    buildShareOverviewCacheKey,
    getShareOverviewContext,
    parseOverviewRequest,
    SHARE_OVERVIEW_CACHE_TTL,
    shareOverviewRoute,
} from '@/lib/shareOverviewServer';

export const dynamic = 'force-dynamic';

async function handleGet(
    req: Request,
    context: { params: Promise<unknown> }
) {
    const { token } = (await context.params) as { token: string };
    const request = parseOverviewRequest(req);
    const shareContext = await getShareOverviewContext(token);
    if (shareContext.error || !shareContext.share || !shareContext.accessToken) {
        return shareContext.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const cacheKey = buildShareOverviewCacheKey('liveVisitors', token, shareContext.share.propertyId, [
        request.filters,
        request.events,
    ]);
    const data = await cachedFetch(cacheKey, SHARE_OVERVIEW_CACHE_TTL.liveVisitors, () => fetchShareOverviewLiveVisitors({
        accessToken: shareContext.accessToken!,
        propertyId: shareContext.share!.propertyId,
        filters: request.filters,
        events: request.events,
    }));

    return NextResponse.json(data);
}

export const GET = shareOverviewRoute(handleGet);
