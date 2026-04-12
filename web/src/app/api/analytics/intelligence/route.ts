import { NextResponse } from 'next/server';
import { cachedFetch, CACHE_TTL } from '@/lib/apiCache';
import { getAnalyticsOverviewContext } from '@/lib/analyticsOverviewServer';
import { fetchAnalyticsIntelligenceData } from '@/lib/analyticsIntelligenceServer';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const context = await getAnalyticsOverviewContext(req);
    if (context.error || !context.userId || !context.propertyId || !context.accessToken) {
        return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const range = new URL(req.url).searchParams.get('range') || '30d';
    const cacheKey = `ga:intelligence:${context.userId}:${context.propertyId}:${range}`;
    const data = await cachedFetch(cacheKey, CACHE_TTL.DASHBOARD_DATA, () => fetchAnalyticsIntelligenceData(
        context.accessToken!,
        context.propertyId!,
        range,
    ));

    return NextResponse.json(data);
}
