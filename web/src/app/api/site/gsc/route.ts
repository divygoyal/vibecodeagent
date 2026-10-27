import { NextResponse } from 'next/server';

import { getSiteContext, googleErrorResponse, jsonError, PRIVATE_CACHE } from '../_lib/context';
import {
    gscCannibalization, gscDecay, gscDetail, gscInspectUrl, gscOpportunities, gscRows, gscSitemapRows, gscSummary, isGscDimension,
} from '../_lib/gscReports';
import { parseRange, parseSiteUrl } from '../_lib/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/site/gsc?site=sc-domain:acme.com&report=…&start=&end=[&cmpStart=&cmpEnd=]
 *
 * report: summary | queries | pages | countries | devices | appearance
 *       | opportunities | cannibalization | decay | detail (&query= or &page=)
 *       | sitemaps | inspect (&url=)
 *
 * Small cached Search Console reports, one per card or tab. Read-only.
 */
export async function GET(req: Request) {
    const sp = new URL(req.url).searchParams;
    const site = parseSiteUrl(sp.get('site'));
    if (!site) return jsonError('A Search Console site is required.', 400);
    const report = sp.get('report') ?? 'summary';
    const ctx = await getSiteContext(req, { kind: 'gsc', id: site });
    if (ctx instanceof NextResponse) return ctx;
    const range = parseRange(sp, 2);
    const ok = (data: unknown) => NextResponse.json(data, { headers: PRIVATE_CACHE });

    try {
        switch (report) {
            case 'summary':
                return ok(await gscSummary(ctx.userId, ctx.token, site, range));
            case 'opportunities':
                return ok(await gscOpportunities(ctx.userId, ctx.token, site, range));
            case 'cannibalization':
                return ok({ cannibalized: await gscCannibalization(ctx.userId, ctx.token, site, range.cur) });
            case 'decay':
                return ok({ rows: await gscDecay(ctx.userId, ctx.token, site, range.cur.end) });
            case 'detail': {
                const query = sp.get('query');
                const page = sp.get('page');
                if (!query && !page) return jsonError('query or page is required.', 400);
                if ((query ?? page ?? '').length > 2000) return jsonError('Too long.', 400);
                return ok(await gscDetail(ctx.userId, ctx.token, site, range, query ? { query } : { page: page! }));
            }
            case 'sitemaps':
                return ok({ sitemaps: await gscSitemapRows(ctx.userId, ctx.token, site) });
            case 'inspect': {
                const url = sp.get('url') ?? '';
                if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) return jsonError('Enter a full URL on this site, like https://example.com/page.', 400);
                return ok(await gscInspectUrl(ctx.userId, ctx.token, site, url));
            }
            default:
                if (isGscDimension(report)) return ok(await gscRows(ctx.userId, ctx.token, site, report, range));
                return jsonError('Unknown report.', 400);
        }
    } catch (e) {
        return googleErrorResponse(e, 'Search Console');
    }
}
