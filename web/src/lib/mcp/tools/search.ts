import * as z from 'zod';
import { expectedCTR } from '@/lib/alertEngine';
import { siteCoversHost } from '@/lib/sites/pairing';
import { fmtPeriod, previousPeriod, resolvePeriod } from '../dates';
import { ToolError } from '../errors';
import { fmtInt, fmtNum, headerLine, render, renderJson, type Cell, type Section } from '../format';
import type { GscRow } from '../google';
import { brandTokens, requireGsc } from '../siteResolver';
import { dateRangeArg, defineTool, formatArg, J, siteArg, type ToolContext } from '../toolkit';
import { ensureQueriesAllowed, gscBody, mapLimit, takeInspectionQuota, userKeyOf } from './common';

const OPP_TYPES = ['striking_distance', 'low_ctr', 'decaying_pages', 'cannibalization', 'new_queries'] as const;

/** Display a GSC page URL compactly: path for the site's own host, full URL otherwise; never query strings. */
function pageLabel(ctx: ToolContext, url: string, host: string): string {
    try {
        const u = new URL(url);
        const h = u.host.replace(/^www\./, '');
        return ctx.san.path(h === host ? u.pathname : `${h}${u.pathname}`, 160);
    } catch {
        return ctx.san.path(url, 160);
    }
}

function range28(lo: number, hi: number, days: number): string {
    const f = 28 / Math.max(1, days);
    return `${fmtInt(Math.max(0, lo * f))}-${fmtInt(Math.max(0, hi * f))}`;
}

