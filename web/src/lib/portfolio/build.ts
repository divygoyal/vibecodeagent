/**
 * Build the portfolio API response from a store snapshot. Pure and
 * client-safe: the API route, the CSV export and the public demo all call it.
 */
import { normalizeHost, siteKind } from '@/lib/sites/pairing';
import { addDays, daysBetween } from './ranges';
import { NO_PAIR, type SnapshotData, type StoreAsset, type StoreWindow, type TotalsRow } from './snapshot';
import type {
    AlertMetric,
    AssetKind,
    Compared,
    DateWindow,
    PortfolioAlert,
    PortfolioRange,
    PortfolioResponse,
    PortfolioSite,
    PortfolioState,
    SearchTotals,
    SiteGa4,
    SiteGsc,
    SiteSeries,
    SiteStatus,
    TrafficTotals,
} from './types';

export interface BuildOptions {
    range: PortfolioRange;
    now?: number;
    /** A sync is running for this user right now. */
    syncing?: boolean;
    googleError?: { status: number; message: string } | null;
    /** The inventory finished and found no properties or sites. */
    noSites?: boolean;
    demo?: boolean;
}

/** A "syncing" asset whose sync started longer ago than this is treated as interrupted. */
const SYNC_STUCK_S = 15 * 60;
/** Last good sync older than this shows the "Stale" pill. */
const STALE_PILL_S = 24 * 3600;
/** Drop alerts need a previous period of at least this much, and a drop of at least MIN_DROP_ABS (tiny sites are noise). */
const MIN_PREV_FOR_DROP = 50;
const MIN_DROP_ABS = 20;
const DROP_WARN = -30;
const DROP_CRITICAL = -50;
/** Zero-traffic alerts need this daily average before the zero run. */
const MIN_DAILY_FOR_ZERO = 2;

const EMPTY_SEARCH: SearchTotals = { clicks: 0, impressions: 0, ctr: null, position: null };
const EMPTY_TRAFFIC: TrafficTotals = { users: 0, sessions: 0, pageviews: 0, keyEvents: 0, engagementRate: null };

function toSearch(t: TotalsRow | undefined): SearchTotals {
    if (!t) return { ...EMPTY_SEARCH };
    const clicks = Math.round(t.clicks ?? 0);
    const impressions = Math.round(t.impressions ?? 0);
    return {
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : null,
        position: impressions > 0 && t.position_weighted != null ? t.position_weighted / impressions : null,
    };
}

function toTraffic(t: TotalsRow | undefined): TrafficTotals {
    if (!t) return { ...EMPTY_TRAFFIC };
    const sessions = Math.round(t.sessions ?? 0);
    return {
        users: Math.round(t.users ?? 0),
        sessions,
        pageviews: Math.round(t.pageviews ?? 0),
        keyEvents: Math.round((t.key_events ?? 0) * 100) / 100,
        engagementRate: sessions > 0 && t.engaged_weighted != null ? t.engaged_weighted / sessions : null,
    };
}

function toWindow(w: StoreWindow | undefined): DateWindow | null {
    return w ? { curStart: w.cur_start, curEnd: w.cur_end, prevStart: w.prev_start, prevEnd: w.prev_end } : null;
}

/** Percent change, null when there is no meaningful base. */
export function pctChange(cur: number, prev: number | null | undefined): number | null {
    if (prev === null || prev === undefined || prev === 0) return null;
    return ((cur - prev) / prev) * 100;
}

function hasData(a: StoreAsset): boolean {
    return Boolean(a.data_end);
}

function isSyncing(a: StoreAsset, nowS: number): boolean {
    return a.status === 'syncing' && (a.sync_started_at ?? 0) > nowS - SYNC_STUCK_S;
}

function siteStatus(assets: StoreAsset[], nowS: number): SiteStatus {
    const live = assets.filter((a) => !a.missing);
    if (live.length === 0) return 'no_access';
    if (live.some((a) => isSyncing(a, nowS))) return 'syncing';
    if (live.some((a) => a.status === 'error')) return 'error';
    if (live.every((a) => a.status === 'no_access')) return 'no_access';
    const usable = live.filter((a) => a.status !== 'no_access');
    if (usable.some((a) => !a.last_synced_at)) return 'pending';
    const oldest = Math.min(...usable.map((a) => a.last_synced_at ?? 0));
    if (oldest < nowS - STALE_PILL_S) return 'stale';
    return 'synced';
}

