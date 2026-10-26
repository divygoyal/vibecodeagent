/**
 * Server-only adapter: builds the public demo portfolio and sample dashboards
 * straight from the demo data generator (web/src/lib/demo). Pure, no network,
 * never calls Google, deterministic per UTC day, memoised for 10 minutes.
 *
 * This is the marketing stream's stand-in for tc/portfolio's
 * `buildDemoPortfolio()` (web/src/lib/portfolio/demo.ts). The output types in
 * ./types.ts use the same field names, so once tc/portfolio is merged,
 * `buildMarketingDemoPortfolio` can simply return `buildDemoPortfolio({ range })`.
 *
 * Do not import this file from a client component.
 */

import { getDemoSites, type DemoSite } from '@/lib/demo/catalog';
import { demoRunReport } from '@/lib/demo/ga4';
import { demoSearchAnalytics } from '@/lib/demo/gsc';

import {
    DEMO_RANGES,
    type Compared,
    type DateWindow,
    type DemoAlert,
    type DemoPortfolio,
    type DemoPortfolioSite,
    type DemoRange,
    type DemoSiteDashboard,
    type NamedValue,
    type SearchTotals,
    type TrafficTotals,
} from './types';

const DAY_MS = 86_400_000;
const MEMO_MS = 10 * 60_000;
/** Search Console data in the generator (like the real API) stops 2 days before today. */
const GSC_LAG_DAYS = 2;
const STARRED = new Set(['acme', 'health']);

const iso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const compactToIso = (v: string) => (v.length === 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v);

interface DayWindow {
    curStart: number;
    curEnd: number;
    prevStart: number;
    prevEnd: number;
}

function dayWindow(endDay: number, days: number): DayWindow {
    const curStart = endDay - days + 1;
    return { curStart, curEnd: endDay, prevStart: curStart - days, prevEnd: curStart - 1 };
}

function isoWindow(w: DayWindow): DateWindow {
    return { curStart: iso(w.curStart), curEnd: iso(w.curEnd), prevStart: iso(w.prevStart), prevEnd: iso(w.prevEnd) };
}

/* ─── Raw daily fetchers (generator calls) ─── */

interface GaDay { users: number; sessions: number; pageviews: number; keyEvents: number; engaged: number }
interface GscDay { clicks: number; impressions: number; posWeighted: number }

/* eslint-disable @typescript-eslint/no-explicit-any */
function gaDaily(property: string, start: number, end: number, now: number): Map<string, GaDay> {
    const res = demoRunReport(property, {
        dateRanges: [{ startDate: iso(start), endDate: iso(end) }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'keyEvents' }, { name: 'engagedSessions' }],
        limit: 5000,
    }, { now });
    const out = new Map<string, GaDay>();
    for (const row of (res?.rows ?? []) as any[]) {
        const v = (i: number) => Number(row.metricValues?.[i]?.value ?? 0) || 0;
        out.set(compactToIso(String(row.dimensionValues?.[0]?.value ?? '')), { users: v(0), sessions: v(1), pageviews: v(2), keyEvents: v(3), engaged: v(4) });
    }
    return out;
}

function gscDaily(siteUrl: string, start: number, end: number, now: number): Map<string, GscDay> {
    const res = demoSearchAnalytics(siteUrl, { startDate: iso(start), endDate: iso(end), dimensions: ['date'], rowLimit: 5000 }, { now });
    const out = new Map<string, GscDay>();
    for (const row of (res?.rows ?? []) as any[]) {
        const impressions = Number(row.impressions) || 0;
        out.set(String(row.keys?.[0] ?? ''), { clicks: Number(row.clicks) || 0, impressions, posWeighted: (Number(row.position) || 0) * impressions });
    }
    return out;
}

