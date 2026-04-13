import { NextResponse } from 'next/server';
import { cachedFetch, CACHE_TTL } from '@/lib/apiCache';
import { getAnalyticsOverviewContext } from '@/lib/analyticsOverviewServer';
import { buildFunnelSuggestions, fetchFunnelDefinitionAnalytics } from '@/lib/analyticsSubpageServer';
import type { FunnelDefinition } from '@/lib/analyticsDefinitions';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const context = await getAnalyticsOverviewContext(req);
    if (context.error || !context.userId || !context.propertyId || !context.accessToken) {
        return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const searchParams = new URL(req.url).searchParams;
    const range = searchParams.get('range') || '30d';
    const stepValues = (searchParams.get('steps') || '')
        .split(',')
        .map((step) => step.trim())
        .filter(Boolean);
    let steps = stepValues;
    const name = searchParams.get('name') || '';
    const description = searchParams.get('description') || '';

    if (steps.length < 2) {
        const suggestions = await buildFunnelSuggestions(context.accessToken, context.propertyId, range);
        const suggestion = suggestions[0];
        if (!suggestion) {
            return NextResponse.json({ error: 'No funnel suggestions available for this property' }, { status: 404 });
        }

        steps = suggestion.steps;
    }

    const definition: FunnelDefinition = {
        id: 'preview-funnel',
        propertyId: context.propertyId,
        name: name || 'Funnel preview',
        description,
        steps,
        isActive: true,
    };

    const cacheKey = `ga:analytics-funnel:${context.userId}:${context.propertyId}:${range}:${steps.join('>')}`;
    const data = await cachedFetch(
        cacheKey,
        CACHE_TTL.DASHBOARD_DATA,
        () => fetchFunnelDefinitionAnalytics(context.accessToken!, context.propertyId!, definition, range),
    );

    return NextResponse.json(data);
}