/** Series aligned to the window; drops a partial oldest bucket when bucketing by week. */
function trimmedSeries(snap: SnapshotData, kind: AssetKind, id: string, metrics: readonly string[]): Record<string, number[]> {
    const meta = snap.series[kind];
    const out: Record<string, number[]> = {};
    if (!meta) return out;
    const partial = snap.bucket_days > 1 && meta.span_days % snap.bucket_days !== 0;
    const src = meta.by_asset[id];
    for (const m of metrics) {
        const arr = src?.[m] ?? new Array<number>(meta.n).fill(0);
        out[m] = (partial ? arr.slice(1) : arr).map((v) => Math.round(v));
    }
    return out;
}

function seriesDates(snap: SnapshotData, kind: AssetKind): string[] {
    const meta = snap.series[kind];
    const w = snap.windows[kind];
    if (!meta || !w) return [];
    const b = snap.bucket_days;
    const dates: string[] = [];
    for (let i = 0; i < meta.n; i++) dates.push(addDays(w.cur_end, -(meta.n - 1 - i) * b));
    const partial = b > 1 && meta.span_days % b !== 0;
    return partial ? dates.slice(1) : dates;
}

/** Days of daily values the snapshot returns for zero-traffic checks. */
export const RECENT_DAYS = 7;

/** Consecutive zero days at the end of the stored data (missing days count as zero). */
function zeroRun(snap: SnapshotData, kind: AssetKind, asset: StoreAsset): number {
    const w = snap.windows[kind];
    if (!w || !asset.data_end) return 0;
    const values = new Map((snap.recent[kind]?.[asset.asset_id] ?? []).map(([d, v]) => [d, v]));
    const oldest = addDays(w.cur_end, -(RECENT_DAYS - 1));
    let day = asset.data_end < w.cur_end ? asset.data_end : w.cur_end;
    let run = 0;
    while (day >= oldest && day >= w.cur_start && (values.get(day) ?? 0) === 0) {
        run += 1;
        day = addDays(day, -1);
    }
    return run;
}

/**
 * Sites with many empty days (tiny or bursty traffic) would alert all the
 * time. With a daily series, alert only when fewer than 10% of the earlier
 * days were zero; with weekly buckets, require a higher daily average.
 */
function zeroDaysAreRare(series: number[] | undefined, bucketDays: number, run: number, dailyAvg: number): boolean {
    if (bucketDays !== 1 || !series) return dailyAvg >= 10;
    const before = series.slice(0, Math.max(0, series.length - run));
    if (before.length < 5) return dailyAvg >= 10;
    const zeros = before.filter((v) => v === 0).length;
    return zeros / before.length < 0.1;
}

const METRIC_LABEL: Record<AlertMetric, string> = { clicks: 'Clicks', users: 'Users' };

