/**
 * Search Console reports for the site pages. Base queries (date, query, page,
 * query+page) are cached per (user, site, range); derived reports
 * (opportunities, cannibalization, decay) reuse them.
 */
import {
    expectedCtr, isLowCtr, isStriking, lowCtrPotential, median, strikingPotential, sumGsc,
} from '@/components/site/lib/rules';
import type {
    CannibalizedQuery, DecayRow, GscDetailResponse, GscDimensionReport, GscMetrics, GscRow, GscRowsResponse,
    GscSeriesPoint, GscSummary, InspectResponse, OpportunitiesResponse, OpportunityRow, SitemapRow,
} from '@/components/site/lib/types';
import { gscInspect, gscQuery, gscSitemaps, type GscApiRow } from './google';
import { addDays, daysBetween, type RangeParams, type Window } from './params';

const DIM: Record<GscDimensionReport, string> = {
    queries: 'query',
    pages: 'page',
    countries: 'country',
    devices: 'device',
    appearance: 'searchAppearance',
};
const ROW_LIMIT: Record<GscDimensionReport, number> = { queries: 2500, pages: 2500, countries: 250, devices: 10, appearance: 50 };

export function isGscDimension(v: string | null): v is GscDimensionReport {
    return typeof v === 'string' && v in DIM;
}

function metrics(r: GscApiRow): GscMetrics {
    return { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 };
}

function days(w: Window): string[] {
    return Array.from({ length: Math.max(0, daysBetween(w.start, w.end)) }, (_, i) => addDays(w.start, i));
}

// ─── Summary ──────────────────────────────────────────────────────────────

export async function gscSummary(userId: string, token: string, site: string, r: RangeParams, filters?: Record<string, string>): Promise<GscSummary> {
    const q = (w: Window) => gscQuery(userId, token, site, { dimensions: ['date'], startDate: w.start, endDate: w.end, rowLimit: 1000, filters });
    const [cur, cmp] = await Promise.all([q(r.cur), r.cmp ? q(r.cmp) : Promise.resolve(null)]);
    const curMap = new Map(cur.map((x) => [x.keys?.[0] ?? '', metrics(x)]));
    const cmpMap = cmp ? new Map(cmp.map((x) => [x.keys?.[0] ?? '', metrics(x)])) : null;
    const lastDate = cur.reduce<string | null>((acc, x) => {
        const d = x.keys?.[0] ?? '';
        return !acc || d > acc ? d : acc;
    }, null);
    // GSC ranges end on the last available date (DESIGN 6.5).
    const curDays = days(r.cur).filter((d) => !lastDate || d <= lastDate);
    const cmpDays = r.cmp ? days(r.cmp) : [];
    const series: GscSeriesPoint[] = curDays.map((date, i) => {
        const m = curMap.get(date) ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
        const p: GscSeriesPoint = { date, ...m, position: m.impressions > 0 ? m.position : 0 };
        if (cmpMap) {
            const pd = cmpDays[i] ?? null;
            const pm = pd ? cmpMap.get(pd) : undefined;
            p.prevDate = pd;
            p.prev_clicks = pd ? pm?.clicks ?? 0 : null;
            p.prev_impressions = pd ? pm?.impressions ?? 0 : null;
            p.prev_ctr = pd ? pm?.ctr ?? 0 : null;
            p.prev_position = pd && pm && pm.impressions > 0 ? pm.position : null;
        }
        return p;
    });
    return {
        totals: sumGsc([...curMap.values()]),
        previous: cmpMap ? sumGsc([...cmpMap.values()]) : null,
        series,
        lastDate,
    };
}

// ─── Dimension tables ───────────────────────────────────────────────────────

export async function gscRows(userId: string, token: string, site: string, report: GscDimensionReport, r: RangeParams): Promise<GscRowsResponse> {
    const dim = DIM[report];
    const limit = ROW_LIMIT[report];
    const q = (w: Window) => gscQuery(userId, token, site, { dimensions: [dim], startDate: w.start, endDate: w.end, rowLimit: limit });
    const [cur, cmp] = await Promise.all([q(r.cur), r.cmp ? q(r.cmp) : Promise.resolve(null)]);
    const truncatedPrev = Boolean(cmp && cmp.length >= limit);
    const prevMap = cmp ? new Map(cmp.map((x) => [x.keys?.[0] ?? '', metrics(x)])) : null;
    const rows: GscRow[] = cur.map((x) => {
        const key = x.keys?.[0] ?? '';
        const row: GscRow = { key, ...metrics(x) };
        if (prevMap) row.prev = prevMap.get(key) ?? (truncatedPrev ? null : { clicks: 0, impressions: 0, ctr: 0, position: 0 });
        return row;
    });
    const curKeys = new Set(rows.map((x) => x.key));
    const lost: GscRow[] = [];
    if (prevMap && cur.length < limit) {
        for (const [key, m] of prevMap) {
            if (curKeys.has(key) || m.clicks <= 0) continue;
            lost.push({ key, clicks: 0, impressions: 0, ctr: 0, position: 0, prev: m });
        }
        lost.sort((a, b) => (b.prev?.clicks ?? 0) - (a.prev?.clicks ?? 0));
    }
    return { report, rows, lost: lost.slice(0, 500), truncated: cur.length >= limit };
}

