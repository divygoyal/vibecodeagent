/**
 * Server-only data for the home page's live product-tour rows (round 6): the tour site's overview numbers, its fix
 * list, its traffic (AI) chart and a small sample dashboard, each computed by the APP'S OWN server code (ga4Summary,
 * gscSummary, the breakdowns behind the chart findings, buildActions, the dashboard engine) with the demo generator
 * as Google (lib/demo/sampleScope: no network, no request context, so the page stays static). The numbers are the
 * ones the live demo shows for the same day.
 *
 * Every row is optional: if one fails to build, the page keeps that row's static picture. Props stay small: only
 * what the rows draw (no unused metrics, no evidence lists).
 */
import { ga4Breakdown, ga4Summary } from '@/app/api/site/_lib/ga4Reports';
import { gscRows, gscSummary } from '@/app/api/site/_lib/gscReports';
import { buildActions } from '@/app/api/site/_lib/actions';
import type { RangeParams } from '@/app/api/site/_lib/params';
import { searchFindingOf, trafficFindingOf, type FindingContext } from '@/components/site/chart/findingRules';
import type { Finding } from '@/components/site/lib/findings';
import { googleUpdatesIn } from '@/components/site/lib/googleUpdates';
import { snapToBucket } from '@/components/site/lib/intervals';
import { rankByImpact } from '@/components/site/lib/actionText';
import { auditActions } from '@/components/site/lib/auditActions';
import type { Ga4BreakdownResponse, Ga4SeriesPoint, Ga4Summary, GscRowsResponse, GscSummary, SiteAction } from '@/components/site/lib/types';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { buildDirectory } from '@/lib/builder/server/sources';
import { buildFromTemplate } from '@/lib/builder/templates';
import type { ControlState, DatePresetId, ResolvedDates, WidgetDef, WidgetResult } from '@/lib/builder/types';
import { compareSuffix, resolveDateRange, type DateRangeValue } from '@/lib/dateRange';
import { demoAccessToken, getDemoSites } from '@/lib/demo/catalog';
import { sampleGoogleFetch } from '@/lib/demo/fetchShim';
import { runWithSampleGoogle } from '@/lib/demo/sampleScope';
import { fmtDateRange } from '@/lib/format';
import type { MetricKey } from '@/lib/metrics';
import { DEMO_NOTES } from '@/lib/publicDemo/config';
import { getDemoAuditReport } from '@/lib/demoWorkspaceData';
import { fetchInventory } from '@/lib/sites/fetchInventory';
import { demoHref } from './demoLinks';
import { TOUR_SITE_KEY } from './homeData';

/** Cache identity of the sample data in lib/apiCache and the builder cache (never a real user id: those are numeric). */
const SAMPLE_USER = 'home-sample';
const DAY_MS = 86_400_000;
const RANGE: DateRangeValue = { preset: '28d', compare: 'prev' };

const TRAFFIC_TILES = ['users', 'sessions', 'pageviews', 'conversions'] as const;
const SEARCH_TILES = ['clicks', 'impressions', 'ctr', 'position'] as const;
const AI_STRIP = ['users', 'sessions', 'pageviews', 'conversions', 'ai'] as const;

export interface LiveMarker {
    key: string;
    date: string;
    /** Row date it is drawn on. */
    at: string;
    label: string;
    kind: 'google' | 'note';
    detail: string;
}

/** What the site and traffic rows share: the tour site and the 28-day window, as on its page in the demo. */
export interface LiveSiteMeta {
    host: string;
    ga4: string;
    gsc: string;
    /** "previous 28 days" */
    compareText: string;
    /** "Dashed: previous 28 days" */
    compareLabel: string;
    window: { start: string; end: string; searchStart: string; searchEnd: string };
    links: { site: string; traffic: string; search: string };
}

export interface LiveSiteRow {
    meta: LiveSiteMeta;
    traffic: Ga4Summary;
    search: GscSummary;
    trafficFindings: Partial<Record<MetricKey, Finding | null>>;
    searchFindings: Partial<Record<MetricKey, Finding | null>>;
    markers: { traffic: LiveMarker[]; search: LiveMarker[] };
}

