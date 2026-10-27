import * as z from 'zod';
import { isoFromDay, latestCompleteDay, type Period } from '../dates';
import { ToolError } from '../errors';
import { deltaPct, fmtInt, fmtNum, headerLine, render, type Cell } from '../format';
import { gaRows, type GoogleClient } from '../google';
import type { SiteRecord } from '../siteResolver';
import { defineTool, type ToolContext } from '../toolkit';
import { gaDate, gscBody, mapLimit, takeInspectionQuota, userKeyOf } from './common';

type Severity = 'high' | 'medium' | 'low';
type Area = 'tracking' | 'indexing' | 'search_performance' | 'traffic';

interface Finding {
    site: string;
    check: string;
    severity: Severity;
    area: Area;
    finding: string;
    evidence: string;
    action: string;
    confidence: 'high' | 'medium' | 'low';
    /** Estimated clicks or sessions at stake per day, for ranking. */
    stake: number;
}

const WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

const CHECK_AREAS: Record<string, Area[]> = {
    ga4_zero_days: ['tracking', 'traffic'],
    ga4_sudden_drop: ['traffic'],
    ga4_no_key_events: ['tracking'],
    ga4_not_set_share: ['tracking'],
    ga4_gsc_mismatch: ['tracking'],
    gsc_clicks_drop: ['search_performance', 'traffic'],
    gsc_impr_up_ctr_down: ['search_performance'],
    gsc_position_regression: ['search_performance'],
    gsc_sitemap_issues: ['indexing'],
    gsc_homepage_index: ['indexing'],
    unpaired_site: ['tracking'],
    data_stale: ['traffic', 'tracking'],
};

function mean(xs: number[]): number {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

interface SiteData {
    gaDaily?: Map<string, { sessions: number; keyEvents: number }>;
    gaDays?: string[];
    gscDaily?: Map<string, { clicks: number; impressions: number; posW: number }>;
    gscDays?: string[];
    channels?: Map<string, number>;
    landing?: { notSet: number; total: number };
    sitemaps?: { path?: string; errors: number; warnings: number; lastDownloaded?: string }[];
    homepage?: { url: string; verdict: string; coverage: string };
}

function dayList(endDay: number, n: number): string[] {
    return Array.from({ length: n }, (_, i) => isoFromDay(endDay - n + 1 + i));
}

async function loadSiteData(g: GoogleClient, ctx: ToolContext, site: SiteRecord, deep: boolean, wanted: Set<string>, skipped: Map<string, string>): Promise<SiteData> {
    const d: SiteData = {};
    const jobs: Promise<void>[] = [];
    const gaEnd = latestCompleteDay('ga4');
    const gscEnd = latestCompleteDay('gsc');
    if (site.ga4) {
        const property = site.ga4.property;
        const days = dayList(gaEnd, 42);
        const p: Period = { start: days[0], end: days[days.length - 1], days: 42 };
        jobs.push(g.ga4Report(property, { dateRanges: [{ startDate: p.start, endDate: p.end }], dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }, { name: 'keyEvents' }], limit: 100 })
            .then((r) => {
                d.gaDays = days;
                d.gaDaily = new Map(days.map((day) => [day, { sessions: 0, keyEvents: 0 }]));
                for (const row of gaRows(r)) d.gaDaily.set(gaDate(row.dims[0]), { sessions: row.mets[0], keyEvents: row.mets[1] });
            }).catch((e) => { skipped.set('ga4_daily', e instanceof ToolError ? e.code : 'error'); }));
        const p28 = { startDate: isoFromDay(gaEnd - 27), endDate: isoFromDay(gaEnd) };
        if (deep && (wanted.has('ga4_gsc_mismatch'))) {
            jobs.push(g.ga4Report(property, { dateRanges: [p28], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], limit: 50 })
                .then((r) => { d.channels = new Map(gaRows(r).map((row) => [row.dims[0], row.mets[0]])); })
                .catch(() => { skipped.set('ga4_gsc_mismatch', 'ga4_error'); }));
        }
        if (deep && wanted.has('ga4_not_set_share')) {
            jobs.push(g.ga4Report(property, { dateRanges: [p28], dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }], limit: 25, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], metricAggregations: ['TOTAL'] })
                .then((r) => {
                    const rows = gaRows(r);
                    const total = Number(r.totals?.[0]?.metricValues?.[0]?.value ?? rows.reduce((a, x) => a + x.mets[0], 0));
                    const notSet = rows.filter((x) => x.dims[0] === '(not set)' || x.dims[0] === '').reduce((a, x) => a + x.mets[0], 0);
                    d.landing = { notSet, total };
                }).catch(() => { skipped.set('ga4_not_set_share', 'ga4_error'); }));
        }
    }
    if (site.gsc) {
        const siteUrl = site.gsc.siteUrl;
        const days = dayList(gscEnd, 56);
        jobs.push(g.gscQuery(siteUrl, gscBody({ start: days[0], end: days[days.length - 1], days: 56 }, { dimensions: ['date'], rowLimit: 100 }))
            .then((r) => {
                d.gscDays = days;
                d.gscDaily = new Map(days.map((day) => [day, { clicks: 0, impressions: 0, posW: 0 }]));
                for (const row of r.rows || []) d.gscDaily.set(row.keys?.[0] ?? '', { clicks: row.clicks, impressions: row.impressions, posW: row.position * row.impressions });
            }).catch((e) => { skipped.set('gsc_daily', e instanceof ToolError ? e.code : 'error'); }));
        if (deep && wanted.has('gsc_sitemap_issues')) {
            jobs.push(g.gscSitemaps(siteUrl).then((r) => {
                d.sitemaps = (r.sitemap || []).map((s) => ({ path: s.path, errors: Number(s.errors ?? 0), warnings: Number(s.warnings ?? 0), lastDownloaded: s.lastDownloaded }));
            }).catch((e) => { skipped.set('gsc_sitemap_issues', e instanceof ToolError ? e.code : 'error'); }));
        }
        if (deep && wanted.has('gsc_homepage_index')) {
            const host = site.ga4?.streamUris[0] ? new URL(site.ga4.streamUris[0]).origin : `https://${site.host}`;
            const url = siteUrl.startsWith('sc-domain:') ? `${host}/` : siteUrl;
            const q = takeInspectionQuota(userKeyOf(ctx.principal), 1);
            if (!q.ok) skipped.set('gsc_homepage_index', 'inspection_quota');
            else {
                jobs.push(g.gscInspect(siteUrl, url, 'en-US').then((r) => {
                    const idx = (r.inspectionResult?.indexStatusResult ?? {}) as Record<string, string>;
                    d.homepage = { url, verdict: idx.verdict ?? 'UNKNOWN', coverage: idx.coverageState ?? '' };
                }).catch((e) => { skipped.set('gsc_homepage_index', e instanceof ToolError ? e.code : 'error'); }));
            }
        }
    }
    await Promise.all(jobs);
    return d;
}

