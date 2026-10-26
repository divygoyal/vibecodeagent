import * as z from 'zod';
import { fmtPeriod, previousPeriod, resolvePeriod, type Period } from '../dates';
import { ToolError } from '../errors';
import { fmtDelta, fmtInt, fmtNum, headerLine, render, renderJson, type Cell, type Section } from '../format';
import { gaRows, type GscRow } from '../google';
import { requireGa4, requireGsc, type SiteRecord } from '../siteResolver';
import { dateRangeArg, defineTool, formatArg, siteArg, type ToolContext } from '../toolkit';
import { ensureQueriesAllowed, ga4Totals, gaRange, gscBody, gscTotals, re2Escape, sumGsc } from './common';
import { gaDimCell, gaMetricCell, validateGa4Fields } from './ga4';

const GSC_MOVER_DIMS = ['page', 'query', 'country', 'device'];
const GA4_MOVER_DIMS: Record<string, string> = { page: 'pagePath', channel: 'sessionDefaultChannelGroup', source_medium: 'sessionSourceMedium', landing_page: 'landingPage', country: 'country', device: 'deviceCategory' };
const GA4_MOVER_METRICS: Record<string, string> = { sessions: 'sessions', users: 'activeUsers', key_events: 'keyEvents', revenue: 'totalRevenue' };

function itemLabel(ctx: ToolContext, dim: string, value: string, host: string): string {
    if (dim === 'page' && /^https?:\/\//.test(value)) {
        try {
            const u = new URL(value);
            const h = u.host.replace(/^www\./, '');
            return ctx.san.path(h === host ? u.pathname : `${h}${u.pathname}`, 160);
        } catch {
            /* fall through */
        }
    }
    if (dim === 'page' || dim === 'landing_page') return ctx.san.path(value, 160);
    return ctx.san.text(value, 120);
}