export const seoOpportunities = defineTool({
    name: 'seo_opportunities',
    title: 'SEO opportunities',
    description: 'Find ranked SEO opportunities from Search Console: striking-distance queries (positions 8-20), low-CTR pages and queries, decaying pages, keyword cannibalization and new queries. Each item has current metrics, an estimated extra-clicks range per 28 days (an estimate, not a forecast) and a one-line reason. Use for \'quick wins\' and \'which content should I improve\'.',
    input: z.object({
        site: siteArg,
        types: z.array(z.enum(OPP_TYPES)).min(1).max(5).default(['striking_distance', 'low_ctr', 'decaying_pages']),
        date_range: dateRangeArg.optional(),
        min_impressions: z.number().int().min(10).default(100),
        exclude_branded: z.boolean().default(true).describe('Skip queries containing the site\'s brand tokens (derived from the host).'),
        brand_terms: z.array(z.string().max(60)).max(10).optional().describe('Extra brand words to treat as branded.'),
        limit: z.number().int().min(1).max(25).default(10).describe('Items per type.'),
    }).strict(),
    cost: 8,
    invoking: 'Looking for quick wins…',
    invoked: 'Opportunities found',
    output: { data: 'table', props: { site: J.str, period: J.range, counts: { type: 'object', additionalProperties: J.int }, estimate: J.bool } },
    async run(args, ctx) {
        const site = await ctx.site(args.site);
        const { siteUrl } = requireGsc(site);
        const { period, warnings } = resolvePeriod(args.date_range, { source: 'gsc' });
        warnings.forEach((w) => ctx.warn(w));
        const prev = previousPeriod(period, 'previous_period');
        const g = await ctx.google();
        const noQueries = ctx.principal.excludeQueries;
        const types = Array.from(new Set(args.types));
        if (noQueries) {
            for (const t of ['cannibalization', 'new_queries'] as const) {
                if (types.includes(t)) ctx.warn(`${t} skipped: search queries are not shared with this connection`);
            }
        }
        const active = types.filter((t) => !(noQueries && (t === 'cannibalization' || t === 'new_queries')));
        const itemDim = noQueries ? 'page' : 'query';

        const brand = [...brandTokens(site.host), ...(args.brand_terms || []).map((t) => t.toLowerCase().trim()).filter(Boolean)];
        const isBranded = (q: string) => {
            if (!args.exclude_branded || noQueries) return false;
            const lower = q.toLowerCase();
            const squashed = lower.replace(/[\s.-]+/g, '');
            return brand.some((t) => lower.includes(t) || squashed.includes(t.replace(/[\s.-]+/g, '')));
        };
        const label = (key: string) => (itemDim === 'page' ? pageLabel(ctx, key, site.host) : ctx.san.text(key, 120));

        const need = {
            itemCur: active.some((t) => t === 'striking_distance' || t === 'low_ctr' || t === 'new_queries'),
            queryPrev: active.includes('new_queries'),
            pages: active.includes('decaying_pages'),
            qp: active.includes('cannibalization'),
        };
        const [itemCur, queryPrev, pageCur, pagePrev, qp] = await Promise.all([
            need.itemCur ? g.gscQuery(siteUrl, gscBody(period, { dimensions: [itemDim], rowLimit: 5000 })).then((r) => r.rows || []) : Promise.resolve([] as GscRow[]),
            need.queryPrev ? g.gscQuery(siteUrl, gscBody(prev, { dimensions: ['query'], rowLimit: 5000 })).then((r) => r.rows || []) : Promise.resolve([] as GscRow[]),
            need.pages ? g.gscQuery(siteUrl, gscBody(period, { dimensions: ['page'], rowLimit: 2000 })).then((r) => r.rows || []) : Promise.resolve([] as GscRow[]),
            need.pages ? g.gscQuery(siteUrl, gscBody(prev, { dimensions: ['page'], rowLimit: 2000 })).then((r) => r.rows || []) : Promise.resolve([] as GscRow[]),
            need.qp ? g.gscQuery(siteUrl, gscBody(period, { dimensions: ['query', 'page'], rowLimit: 5000 })).then((r) => r.rows || []) : Promise.resolve([] as GscRow[]),
        ]);

        const columns = ['item', 'clicks', 'impressions', 'ctr_pct', 'avg_pos', 'est_extra_clicks_28d', 'why'];
        const sections: Section[] = [];
        const counts: Record<string, number> = {};
        const days = period.days;
        const minImp = args.min_impressions;

        for (const type of active) {
            let rows: Cell[][] = [];
            if (type === 'striking_distance') {
                const items = itemCur.filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= minImp && !isBranded(r.keys?.[0] ?? ''))
                    .map((r) => ({ r, hi: r.impressions * Math.max(0, expectedCTR(5) / 100 - r.ctr), lo: r.impressions * Math.max(0, expectedCTR(8) / 100 - r.ctr) }))
                    .sort((a, b) => b.hi - a.hi);
                counts[type] = items.length;
                rows = items.slice(0, args.limit).map(({ r, hi, lo }) => [label(r.keys?.[0] ?? ''), fmtInt(r.clicks), fmtInt(r.impressions), fmtNum(r.ctr * 100, 2), fmtNum(r.position, 1), range28(lo, hi, days), `position ${fmtNum(r.position, 1)}: page two or bottom of page one; reaching top 5 adds the high end`]);
            } else if (type === 'low_ctr') {
                const items = itemCur.filter((r) => r.position <= 10 && r.impressions >= 2 * minImp && r.ctr < 0.6 * expectedCTR(r.position) / 100 && !isBranded(r.keys?.[0] ?? ''))
                    .map((r) => {
                        const exp = expectedCTR(r.position) / 100;
                        return { r, exp, hi: r.impressions * (exp - r.ctr), lo: r.impressions * Math.max(0, 0.6 * exp - r.ctr) };
                    })
                    .sort((a, b) => b.hi - a.hi);
                counts[type] = items.length;
                rows = items.slice(0, args.limit).map(({ r, exp, hi, lo }) => [label(r.keys?.[0] ?? ''), fmtInt(r.clicks), fmtInt(r.impressions), fmtNum(r.ctr * 100, 2), fmtNum(r.position, 1), range28(lo, hi, days), `CTR ${fmtNum(r.ctr * 100, 1)}% vs about ${fmtNum(exp * 100, 1)}% typical at this position; improve title and description`]);
            } else if (type === 'decaying_pages') {
                const prevMap = new Map(pagePrev.map((r) => [r.keys?.[0] ?? '', r]));
                const items = pageCur.map((r) => ({ r, p: prevMap.get(r.keys?.[0] ?? '') }))
                    .concat(pagePrev.filter((p) => !pageCur.some((c) => c.keys?.[0] === p.keys?.[0])).map((p) => ({ r: { keys: p.keys, clicks: 0, impressions: 0, ctr: 0, position: 0 }, p })))
                    .filter(({ r, p }) => p && p.clicks >= 30 && r.clicks <= p.clicks * 0.7)
                    .map(({ r, p }) => ({ r, p: p as GscRow, lost: (p as GscRow).clicks - r.clicks }))
                    .sort((a, b) => b.lost - a.lost);
                counts[type] = items.length;
                rows = items.slice(0, args.limit).map(({ r, p, lost }) => [pageLabel(ctx, r.keys?.[0] ?? '', site.host), fmtInt(r.clicks), fmtInt(r.impressions), fmtNum(r.ctr * 100, 2), r.impressions ? fmtNum(r.position, 1) : '', range28(lost * 0.5, lost, days), `clicks ${fmtInt(p.clicks)} → ${fmtInt(r.clicks)}${r.impressions && p.impressions ? `, position ${fmtNum(p.position, 1)} → ${fmtNum(r.position, 1)}` : ''}; refresh the content`]);
            } else if (type === 'cannibalization') {
                const byQuery = new Map<string, GscRow[]>();
                for (const r of qp) {
                    const q = r.keys?.[0] ?? '';
                    if (!byQuery.has(q)) byQuery.set(q, []);
                    byQuery.get(q)!.push(r);
                }
                const items = Array.from(byQuery.entries()).map(([q, list]) => {
                    const impr = list.reduce((a, x) => a + x.impressions, 0);
                    const strong = list.filter((x) => impr > 0 && x.impressions / impr >= 0.15).sort((a, b) => b.impressions - a.impressions);
                    return { q, list, impr, strong };
                }).filter((x) => x.impr >= minImp && x.strong.length >= 2 && !isBranded(x.q)).sort((a, b) => b.impr - a.impr);
                counts[type] = items.length;
                rows = items.slice(0, args.limit).map(({ q, list, impr, strong }) => {
                    const clicks = list.reduce((a, x) => a + x.clicks, 0);
                    const pos = list.reduce((a, x) => a + x.position * x.impressions, 0) / Math.max(1, impr);
                    const pages = strong.slice(0, 3).map((x) => `${pageLabel(ctx, x.keys?.[1] ?? '', site.host)} (${fmtNum((x.impressions / impr) * 100, 0)}%)`).join(', ');
                    return [ctx.san.text(q, 120), fmtInt(clicks), fmtInt(impr), fmtNum(impr ? (clicks / impr) * 100 : 0, 2), fmtNum(pos, 1), '', `${strong.length} pages compete: ${pages}`];
                });
            } else if (type === 'new_queries') {
                const before = new Set(queryPrev.map((r) => r.keys?.[0] ?? ''));
                const items = itemCur.filter((r) => !before.has(r.keys?.[0] ?? '') && r.impressions >= minImp && !isBranded(r.keys?.[0] ?? '')).sort((a, b) => b.impressions - a.impressions);
                counts[type] = items.length;
                rows = items.slice(0, args.limit).map((r) => [ctx.san.text(r.keys?.[0] ?? '', 120), fmtInt(r.clicks), fmtInt(r.impressions), fmtNum(r.ctr * 100, 2), fmtNum(r.position, 1), '', `not seen in ${fmtPeriod(prev)}`]);
            }
            sections.push({ title: type + (noQueries && (type === 'striking_distance' || type === 'low_ctr') ? ' (by page: queries not shared)' : ''), columns, rows });
        }

        const header = [...ctx.banner(), headerLine(['seo_opportunities', site.site_id, `GSC ${fmtPeriod(period)}`, `min_impressions ${minImp}`, args.exclude_branded && !noQueries ? `branded excluded (${brand.slice(0, 5).join(', ')})` : null])];
        const footer = ['# est_extra_clicks_28d is a rough range from typical CTR by position, not a forecast.', ctx.note()];
        const out = render(header, sections, footer);
        return { text: out.text, rows: out.rowsReturned, structured: { site: site.site_id, period: { start: period.start, end: period.end }, counts, estimate: true, table: out.text, truncated: out.truncated } };
    },
});