function runChecks(site: SiteRecord, d: SiteData, wanted: Set<string>, ctx: ToolContext): Finding[] {
    const out: Finding[] = [];
    const add = (f: Omit<Finding, 'site'>) => { if (wanted.has(f.check)) out.push({ site: site.site_id, ...f }); };

    if (!site.ga4 || !site.gsc) {
        add({ check: 'unpaired_site', severity: 'low', area: 'tracking', finding: site.ga4 ? 'No Search Console site paired' : 'No GA4 property paired', evidence: site.ga4 ? `GA4 ${site.ga4.property} has no Search Console site for ${site.host}` : `Search Console ${site.gsc?.siteUrl} has no GA4 property with a web stream on ${site.host}`, action: site.ga4 ? `Verify ${site.host} in Search Console (a Domain property covers all subdomains)` : `Add a GA4 web data stream for ${site.host}, or pair it manually in TrafficClaw`, confidence: 'high', stake: 0.5 });
    }

    if (d.gaDaily && d.gaDays) {
        const s = d.gaDays.map((day) => d.gaDaily!.get(day)!.sessions);
        const last7 = d.gaDays.slice(-7);
        const base28 = mean(s.slice(-35, -7));
        const zero = last7.filter((day) => d.gaDaily!.get(day)!.sessions === 0);
        if (zero.length && base28 > 20) {
            add({ check: 'ga4_zero_days', severity: 'high', area: 'tracking', finding: `${zero.length} day(s) with zero GA4 sessions in the last week`, evidence: `${zero.slice(0, 3).join(', ')}: 0 sessions; previous 4-week mean ${fmtInt(base28)}/day`, action: 'Check that the GA4 tag (gtag or GTM) still fires on every page; look for a recent deploy, consent banner change or blocked script', confidence: 'high', stake: base28 * zero.length });
        }
        const last3 = mean(s.slice(-3));
        const prior14 = mean(s.slice(-17, -3));
        if (prior14 >= 20 && last3 < prior14 * 0.5 && !zero.length) {
            add({ check: 'ga4_sudden_drop', severity: 'high', area: 'traffic', finding: 'GA4 sessions fell by more than half in the last 3 days', evidence: `last 3 days ${fmtInt(last3)}/day vs ${fmtInt(prior14)}/day in the 14 days before`, action: 'Compare channels with top_movers (source ga4, dimension channel) to see which source dropped; check tracking and recent releases', confidence: 'medium', stake: prior14 - last3 });
        }
        const sess28 = s.slice(-28).reduce((a, b) => a + b, 0);
        const key28 = d.gaDays.slice(-28).reduce((a, day) => a + d.gaDaily!.get(day)!.keyEvents, 0);
        if (sess28 > 500 && key28 === 0) {
            add({ check: 'ga4_no_key_events', severity: 'medium', area: 'tracking', finding: 'No GA4 key events recorded in 28 days', evidence: `${fmtInt(sess28)} sessions and 0 key events`, action: 'Mark the events that matter (sign_up, purchase, generate_lead) as key events in GA4 Admin > Events', confidence: 'high', stake: (sess28 / 28) * 0.05 });
        }
        const lastTwo = s.slice(-2);
        if (lastTwo.every((x) => x === 0) && base28 > 20 && !zero.length) {
            add({ check: 'data_stale', severity: 'medium', area: 'traffic', finding: 'GA4 shows no data for the last 2 days', evidence: `0 sessions on ${d.gaDays.slice(-2).join(', ')}`, action: 'Check the GA4 tag; data can also lag a day', confidence: 'medium', stake: base28 });
        }
    }

    if (d.landing && d.landing.total > 200) {
        const share = d.landing.notSet / d.landing.total;
        if (share > 0.3) {
            add({ check: 'ga4_not_set_share', severity: 'medium', area: 'tracking', finding: `${fmtNum(share * 100, 0)}% of sessions have landing page "(not set)"`, evidence: `${fmtInt(d.landing.notSet)} of ${fmtInt(d.landing.total)} sessions in 28 days`, action: 'Usually sessions without a page_view (consent mode, server-side events or a missing page_view on load); make sure page_view fires first', confidence: 'medium', stake: (d.landing.notSet / 28) * 0.1 });
        }
    }

    type Agg = { clicks: number; impressions: number; posW: number };
    let gscCur: Agg | null = null;
    if (d.gscDaily && d.gscDays) {
        const sum = (days: string[]) => days.reduce((a, day) => {
            const v = d.gscDaily!.get(day)!;
            return { clicks: a.clicks + v.clicks, impressions: a.impressions + v.impressions, posW: a.posW + v.posW };
        }, { clicks: 0, impressions: 0, posW: 0 });
        gscCur = sum(d.gscDays.slice(-28));
        const gscPrev: Agg = sum(d.gscDays.slice(0, 28));
        const dClicks = deltaPct(gscCur.clicks, gscPrev.clicks);
        if (gscPrev.clicks >= 100 && dClicks !== null && dClicks <= -25) {
            add({ check: 'gsc_clicks_drop', severity: 'high', area: 'search_performance', finding: `Search clicks down ${fmtNum(-dClicks, 0)}% vs the previous 28 days`, evidence: `${fmtInt(gscCur.clicks)} clicks vs ${fmtInt(gscPrev.clicks)}`, action: 'Run top_movers (dimension page, then query) to find the pages and queries that lost clicks', confidence: 'high', stake: (gscPrev.clicks - gscCur.clicks) / 28 });
        }
        const ctrCur = gscCur.impressions ? gscCur.clicks / gscCur.impressions : 0;
        const ctrPrev = gscPrev.impressions ? gscPrev.clicks / gscPrev.impressions : 0;
        const dImpr = deltaPct(gscCur.impressions, gscPrev.impressions);
        const dCtr = deltaPct(ctrCur, ctrPrev);
        if (gscPrev.impressions >= 1000 && dImpr !== null && dImpr >= 20 && dCtr !== null && dCtr <= -20) {
            add({ check: 'gsc_impr_up_ctr_down', severity: 'medium', area: 'search_performance', finding: 'More impressions but a much lower CTR', evidence: `impressions ${dImpr >= 0 ? '+' : ''}${fmtNum(dImpr, 0)}%, CTR ${fmtNum(ctrPrev * 100, 2)}% → ${fmtNum(ctrCur * 100, 2)}%`, action: 'New low-intent queries or worse snippets; check seo_opportunities (low_ctr) and rewrite titles and descriptions', confidence: 'medium', stake: gscCur.impressions * (ctrPrev - ctrCur) / 28 });
        }
        const posCur = gscCur.impressions ? gscCur.posW / gscCur.impressions : 0;
        const posPrev = gscPrev.impressions ? gscPrev.posW / gscPrev.impressions : 0;
        if (gscPrev.impressions >= 100 && gscCur.impressions > 0 && posCur - posPrev >= 2) {
            add({ check: 'gsc_position_regression', severity: 'medium', area: 'search_performance', finding: `Average position worse by ${fmtNum(posCur - posPrev, 1)}`, evidence: `${fmtNum(posPrev, 1)} → ${fmtNum(posCur, 1)} (28 days vs the 28 before)`, action: 'Find the queries that slipped with top_movers (metric position) and refresh those pages', confidence: 'medium', stake: gscCur.clicks / 28 * 0.2 });
        }
        const last3 = d.gscDays.slice(-3).map((day) => d.gscDaily!.get(day)!.impressions);
        const before = mean(d.gscDays.slice(-31, -3).map((day) => d.gscDaily!.get(day)!.impressions));
        if (last3.every((x) => x === 0) && before > 50) {
            add({ check: 'data_stale', severity: 'medium', area: 'traffic', finding: 'Search Console shows no impressions for the last 3 days', evidence: `0 impressions on ${d.gscDays.slice(-3).join(', ')}; ${fmtInt(before)}/day before`, action: 'Check the site is reachable and not blocked by robots.txt or noindex; Search Console can also lag', confidence: 'low', stake: before * 0.02 });
        }
    }

    if (d.channels && gscCur && d.gaDays) {
        const organic = d.channels.get('Organic Search') ?? 0;
        if (organic > 100 && gscCur.clicks > 100) {
            const ratio = organic / gscCur.clicks;
            if (ratio < 0.4 || ratio > 2.5) {
                add({ check: 'ga4_gsc_mismatch', severity: 'medium', area: 'tracking', finding: 'GA4 organic sessions and Search Console clicks disagree', evidence: `${fmtInt(organic)} GA4 Organic Search sessions vs ${fmtInt(gscCur.clicks)} Google clicks (ratio ${fmtNum(ratio, 2)}; expected 0.4-2.5)`, action: ratio < 0.4 ? 'GA4 may miss visits (tag not on all pages, consent mode) or the pairing is wrong' : 'Other search engines or a broader GA4 stream; check the pairing in list_sites', confidence: 'low', stake: Math.abs(organic - gscCur.clicks) / 28 * 0.1 });
            }
        }
    }

    if (d.sitemaps) {
        if (!d.sitemaps.length) {
            add({ check: 'gsc_sitemap_issues', severity: 'medium', area: 'indexing', finding: 'No sitemap submitted', evidence: 'Search Console lists no sitemaps for this property', action: 'Submit a sitemap.xml in Search Console > Sitemaps', confidence: 'high', stake: 1 });
        }
        for (const sm of d.sitemaps) {
            const path = ctx.san.path(sm.path, 120);
            if (sm.errors > 0) add({ check: 'gsc_sitemap_issues', severity: 'high', area: 'indexing', finding: 'Sitemap has errors', evidence: `${path}: ${sm.errors} errors`, action: 'Open the sitemap report in Search Console and fix the listed errors', confidence: 'high', stake: 2 });
            else if (sm.warnings > 0) add({ check: 'gsc_sitemap_issues', severity: 'low', area: 'indexing', finding: 'Sitemap has warnings', evidence: `${path}: ${sm.warnings} warnings`, action: 'Review the warnings in Search Console > Sitemaps', confidence: 'medium', stake: 0.5 });
            if (sm.lastDownloaded && Date.now() - Date.parse(sm.lastDownloaded) > 30 * 86400_000) {
                add({ check: 'gsc_sitemap_issues', severity: 'low', area: 'indexing', finding: 'Google has not read the sitemap for over 30 days', evidence: `${path}: last read ${sm.lastDownloaded.slice(0, 10)}`, action: 'Resubmit the sitemap and check it returns 200 quickly', confidence: 'medium', stake: 0.5 });
            }
        }
    }

    if (d.homepage && d.homepage.verdict !== 'PASS') {
        add({ check: 'gsc_homepage_index', severity: 'high', area: 'indexing', finding: 'Home page is not indexed as expected', evidence: `${ctx.san.path(d.homepage.url, 100)}: verdict ${d.homepage.verdict}${d.homepage.coverage ? `, ${ctx.san.text(d.homepage.coverage, 80)}` : ''}`, action: 'Inspect the URL in Search Console, fix noindex, robots or canonical problems, then request indexing', confidence: 'high', stake: 5 });
    }
    return out;
}