export const topMovers = defineTool({
    name: 'top_movers',
    title: 'Top movers',
    description: 'Rank what gained and lost most between two periods for one site: pages, queries, countries or devices from Search Console, or pages, channels, sources or landing pages from GA4. Returns gainers, losers, new and lost items with deltas and each item\'s share of the total change. Use for \'what changed\' and \'which pages dropped\'.',
    input: z.object({
        site: siteArg,
        source: z.enum(['gsc', 'ga4']).default('gsc'),
        dimension: z.enum(['page', 'query', 'country', 'device', 'channel', 'source_medium', 'landing_page']).default('page').describe('gsc supports page, query, country, device. ga4 supports page, channel, source_medium, landing_page, country, device.'),
        metric: z.enum(['clicks', 'impressions', 'position', 'sessions', 'users', 'key_events', 'revenue']).optional().describe('Default clicks (gsc) or sessions (ga4).'),
        date_range: dateRangeArg.optional(),
        compare_to: z.enum(['previous_period', 'previous_year']).default('previous_period'),
        direction: z.enum(['both', 'gainers', 'losers']).default('both'),
        min_base: z.number().min(0).optional().describe('Ignore items whose value is below this in both periods. Default 10 clicks or 20 sessions.'),
        include_new_lost: z.boolean().default(true),
        limit: z.number().int().min(1).max(25).default(10).describe('Items per section.'),
    }).strict(),
    cost: 4,
    invoking: 'Finding what changed…',
    invoked: 'Changes ranked',
    async run(args, ctx) {
        const site = await ctx.site(args.site);
        const g = await ctx.google();
        const isGsc = args.source === 'gsc';
        const metric = args.metric ?? (isGsc ? 'clicks' : 'sessions');
        if (isGsc && !GSC_MOVER_DIMS.includes(args.dimension)) throw new ToolError('invalid_argument', `dimension ${args.dimension} is not available for gsc; use page, query, country or device`);
        if (!isGsc && !GA4_MOVER_DIMS[args.dimension]) throw new ToolError('invalid_argument', `dimension ${args.dimension} is not available for ga4; use page, channel, source_medium, landing_page, country or device`);
        if (isGsc && !['clicks', 'impressions', 'position'].includes(metric)) throw new ToolError('invalid_argument', 'gsc metrics are clicks, impressions or position');
        if (!isGsc && !GA4_MOVER_METRICS[metric]) throw new ToolError('invalid_argument', 'ga4 metrics are sessions, users, key_events or revenue');
        if (args.dimension === 'query') ensureQueriesAllowed(ctx.principal.excludeQueries, 'Query movers');

        const { period, warnings } = resolvePeriod(args.date_range, { source: isGsc ? 'gsc' : 'ga4' });
        warnings.forEach((w) => ctx.warn(w));
        const prev = previousPeriod(period, args.compare_to);
        const minBase = args.min_base ?? (metric === 'position' ? 50 : metric === 'impressions' ? 100 : isGsc ? 10 : 20);

        type Item = { key: string; cur: number; prev: number; posCur?: number; posPrev?: number; imprCur?: number; imprPrev?: number };
        const items = new Map<string, Item>();
        if (isGsc) {
            const { siteUrl } = requireGsc(site);
            const [a, b] = await Promise.all([
                g.gscQuery(siteUrl, gscBody(period, { dimensions: [args.dimension], rowLimit: 1000 })),
                g.gscQuery(siteUrl, gscBody(prev, { dimensions: [args.dimension], rowLimit: 1000 })),
            ]);
            const val = (r: GscRow) => (metric === 'clicks' ? r.clicks : metric === 'impressions' ? r.impressions : r.position);
            for (const r of a.rows || []) items.set(r.keys?.[0] ?? '', { key: r.keys?.[0] ?? '', cur: val(r), prev: 0, posCur: r.position, imprCur: r.impressions, imprPrev: 0 });
            for (const r of b.rows || []) {
                const k = r.keys?.[0] ?? '';
                const it = items.get(k) ?? { key: k, cur: 0, prev: 0, imprCur: 0 };
                it.prev = val(r);
                it.posPrev = r.position;
                it.imprPrev = r.impressions;
                items.set(k, it);
            }
        } else {
            const { property } = requireGa4(site);
            const dim = GA4_MOVER_DIMS[args.dimension];
            const m = GA4_MOVER_METRICS[metric];
            const report = await g.ga4Report(property, {
                dateRanges: [gaRange(period, 'cur'), gaRange(prev, 'prev')],
                dimensions: [{ name: dim }],
                metrics: [{ name: m }],
                limit: 2000,
                orderBys: [{ metric: { metricName: m }, desc: true }],
            });
            for (const r of gaRows(report)) {
                const k = r.dims[0];
                const it = items.get(k) ?? { key: k, cur: 0, prev: 0 };
                if (r.dims[1] === 'prev') it.prev = r.mets[0];
                else it.cur = r.mets[0];
                items.set(k, it);
            }
        }

        const all = Array.from(items.values());
        let gainers: (Item & { delta: number })[];
        let losers: (Item & { delta: number })[];
        let fresh: Item[] = [];
        let lost: Item[] = [];
        if (metric === 'position') {
            const both = all.filter((i) => (i.imprCur ?? 0) >= minBase && (i.imprPrev ?? 0) >= minBase).map((i) => ({ ...i, delta: i.prev - i.cur }));
            gainers = both.filter((i) => i.delta > 0).sort((a, b) => b.delta - a.delta);
            losers = both.filter((i) => i.delta < 0).sort((a, b) => a.delta - b.delta);
        } else {
            const both = all.filter((i) => i.cur > 0 && i.prev > 0 && (i.cur >= minBase || i.prev >= minBase)).map((i) => ({ ...i, delta: i.cur - i.prev }));
            gainers = both.filter((i) => i.delta > 0).sort((a, b) => b.delta - a.delta);
            losers = both.filter((i) => i.delta < 0).sort((a, b) => a.delta - b.delta);
            fresh = all.filter((i) => i.prev === 0 && i.cur >= minBase).sort((a, b) => b.cur - a.cur);
            lost = all.filter((i) => i.cur === 0 && i.prev >= minBase).sort((a, b) => b.prev - a.prev);
        }
        const totalAbs = metric === 'position' ? 0 : all.reduce((a, i) => a + Math.abs(i.cur - i.prev), 0);
        const fmtVal = (v: number) => (metric === 'position' ? fmtNum(v, 1) : metric === 'revenue' ? fmtNum(v, 2) : fmtInt(v));
        const row = (i: Item): Cell[] => {
            const delta = metric === 'position' ? i.cur - i.prev : i.cur - i.prev;
            return [
                itemLabel(ctx, args.dimension, i.key, site.host), fmtVal(i.cur), fmtVal(i.prev), metric === 'position' ? fmtNum(delta, 1) : fmtVal(delta),
                metric === 'position' ? '' : fmtDelta(i.cur, i.prev).replace('%', ''),
                totalAbs ? fmtNum(((i.cur - i.prev) / totalAbs) * 100, 1) : '',
                ...(isGsc ? [i.posCur ? fmtNum(i.posCur, 1) : '', i.posPrev ? fmtNum(i.posPrev, 1) : ''] : []),
            ];
        };
        const columns = ['item', 'current', 'previous', 'delta', 'delta_pct', 'share_of_change_pct', ...(isGsc ? ['pos_current', 'pos_previous'] : [])];
        const sections: Section[] = [];
        if (args.direction !== 'losers') sections.push({ title: 'gainers', columns, rows: gainers.slice(0, args.limit).map(row) });
        if (args.direction !== 'gainers') sections.push({ title: 'losers', columns, rows: losers.slice(0, args.limit).map(row) });
        if (args.include_new_lost && metric !== 'position') {
            if (args.direction !== 'losers') sections.push({ title: 'new', columns, rows: fresh.slice(0, args.limit).map(row) });
            if (args.direction !== 'gainers') sections.push({ title: 'lost', columns, rows: lost.slice(0, args.limit).map(row) });
        }
        const curTotal = all.reduce((a, i) => a + i.cur, 0);
        const prevTotal = all.reduce((a, i) => a + i.prev, 0);
        const header = [...ctx.banner(), headerLine(['top_movers', site.site_id, `${args.source} ${args.dimension} by ${metric}`, `${fmtPeriod(period)} vs ${fmtPeriod(prev)}`,
            metric !== 'position' ? `total ${fmtVal(curTotal)} vs ${fmtVal(prevTotal)} (${fmtDelta(curTotal, prevTotal)}) over the top rows` : `min impressions ${minBase} in both periods`])];
        const footer = [metric === 'position' ? '# position: lower is better; delta is current minus previous' : '# share_of_change_pct = item change / sum of absolute changes', ctx.note()];
        const out = render(header, sections, footer);
        return { text: out.text, rows: out.rowsReturned, structured: { site: site.site_id, period: { start: period.start, end: period.end }, compare: { start: prev.start, end: prev.end }, counts: { gainers: gainers.length, losers: losers.length, new: fresh.length, lost: lost.length }, truncated: out.truncated } };
    },
});

