import { NextResponse } from 'next/server';
import { rateLimited, sessionUserId } from '@/lib/builder/server/access';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { jsonError, ownerDeps } from '@/lib/builder/server/service';
import { countryName } from '@/lib/builder/countries';
import { getDim } from '@/lib/builder/catalog';
import type { SourceRef, TableWidget } from '@/lib/builder/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/options?siteId=&dimension=&q=: values for filter controls (top 50 by
 * sessions or clicks over the last 28 days, cached through the leaf cache).
 */
export async function GET(req: Request) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    if (rateLimited(`dopt:${userId}`, 120)) return jsonError(429, 'Too many requests');
    const sp = new URL(req.url).searchParams;
    const dimension = sp.get('dimension') ?? '';
    const def = getDim(dimension);
    if (!def || !def.filterable) return jsonError(422, 'Unknown dimension');
    const siteId = sp.get('siteId');
    const q = (sp.get('q') ?? '').trim().slice(0, 100);
    const metric = def.ga4 ? 'ga4:sessions' : 'gsc:clicks';
    const source: SourceRef = siteId ? { type: 'site', siteId } : { type: 'portfolio', include: 'all' };
    const widget: TableWidget = {
        id: 'w_options', type: 'table', source,
        filters: q ? [{ dimension, op: 'contains', value: q }] : undefined,
        config: { dimensions: [dimension], columns: [{ id: `d:${dimension}`, kind: 'dimension', ref: dimension, visual: 'none' }, { id: `m:${metric}`, kind: 'metric', ref: metric, visual: 'none' }], sort: { by: `m:${metric}`, dir: 'desc' }, pagination: false, pageSize: 50, maxRows: 50, search: false, totalsRow: false, rowNumbers: false, density: 'compact', download: false },
    };
    const res = await evaluateWidgets({
        widgets: [{ widget }],
        defaultSource: source,
        controlDefs: [],
        controls: { date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'none' } }, filters: {} },
    }, ownerDeps(userId, 'owner'));
    const r = res.results.w_options;
    if (!r || r.status !== 'ok') return NextResponse.json({ options: [], error: r?.status === 'error' ? r.message : undefined });
    const options = (r.parts.rows?.rows ?? [])
        .map((row) => String(row[`d:${dimension}`] ?? ''))
        .filter((v) => v && v !== '(not set)' && v !== '(other)')
        .slice(0, 50)
        .map((value) => ({ value, label: dimension === 'country' ? countryName(value) : value }));
    return NextResponse.json({ options }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
