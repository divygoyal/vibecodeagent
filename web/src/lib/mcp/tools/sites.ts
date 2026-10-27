import * as z from 'zod';
import { previousPeriod, resolvePeriod, type Period } from '../dates';
import { ToolError } from '../errors';
import { deltaPct, fmtDelta, fmtInt, fmtNum, headerLine, render, renderJson, type Cell } from '../format';
import { resolveSite, type SiteRecord } from '../siteResolver';
import { dateRangeArg, defineTool, formatArg } from '../toolkit';
import { ga4Totals, gscTotals, mapLimit, type GscTotals } from './common';

export const listSites = defineTool({
    name: 'list_sites',
    title: 'List sites',
    description: 'List every website the user can query: Google Analytics 4 properties and Search Console sites, paired by host. Call this first to get site_id values for the other tools. Returns site_id, GA4 property, Search Console property and which side is connected. Does not return traffic numbers (use portfolio_summary).',
    input: z.object({
        query: z.string().max(100).optional().describe('Optional case-insensitive substring filter on site_id.'),
        include_unpaired: z.boolean().default(true).describe('Include sites that exist only in GA4 or only in Search Console.'),
        refresh: z.boolean().default(false).describe('Re-read the property and site lists from Google instead of using the 10-minute cache.'),
    }).strict(),
    cost: 1,
    invoking: 'Listing your sites…',
    invoked: 'Sites listed',
    async run(args, ctx) {
        const catalog = await ctx.catalog({ refresh: args.refresh });
        if (catalog.errors.ga4) ctx.warn(`GA4 properties could not be listed (${catalog.errors.ga4.status}): ${ctx.san.text(catalog.errors.ga4.message, 160, { pii: false })}`);
        if (catalog.errors.gsc) ctx.warn(`Search Console sites could not be listed (${catalog.errors.gsc.status}): ${ctx.san.text(catalog.errors.gsc.message, 160, { pii: false })}`);
        let sites = catalog.sites;
        const counts = {
            total: sites.length,
            paired: sites.filter((s) => s.ga4 && s.gsc).length,
            ga4_only: sites.filter((s) => s.ga4 && !s.gsc).length,
            gsc_only: sites.filter((s) => !s.ga4 && s.gsc).length,
        };
        if (!args.include_unpaired) sites = sites.filter((s) => s.ga4 && s.gsc);
        if (args.query) {
            const q = args.query.toLowerCase();
            sites = sites.filter((s) => s.site_id.includes(q) || (s.ga4?.displayName.toLowerCase().includes(q) ?? false));
        }
        const capped = sites.slice(0, 200);
        const rows: Cell[][] = capped.map((s) => [
            s.site_id,
            s.ga4?.property ?? '',
            s.ga4 ? ctx.san.text(s.ga4.displayName, 80) : '',
            s.gsc?.siteUrl ?? '',
            s.gsc?.permissionLevel ?? '',
            s.paired_by,
        ]);
        const header = [
            ...ctx.banner(),
            headerLine([
                'list_sites',
                `${counts.total} sites (${counts.paired} paired, ${counts.ga4_only} ga4_only, ${counts.gsc_only} gsc_only)`,
                catalog.filtered ? `this connection can read ${catalog.sites.length} of the user's ${catalog.totalBeforeFilter} sites` : null,
            ]),
        ];
        const out = render(header, [{ columns: ['site_id', 'ga4_property', 'ga4_name', 'gsc_property', 'gsc_permission', 'paired_by'], rows }],
            [sites.length > capped.length ? `# showing ${capped.length} of ${sites.length}; pass query to narrow` : '', rows.length ? ctx.note() : '']);
        return { text: out.text, rows: out.rowsReturned };
    },
});

const SORTS = ['gsc_clicks', 'gsc_clicks_delta_pct', 'ga4_sessions', 'ga4_sessions_delta_pct', 'gsc_impressions', 'avg_position'] as const;

interface SiteSummary {
    site: SiteRecord;
    ga4?: { cur: number[]; prev: number[] | null } | null;
    gsc?: { cur: GscTotals; prev: GscTotals | null } | null;
    failed: string[];
}

const GA4_METRICS = ['sessions', 'engagementRate', 'keyEvents', 'activeUsers'];