const GSC_METRICS = ['clicks', 'impressions', 'ctr', 'position'];
const GA4_DEFAULT_METRICS = ['sessions', 'activeUsers', 'engagementRate', 'keyEvents'];
const GA4_BY_ALIASES: Record<string, string> = { page: 'pagePath', device: 'deviceCategory', channel: 'sessionDefaultChannelGroup', source_medium: 'sessionSourceMedium', landing_page: 'landingPage' };

export const comparePeriods = defineTool({
    name: 'compare_periods',
    title: 'Compare periods',
    description: 'Compare totals, and optionally a breakdown, between two periods for one site from Search Console, GA4 or both. Default compares the last 28 days with the 28 days before. Returns value A, value B, absolute and percent change. Use for week-over-week, month-over-month and year-over-year questions.',
    input: z.object({
        site: siteArg,
        source: z.enum(['both', 'gsc', 'ga4']).default('both'),
        period_a: dateRangeArg.optional().describe('Period to analyse. Default {preset:last_28d}.'),
        compare_to: z.enum(['previous_period', 'previous_year', 'custom']).default('previous_period'),
        period_b: z.object({ start_date: z.string().max(20), end_date: z.string().max(20) }).strict().optional().describe('Required when compare_to is custom.'),
        metrics: z.array(z.string().min(1).max(100)).max(8).optional().describe('gsc: clicks, impressions, ctr, position. ga4: GA4 metric names. Default: clicks, impressions, ctr, position, sessions, activeUsers, engagementRate, keyEvents.'),
        by: z.string().max(100).optional().describe('Optional breakdown. gsc: query, page, country, device. ga4: any GA4 dimension API name, for example sessionDefaultChannelGroup.'),
        limit: z.number().int().min(1).max(50).default(10),
        format: formatArg,
    }).strict(),
    cost: 4,
    invoking: 'Comparing periods…',
    invoked: 'Periods compared',
    async run(args, ctx) {
        const site = await ctx.site(args.site);
        if (args.compare_to === 'custom' && !args.period_b) throw new ToolError('invalid_argument', 'period_b is required when compare_to is custom');
        const requested = args.metrics?.length ? Array.from(new Set(args.metrics)) : null;
        const gscMetrics = (requested ?? GSC_METRICS).filter((m) => GSC_METRICS.includes(m));
        const gaMetrics = requested ? requested.filter((m) => !GSC_METRICS.includes(m)) : GA4_DEFAULT_METRICS;
        const useGsc = args.source !== 'ga4' && Boolean(site.gsc) && gscMetrics.length > 0;
        const useGa = args.source !== 'gsc' && Boolean(site.ga4) && gaMetrics.length > 0;
        if (args.source === 'gsc') requireGsc(site);
        if (args.source === 'ga4') requireGa4(site);
        if (!useGsc && !useGa) throw new ToolError('invalid_argument', 'Nothing to compare: the site lacks the requested source, or no metric matches it');
        if (args.source === 'both' && !site.gsc) ctx.warn('no Search Console site paired: GA4 only');
        if (args.source === 'both' && !site.ga4) ctx.warn('no GA4 property paired: Search Console only');
        const by = args.by?.trim() || null;
        const gscBy = by && ['query', 'page', 'country', 'device'].includes(by) ? by : null;
        const gaBy = by ? (GA4_BY_ALIASES[by] ?? by) : null;
        if (gscBy === 'query' && useGsc) ensureQueriesAllowed(ctx.principal.excludeQueries, 'A query breakdown');

        const periods = (source: 'ga4' | 'gsc') => {
            const a = resolvePeriod(args.period_a, { source });
            a.warnings.forEach((w) => ctx.warn(w));
            const b = args.compare_to === 'custom'
                ? resolvePeriod({ start_date: args.period_b!.start_date, end_date: args.period_b!.end_date }, { source }).period
                : previousPeriod(a.period, args.compare_to);
            return { a: a.period, b };
        };
        const g = await ctx.google();
        const rows: Cell[][] = [];
        const notes: string[] = [];
        const lowBase = (x: number, y: number, m: string) => (!/rate|ctr|position|duration/i.test(m) && (x < 30 || y < 30) ? 'low_base' : '');
        const fmt = (m: string, v: number) => (m === 'ctr' ? fmtNum(v * 100, 2) : m === 'position' ? fmtNum(v, 1) : gaMetricCell(v));
        const label = (m: string) => (m === 'ctr' ? 'ctr_pct' : m);
        const periodsUsed: Record<string, { a: Period; b: Period }> = {};

        if (useGsc) {
            const { siteUrl } = requireGsc(site);
            const p = periods('gsc');
            periodsUsed.gsc = p;
            if (gscBy) {
                const [ra, rb] = await Promise.all([
                    g.gscQuery(siteUrl, gscBody(p.a, { dimensions: [gscBy], rowLimit: 1000 })),
                    g.gscQuery(siteUrl, gscBody(p.b, { dimensions: [gscBy], rowLimit: 1000 })),
                ]);
                const bMap = new Map((rb.rows || []).map((r) => [r.keys?.[0] ?? '', r]));
                const top = (ra.rows || []).slice(0, args.limit);
                for (const r of top) {
                    const other = bMap.get(r.keys?.[0] ?? '');
                    for (const m of gscMetrics) {
                        const va = r[m as keyof GscRow] as number;
                        const vb = other ? (other[m as keyof GscRow] as number) : 0;
                        rows.push(['gsc', label(m), itemLabel(ctx, gscBy, r.keys?.[0] ?? '', site.host), fmt(m, va), other ? fmt(m, vb) : '', other ? fmt(m, va - vb) : '', other ? fmtDelta(va, vb) : 'new', lowBase(va, vb, m)]);
                    }
                }
            } else {
                const [ta, tb] = await Promise.all([gscTotals(g, siteUrl, p.a), gscTotals(g, siteUrl, p.b)]);
                for (const m of gscMetrics) {
                    const va = ta[m as keyof typeof ta];
                    const vb = tb[m as keyof typeof tb];
                    rows.push(['gsc', label(m), ...(by ? [''] : []), fmt(m, va), fmt(m, vb), fmt(m, va - vb), fmtDelta(va, vb), lowBase(va, vb, m)]);
                }
            }
        }
        if (useGa) {
            const { property } = requireGa4(site);
            await validateGa4Fields(g, property, gaMetrics, gaBy ? [gaBy] : []);
            const p = periods('ga4');
            periodsUsed.ga4 = p;
            if (gaBy) {
                const report = await g.ga4Report(property, {
                    dateRanges: [gaRange(p.a, 'a'), gaRange(p.b, 'b')],
                    dimensions: [{ name: gaBy }],
                    metrics: gaMetrics.map((name) => ({ name })),
                    limit: 1000,
                    orderBys: [{ metric: { metricName: gaMetrics[0] }, desc: true }],
                });
                const types = (report.metricHeaders || []).map((h) => h.type);
                const map = new Map<string, { a?: number[]; b?: number[] }>();
                for (const r of gaRows(report)) {
                    const e = map.get(r.dims[0]) ?? {};
                    if (r.dims[1] === 'b') e.b = r.mets;
                    else e.a = r.mets;
                    map.set(r.dims[0], e);
                }
                const top = Array.from(map.entries()).filter(([, v]) => v.a).sort((x, y) => (y[1].a![0] ?? 0) - (x[1].a![0] ?? 0)).slice(0, args.limit);
                for (const [key, v] of top) {
                    gaMetrics.forEach((m, i) => {
                        const va = v.a?.[i] ?? 0;
                        const vb = v.b?.[i];
                        rows.push(['ga4', m, gaDimCell(ctx, gaBy, key), gaMetricCell(va, types[i]), vb === undefined ? '' : gaMetricCell(vb, types[i]), vb === undefined ? '' : gaMetricCell(va - vb, types[i]), vb === undefined ? 'new' : fmtDelta(va, vb), lowBase(va, vb ?? 0, m)]);
                    });
                }
            } else {
                const t = await ga4Totals(g, property, p.a, p.b, gaMetrics);
                const types = (t.report.metricHeaders || []).map((h) => h.type);
                gaMetrics.forEach((m, i) => {
                    const va = t.cur[i];
                    const vb = t.prev?.[i] ?? 0;
                    rows.push(['ga4', m, ...(by ? [''] : []), gaMetricCell(va, types[i]), gaMetricCell(vb, types[i]), gaMetricCell(va - vb, types[i]), fmtDelta(va, vb), lowBase(va, vb, m)]);
                });
            }
        }
        if (by && useGsc && !gscBy) notes.push(`# by=${by} applies to GA4 only; Search Console supports query, page, country, device`);
        const columns = ['source', 'metric', ...(by ? ['dimension'] : []), 'period_a', 'period_b', 'delta', 'delta_pct', 'note'];
        const env = { site: site.site_id, periods: Object.fromEntries(Object.entries(periodsUsed).map(([k, v]) => [k, { a: { start: v.a.start, end: v.a.end, days: v.a.days }, b: { start: v.b.start, end: v.b.end, days: v.b.days } }])) };
        if (args.format === 'json') {
            const j = renderJson([{ columns, rows }], env);
            return { text: j.text, rows: j.rowsReturned, structured: { ...env, truncated: j.truncated } };
        }
        const desc = Object.entries(periodsUsed).map(([k, v]) => `${k.toUpperCase()} A ${fmtPeriod(v.a)} (${v.a.days}d) vs B ${fmtPeriod(v.b)} (${v.b.days}d)`);
        const header = [...ctx.banner(), headerLine(['compare_periods', site.site_id, ...desc, by ? `by ${by}` : null])];
        const out = render(header, [{ columns, rows }], [...notes, '# delta = A - B; low_base marks values under 30, where percentages swing a lot', by ? ctx.note() : '']);
        return { text: out.text, rows: out.rowsReturned, structured: { ...env, truncated: out.truncated } };
    },
});

