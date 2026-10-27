import { NextResponse } from 'next/server';

import { ga4DimensionFilter, parseFilterParams } from '@/components/site/lib/filters';
import { isInterval } from '@/components/site/lib/intervals';
import { getSiteContext, googleErrorResponse, jsonError, NO_STORE, PRIVATE_CACHE } from '../_lib/context';
import {
    ga4Breakdown, ga4Heatmap, ga4OrganicSeries, ga4PageDetail, ga4PageTrends, ga4RealtimeSnapshot, ga4Retention, ga4Summary, isBreakdown,
} from '../_lib/ga4Reports';
import { parseProperty, parseRange } from '../_lib/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/site/ga4?property=properties/123&report=summary|<breakdown>|page|realtime|retention|heatmap|pageTrends|organic
 *   &start=YYYY-MM-DD&end=YYYY-MM-DD[&cmpStart=&cmpEnd=][&mode=daily|weekly|monthly]
 *   [&f=<key>:<value> ...]  click-to-filter (components/site/lib/filters.ts): summary, breakdowns, heatmap, pageTrends
 *   [&interval=day|week|month]  summary buckets
 *   [&limit=1-30]  pageTrends rows
 *
 * One small cached GA4 report per call (summary = 3), so each tab and card
 * fetches only what it shows. Read-only.
 */
export async function GET(req: Request) {
    const sp = new URL(req.url).searchParams;
    const property = parseProperty(sp.get('property'));
    if (!property) return jsonError('A GA4 property is required.', 400);
    const report = sp.get('report') ?? 'summary';
    const ctx = await getSiteContext(req, { kind: 'ga4', id: property });
    if (ctx instanceof NextResponse) return ctx;

    try {
        if (report === 'realtime') {
            return NextResponse.json(await ga4RealtimeSnapshot(ctx.userId, ctx.token, property), { headers: NO_STORE });
        }
        if (report === 'retention') {
            const m = sp.get('mode');
            const mode = m === 'weekly' || m === 'monthly' ? m : 'daily';
            return NextResponse.json(await ga4Retention(ctx.userId, ctx.token, property, mode), { headers: PRIVATE_CACHE });
        }
        const range = parseRange(sp);
        const filter = ga4DimensionFilter(parseFilterParams(sp.getAll('f')));
        if (report === 'summary') {
            const iv = sp.get('interval');
            return NextResponse.json(await ga4Summary(ctx.userId, ctx.token, property, range, { filter, interval: isInterval(iv) ? iv : 'day' }), { headers: PRIVATE_CACHE });
        }
        if (report === 'heatmap') {
            return NextResponse.json(await ga4Heatmap(ctx.userId, ctx.token, property, range, filter), { headers: PRIVATE_CACHE });
        }
        if (report === 'pageTrends') {
            const limit = Number(sp.get('limit')) || 10;
            return NextResponse.json(await ga4PageTrends(ctx.userId, ctx.token, property, range, filter, limit), { headers: PRIVATE_CACHE });
        }
        if (report === 'organic') {
            return NextResponse.json(await ga4OrganicSeries(ctx.userId, ctx.token, property, range), { headers: PRIVATE_CACHE });
        }
        if (report === 'page') {
            const path = sp.get('path') ?? '';
            const host = sp.get('host');
            if (!path.startsWith('/') || path.length > 1000) return jsonError('A page path is required.', 400);
            const okHost = host && /^[a-z0-9.-]{1,253}$/i.test(host) ? host : null;
            return NextResponse.json(await ga4PageDetail(ctx.userId, ctx.token, property, path, okHost, range), { headers: PRIVATE_CACHE });
        }
        if (isBreakdown(report)) {
            return NextResponse.json(await ga4Breakdown(ctx.userId, ctx.token, property, report, range, filter), { headers: PRIVATE_CACHE });
        }
        return jsonError('Unknown report.', 400);
    } catch (e) {
        return googleErrorResponse(e, 'Analytics');
    }
}
