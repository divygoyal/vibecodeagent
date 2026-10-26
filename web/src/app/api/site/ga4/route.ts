import { NextResponse } from 'next/server';

import { getSiteContext, googleErrorResponse, jsonError, NO_STORE, PRIVATE_CACHE } from '../_lib/context';
import { ga4Breakdown, ga4RealtimeSnapshot, ga4Retention, ga4Summary, isBreakdown } from '../_lib/ga4Reports';
import { parseProperty, parseRange } from '../_lib/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/site/ga4?property=properties/123&report=summary|<breakdown>|realtime|retention
 *   &start=YYYY-MM-DD&end=YYYY-MM-DD[&cmpStart=&cmpEnd=][&mode=daily|weekly|monthly]
 *
 * One small cached GA4 report per call (summary = 3), so each tab and card
 * fetches only what it shows. Read-only.
 */
export async function GET(req: Request) {
    const sp = new URL(req.url).searchParams;
    const property = parseProperty(sp.get('property'));
    if (!property) return jsonError('A GA4 property is required.', 400);
    const report = sp.get('report') ?? 'summary';
    const ctx = await getSiteContext(req);
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
        if (report === 'summary') {
            return NextResponse.json(await ga4Summary(ctx.userId, ctx.token, property, range), { headers: PRIVATE_CACHE });
        }
        if (isBreakdown(report)) {
            return NextResponse.json(await ga4Breakdown(ctx.userId, ctx.token, property, report, range), { headers: PRIVATE_CACHE });
        }
        return jsonError('Unknown report.', 400);
    } catch (e) {
        return googleErrorResponse(e, 'Analytics');
    }
}