function normalizePath(input: string, site: SiteRecord): string {
    let path = input.trim();
    if (/^https?:\/\//i.test(path)) {
        let u: URL;
        try {
            u = new URL(path);
        } catch {
            throw new ToolError('invalid_argument', 'page is not a valid URL or path');
        }
        const h = u.host.replace(/^www\./, '').toLowerCase();
        if (h !== site.host && !h.endsWith(`.${site.host}`)) throw new ToolError('invalid_argument', `page ${u.host} is not on ${site.site_id}`);
        path = u.pathname;
    }
    path = path.split(/[?#]/)[0] || '/';
    if (!path.startsWith('/')) path = `/${path}`;
    return path;
}

export const pageDetail = defineTool({
    name: 'page_detail',
    title: 'Page detail',
    description: 'Everything about one page of one site: GA4 engagement and top traffic sources, plus Search Console clicks, impressions, CTR, position, top queries and devices, each versus the previous period, and any queries where several of the site\'s pages compete. Use after you know which page to look at.',
    input: z.object({
        site: siteArg,
        page: z.string().min(1).max(2000).describe('Page path (/pricing) or full URL on this site.'),
        date_range: dateRangeArg.optional(),
        top_queries: z.number().int().min(1).max(25).default(10),
    }).strict(),
    cost: 5,
    invoking: 'Reading the page\'s numbers…',
    invoked: 'Page detail ready',
    async run(args, ctx) {
        const site = await ctx.site(args.site);
        if (!site.ga4 && !site.gsc) throw new ToolError('invalid_argument', 'This site has neither GA4 nor Search Console connected');
        const path = normalizePath(args.page, site);
        const g = await ctx.google();
        const gaSections: Section[] = [];
        const gscSections: Section[] = [];
        const header = [...ctx.banner()];
        const desc: string[] = [];
        const noQueries = ctx.principal.excludeQueries;

        const gaJob = site.ga4 ? (async () => {
            const { property } = site.ga4!;
            const { period, warnings } = resolvePeriod(args.date_range, { source: 'ga4' });
            warnings.forEach((w) => ctx.warn(w));
            const prev = previousPeriod(period, 'previous_period');
            desc.push(`GA4 ${fmtPeriod(period)} vs ${fmtPeriod(prev)}`);
            const variants = Array.from(new Set([path, path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : `${path}/`]));
            const filter = { filter: { fieldName: 'pagePath', inListFilter: { values: variants, caseSensitive: false } } };
            const metrics = ['sessions', 'activeUsers', 'engagementRate', 'userEngagementDuration', 'keyEvents'];
            const [t, src] = await Promise.all([
                ga4Totals(g, property, period, prev, metrics, { dimensionFilter: filter }),
                g.ga4Report(property, { dateRanges: [gaRange(period)], dimensions: [{ name: 'sessionSourceMedium' }], metrics: [{ name: 'sessions' }], dimensionFilter: filter, limit: 5, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] }),
            ]);
            const avgEng = (m: number[]) => (m[1] ? m[3] / m[1] : 0);
            const p = t.prev ?? metrics.map(() => 0);
            gaSections.push({
                title: 'ga4', columns: ['metric', 'current', 'previous', 'delta_pct'], rows: [
                    ['sessions', fmtInt(t.cur[0]), fmtInt(p[0]), fmtDelta(t.cur[0], p[0])],
                    ['users', fmtInt(t.cur[1]), fmtInt(p[1]), fmtDelta(t.cur[1], p[1])],
                    ['engagement_rate_pct', fmtNum(t.cur[2] * 100, 1), fmtNum(p[2] * 100, 1), fmtDelta(t.cur[2], p[2])],
                    ['avg_engagement_s', fmtNum(avgEng(t.cur), 1), fmtNum(avgEng(p), 1), fmtDelta(avgEng(t.cur), avgEng(p))],
                    ['key_events', fmtInt(t.cur[4]), fmtInt(p[4]), fmtDelta(t.cur[4], p[4])],
                ],
            });
            gaSections.push({ title: 'ga4_top_sources', columns: ['source_medium', 'sessions'], rows: gaRows(src).map((r) => [ctx.san.text(r.dims[0], 80), fmtInt(r.mets[0])]) });
            if (t.cur[0] === 0 && p[0] === 0) ctx.warn(`GA4 has no sessions with pagePath ${path}; check the path (GA4 paths exclude the host and query string)`);
        })() : Promise.resolve();

        const gscJob = site.gsc ? (async () => {
            const { siteUrl } = site.gsc!;
            const { period, warnings } = resolvePeriod(args.date_range, { source: 'gsc' });
            warnings.forEach((w) => ctx.warn(w));
            const prev = previousPeriod(period, 'previous_period');
            desc.push(`GSC ${fmtPeriod(period)} vs ${fmtPeriod(prev)}`);
            const trimmed = path.length > 1 ? path.replace(/\/$/, '') : '';
            const pageRe = `^https?://([a-z0-9-]+\\.)*${re2Escape(site.host)}(:[0-9]+)?${re2Escape(trimmed)}/?$`;
            const pageFilter = { dimensionFilterGroups: [{ groupType: 'and', filters: [{ dimension: 'page', operator: 'includingRegex', expression: pageRe }] }] };
            const [a, b, queries, devices] = await Promise.all([
                g.gscQuery(siteUrl, gscBody(period, { dimensions: ['page'], rowLimit: 20, ...pageFilter })).then((r) => sumGsc(r.rows || [])),
                g.gscQuery(siteUrl, gscBody(prev, { dimensions: ['page'], rowLimit: 20, ...pageFilter })).then((r) => sumGsc(r.rows || [])),
                noQueries ? Promise.resolve([] as GscRow[]) : g.gscQuery(siteUrl, gscBody(period, { dimensions: ['query'], rowLimit: args.top_queries, ...pageFilter })).then((r) => r.rows || []),
                g.gscQuery(siteUrl, gscBody(period, { dimensions: ['device'], rowLimit: 10, ...pageFilter })).then((r) => r.rows || []),
            ]);
            gscSections.push({
                title: 'gsc', columns: ['metric', 'current', 'previous', 'delta_pct'], rows: [
                    ['clicks', fmtInt(a.clicks), fmtInt(b.clicks), fmtDelta(a.clicks, b.clicks)],
                    ['impressions', fmtInt(a.impressions), fmtInt(b.impressions), fmtDelta(a.impressions, b.impressions)],
                    ['ctr_pct', fmtNum(a.ctr * 100, 2), fmtNum(b.ctr * 100, 2), fmtDelta(a.ctr, b.ctr)],
                    ['avg_pos', a.impressions ? fmtNum(a.position, 1) : '', b.impressions ? fmtNum(b.position, 1) : '', ''],
                ],
            });
            if (noQueries) ctx.warn('top queries and competing pages are hidden: search queries are not shared with this connection');
            else gscSections.push({ title: 'top_queries', columns: ['query', 'clicks', 'impressions', 'ctr_pct', 'position'], rows: queries.map((r) => [ctx.san.text(r.keys?.[0], 120), fmtInt(r.clicks), fmtInt(r.impressions), fmtNum(r.ctr * 100, 2), fmtNum(r.position, 1)]) });
            gscSections.push({ title: 'devices', columns: ['device', 'clicks', 'impressions', 'ctr_pct', 'position'], rows: devices.map((r) => [ctx.san.text(r.keys?.[0], 20), fmtInt(r.clicks), fmtInt(r.impressions), fmtNum(r.ctr * 100, 2), fmtNum(r.position, 1)]) });
            if (!noQueries && queries.length) {
                const qs = queries.slice(0, 10).map((r) => r.keys?.[0] ?? '').filter(Boolean);
                const qp = await g.gscQuery(siteUrl, gscBody(period, {
                    dimensions: ['query', 'page'], rowLimit: 1000,
                    dimensionFilterGroups: [{ groupType: 'and', filters: [{ dimension: 'query', operator: 'includingRegex', expression: `^(${qs.map(re2Escape).join('|')})$` }] }],
                }));
                const own = new RegExp(pageRe, 'i');
                const byQuery = new Map<string, GscRow[]>();
                for (const r of qp.rows || []) {
                    const q = r.keys?.[0] ?? '';
                    if (!byQuery.has(q)) byQuery.set(q, []);
                    byQuery.get(q)!.push(r);
                }
                const comp: Cell[][] = [];
                for (const [q, list] of byQuery) {
                    const total = list.reduce((s, r) => s + r.impressions, 0);
                    for (const r of list) {
                        const url = r.keys?.[1] ?? '';
                        if (own.test(url) || !total || r.impressions / total < 0.15) continue;
                        comp.push([ctx.san.text(q, 120), itemLabel(ctx, 'page', url, site.host), fmtNum((r.impressions / total) * 100, 0), fmtNum(r.position, 1)]);
                    }
                }
                gscSections.push({ title: 'competing_pages', columns: ['query', 'other_page', 'impression_share_pct', 'position'], rows: comp.slice(0, 15) });
            }
        })() : Promise.resolve();

        const results = await Promise.allSettled([gaJob, gscJob]);
        const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
        if (errors.length === results.filter((_, i) => (i === 0 ? site.ga4 : site.gsc)).length) throw errors[0];
        for (const e of errors) ctx.warn(`one source failed: ${e instanceof ToolError ? `${e.code}: ${e.message}` : 'error'}`);
        header.push(headerLine(['page_detail', site.site_id, path, ...desc]));
        const out = render(header, [...gaSections, ...gscSections], [ctx.note()]);
        return { text: out.text, rows: out.rowsReturned, structured: { site: site.site_id, page: path, sources: [site.ga4 ? 'ga4' : null, site.gsc ? 'gsc' : null].filter(Boolean), truncated: out.truncated } };
    },
});

