import { NextResponse } from 'next/server';

import { cachedResult } from '../_lib/google';
import { buildActions } from '../_lib/actions';
import { getSiteContext, googleErrorResponse, jsonError, PRIVATE_CACHE } from '../_lib/context';
import { parseProperty, parseRange, parseSiteUrl, rangeKey } from '../_lib/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/site/actions?site=&property=&label=
 *   &start=&end=[&cmpStart=&cmpEnd=]            (Search Console days)
 *   &tStart=&tEnd=[&tCmpStart=&tCmpEnd=]        (GA4 days)
 *
 * Ranked "what to fix next" tasks built from the same cached reports the
 * Search, Traffic and Pages tabs use. Read-only.
 */
export async function GET(req: Request) {
    const sp = new URL(req.url).searchParams;
    const siteUrl = parseSiteUrl(sp.get('site'));
    const property = parseProperty(sp.get('property'));
    if (!siteUrl && !property) return jsonError('A Search Console site or GA4 property is required.', 400);
    const label = (sp.get('label') ?? '').slice(0, 120) || 'this site';
    // GA4 and Search Console of one site can sit in different Google accounts: one token each.
    const ctx = await getSiteContext(req, siteUrl ? { kind: 'gsc', id: siteUrl } : { kind: 'ga4', id: property! });
    if (ctx instanceof NextResponse) return ctx;
    const gaCtx = siteUrl && property ? await getSiteContext(req, { kind: 'ga4', id: property }) : ctx;
    if (gaCtx instanceof NextResponse) return gaCtx;

    const search = parseRange(sp, 2);
    const t = new URLSearchParams();
    for (const [from, to] of [['tStart', 'start'], ['tEnd', 'end'], ['tCmpStart', 'cmpStart'], ['tCmpEnd', 'cmpEnd']]) {
        const v = sp.get(from);
        if (v) t.set(to, v);
    }
    const traffic = parseRange(t, 0);

    try {
        const data = await cachedResult(
            `site-actions:${ctx.userId}:${siteUrl ?? ''}:${property ?? ''}:${label}:${rangeKey(search)}:${rangeKey(traffic)}`,
            5 * 60_000,
            () => buildActions({ userId: ctx.userId, token: ctx.token, gaToken: gaCtx.token, label, siteUrl, property, search, traffic }),
        );
        return NextResponse.json(data, { headers: PRIVATE_CACHE });
    } catch (e) {
        return googleErrorResponse(e, 'site');
    }
}