const GSC_DIMS = ['query', 'page', 'country', 'device', 'date', 'searchAppearance'] as const;

export const gscSearchAnalytics = defineTool({
    name: 'gsc_search_analytics',
    title: 'Search Console query',
    description: 'Query Google Search Console search performance with custom dimensions (query, page, country, device, date, searchAppearance), filters, search type and sorting. Returns clicks, impressions, CTR (%) and average position. Data lags about two days and the API returns top rows, not all rows. Use for Search Console questions the higher-level tools do not cover.',
    input: z.object({
        site: siteArg,
        date_range: dateRangeArg.optional(),
        dimensions: z.array(z.enum(GSC_DIMS)).max(4).default(['query']),
        search_type: z.enum(['web', 'image', 'video', 'news', 'googleNews', 'discover']).default('web'),
        filters: z.array(z.object({
            dimension: z.enum(['query', 'page', 'country', 'device', 'searchAppearance']),
            operator: z.enum(['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex']).default('equals'),
            expression: z.string().min(1).max(500).describe('Value; for country use an ISO 3166-1 alpha-3 code such as USA or GBR (case is normalised); device is DESKTOP, MOBILE or TABLET; regex is RE2.'),
        }).strict()).max(8).optional().describe('All filters are ANDed.'),
        sort_by: z.enum(['clicks', 'impressions', 'ctr', 'position']).default('clicks').describe('The API sorts by clicks; other orders are applied to the top 5,000 rows.'),
        min_impressions: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(200).default(25),
        offset: z.number().int().min(0).max(50000).default(0),
        fresh: z.boolean().default(false).describe('Include the latest incomplete days (dataState all). Default only finalised data.'),
        format: formatArg,
    }).strict(),
    cost: 2,
    invoking: 'Querying Search Console…',
    invoked: 'Search Console answered',
    output: { data: 'format', props: { site: J.str, period: J.range, search_type: J.str, rows_returned: J.int, next_offset: J.orNull(J.int), data_through: J.str } },
    async run(args, ctx) {
        const site = await ctx.site(args.site);
        const { siteUrl } = requireGsc(site);
        if (args.dimensions.includes('query') || args.filters?.some((f) => f.dimension === 'query')) ensureQueriesAllowed(ctx.principal.excludeQueries, 'This report');
        const dims = Array.from(new Set(args.dimensions));
        const { period, warnings } = resolvePeriod(args.date_range, { source: 'gsc', fresh: args.fresh });
        warnings.forEach((w) => ctx.warn(w));
        const filters = (args.filters || []).map((f) => ({
            dimension: f.dimension,
            operator: f.operator,
            expression: f.dimension === 'country' ? f.expression.toLowerCase() : f.dimension === 'device' ? f.expression.toUpperCase() : f.expression,
        }));
        const clientSort = args.sort_by !== 'clicks' || args.min_impressions > 0;
        const body = gscBody(period, {
            dimensions: dims,
            type: args.search_type,
            dataState: args.fresh ? 'all' : 'final',
            rowLimit: clientSort ? 5000 : args.limit,
            startRow: clientSort ? 0 : args.offset,
            ...(filters.length ? { dimensionFilterGroups: [{ groupType: 'and', filters }] } : {}),
        });
        const g = await ctx.google();
        const res = await g.gscQuery(siteUrl, body);
        let rows = res.rows || [];
        if (args.min_impressions > 0) rows = rows.filter((r) => r.impressions >= args.min_impressions);
        if (clientSort) {
            const key = args.sort_by;
            rows = [...rows].sort((a, b) => (key === 'position' ? a.position - b.position : (b[key] as number) - (a[key] as number)));
            rows = rows.slice(args.offset, args.offset + args.limit);
        }
        const more = clientSort ? (res.rows?.length ?? 0) > args.offset + args.limit : (res.rows?.length ?? 0) === args.limit;
        const cell = (dim: string, v: string) => (dim === 'page' ? ctx.san.path(v, 200) : dim === 'query' ? ctx.san.text(v, 160) : ctx.san.text(v, 60));
        const tableRows: Cell[][] = rows.map((r) => [...dims.map((d, i) => cell(d, r.keys?.[i] ?? '')), fmtInt(r.clicks), fmtInt(r.impressions), fmtNum(r.ctr * 100, 2), fmtNum(r.position, 1)]);
        const columns = [...dims, 'clicks', 'impressions', 'ctr_pct', 'position'];
        const envelope = { site: site.site_id, period: { start: period.start, end: period.end }, search_type: args.search_type, rows_returned: tableRows.length, next_offset: more ? args.offset + tableRows.length : null, data_through: period.end };
        if (args.format === 'json') {
            const j = renderJson([{ columns, rows: tableRows }], envelope);
            return { text: j.text, rows: j.rowsReturned, structured: { ...envelope, ...j.data, truncated: j.truncated } };
        }
        const header = [...ctx.banner(), headerLine(['gsc_search_analytics', site.site_id, siteUrl, `${fmtPeriod(period)}${args.fresh ? ' (includes incomplete days)' : ''}`, `type ${args.search_type}`, `sorted by ${args.sort_by}`])];
        const footer = [
            more ? `# more rows: call again with offset ${args.offset + tableRows.length}` : '',
            dims.includes('date') ? '# days without data are absent' : '',
            dims.includes('query') ? '# anonymised queries are omitted by Google, so query totals can be below site totals' : '',
            clientSort ? '# sorted client-side over the top 5,000 rows' : '',
            tableRows.length && (dims.includes('query') || dims.includes('page')) ? ctx.note() : '',
        ];
        const out = render(header, [{ columns, rows: tableRows }], footer);
        return { text: out.text, rows: out.rowsReturned, structured: { ...envelope, table: out.text, truncated: out.truncated } };
    },
});

