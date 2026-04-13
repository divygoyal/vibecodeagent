import { NextResponse } from 'next/server';
import { cachedFetch, CACHE_TTL } from '@/lib/apiCache';
import { getAnalyticsOverviewContext } from '@/lib/analyticsOverviewServer';
import { buildGoalSuggestions, fetchGoalDefinitionAnalytics } from '@/lib/analyticsSubpageServer';
import type { GoalDefinition, GoalDefinitionType } from '@/lib/analyticsDefinitions';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const context = await getAnalyticsOverviewContext(req);
    if (context.error || !context.userId || !context.propertyId || !context.accessToken) {
        return context.error || NextResponse.json({ error: 'Analytics data is temporarily unavailable' }, { status: 503 });
    }

    const searchParams = new URL(req.url).searchParams;
    const range = searchParams.get('range') || '30d';
    let type = searchParams.get('type') as GoalDefinitionType | null;
    let target = searchParams.get('target');
    const name = searchParams.get('name') || '';
    const description = searchParams.get('description') || '';

    if (!type || !target) {
        const suggestions = await buildGoalSuggestions(context.accessToken, context.propertyId, range);
        const suggestion = suggestions[0];
        if (!suggestion) {
            return NextResponse.json({ error: 'No goal suggestions available for this property' }, { status: 404 });
        }

        type = suggestion.type;
        target = suggestion.target;
    }

    const definition: GoalDefinition = {
        id: 'preview-goal',
        propertyId: context.propertyId,
        name: name || target,
        description,
        type,
        target,
        isActive: true,
    };

    const cacheKey = `ga:analytics-goal:${context.userId}:${context.propertyId}:${range}:${definition.type}:${definition.target}`;
    const data = await cachedFetch(
        cacheKey,
        CACHE_TTL.DASHBOARD_DATA,
        () => fetchGoalDefinitionAnalytics(context.accessToken!, context.propertyId!, definition, range),
    );

    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=30' } });
}