function gaTop(property: string, w: DayWindow, dimension: string, metric: string, limit: number, now: number): NamedValue[] {
    const res = demoRunReport(property, {
        dateRanges: [{ startDate: iso(w.curStart), endDate: iso(w.curEnd) }],
        dimensions: [{ name: dimension }],
        metrics: [{ name: metric }],
        orderBys: [{ metric: { metricName: metric }, desc: true }],
        limit,
    }, { now });
    return ((res?.rows ?? []) as any[])
        .map((row) => ({ name: String(row.dimensionValues?.[0]?.value ?? ''), value: Number(row.metricValues?.[0]?.value ?? 0) || 0 }))
        .filter((r) => r.name && r.name !== '(not set)');
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ─── Series helpers ─── */

function daysOf(start: number, end: number): number[] {
    const out: number[] = [];
    for (let d = start; d <= end; d++) out.push(d);
    return out;
}

/** Sum consecutive days into buckets of `size` (last bucket ends on the last day). */
function bucket(values: number[], size: number): number[] {
    if (size <= 1) return values;
    const out: number[] = [];
    for (let i = values.length; i > 0; i -= size) {
        let s = 0;
        for (let j = Math.max(0, i - size); j < i; j++) s += values[j];
        out.unshift(s);
    }
    return out;
}

function bucketDates(days: number[], size: number): string[] {
    if (size <= 1) return days.map(iso);
    const out: string[] = [];
    for (let i = days.length; i > 0; i -= size) out.unshift(iso(days[i - 1]));
    return out;
}

function trafficTotals(days: number[], data: Map<string, GaDay>): TrafficTotals {
    let users = 0, sessions = 0, pageviews = 0, keyEvents = 0, engaged = 0;
    for (const d of days) {
        const r = data.get(iso(d));
        if (!r) continue;
        users += r.users; sessions += r.sessions; pageviews += r.pageviews; keyEvents += r.keyEvents; engaged += r.engaged;
    }
    return { users, sessions, pageviews, keyEvents, engagementRate: sessions > 0 ? engaged / sessions : null };
}

function searchTotals(days: number[], data: Map<string, GscDay>): SearchTotals {
    let clicks = 0, impressions = 0, posWeighted = 0;
    for (const d of days) {
        const r = data.get(iso(d));
        if (!r) continue;
        clicks += r.clicks; impressions += r.impressions; posWeighted += r.posWeighted;
    }
    return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : null, position: impressions > 0 ? posWeighted / impressions : null };
}

function pct(cur: number, prev: number): number | null {
    return prev > 0 ? ((cur - prev) / prev) * 100 : null;
}

function rangeDays(range: DemoRange): number {
    return DEMO_RANGES.find((r) => r.value === range)?.days ?? 28;
}

function rangeLong(range: DemoRange): string {
    return DEMO_RANGES.find((r) => r.value === range)?.long ?? 'previous period';
}

/* ─── Site identity ─── */

function hostOf(site: DemoSite): string {
    return site.host.replace(/^www\./, '').toLowerCase();
}