export interface LiveTrafficRow {
    meta: LiveSiteMeta;
    traffic: Ga4Summary;
    findings: Partial<Record<MetricKey, Finding | null>>;
    markers: LiveMarker[];
}

export interface LiveFixesRow {
    site: { ga4: string | null; gsc: string | null; siteHost: string };
    /** The first tasks of the site's Actions page, in its order (open, ranked by expected impact). */
    actions: SiteAction[];
    total: number;
    links: { actions: string };
}

export type LiveDashRange = '7d' | '28d' | '3m';

export interface LiveDashboardRow {
    name: string;
    host: string;
    widgets: WidgetDef[];
    byRange: Record<LiveDashRange, { results: Record<string, WidgetResult>; resolved: ResolvedDates }>;
    links: { dashboards: string };
}

export interface HomeLive {
    site: LiveSiteRow | null;
    traffic: LiveTrafficRow | null;
    fixes: LiveFixesRow | null;
    dashboards: LiveDashboardRow | null;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function rangeParams(r: { start: string; end: string; prevStart: string | null; prevEnd: string | null }): RangeParams {
    return { cur: { start: r.start, end: r.end }, cmp: r.prevStart && r.prevEnd ? { start: r.prevStart, end: r.prevEnd } : null };
}

/** Drop what no row draws (engagement rate, revenue for a site that sells nothing) from a GA4 summary. */
function leanGa4(s: Ga4Summary): Ga4Summary {
    const revenue = s.totals.revenue > 0 || (s.previous?.revenue ?? 0) > 0;
    const series = s.series.map((p): Ga4SeriesPoint => ({
        date: p.date, users: p.users, sessions: p.sessions, pageviews: p.pageviews, conversions: p.conversions, ai: p.ai,
        revenue: revenue ? p.revenue : 0, engagementRate: 0,
        prevDate: p.prevDate ?? null, prev_users: p.prev_users ?? null, prev_sessions: p.prev_sessions ?? null,
        prev_pageviews: p.prev_pageviews ?? null, prev_conversions: p.prev_conversions ?? null, prev_ai: p.prev_ai ?? null,
        ...(revenue ? { prev_revenue: p.prev_revenue ?? null } : {}),
    }));
    return { ...s, series };
}

function markersFor(dates: string[], start: string, end: string, now: number, notes: boolean): LiveMarker[] {
    const out: LiveMarker[] = [];
    if (!dates.length) return out;
    for (const u of googleUpdatesIn(start, end)) {
        const at = snapToBucket(u.start, dates);
        if (at) out.push({ key: `g-${u.start}-${u.name}`, date: u.start, at, label: u.name, kind: 'google', detail: `Google ${u.kind === 'core' ? 'core' : u.kind === 'spam' ? 'spam' : 'ranking'} update, rolled out ${fmtDateRange(u.start, u.end)}. Source: Google Search Status Dashboard.` });
    }
    if (notes) {
        for (const n of DEMO_NOTES) {
            const date = iso(now - n.daysAgo * DAY_MS);
            if (date < start || date > end) continue;
            const at = snapToBucket(date, dates);
            if (at) out.push({ key: `n-${n.daysAgo}`, date, at, label: n.title, kind: 'note', detail: 'A note on this chart (sample)' });
        }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

async function settle<T>(what: string, p: Promise<T>): Promise<T | null> {
    try {
        return await p;
    } catch (e) {
        console.warn(`[home-live] ${what} unavailable, the static picture stays: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}

/** The sample dashboard: the first one the live demo seeds ("Acme Analytics – weekly overview"), three of its widgets. */
const DASH_WIDGETS = ['w_kpis', 'w_search', 'w_queries'];
const DASH_RANGES: LiveDashRange[] = ['7d', '28d', '3m'];

async function buildDashboard(token: string, host: string, ga4: string, gsc: string, now: Date): Promise<LiveDashboardRow> {
    const directory = buildDirectory(await fetchInventory(token, { demo: true, fetch: sampleGoogleFetch, cacheKey: SAMPLE_USER }));
    const site = directory.sites.find((s) => s.ga4 === ga4 && s.gsc === gsc) ?? directory.sites.find((s) => s.siteId === host);
    if (!site) throw new Error(`no sample site ${host}`);
    const name = `${getDemoSites().find((s) => s.key === TOUR_SITE_KEY)?.name ?? host} – weekly overview`;
    const doc = buildFromTemplate('site-overview', { name, defaultSource: { type: 'site', siteId: site.siteId, ga4: site.ga4, gsc: site.gsc } });
    // Impressions run ~30x clicks: on the clicks scale their line would read as ~1K a day. Give them their own (right)
    // axis, as the site page's Search chart does with two metrics.
    const widgets = DASH_WIDGETS.map((id) => doc.widgets[id]).filter(Boolean).map((w): WidgetDef => (w.type === 'timeseries'
        ? { ...w, config: { ...w.config, series: w.config.series.map((x, i) => (i > 0 ? { ...x, axis: 'right' as const } : x)) } }
        : w));
    const deps = { userId: SAMPLE_USER, mode: 'owner' as const, getToken: async () => token, loadDirectory: async () => directory, now };
    const entries = await Promise.all(DASH_RANGES.map(async (id) => {
        const controls: ControlState = { date: { range: { kind: 'preset', id: id as DatePresetId }, compare: { mode: 'previous_period' } }, filters: {} };
        const res = await evaluateWidgets({ widgets: widgets.map((widget) => ({ widget, pageId: doc.pages[0].id })), defaultSource: doc.defaultSource, controlDefs: doc.controls, controls, timezone: doc.settings.timezone }, deps);
        // The KPI strip draws sparklines only in taller cells than the row gives it: leave them out of the props.
        const results = Object.fromEntries(Object.entries(res.results).map(([wid, r]) => {
            if (r.status !== 'ok' || doc.widgets[wid]?.type !== 'kpi-strip') return [wid, r];
            const { spark: _spark, ...parts } = r.parts;
            void _spark;
            return [wid, { ...r, parts }];
        }));
        return [id, { results, resolved: res.resolved }] as const;
    }));
    return { name, host, widgets, byRange: Object.fromEntries(entries) as LiveDashboardRow['byRange'], links: { dashboards: demoHref('/dashboard/dashboards') } };
}

/**
 * Builds every live row for `now` (deterministic per UTC day, like the hero). `slug` is the tour site's app slug
 * (homeData buildTourLinks), so the links land on the same pages as the row CTAs.
 */
export async function buildHomeLive(slug: string, now: number = Date.now()): Promise<HomeLive> {
    const site = getDemoSites().find((s) => s.key === TOUR_SITE_KEY);
    if (!site?.ga || !site.gsc) return { site: null, traffic: null, fixes: null, dashboards: null };
    const ga4 = site.ga.propertyId;
    const gsc = site.gsc.siteUrl;
    const host = site.host.replace(/^www\./, '');
    // useSite().homeUrl for a Search Console domain property, at the root like the demo's audit (demoUserUrl).
    const homeUrl = gsc.startsWith('sc-domain:') ? `https://${gsc.slice('sc-domain:'.length)}/` : new URL(gsc).origin + '/';
    const token = demoAccessToken();
    const today = new Date(now);
    // One window for the whole page: the hero's and the sample dashboard's 28 days (GA4 through yesterday, Search
    // Console through 2 days ago, as Google reports it), so a number reads the same in every row; each row shows it.
    const dr = resolveDateRange(RANGE, { now: today, lagDays: 1 });
    const drs = resolveDateRange(RANGE, { now: today, lagDays: 2 });
    const traffic = rangeParams(dr);
    const search = rangeParams(drs);
    const compareText = compareSuffix(RANGE).replace(/^vs\s+/, '');
    const base = `/dashboard/s/${encodeURIComponent(slug)}`;
    const meta: LiveSiteMeta = {
        host,
        ga4,
        gsc,
        compareText,
        compareLabel: `Dashed: ${compareText}`,
        window: { start: dr.start, end: dr.end, searchStart: drs.start, searchEnd: drs.end },
        links: { site: demoHref(base), traffic: demoHref(`${base}/traffic`), search: demoHref(`${base}/search`) },
    };
    const ctx: FindingContext = { compareOn: true, compareText, siteHost: host, daily: true };

    return runWithSampleGoogle(sampleGoogleFetch, async () => {
        const [ga, gs, channels, pages, referrers, gPages, gQueries, actions, dashboards] = await Promise.all([
            settle('GA4 summary', ga4Summary(SAMPLE_USER, token, ga4, traffic)),
            settle('Search Console summary', gscSummary(SAMPLE_USER, token, gsc, search)),
            settle('GA4 channels', ga4Breakdown(SAMPLE_USER, token, ga4, 'channels', traffic)),
            settle('GA4 pages', ga4Breakdown(SAMPLE_USER, token, ga4, 'pages', traffic)),
            settle('GA4 referrers', ga4Breakdown(SAMPLE_USER, token, ga4, 'referrers', traffic)),
            settle('Search Console pages', gscRows(SAMPLE_USER, token, gsc, 'pages', search)),
            settle('Search Console queries', gscRows(SAMPLE_USER, token, gsc, 'queries', search)),
            settle('actions', buildActions({ userId: SAMPLE_USER, token, label: host, siteUrl: gsc, property: ga4, search, traffic })),
            settle('dashboard', buildDashboard(token, host, ga4, gsc, today)),
        ]);

        const trafficDrivers = (m: MetricKey): Ga4BreakdownResponse | undefined =>
            (m === 'pageviews' ? pages : m === 'ai' ? referrers : channels) ?? undefined;
        const searchDrivers = (m: MetricKey): GscRowsResponse | undefined =>
            (m === 'clicks' ? gPages : m === 'impressions' ? gQueries : null) ?? undefined;
        const leanTraffic = ga ? leanGa4(ga) : null;
        const trafficFindings = ga
            ? Object.fromEntries(AI_STRIP.map((m) => [m, trafficFindingOf(m, ga, trafficDrivers(m), ctx)]))
            : {};
        const tDates = ga?.series.map((p) => p.date) ?? [];
        const sDates = gs?.series.map((p) => p.date) ?? [];
        const trafficMarkers = markersFor(tDates, dr.start, dr.end, now, true);

        const siteRow: LiveSiteRow | null = leanTraffic && gs ? {
            meta,
            traffic: leanTraffic,
            search: gs,
            trafficFindings: Object.fromEntries(TRAFFIC_TILES.map((m) => [m, trafficFindings[m] ?? null])),
            searchFindings: Object.fromEntries(SEARCH_TILES.map((m) => [m, searchFindingOf(m, gs, searchDrivers(m), ctx)])),
            markers: { traffic: trafficMarkers, search: markersFor(sDates, drs.start, gs.lastDate ?? drs.end, now, true) },
        } : null;

        const trafficRow: LiveTrafficRow | null = leanTraffic ? { meta, traffic: leanTraffic, findings: trafficFindings, markers: trafficMarkers } : null;

        // The Actions page's list and order (useSiteActions with includeAudit, then rankByImpact over open tasks): the
        // search and traffic tasks plus the homepage audit's issues. The demo answers the audit with its sample report
        // (api/site/audit demoReport), which is pure, so the count matches the live demo.
        const audit = auditActions(getDemoAuditReport(homeUrl), host);
        const open = actions ? rankByImpact([...actions.actions, ...audit]) : [];
        const fixesRow: LiveFixesRow | null = open.length ? {
            site: { ga4, gsc, siteHost: host },
            actions: open.slice(0, 6).map((a) => ({ ...a, evidence: [] })),
            total: open.length,
            links: { actions: demoHref(`${base}/actions`) },
        } : null;

        return { site: siteRow, traffic: trafficRow, fixes: fixesRow, dashboards };
    });
}
