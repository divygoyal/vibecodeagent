/**
 * Build the portfolio API response from a store snapshot. Pure and
 * client-safe: the API route, the CSV export and the public demo all call it.
 */
import { normalizeHost, siteKind } from '@/lib/sites/pairing';
import { addDays, daysBetween } from './ranges';
import { NO_PAIR, type RangeTotalRow, type SnapshotData, type StoreAsset, type StoreWindow, type TotalsRow } from './snapshot';
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
    /** Exact users for this range are being fetched. */
    usersPending?: boolean;
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
const EMPTY_TRAFFIC: TrafficTotals = { users: 0, usersExact: false, sessions: 0, pageviews: 0, keyEvents: 0, engagementRate: null };
/** Exact range users older than this are refetched (same staleness as the daily sync). */
const RANGE_USERS_STALE_S = 6 * 3600;

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

function toTraffic(t: TotalsRow | undefined, exactUsers?: number | null): TrafficTotals {
    const exact = exactUsers !== undefined && exactUsers !== null;
    if (!t) return { ...EMPTY_TRAFFIC, users: exact ? exactUsers : 0, usersExact: exact };
    const sessions = Math.round(t.sessions ?? 0);
    return {
        users: exact ? exactUsers : Math.round(t.users ?? 0),
        usersExact: exact,
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
function trimmedSeries(
    snap: SnapshotData, kind: AssetKind, id: string, metrics: readonly string[], which: 'by_asset' | 'prev_by_asset' = 'by_asset', round = true,
): Record<string, number[]> {
    const meta = snap.series[kind];
    const out: Record<string, number[]> = {};
    if (!meta) return out;
    const partial = snap.bucket_days > 1 && meta.span_days % snap.bucket_days !== 0;
    const src = meta[which]?.[id];
    for (const m of metrics) {
        const arr = src?.[m] ?? new Array<number>(meta.n).fill(0);
        const cut = partial ? arr.slice(1) : arr;
        out[m] = round ? cut.map((v) => Math.round(v)) : cut.slice();
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

/** Exact-users rows that belong to the current GA4 window, by property. */
function rangeUsersByAsset(snap: SnapshotData): Map<string, RangeTotalRow> {
    const w = snap.windows.ga4;
    const out = new Map<string, RangeTotalRow>();
    if (!w) return out;
    for (const r of snap.range_totals ?? []) {
        if (r.asset_kind === 'ga4' && r.cur_start === w.cur_start && r.cur_end === w.cur_end) out.set(r.asset_id, r);
    }
    return out;
}

/**
 * GA4 properties whose exact users for this range are missing, for another
 * window, or older than 6 hours. Hidden, missing and inaccessible ones are skipped.
 */
export function rangeUsersNeeded(snap: SnapshotData, nowS: number): StoreAsset[] {
    const w = snap.windows.ga4;
    if (!w) return [];
    const rows = new Map((snap.range_totals ?? []).filter((r) => r.asset_kind === 'ga4').map((r) => [r.asset_id, r]));
    return snap.assets.filter((a) => {
        if (a.asset_kind !== 'ga4' || a.hidden || a.missing || a.status === 'no_access' || !hasData(a)) return false;
        const r = rows.get(a.asset_id);
        return !r || r.cur_start !== w.cur_start || r.cur_end !== w.cur_end || r.fetched_at < nowS - RANGE_USERS_STALE_S;
    });
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
        let usersExact = true;
        for (const t of items) {
            usersExact &&= t.usersExact;
            users += t.users;
            sessions += t.sessions;
            pageviews += t.pageviews;
            keyEvents += t.keyEvents;
            if (t.engagementRate !== null) { erW += t.engagementRate * t.sessions; erS += t.sessions; }
        }
        return { users, usersExact, sessions, pageviews, keyEvents, engagementRate: erS > 0 ? erW / erS : null };
    };
    const prevs = list.map((c) => c.prev).filter((p): p is TrafficTotals => p !== null);
    return { cur: add(list.map((c) => c.cur)), prev: prevs.length ? add(prevs) : null };
}

function addInto(target: number[], src: number[] | undefined) {
    if (!src) return;
    for (let i = 0; i < target.length && i < src.length; i++) target[i] += src[i];
}

/** Tells apart properties that share a host: "http", "www", "/blog", "domain", or "GA4". */
function variantChip(siteUrl: string | undefined, ga4: StoreAsset | undefined): string {
    if (!siteUrl) return ga4 ? 'GA4' : '';
    if (siteUrl.startsWith('sc-domain:')) return 'domain';
    const m = /^([a-z]+):\/\/([^/]+)(\/.*)?$/i.exec(siteUrl);
    if (!m) return siteUrl;
    const path = (m[3] ?? '/').replace(/\/$/, '');
    if (path) return path;
    if (m[1].toLowerCase() === 'http') return 'http';
    if (m[2].toLowerCase().startsWith('www.')) return 'www';
    return 'https';
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
    const exactUsers = rangeUsersByAsset(snap);
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
        // Same keys as the app's site directory (lib/sites/siteDirectory.ts): a GA4-only site is
        // 'ga4-<number>' even when its stream has a host, so /dashboard/s/<slug> resolves.
        const baseSlug = gsc ? host : `ga4-${propertyNumber(ga4?.asset_id ?? 'unknown')}`;
        const n = (slugCount.get(baseSlug) ?? 0) + 1;
        slugCount.set(baseSlug, n);
        const slug = n === 1 ? baseSlug : `${baseSlug}--${n}`;
        const label = host || ga4?.display_name || key;
        const variant = (hostCount.get(host) ?? 0) > 1 && n > 1 ? variantChip(gsc?.asset_id, ga4) : null;

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
        const exact = ga4 ? exactUsers.get(ga4.asset_id) : undefined;
        const traffic: Compared<TrafficTotals> | null = ga4 && hasData(ga4) ? {
            cur: toTraffic(totals.get(`ga4|${ga4.asset_id}|cur`), exact?.active_users_cur ?? (exact ? 0 : undefined)),
            prev: coveredFrom(ga4, ga4W) ? toTraffic(totals.get(`ga4|${ga4.asset_id}|prev`), exact?.active_users_prev ?? (exact ? 0 : undefined)) : null,
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
            variant,
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
    const zeros = (n: number) => new Array<number>(n).fill(0);
    const nS = dates.search.length;
    const nT = dates.traffic.length;
    const cur = { clicks: zeros(nS), impressions: zeros(nS), pw: zeros(nS), users: zeros(nT), sessions: zeros(nT) };
    const prev = { clicks: zeros(nS), impressions: zeros(nS), pw: zeros(nS), users: zeros(nT), sessions: zeros(nT) };
    let prevSearch = false, prevTraffic = false;
    const byKey = new Map(groups.map((g) => [g.key, g]));
    let up = 0, down = 0, fresh = 0, synced = 0;
    for (const s of visible) {
        const g = byKey.get(s.key);
        if (s.search && g?.gsc) {
            const c = trimmedSeries(snap, 'gsc', g.gsc.asset_id, ['clicks', 'impressions', 'position_weighted'], 'by_asset', false);
            addInto(cur.clicks, c.clicks);
            addInto(cur.impressions, c.impressions);
            addInto(cur.pw, c.position_weighted);
            if (s.search.prev) {
                prevSearch = true;
                const p = trimmedSeries(snap, 'gsc', g.gsc.asset_id, ['clicks', 'impressions', 'position_weighted'], 'prev_by_asset', false);
                addInto(prev.clicks, p.clicks);
                addInto(prev.impressions, p.impressions);
                addInto(prev.pw, p.position_weighted);
            }
        }
        if (s.traffic && g?.ga4) {
            addInto(cur.users, s.series.users);
            addInto(cur.sessions, s.series.sessions);
            if (s.traffic.prev) {
                prevTraffic = true;
                const p = trimmedSeries(snap, 'ga4', g.ga4.asset_id, ['users', 'sessions'], 'prev_by_asset');
                addInto(prev.users, p.users);
                addInto(prev.sessions, p.sessions);
            }
        }
        if (s.status === 'synced' || s.status === 'stale') synced += 1;
        const [now_, before] = s.search ? [s.search.cur.clicks, s.search.prev?.clicks] : [s.traffic?.cur.users ?? 0, s.traffic?.prev?.users];
        if (before === 0 && now_ > 0) fresh += 1;
        else if (before !== undefined && before !== null && before > 0) {
            if (now_ > before) up += 1;
            else if (now_ < before) down += 1;
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
        usersPending: Boolean(opts.usersPending),
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
        combined: {
            clicks: cur.clicks.map(Math.round),
            impressions: cur.impressions.map(Math.round),
            position: cur.pw.map((v, i) => (cur.impressions[i] > 0 ? v / cur.impressions[i] : null)),
            users: cur.users,
            sessions: cur.sessions,
        },
        combinedPrev: {
            ...(prevSearch ? {
                clicks: prev.clicks.map(Math.round),
                impressions: prev.impressions.map(Math.round),
                position: prev.pw.map((v, i) => (prev.impressions[i] > 0 ? v / prev.impressions[i] : null)),
            } : {}),
            ...(prevTraffic ? { users: prev.users, sessions: prev.sessions } : {}),
        },
        alerts,
        demo: opts.demo || undefined,
    };
}