export const siteHealth = defineTool({
    name: 'site_health',
    title: 'Site health: what to fix next',
    description: 'Run read-only checks on one site, or all sites, and return a ranked list of what to fix next, each with evidence and a suggested action. Checks GA4 tracking gaps, traffic and click drops, CTR and position regressions, sitemap errors, GA4 versus Search Console mismatches and stale data. Use for \'what should I fix next\', \'is anything broken\' and \'why is traffic down\'.',
    input: z.object({
        site: z.string().max(300).default('all').describe('Site id from list_sites, or \'all\' (default) to rank issues across up to 20 sites.'),
        focus: z.enum(['all', 'tracking', 'indexing', 'search_performance', 'traffic']).default('all'),
        limit: z.number().int().min(1).max(15).default(5),
    }).strict(),
    cost: (a) => (a.site === 'all' ? 65 : 8),
    invoking: 'Running health checks…',
    invoked: 'Health checks done',
    async run(args, ctx) {
        const catalog = await ctx.catalog();
        const all = args.site === 'all';
        let targets: SiteRecord[];
        if (all) {
            const ranked = [...catalog.sites].sort((a, b) => Number(Boolean(b.ga4 && b.gsc)) - Number(Boolean(a.ga4 && a.gsc)));
            targets = ranked.slice(0, 20);
            if (catalog.sites.length > 20) ctx.warn(`checked 20 of ${catalog.sites.length} sites (paired sites first); pass a site for the others`);
        } else {
            targets = [await ctx.site(args.site)];
        }
        const deepChecks = ['ga4_not_set_share', 'ga4_gsc_mismatch', 'gsc_sitemap_issues', 'gsc_homepage_index'];
        const wanted = new Set(Object.entries(CHECK_AREAS).filter(([, areas]) => args.focus === 'all' || areas.includes(args.focus)).map(([id]) => id));
        const skipped = new Map<string, string>();
        if (all) for (const c of deepChecks) if (wanted.has(c)) skipped.set(c, 'single_site_only');
        const g = await ctx.google();
        const findings = (await mapLimit(targets, 4, async (site) => {
            const data = await loadSiteData(g, ctx, site, !all, wanted, skipped);
            return runChecks(site, data, wanted, ctx);
        })).flat();
        findings.sort((a, b) => WEIGHT[b.severity] * Math.max(1, b.stake) - WEIGHT[a.severity] * Math.max(1, a.stake) || a.site.localeCompare(b.site));
        const top = findings.slice(0, args.limit);
        const rows: Cell[][] = top.map((f, i) => [i + 1, f.site, f.severity, f.area, f.finding, f.evidence, f.action, f.confidence]);
        const checked = Array.from(wanted).filter((c) => !skipped.has(c));
        const header = [...ctx.banner(), headerLine(['site_health', all ? `${targets.length} sites` : targets[0].site_id, `focus ${args.focus}`, `${findings.length} findings, top ${top.length}`, `GA4 through ${isoFromDay(latestCompleteDay('ga4'))}, GSC through ${isoFromDay(latestCompleteDay('gsc'))}`])];
        const footer = [
            findings.length === 0 ? '# no issues found by these checks' : '',
            `# checked: ${checked.join(', ')}${skipped.size ? ` | skipped: ${Array.from(skipped).map(([k, v]) => `${k}:${v}`).join(', ')}` : ''}`,
            top.length ? ctx.note() : '',
        ];
        const out = render(header, [{ columns: ['rank', 'site', 'severity', 'area', 'finding', 'evidence', 'suggested_action', 'confidence'], rows }], footer);
        return {
            text: out.text,
            rows: out.rowsReturned,
            structured: { sites_checked: targets.length, findings_total: findings.length, returned: top.length, checked, skipped: Object.fromEntries(skipped), truncated: out.truncated || findings.length > top.length },
        };
    },
});