// ─── Query + page (opportunities, cannibalization) ─────────────────────────

async function queryPages(userId: string, token: string, site: string, w: Window) {
    const rows = await gscQuery(userId, token, site, { dimensions: ['query', 'page'], startDate: w.start, endDate: w.end, rowLimit: 5000 });
    return rows.map((x) => ({ query: x.keys?.[0] ?? '', page: x.keys?.[1] ?? '', ...metrics(x) }));
}

/** Top page (most impressions) per query. */
export async function topPageByQuery(userId: string, token: string, site: string, w: Window): Promise<Map<string, string>> {
    const qp = await queryPages(userId, token, site, w);
    const best = new Map<string, { page: string; impressions: number }>();
    for (const r of qp) {
        const b = best.get(r.query);
        if (!b || r.impressions > b.impressions) best.set(r.query, { page: r.page, impressions: r.impressions });
    }
    return new Map([...best].map(([q, v]) => [q, v.page]));
}

export async function gscCannibalization(userId: string, token: string, site: string, w: Window): Promise<CannibalizedQuery[]> {
    const qp = await queryPages(userId, token, site, w);
    const grouped = new Map<string, (GscMetrics & { page: string })[]>();
    for (const r of qp) {
        const list = grouped.get(r.query) ?? [];
        list.push({ page: r.page, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
        grouped.set(r.query, list);
    }
    const out: CannibalizedQuery[] = [];
    for (const [query, pages] of grouped) {
        if (pages.length < 2) continue;
        const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
        if (totalImpressions < 10) continue;
        const sorted = [...pages].sort((a, b) => b.impressions - a.impressions);
        // One page with 85%+ of impressions is not really cannibalization.
        if (sorted[0].impressions / totalImpressions > 0.85) continue;
        const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);
        const competing = sorted.filter((p) => p.impressions / totalImpressions >= 0.1);
        const spread = Math.max(...competing.map((p) => p.position)) - Math.min(...competing.map((p) => p.position));
        const severity: CannibalizedQuery['severity'] = competing.length >= 3 || (competing.length >= 2 && spread < 3 && totalImpressions >= 200)
            ? 'high'
            : competing.length >= 2 && totalImpressions >= 50 ? 'medium' : 'low';
        out.push({
            query,
            pages: sorted.slice(0, 6).map((p) => ({ ...p, share: totalImpressions > 0 ? p.impressions / totalImpressions : 0 })),
            totalClicks,
            totalImpressions,
            bestPosition: Math.min(...pages.map((p) => p.position)),
            severity,
        });
    }
    const order = { high: 3, medium: 2, low: 1 };
    out.sort((a, b) => order[b.severity] - order[a.severity] || b.totalImpressions - a.totalImpressions);
    return out.slice(0, 100);
}

export async function gscOpportunities(userId: string, token: string, site: string, r: RangeParams): Promise<OpportunitiesResponse> {
    const [queries, pages, topPage] = await Promise.all([
        gscRows(userId, token, site, 'queries', { cur: r.cur, cmp: null }),
        gscRows(userId, token, site, 'pages', { cur: r.cur, cmp: null }),
        topPageByQuery(userId, token, site, r.cur),
    ]);
    const med = median(queries.rows.filter((x) => x.impressions > 0).map((x) => x.impressions));
    const row = (x: GscRow, kind: OpportunityRow['kind'], target: OpportunityRow['target']): OpportunityRow => ({
        kind,
        target,
        key: x.key,
        page: target === 'page' ? x.key : topPage.get(x.key) ?? null,
        clicks: x.clicks,
        impressions: x.impressions,
        ctr: x.ctr,
        position: x.position,
        expectedCtr: expectedCtr(kind === 'striking' ? 3 : x.position),
        potentialClicks: kind === 'striking' ? strikingPotential(x) : lowCtrPotential(x),
    });
    const striking = queries.rows.filter((x) => isStriking(x, med)).map((x) => row(x, 'striking', 'query'));
    const lowCtr = [
        ...pages.rows.filter((x) => isLowCtr(x, 200)).map((x) => row(x, 'low_ctr', 'page')),
        ...queries.rows.filter((x) => isLowCtr(x, 100)).map((x) => row(x, 'low_ctr', 'query')),
    ];
    const byPotential = (a: OpportunityRow, b: OpportunityRow) => b.potentialClicks - a.potentialClicks;
    return {
        striking: striking.sort(byPotential).slice(0, 300),
        lowCtr: lowCtr.filter((x) => x.potentialClicks > 0).sort(byPotential).slice(0, 300),
        medianImpressions: med,
    };
}

// ─── Detail (query or page drawer) ─────────────────────────────────────────

export async function gscDetail(userId: string, token: string, site: string, r: RangeParams, by: { query?: string; page?: string }): Promise<GscDetailResponse> {
    const filters: Record<string, string> = by.query ? { query: by.query } : { page: by.page ?? '' };
    const relatedDim = by.query ? 'page' : 'query';
    const [summary, related, countries] = await Promise.all([
        gscSummary(userId, token, site, r, filters),
        gscQuery(userId, token, site, { dimensions: [relatedDim], startDate: r.cur.start, endDate: r.cur.end, rowLimit: 50, filters }),
        gscQuery(userId, token, site, { dimensions: ['country'], startDate: r.cur.start, endDate: r.cur.end, rowLimit: 10, filters }),
    ]);
    const asRow = (x: GscApiRow): GscRow => ({ key: x.keys?.[0] ?? '', ...metrics(x) });
    return {
        series: summary.series,
        totals: summary.totals,
        previous: summary.previous,
        related: related.map(asRow),
        countries: countries.map(asRow),
    };
}

// ─── Decay (three 28-day windows) ─────────────────────────────────────────

export async function gscDecay(userId: string, token: string, site: string, end: string): Promise<DecayRow[]> {
    const windows: Window[] = [2, 1, 0].map((k) => ({ start: addDays(end, -28 * (k + 1) + 1), end: addDays(end, -28 * k) }));
    const results = await Promise.all(windows.map((w) => gscQuery(userId, token, site, { dimensions: ['page'], startDate: w.start, endDate: w.end, rowLimit: 2500 })));
    const map = new Map<string, [number, number, number]>();
    results.forEach((rows, i) => {
        for (const x of rows) {
            const page = x.keys?.[0] ?? '';
            const v = map.get(page) ?? [0, 0, 0];
            v[i] = x.clicks ?? 0;
            map.set(page, v);
        }
    });
    return [...map].map(([page, clicks]) => ({ page, clicks }));
}

// ─── Indexing ─────────────────────────────────────────────────────────────

export async function gscSitemapRows(userId: string, token: string, site: string): Promise<SitemapRow[]> {
    const data = await gscSitemaps(userId, token, site) as { sitemap?: Array<Record<string, unknown>> };
    return (data.sitemap ?? []).map((s) => {
        const contents = (s.contents as Array<{ submitted?: string; indexed?: string }> | undefined) ?? [];
        const submitted = contents.reduce((a, c) => a + (Number(c.submitted) || 0), 0);
        const hasIndexed = contents.some((c) => c.indexed !== undefined);
        return {
            path: String(s.path ?? ''),
            lastSubmitted: (s.lastSubmitted as string) ?? null,
            lastDownloaded: (s.lastDownloaded as string) ?? null,
            isPending: Boolean(s.isPending),
            isSitemapsIndex: Boolean(s.isSitemapsIndex),
            warnings: Number(s.warnings) || 0,
            errors: Number(s.errors) || 0,
            submitted,
            indexed: hasIndexed ? contents.reduce((a, c) => a + (Number(c.indexed) || 0), 0) : null,
        };
    });
}

export async function gscInspectUrl(userId: string, token: string, site: string, url: string): Promise<InspectResponse> {
    const data = await gscInspect(userId, token, site, url) as { inspectionResult?: Record<string, unknown> };
    const r = data.inspectionResult ?? {};
    const idx = (r.indexStatusResult ?? {}) as Record<string, unknown>;
    const mob = (r.mobileUsabilityResult ?? {}) as Record<string, unknown>;
    const rich = (r.richResultsResult ?? {}) as { verdict?: string; detectedItems?: { richResultType?: string }[] };
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    return {
        url,
        verdict: str(idx.verdict) ?? 'VERDICT_UNSPECIFIED',
        coverageState: str(idx.coverageState),
        indexingState: str(idx.indexingState),
        robotsTxtState: str(idx.robotsTxtState),
        pageFetchState: str(idx.pageFetchState),
        lastCrawlTime: str(idx.lastCrawlTime),
        googleCanonical: str(idx.googleCanonical),
        userCanonical: str(idx.userCanonical),
        crawledAs: str(idx.crawledAs),
        mobileVerdict: str(mob.verdict),
        richResultsVerdict: str(rich.verdict),
        richResultTypes: (rich.detectedItems ?? []).map((d) => d.richResultType ?? '').filter(Boolean),
        link: str(r.inspectionResultLink),
    };
}