export const portfolioSummary = defineTool({
    name: 'portfolio_summary',
    title: 'Portfolio summary',
    description: 'Compare all of the user\'s sites, or a chosen subset, in one table: GA4 sessions, engagement and key events plus Search Console clicks, impressions, CTR and position, each with the change versus the previous period, and flags for notable drops. Use for overviews, \'how are my sites doing\' and to find which site needs attention. For one site in detail use site_health, top_movers or the gsc_ and ga4_ tools.',
    input: z.object({
        site_ids: z.array(z.string().max(300)).max(50).optional().describe('Subset of site ids. Default: all sites, up to limit.'),
        date_range: dateRangeArg.optional(),
        compare_to: z.enum(['previous_period', 'previous_year', 'none']).default('previous_period'),
        sort_by: z.enum(SORTS).default('gsc_clicks'),
        limit: z.number().int().min(1).max(100).default(25),
        format: formatArg,
    }).strict(),
    cost: (a) => 4 + 0.5 * Math.min(a.site_ids?.length ?? 50, 100),
    invoking: 'Checking your sites…',
    invoked: 'Portfolio checked',
    async run(args, ctx) {
        const catalog = await ctx.catalog();
        let targets: SiteRecord[];
        if (args.site_ids?.length) {
            targets = Array.from(new Map(args.site_ids.map((id) => {
                const s = resolveSite(catalog, id);
                return [s.site_id, s] as const;
            })).values());
        } else {
            targets = catalog.sites;
        }
        const totalSites = targets.length;
        if (targets.length > 100) {
            ctx.warn(`only the first 100 of ${targets.length} sites were compared; pass site_ids for others`);
            targets = targets.slice(0, 100);
        }
        const ga = resolvePeriod(args.date_range, { source: 'ga4' });
        const gs = resolvePeriod(args.date_range, { source: 'gsc' });
        [...ga.warnings, ...gs.warnings].forEach((w) => ctx.warn(w));
        const gaPrev: Period | null = args.compare_to === 'none' ? null : previousPeriod(ga.period, args.compare_to);
        const gsPrev: Period | null = args.compare_to === 'none' ? null : previousPeriod(gs.period, args.compare_to);

        const g = await ctx.google();
        const results: (SiteSummary | null)[] = new Array(targets.length).fill(null);
        const work = mapLimit(targets, 5, async (site, i) => {
            const summary: SiteSummary = { site, failed: [] };
            const jobs: Promise<void>[] = [];
            if (site.ga4) {
                jobs.push(ga4Totals(g, site.ga4.property, ga.period, gaPrev, GA4_METRICS)
                    .then((r) => { summary.ga4 = { cur: r.cur, prev: r.prev }; })
                    .catch((err) => { summary.ga4 = null; summary.failed.push(`ga4: ${err instanceof ToolError ? err.code : 'error'}`); }));
            }
            if (site.gsc) {
                const siteUrl = site.gsc.siteUrl;
                jobs.push(Promise.all([gscTotals(g, siteUrl, gs.period), gsPrev ? gscTotals(g, siteUrl, gsPrev) : Promise.resolve(null)])
                    .then(([cur, prev]) => { summary.gsc = { cur, prev }; })
                    .catch((err) => { summary.gsc = null; summary.failed.push(`gsc: ${err instanceof ToolError ? err.code : 'error'}`); }));
            }
            await Promise.all(jobs);
            results[i] = summary;
        });
        let deadlineHit = false;
        await Promise.race([work, new Promise<void>((r) => setTimeout(() => { deadlineHit = true; r(); }, 25_000))]);

        const incomplete: string[] = [];
        const rowsData = targets.map((site, i) => {
            const r = results[i];
            if (!r) incomplete.push(site.site_id);
            else if (r.failed.length) incomplete.push(site.site_id);
            return r ?? { site, failed: ['deadline'] };
        });
        if (deadlineHit) ctx.warn('some sites did not answer within 25 s; they are listed in incomplete_sites');

        const metric = (r: SiteSummary) => {
            const s = r.ga4?.cur[0];
            const c = r.gsc?.cur.clicks;
            switch (args.sort_by) {
                case 'ga4_sessions': return s ?? -1;
                case 'ga4_sessions_delta_pct': return r.ga4?.prev ? deltaPct(r.ga4.cur[0], r.ga4.prev[0]) ?? -1e9 : -1e9;
                case 'gsc_impressions': return r.gsc?.cur.impressions ?? -1;
                case 'gsc_clicks_delta_pct': return r.gsc?.prev ? deltaPct(r.gsc.cur.clicks, r.gsc.prev.clicks) ?? -1e9 : -1e9;
                case 'avg_position': return r.gsc?.cur.impressions ? -r.gsc.cur.position : -1e9;
                default: return c ?? -1;
            }
        };
        rowsData.sort((a, b) => metric(b) - metric(a) || a.site.site_id.localeCompare(b.site.site_id));

        const flagsFor = (r: SiteSummary): string => {
            const f: string[] = [];
            if (!r.site.ga4) f.push('no_ga4');
            if (!r.site.gsc) f.push('no_gsc');
            if (r.gsc?.prev && r.gsc.prev.clicks >= 100) {
                const d = deltaPct(r.gsc.cur.clicks, r.gsc.prev.clicks);
                if (d !== null && d <= -20) f.push(`clicks_down_${Math.round(-d)}pct`);
            }
            if (r.ga4?.prev && r.ga4.prev[0] >= 100) {
                const d = deltaPct(r.ga4.cur[0], r.ga4.prev[0]);
                if (d !== null && d <= -20) f.push(`sessions_down_${Math.round(-d)}pct`);
            }
            if (r.ga4 && r.ga4.cur[0] > 500 && r.ga4.cur[2] === 0) f.push('no_ga4_keyevents');
            if ((r.ga4 && r.ga4.cur[0] === 0 && (r.ga4.prev?.[0] ?? 0) > 100) || (r.gsc && r.gsc.cur.impressions === 0 && (r.gsc.prev?.impressions ?? 0) > 100)) f.push('data_stale');
            if (r.failed.length) f.push(...r.failed.map((x) => `failed_${x.split(':')[0]}`));
            return f.join(',');
        };

        const shown = rowsData.slice(0, args.limit);
        const rows: Cell[][] = shown.map((r) => [
            r.site.site_id,
            r.ga4 ? fmtInt(r.ga4.cur[0]) : '',
            r.ga4?.prev ? fmtDelta(r.ga4.cur[0], r.ga4.prev[0]) : '',
            r.ga4 ? fmtNum(r.ga4.cur[1] * 100, 1) : '',
            r.ga4 ? fmtInt(r.ga4.cur[2]) : '',
            r.gsc ? fmtInt(r.gsc.cur.clicks) : '',
            r.gsc?.prev ? fmtDelta(r.gsc.cur.clicks, r.gsc.prev.clicks) : '',
            r.gsc ? fmtInt(r.gsc.cur.impressions) : '',
            r.gsc ? fmtNum(r.gsc.cur.ctr * 100, 1) : '',
            r.gsc && r.gsc.cur.impressions ? fmtNum(r.gsc.cur.position, 1) : '',
            flagsFor(r),
        ]);

        // Totals over every compared site (not only the rows shown).
        let sess = 0, sessPrev = 0, keyEv = 0, clicks = 0, clicksPrev = 0, impr = 0, posW = 0;
        for (const r of rowsData) {
            if (r.ga4) { sess += r.ga4.cur[0]; sessPrev += r.ga4.prev?.[0] ?? 0; keyEv += r.ga4.cur[2]; }
            if (r.gsc) { clicks += r.gsc.cur.clicks; clicksPrev += r.gsc.prev?.clicks ?? 0; impr += r.gsc.cur.impressions; posW += r.gsc.cur.position * r.gsc.cur.impressions; }
        }
        rows.push(['TOTAL', fmtInt(sess), gaPrev ? fmtDelta(sess, sessPrev) : '', '', fmtInt(keyEv), fmtInt(clicks), gsPrev ? fmtDelta(clicks, clicksPrev) : '', fmtInt(impr), impr ? fmtNum((clicks / impr) * 100, 1) : '', impr ? fmtNum(posW / impr, 1) : '', '']);

        const columns = ['site', 'ga4_sessions', 'ga4_vs_prev', 'eng_rate_pct', 'key_events', 'gsc_clicks', 'gsc_vs_prev', 'gsc_impr', 'ctr_pct', 'avg_pos', 'flags'];
        const envelope = {
            period: { ga4: { start: ga.period.start, end: ga.period.end }, gsc: { start: gs.period.start, end: gs.period.end } },
            compare: gaPrev && gsPrev ? { ga4: { start: gaPrev.start, end: gaPrev.end }, gsc: { start: gsPrev.start, end: gsPrev.end } } : null,
            sites_returned: shown.length,
            sites_total: totalSites,
            data_through: { ga4: ga.period.end, gsc: gs.period.end },
            incomplete_sites: incomplete,
        };
        if (args.format === 'json') {
            const j = renderJson([{ columns, rows }], envelope);
            return { text: j.text, rows: j.rowsReturned };
        }
        const header = [...ctx.banner(), headerLine([
            'portfolio_summary',
            `GA4 ${ga.period.start}..${ga.period.end}${gaPrev ? ` vs ${gaPrev.start}..${gaPrev.end}` : ''}`,
            `GSC ${gs.period.start}..${gs.period.end}${gsPrev ? ` vs ${gsPrev.start}..${gsPrev.end}` : ''}`,
            `${shown.length} of ${totalSites} sites`,
            `sorted by ${args.sort_by}`,
        ])];
        const footer = [
            incomplete.length ? `# incomplete_sites: ${incomplete.join(', ')} (blank cells are missing data, not zero)` : '',
            rowsData.length > shown.length ? `# ${rowsData.length - shown.length} more sites not shown; raise limit or pass site_ids` : '',
            '# TOTAL sums sessions, key events, clicks and impressions across all compared sites; CTR and position are impression-weighted.',
        ];
        const out = render(header, [{ columns, rows }], footer);
        return { text: out.text, rows: out.rowsReturned };
    },
});