export const gscInspectUrl = defineTool({
    name: 'gsc_inspect_url',
    title: 'Inspect URLs in Google',
    description: 'Check how Google sees specific URLs of a verified site using the URL Inspection API: indexing verdict and coverage state, last crawl, Google\'s chosen canonical versus the declared one, robots.txt state, mobile usability and rich results. Up to 5 URLs per call. URL Inspection has a daily quota per site, so use it sparingly.',
    input: z.object({
        site: siteArg,
        urls: z.array(z.string().min(1).max(2000)).min(1).max(5).describe('Full URLs that belong to the site\'s Search Console property.'),
        language: z.string().max(20).default('en-US'),
    }).strict(),
    cost: (a) => 3 * a.urls.length,
    invoking: 'Inspecting URLs…',
    invoked: 'URLs inspected',
    output: { data: 'table', props: { site: J.str, inspected: J.int } },
    async run(args, ctx) {
        const site = await ctx.site(args.site);
        const { siteUrl } = requireGsc(site);
        const urls = Array.from(new Set(args.urls.map((u) => u.trim())));
        for (const u of urls) {
            let parsed: URL;
            try {
                parsed = new URL(u);
            } catch {
                throw new ToolError('invalid_argument', `"${u.slice(0, 80)}" is not a full URL (include https://)`);
            }
            const ok = siteUrl.startsWith('sc-domain:') ? siteCoversHost(siteUrl, parsed.host) : u.startsWith(siteUrl);
            if (!ok || !/^https?:$/.test(parsed.protocol)) throw new ToolError('invalid_argument', `${u.slice(0, 120)} is not part of ${siteUrl}`);
        }
        const quota = takeInspectionQuota(userKeyOf(ctx.principal), urls.length);
        if (!quota.ok) throw new ToolError('quota_exhausted', 'URL Inspection budget used up (100 a day, 20 an hour per user)', undefined, quota.retryAfterS);
        const g = await ctx.google();
        const results = await mapLimit(urls, 2, async (url) => {
            try {
                const r = await g.gscInspect(siteUrl, url, args.language);
                return { url, r: (r.inspectionResult ?? {}) as Record<string, Record<string, unknown> | undefined> };
            } catch (err) {
                if (err instanceof ToolError && (err.code === 'google_reauth_required' || err.code === 'quota_exhausted')) throw err;
                return { url, error: err instanceof ToolError ? err.message : 'inspection failed' };
            }
        });
        const s = (v: unknown, max = 80) => ctx.san.text(v === undefined || v === null ? '' : String(v), max);
        const rows: Cell[][] = results.map((x) => {
            if ('error' in x) return [ctx.san.path(x.url, 200), 'ERROR', s(x.error, 160), '', '', '', '', '', '', '', '', ''];
            const idx = x.r.indexStatusResult ?? {};
            const mob = x.r.mobileUsabilityResult ?? {};
            const rich = x.r.richResultsResult ?? {};
            const richTypes = Array.isArray(rich.detectedItems) ? (rich.detectedItems as { richResultType?: string }[]).map((d) => d.richResultType).filter(Boolean).join(',') : '';
            return [
                ctx.san.path(x.url, 200), s(idx.verdict), s(idx.coverageState), s(idx.indexingState), s(idx.robotsTxtState), s(idx.pageFetchState),
                s(idx.lastCrawlTime, 30), s(idx.crawledAs, 20), ctx.san.path(idx.googleCanonical, 200), ctx.san.path(idx.userCanonical, 200),
                s(mob.verdict, 30), `${s(rich.verdict, 30)}${richTypes ? ` (${s(richTypes, 80)})` : ''}`,
            ];
        });
        const header = [...ctx.banner(), headerLine(['gsc_inspect_url', site.site_id, siteUrl, `${urls.length} URL(s)`])];
        const out = render(header, [{ columns: ['url', 'verdict', 'coverage_state', 'indexing_state', 'robots_txt_state', 'page_fetch_state', 'last_crawl', 'crawled_as', 'google_canonical', 'user_canonical', 'mobile_usability', 'rich_results'], rows }], [ctx.note()]);
        return { text: out.text, rows: out.rowsReturned, structured: { site: site.site_id, inspected: urls.length, table: out.text, truncated: out.truncated } };
    },
});