function siteIdentity(site: DemoSite, all: readonly DemoSite[]) {
    const host = hostOf(site);
    const shared = all.filter((s) => hostOf(s) === host).length > 1;
    const label = shared && site.gsc && !site.gsc.siteUrl.startsWith('sc-domain:')
        ? site.gsc.siteUrl.replace(/\/$/, '').replace(/^https:\/\//, '')
        : host;
    return { host, label, slug: site.key, name: site.ga?.displayName ?? site.name ?? host };
}

/* ─── Alerts (PRODUCT 1: >30% drop, or zero for 2+ days) ─── */

function siteAlerts(site: DemoSite, host: string, metric: 'clicks' | 'users', cur: number, prev: number, dailyCur: number[], range: DemoRange, days: number): DemoAlert[] {
    const out: DemoAlert[] = [];
    const label = metric === 'clicks' ? 'Clicks' : 'Users';
    let zeroRun = 0;
    for (let i = dailyCur.length - 1; i >= 0 && dailyCur[i] === 0; i--) zeroRun++;
    if (zeroRun >= 2 && prev / days >= 3) {
        out.push({
            id: `${site.key}:${metric}:zero`, siteKey: site.key, host, slug: site.key, metric, type: 'zero', severity: 'critical',
            current: cur, previous: prev, days: zeroRun, message: `No ${metric} for ${zeroRun} days`,
        });
        return out;
    }
    const change = pct(cur, prev);
    // Tiny sites swing a lot; only alert once the previous period had real volume.
    if (change !== null && change <= -30 && prev >= 50) {
        out.push({
            id: `${site.key}:${metric}:drop`, siteKey: site.key, host, slug: site.key, metric, type: 'drop',
            severity: change <= -50 ? 'critical' : 'warning', current: cur, previous: prev, changePct: change,
            message: `${label} down ${Math.abs(Math.round(change))}% vs ${rangeLong(range)}`,
        });
    }
    return out;
}

/* ─── Portfolio ─── */

const memo = new Map<string, { until: number; value: unknown }>();

function memoised<T>(key: string, build: () => T): T {
    const hit = memo.get(key);
    if (hit && hit.until > Date.now()) return hit.value as T;
    const value = build();
    if (memo.size > 64) memo.clear();
    memo.set(key, { until: Date.now() + MEMO_MS, value });
    return value;
}

export function buildMarketingDemoPortfolio(range: DemoRange = '28d', now: number = Date.now()): DemoPortfolio {
    const today = Math.floor(now / DAY_MS);
    return memoised(`portfolio:${range}:${today}`, () => computePortfolio(range, now, today));
}

function computePortfolio(range: DemoRange, now: number, today: number): DemoPortfolio {
    const days = rangeDays(range);
    const size = range === '12m' ? 7 : 1;
    const gaW = dayWindow(today - 1, days);
    const gscW = dayWindow(today - GSC_LAG_DAYS, days);
    const gaDays = daysOf(gaW.curStart, gaW.curEnd);
    const gaPrevDays = daysOf(gaW.prevStart, gaW.prevEnd);
    const gscDays = daysOf(gscW.curStart, gscW.curEnd);
    const gscPrevDays = daysOf(gscW.prevStart, gscW.prevEnd);
    const all = getDemoSites();

    const zero = (n: number) => new Array<number>(n).fill(0);
    const nBucketsGa = bucket(zero(days), size).length;
    const nBucketsGsc = nBucketsGa;
    const combined = { clicks: zero(nBucketsGsc), impressions: zero(nBucketsGsc), posW: zero(nBucketsGsc), users: zero(nBucketsGa), sessions: zero(nBucketsGa) };
    const combinedPrev = { clicks: zero(nBucketsGsc), impressions: zero(nBucketsGsc), posW: zero(nBucketsGsc), users: zero(nBucketsGa), sessions: zero(nBucketsGa) };

    const sites: DemoPortfolioSite[] = all.map((site) => {
        const id = siteIdentity(site, all);
        const out: DemoPortfolioSite = {
            key: site.ga ? `ga4:${site.ga.propertyId}` : `gsc:${site.gsc?.siteUrl}`,
            ...id,
            gsc: site.gsc ? { siteUrl: site.gsc.siteUrl, propertyType: site.gsc.siteUrl.startsWith('sc-domain:') ? 'domain' : 'prefix', permissionLevel: site.gsc.permissionLevel } : null,
            ga4: site.ga ? { property: site.ga.propertyId, propertyId: site.ga.propertyId.replace('properties/', ''), displayName: site.ga.displayName, accountName: null } : null,
            starred: STARRED.has(site.key),
            status: 'synced',
            search: null,
            traffic: null,
            series: {},
            alerts: [],
        };

        if (site.ga) {
            const data = gaDaily(site.ga.propertyId, gaW.prevStart, gaW.curEnd, now);
            const pick = (ds: number[], k: keyof GaDay) => ds.map((d) => data.get(iso(d))?.[k] ?? 0);
            out.traffic = { cur: trafficTotals(gaDays, data), prev: trafficTotals(gaPrevDays, data) };
            const users = bucket(pick(gaDays, 'users'), size);
            const sessions = bucket(pick(gaDays, 'sessions'), size);
            out.series.users = users;
            out.series.sessions = sessions;
            const pu = bucket(pick(gaPrevDays, 'users'), size);
            const ps = bucket(pick(gaPrevDays, 'sessions'), size);
            users.forEach((v, i) => { combined.users[i] += v; combined.sessions[i] += sessions[i]; combinedPrev.users[i] += pu[i]; combinedPrev.sessions[i] += ps[i]; });
            if (!site.gsc) {
                out.alerts.push(...siteAlerts(site, id.host, 'users', out.traffic.cur.users, out.traffic.prev?.users ?? 0, pick(gaDays, 'users'), range, days));
            }
        }
        if (site.gsc) {
            const data = gscDaily(site.gsc.siteUrl, gscW.prevStart, gscW.curEnd, now);
            const pick = (ds: number[], k: keyof GscDay) => ds.map((d) => data.get(iso(d))?.[k] ?? 0);
            out.search = { cur: searchTotals(gscDays, data), prev: searchTotals(gscPrevDays, data) };
            const clicks = bucket(pick(gscDays, 'clicks'), size);
            const impressions = bucket(pick(gscDays, 'impressions'), size);
            const posW = bucket(pick(gscDays, 'posWeighted'), size);
            out.series.clicks = clicks;
            out.series.impressions = impressions;
            const pc = bucket(pick(gscPrevDays, 'clicks'), size);
            const pi = bucket(pick(gscPrevDays, 'impressions'), size);
            const pp = bucket(pick(gscPrevDays, 'posWeighted'), size);
            clicks.forEach((v, i) => {
                combined.clicks[i] += v; combined.impressions[i] += impressions[i]; combined.posW[i] += posW[i];
                combinedPrev.clicks[i] += pc[i]; combinedPrev.impressions[i] += pi[i]; combinedPrev.posW[i] += pp[i];
            });
            out.alerts.push(...siteAlerts(site, id.host, 'clicks', out.search.cur.clicks, out.search.prev?.clicks ?? 0, pick(gscDays, 'clicks'), range, days));
        }
        return out;
    });

    const primary = (s: DemoPortfolioSite) => (s.search ? [s.search.cur.clicks, s.search.prev?.clicks ?? 0] : s.traffic ? [s.traffic.cur.users, s.traffic.prev?.users ?? 0] : [0, 0]);
    sites.sort((a, b) => Number(b.starred) - Number(a.starred)
        || (b.search?.cur.clicks ?? -1) - (a.search?.cur.clicks ?? -1)
        || (b.traffic?.cur.users ?? 0) - (a.traffic?.cur.users ?? 0));

    const addSearch = (acc: SearchTotals & { posW: number }, t: SearchTotals) => {
        acc.clicks += t.clicks; acc.impressions += t.impressions; acc.posW += (t.position ?? 0) * t.impressions;
        return acc;
    };
    const finishSearch = (acc: SearchTotals & { posW: number }): SearchTotals => ({
        clicks: acc.clicks, impressions: acc.impressions,
        ctr: acc.impressions > 0 ? acc.clicks / acc.impressions : null,
        position: acc.impressions > 0 ? acc.posW / acc.impressions : null,
    });
    const emptyS = (): SearchTotals & { posW: number } => ({ clicks: 0, impressions: 0, ctr: null, position: null, posW: 0 });
    const searchSites = sites.filter((s) => s.search);
    const trafficSites = sites.filter((s) => s.traffic);
    const addTraffic = (acc: TrafficTotals & { engaged: number }, t: TrafficTotals) => {
        acc.users += t.users; acc.sessions += t.sessions; acc.pageviews += t.pageviews; acc.keyEvents += t.keyEvents;
        acc.engaged += (t.engagementRate ?? 0) * t.sessions;
        return acc;
    };
    const finishTraffic = (acc: TrafficTotals & { engaged: number }): TrafficTotals => ({
        users: acc.users, sessions: acc.sessions, pageviews: acc.pageviews, keyEvents: acc.keyEvents,
        engagementRate: acc.sessions > 0 ? acc.engaged / acc.sessions : null,
    });
    const emptyT = (): TrafficTotals & { engaged: number } => ({ users: 0, sessions: 0, pageviews: 0, keyEvents: 0, engagementRate: null, engaged: 0 });

    const totalsSearch: Compared<SearchTotals> | null = searchSites.length
        ? {
            cur: finishSearch(searchSites.reduce((acc, s) => addSearch(acc, s.search!.cur), emptyS())),
            prev: finishSearch(searchSites.reduce((acc, s) => addSearch(acc, s.search!.prev ?? emptyS()), emptyS())),
        }
        : null;
    const totalsTraffic: Compared<TrafficTotals> | null = trafficSites.length
        ? {
            cur: finishTraffic(trafficSites.reduce((acc, s) => addTraffic(acc, s.traffic!.cur), emptyT())),
            prev: finishTraffic(trafficSites.reduce((acc, s) => addTraffic(acc, s.traffic!.prev ?? emptyT()), emptyT())),
        }
        : null;

    const counts = sites.reduce(
        (acc, s) => {
            const [cur, prev] = primary(s);
            if (prev === 0 && cur > 0) acc.new++;
            else if (cur > prev) acc.up++;
            else if (cur < prev) acc.down++;
            return acc;
        },
        { up: 0, down: 0, new: 0 },
    );

    const position = (posW: number[], impr: number[]) => posW.map((p, i) => (impr[i] > 0 ? p / impr[i] : null));
    const alerts = sites.flatMap((s) => s.alerts).sort((a, b) => (a.severity === b.severity ? (a.changePct ?? -100) - (b.changePct ?? -100) : a.severity === 'critical' ? -1 : 1));

    return {
        range,
        generatedAt: now,
        windows: { search: isoWindow(gscW), traffic: isoWindow(gaW) },
        bucketDays: size,
        dates: { search: bucketDates(gscDays, size), traffic: bucketDates(gaDays, size) },
        sites,
        totals: { search: totalsSearch, traffic: totalsTraffic, sites: { total: sites.length, synced: sites.length, ...counts, hidden: 0 } },
        combined: {
            clicks: combined.clicks, impressions: combined.impressions, position: position(combined.posW, combined.impressions),
            users: combined.users, sessions: combined.sessions,
        },
        combinedPrev: {
            clicks: combinedPrev.clicks, impressions: combinedPrev.impressions, position: position(combinedPrev.posW, combinedPrev.impressions),
            users: combinedPrev.users, sessions: combinedPrev.sessions,
        },
        alerts,
        demo: true,
    };
}

/* ─── Sample dashboard for one site ─── */

export function demoSiteSlugs(): string[] {
    return getDemoSites().map((s) => s.key);
}

export function buildMarketingDemoSiteDashboard(slug: string, range: DemoRange = '28d', now: number = Date.now()): DemoSiteDashboard | null {
    const today = Math.floor(now / DAY_MS);
    return memoised(`site:${slug}:${range}:${today}`, () => computeSiteDashboard(slug, range, now, today));
}

function computeSiteDashboard(slug: string, range: DemoRange, now: number, today: number): DemoSiteDashboard | null {
    const site = getDemoSites().find((s) => s.key === slug);
    if (!site) return null;
    const portfolio = buildMarketingDemoPortfolio(range, now);
    const card = portfolio.sites.find((s) => s.slug === slug);
    if (!card) return null;
    const days = rangeDays(range);

    let traffic: DemoSiteDashboard['traffic'] = null;
    if (site.ga) {
        const w = dayWindow(today - 1, days);
        const data = gaDaily(site.ga.propertyId, w.prevStart, w.curEnd, now);
        const cur = daysOf(w.curStart, w.curEnd);
        const prev = daysOf(w.prevStart, w.prevEnd);
        const pick = (ds: number[], k: keyof GaDay) => ds.map((d) => data.get(iso(d))?.[k] ?? 0);
        traffic = {
            window: isoWindow(w),
            dates: cur.map(iso),
            prevDates: prev.map(iso),
            users: pick(cur, 'users'),
            sessions: pick(cur, 'sessions'),
            pageviews: pick(cur, 'pageviews'),
            prevUsers: pick(prev, 'users'),
            prevSessions: pick(prev, 'sessions'),
            prevPageviews: pick(prev, 'pageviews'),
            totals: { cur: trafficTotals(cur, data), prev: trafficTotals(prev, data) },
            channels: gaTop(site.ga.propertyId, w, 'sessionDefaultChannelGroup', 'sessions', 10, now),
            devices: gaTop(site.ga.propertyId, w, 'deviceCategory', 'sessions', 5, now),
            countries: gaTop(site.ga.propertyId, w, 'country', 'activeUsers', 8, now),
            pages: gaTop(site.ga.propertyId, w, 'pagePath', 'screenPageViews', 8, now),
        };
    }

    let search: DemoSiteDashboard['search'] = null;
    if (site.gsc) {
        const siteUrl = site.gsc.siteUrl;
        const w = dayWindow(today - GSC_LAG_DAYS, days);
        const data = gscDaily(siteUrl, w.prevStart, w.curEnd, now);
        const cur = daysOf(w.curStart, w.curEnd);
        const prev = daysOf(w.prevStart, w.prevEnd);
        const pick = (ds: number[], k: keyof GscDay) => ds.map((d) => data.get(iso(d))?.[k] ?? 0);
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const q = demoSearchAnalytics(siteUrl, { startDate: iso(w.curStart), endDate: iso(w.curEnd), dimensions: ['query'], rowLimit: 8 }, { now });
        const p = demoSearchAnalytics(siteUrl, { startDate: iso(w.curStart), endDate: iso(w.curEnd), dimensions: ['page'], rowLimit: 8 }, { now });
        const queries = ((q?.rows ?? []) as any[]).map((r) => ({ query: String(r.keys?.[0] ?? ''), clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0, position: Number(r.position) || 0 }));
        const pages = ((p?.rows ?? []) as any[]).map((r) => {
            const url = String(r.keys?.[0] ?? '');
            let path = url;
            try { const u = new URL(url); path = `${u.host === card.host || u.host === `www.${card.host}` ? '' : u.host}${u.pathname}`; } catch { /* keep raw */ }
            return { name: path || '/', value: Number(r.clicks) || 0 };
        });
        /* eslint-enable @typescript-eslint/no-explicit-any */
        search = {
            window: isoWindow(w),
            dates: cur.map(iso),
            prevDates: prev.map(iso),
            clicks: pick(cur, 'clicks'),
            impressions: pick(cur, 'impressions'),
            prevClicks: pick(prev, 'clicks'),
            prevImpressions: pick(prev, 'impressions'),
            totals: { cur: searchTotals(cur, data), prev: searchTotals(prev, data) },
            queries: queries.sort((a, b) => b.clicks - a.clicks),
            pages: pages.sort((a, b) => b.value - a.value),
        };
    }

    return { site: card, range, traffic, search };
}

