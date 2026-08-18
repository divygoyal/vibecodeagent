import { NextResponse } from 'next/server';
import { cachedFetch } from '@/lib/apiCache';
import { fetchShareUmamiDashboard } from '@/lib/shareUmamiData';
import { getShareOverviewContextWithOptions, parseOverviewRequest } from '@/lib/shareOverviewServer';

export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        const context = await getShareOverviewContextWithOptions(token, { requireGoogle: false });
        if (context.error || !context.share) {
            return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
        }

        const request = parseOverviewRequest(req);
        const cacheKey = `share-umami:dashboard:${token}:${context.share.propertyId}:${request.range}:${request.startDate || ''}:${request.endDate || ''}:${JSON.stringify(request.filters)}:${context.share.config.umamiWebsiteId || ''}:${context.share.config.umamiEnabledAt || ''}`;

        const data = await cachedFetch(cacheKey, 60_000, () => fetchShareUmamiDashboard({
            accessToken: context.accessToken,
            propertyId: context.share!.propertyId,
            config: context.share!.config,
            range: request.range,
            startDate: request.startDate,
            endDate: request.endDate,
            filters: request.filters,
        }));

        return NextResponse.json(data);
    } catch (error) {
        console.error('Shared Umami dashboard route error:', error);
        return NextResponse.json(
            {
                error: 'Failed to load shared analytics',
                detail: error instanceof Error ? error.message : 'Unknown server error',
            },
            { status: 500 },
        );
    }
}