function siteAlerts(site: PortfolioSite, snap: SnapshotData, assets: { gsc?: StoreAsset; ga4?: StoreAsset }): PortfolioAlert[] {
    const out: PortfolioAlert[] = [];
    const checks: [AlertMetric, AssetKind, StoreAsset | undefined, number | undefined, number | null | undefined][] = [
        ['clicks', 'gsc', assets.gsc, site.search?.cur.clicks, site.search?.prev?.clicks],
        ['users', 'ga4', assets.ga4, site.traffic?.cur.users, site.traffic?.prev?.users],
    ];
    for (const [metric, kind, asset, cur, prev] of checks) {
        if (!asset || cur === undefined || !hasData(asset)) continue;
        const w = snap.windows[kind];
        const days = w ? daysBetween(w.cur_start, w.cur_end) + 1 : 1;
        const base = Math.max(cur, prev ?? 0) / days;
        const run = zeroRun(snap, kind, asset);
        if (run >= 2 && base >= MIN_DAILY_FOR_ZERO && zeroDaysAreRare(site.series[metric], snap.bucket_days, run, base)) {
            out.push({
                id: `${site.key}:${metric}:zero`, siteKey: site.key, host: site.host, slug: site.slug, metric, type: 'zero',
                severity: 'critical', current: cur, previous: prev ?? null, days: run,
                message: `No ${metric} for ${run} days`,
            });
            continue;
        }
        const change = pctChange(cur, prev);
        if (change !== null && (prev ?? 0) >= MIN_PREV_FOR_DROP && (prev ?? 0) - cur >= MIN_DROP_ABS && change <= DROP_WARN) {
            out.push({
                id: `${site.key}:${metric}:drop`, siteKey: site.key, host: site.host, slug: site.slug, metric, type: 'drop',
                severity: change <= DROP_CRITICAL ? 'critical' : 'warning', current: cur, previous: prev ?? null,
                changePct: change, message: `${METRIC_LABEL[metric]} down ${Math.round(-change)}% vs previous period`,
            });
        }
    }
    return out;
}

function coveredFrom(asset: StoreAsset, w: StoreWindow | undefined): boolean {
    return Boolean(w && asset.data_start && asset.data_start <= w.prev_start);
}

function sumSearch(list: Compared<SearchTotals>[]): Compared<SearchTotals> | null {
    if (list.length === 0) return null;
    const add = (items: SearchTotals[]): SearchTotals => {
        let clicks = 0, impressions = 0, posW = 0, posImpr = 0;
        for (const t of items) {
            clicks += t.clicks;
            impressions += t.impressions;
            if (t.position !== null) { posW += t.position * t.impressions; posImpr += t.impressions; }
        }
        return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : null, position: posImpr > 0 ? posW / posImpr : null };
    };
    const prevs = list.map((c) => c.prev).filter((p): p is SearchTotals => p !== null);
    return { cur: add(list.map((c) => c.cur)), prev: prevs.length ? add(prevs) : null };
}

function sumTraffic(list: Compared<TrafficTotals>[]): Compared<TrafficTotals> | null {
    if (list.length === 0) return null;
    const add = (items: TrafficTotals[]): TrafficTotals => {
        let users = 0, sessions = 0, pageviews = 0, keyEvents = 0, erW = 0, erS = 0;
        for (const t of items) {
            users += t.users;
            sessions += t.sessions;
            pageviews += t.pageviews;
            keyEvents += t.keyEvents;
            if (t.engagementRate !== null) { erW += t.engagementRate * t.sessions; erS += t.sessions; }
        }
        return { users, sessions, pageviews, keyEvents, engagementRate: erS > 0 ? erW / erS : null };
    };
    const prevs = list.map((c) => c.prev).filter((p): p is TrafficTotals => p !== null);
    return { cur: add(list.map((c) => c.cur)), prev: prevs.length ? add(prevs) : null };
}

function addInto(target: number[], src: number[] | undefined) {
    if (!src) return;
    for (let i = 0; i < target.length && i < src.length; i++) target[i] += src[i];
}

