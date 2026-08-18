import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import { fetchShareOverviewJourney } from '@/lib/shareOverviewData';
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
    const steps = parseInt(request.steps || '5', 10) || 5;
    const cacheKey = buildShareOverviewCacheKey('journey', token, context.share.propertyId, [
        request.range,
        steps,
        request.filters,
        request.events,
    ]);
    const data = await cachedFetch(cacheKey, SHARE_OVERVIEW_CACHE_TTL.journey, () => fetchShareOverviewJourney({
        accessToken: context.accessToken!,
        propertyId: context.share!.propertyId,
        range: request.range,
        steps,
        filters: request.filters,
        events: request.events,
    }));

    return NextResponse.json(data);
}