/** "http://x.com", "x.com/blog" or "sc-domain:x.com" for a host shared by several properties. */
function prefixLabel(siteUrl: string): string {
    if (siteUrl.startsWith('sc-domain:')) return siteUrl;
    return siteUrl.replace(/^https:\/\//, '').replace(/\/$/, '');
}

export function propertyNumber(property: string): string {
    return property.replace(/^properties\//, '');
}

export function buildPortfolio(snap: SnapshotData, opts: BuildOptions): PortfolioResponse {
    const now = opts.now ?? Date.now();
    const nowS = Math.floor(now / 1000);
    const totals = new Map<string, TotalsRow>();
    for (const t of snap.totals) totals.set(`${t.kind}|${t.asset_id}|${t.w}`, t);

    const ga4ById = new Map<string, StoreAsset>();
    const gscList: StoreAsset[] = [];
    for (const a of snap.assets) {
        if (a.missing && !hasData(a)) continue;
        if (a.asset_kind === 'ga4') ga4ById.set(a.asset_id, a);
        else gscList.push(a);
    }

    // Rebuild the pairs the sync stored (paired_with on both sides).
    const groups: { key: string; gsc?: StoreAsset; ga4?: StoreAsset }[] = [];
    const usedGa4 = new Set<string>();
    for (const gsc of gscList) {
        const ga4 = gsc.paired_with ? ga4ById.get(gsc.paired_with) : undefined;
        const ok = ga4 && ga4.paired_with === gsc.asset_id && !usedGa4.has(ga4.asset_id);
        if (ok && ga4) usedGa4.add(ga4.asset_id);
        groups.push({ key: `gsc:${gsc.asset_id}`, gsc, ga4: ok ? ga4 : undefined });
    }
    for (const ga4 of ga4ById.values()) {
        if (!usedGa4.has(ga4.asset_id)) groups.push({ key: `ga4:${ga4.asset_id}`, ga4 });
    }

    const gscW = snap.windows.gsc;
    const ga4W = snap.windows.ga4;
    const slugCount = new Map<string, number>();
    // The "main" property of a host keeps the plain slug: paired first, then
    // domain properties, then https prefixes; "--2" goes to the rest.
    const rank = (g: { gsc?: StoreAsset; ga4?: StoreAsset }) =>
        g.gsc && g.ga4 ? 0 : g.gsc?.asset_id.startsWith('sc-domain:') ? 1 : g.gsc?.asset_id.startsWith('https://') ? 2 : g.ga4 ? 3 : 4;
    groups.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
    const hostCount = new Map<string, number>();
    for (const g of groups) {
        const h = g.gsc ? normalizeHost(g.gsc.asset_id) : normalizeHost(g.ga4?.host ?? '');
        hostCount.set(h, (hostCount.get(h) ?? 0) + 1);
    }

    const sites: PortfolioSite[] = groups.map(({ key, gsc, ga4 }) => {
        const host = gsc ? normalizeHost(gsc.asset_id) : normalizeHost(ga4?.host ?? '');
        const baseSlug = host || `ga4-${propertyNumber(ga4?.asset_id ?? 'unknown')}`;
        const n = (slugCount.get(baseSlug) ?? 0) + 1;
        slugCount.set(baseSlug, n);
        const slug = n === 1 ? baseSlug : `${baseSlug}--${n}`;
        const label = gsc && (hostCount.get(host) ?? 0) > 1 && n > 1 ? prefixLabel(gsc.asset_id) : host || ga4?.display_name || key;

        const gscInfo: SiteGsc | null = gsc ? {
            siteUrl: gsc.asset_id,
            propertyType: siteKind(gsc.asset_id),
            permissionLevel: gsc.permission_level,
            status: gsc.missing ? 'no_access' : isSyncing(gsc, nowS) ? 'syncing' : gsc.status === 'syncing' ? 'pending' : gsc.status,
            lastSyncedAt: gsc.last_synced_at,
            lastError: gsc.last_error,
            missing: gsc.missing,
            hasData: hasData(gsc),
        } : null;
        const ga4Info: SiteGa4 | null = ga4 ? {
            property: ga4.asset_id,
            propertyId: propertyNumber(ga4.asset_id),
            displayName: ga4.display_name || ga4.asset_id,
            accountName: ga4.account_name,
            status: ga4.missing ? 'no_access' : isSyncing(ga4, nowS) ? 'syncing' : ga4.status === 'syncing' ? 'pending' : ga4.status,
            lastSyncedAt: ga4.last_synced_at,
            lastError: ga4.last_error,
            missing: ga4.missing,
            hasData: hasData(ga4),
        } : null;

        const search: Compared<SearchTotals> | null = gsc && hasData(gsc) ? {
            cur: toSearch(totals.get(`gsc|${gsc.asset_id}|cur`)),
            prev: coveredFrom(gsc, gscW) ? toSearch(totals.get(`gsc|${gsc.asset_id}|prev`)) : null,
        } : null;
        const traffic: Compared<TrafficTotals> | null = ga4 && hasData(ga4) ? {
            cur: toTraffic(totals.get(`ga4|${ga4.asset_id}|cur`)),
            prev: coveredFrom(ga4, ga4W) ? toTraffic(totals.get(`ga4|${ga4.asset_id}|prev`)) : null,
        } : null;

        const series: SiteSeries = {};
        if (search && gsc) Object.assign(series, trimmedSeries(snap, 'gsc', gsc.asset_id, ['clicks', 'impressions']));
        if (traffic && ga4) Object.assign(series, trimmedSeries(snap, 'ga4', ga4.asset_id, ['users', 'sessions']));

        const members = [gsc, ga4].filter((a): a is StoreAsset => Boolean(a));
        const lastSynced = members.map((a) => a.last_synced_at ?? 0).reduce((m, v) => Math.max(m, v), 0);
        const site: PortfolioSite = {
            key,
            host,
            label,
            slug,
            name: ga4?.display_name || host || key,
            gsc: gscInfo,
            ga4: ga4Info,
            pairing: gsc && ga4 ? (ga4.pairing_override && ga4.pairing_override !== NO_PAIR ? 'manual' : 'auto') : 'none',
            starred: members.some((a) => a.starred),
            hidden: members.some((a) => a.hidden),
            status: siteStatus(members, nowS),
            lastSyncedAt: lastSynced || null,
            search,
            traffic,
            series,
            alerts: [],
        };
        site.alerts = siteAlerts(site, snap, { gsc, ga4 });
        return site;
    });

    const visible = sites.filter((s) => !s.hidden);
    const dates = { search: seriesDates(snap, 'gsc'), traffic: seriesDates(snap, 'ga4') };
    const combined = {
        clicks: new Array<number>(dates.search.length).fill(0),
        impressions: new Array<number>(dates.search.length).fill(0),
        users: new Array<number>(dates.traffic.length).fill(0),
        sessions: new Array<number>(dates.traffic.length).fill(0),
    };
    let up = 0, down = 0, fresh = 0, synced = 0;
    for (const s of visible) {
        addInto(combined.clicks, s.series.clicks);
        addInto(combined.impressions, s.series.impressions);
        addInto(combined.users, s.series.users);
        addInto(combined.sessions, s.series.sessions);
        if (s.status === 'synced' || s.status === 'stale') synced += 1;
        const [cur, prev] = s.search ? [s.search.cur.clicks, s.search.prev?.clicks] : [s.traffic?.cur.users ?? 0, s.traffic?.prev?.users];
        if (prev === 0 && cur > 0) fresh += 1;
        else if (prev !== undefined && prev !== null && prev > 0) {
            if (cur > prev) up += 1;
            else if (cur < prev) down += 1;
        }
    }

    const alerts = visible.flatMap((s) => s.alerts).sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
        if (a.type !== b.type) return a.type === 'zero' ? -1 : 1;
        return (a.changePct ?? 0) - (b.changePct ?? 0);
    });

    const lastSyncedAt = sites.reduce<number | null>((m, s) => (s.lastSyncedAt && (!m || s.lastSyncedAt > m) ? s.lastSyncedAt : m), null);
    let state: PortfolioState = 'ready';
    if (sites.length === 0) state = opts.noSites ? 'no_sites' : 'first_sync';

    return {
        range: opts.range,
        state,
        generatedAt: now,
        syncing: Boolean(opts.syncing) || sites.some((s) => s.status === 'syncing'),
        lastSyncedAt,
        googleError: opts.googleError ?? null,
        windows: { search: toWindow(gscW), traffic: toWindow(ga4W) },
        bucketDays: snap.bucket_days,
        dates,
        sites,
        totals: {
            search: sumSearch(visible.map((s) => s.search).filter((x): x is Compared<SearchTotals> => x !== null)),
            traffic: sumTraffic(visible.map((s) => s.traffic).filter((x): x is Compared<TrafficTotals> => x !== null)),
            sites: { total: visible.length, synced, up, down, new: fresh, hidden: sites.length - visible.length },
        },
        combined,
        alerts,
        demo: opts.demo || undefined,
    };
}
