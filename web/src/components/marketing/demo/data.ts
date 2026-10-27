/**
 * Server-only adapter for the public demo (home hero + /demo + /demo/[slug]).
 * The portfolio is `buildDemoPortfolio()` from lib/portfolio/demo.ts, the same
 * builder as the app's portfolio, so numbers, host names and card titles match
 * the app exactly; this file only maps each site to its /demo/[slug] page (the
 * demo catalogue key) and builds the per-site sample dashboards. Pure, no
 * network, never calls Google, deterministic per UTC day, memoised 10 minutes.
 *
 * Do not import this file from a client component.
 */

import { DEMO_DEFAULT_ACCOUNT, findSiteByPropertyId, findSiteBySiteUrl, getDemoAccount, getDemoSites } from '@/lib/demo/catalog';
import { demoRunReport } from '@/lib/demo/ga4';
import { demoSearchAnalytics } from '@/lib/demo/gsc';
import { buildDemoPortfolio } from '@/lib/portfolio/demo';
import type { PortfolioSite } from '@/lib/portfolio/types';

import {
    DEMO_RANGES,
    type DateWindow,
    type DemoPortfolio,
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

const dayOf = (isoDate: string) => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);

function windowDays(w: DateWindow): DayWindow {
    return { curStart: dayOf(w.curStart), curEnd: dayOf(w.curEnd), prevStart: dayOf(w.prevStart), prevEnd: dayOf(w.prevEnd) };
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

function trafficTotals(days: number[], data: Map<string, GaDay>): TrafficTotals {
    let users = 0, sessions = 0, pageviews = 0, keyEvents = 0, engaged = 0;
    for (const d of days) {
        const r = data.get(iso(d));
        if (!r) continue;
        users += r.users; sessions += r.sessions; pageviews += r.pageviews; keyEvents += r.keyEvents; engaged += r.engaged;
    }
    return { users, usersExact: false, sessions, pageviews, keyEvents, engagementRate: sessions > 0 ? engaged / sessions : null };
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

function rangeDays(range: DemoRange): number {
    return DEMO_RANGES.find((r) => r.value === range)?.days ?? 28;
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

/** Demo catalogue key of a portfolio site: its /demo/[slug]. */
function catalogKey(site: PortfolioSite): string | null {
    const hit = (site.gsc && findSiteBySiteUrl(site.gsc.siteUrl)) || (site.ga4 && findSiteByPropertyId(site.ga4.property));
    return hit ? hit.key : null;
}

export function buildMarketingDemoPortfolio(range: DemoRange = '28d', now: number = Date.now()): DemoPortfolio {
    const today = Math.floor(now / DAY_MS);
    return memoised(`portfolio:${range}:${today}`, () => {
        const p = buildDemoPortfolio({ range, now });
        const slugs = new Map(p.sites.map((site) => [site.slug, catalogKey(site) ?? site.slug]));
        const reslug = <T extends { slug: string }>(x: T): T => ({ ...x, slug: slugs.get(x.slug) ?? x.slug });
        return {
            ...p,
            sites: p.sites.map((site) => ({ ...reslug(site), alerts: site.alerts.map(reslug) })),
            alerts: p.alerts.map(reslug),
            demo: true,
        };
    });
}

/* ─── Sample dashboard for one site ─── */

/** /demo/[slug] pages: every site of the demo account's portfolio. */
export function demoSiteSlugs(): string[] {
    const account = getDemoAccount(DEMO_DEFAULT_ACCOUNT);
    const keys = new Set([...account.gaAccounts.flatMap((a) => a.siteKeys), ...account.gscSiteKeys]);
    return getDemoSites().filter((s) => keys.has(s.key)).map((s) => s.key);
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
        // Same window as the portfolio card, so the totals match it.
        const w = portfolio.windows.traffic ? windowDays(portfolio.windows.traffic) : dayWindow(today - 1, days);
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
            // Exact (de-duplicated) users from the portfolio card, like the app.
            totals: card.traffic ?? { cur: trafficTotals(cur, data), prev: trafficTotals(prev, data) },
            channels: gaTop(site.ga.propertyId, w, 'sessionDefaultChannelGroup', 'sessions', 10, now),
            devices: gaTop(site.ga.propertyId, w, 'deviceCategory', 'sessions', 5, now),
            countries: gaTop(site.ga.propertyId, w, 'country', 'activeUsers', 8, now),
            pages: gaTop(site.ga.propertyId, w, 'pagePath', 'screenPageViews', 8, now),
        };
    }

    let search: DemoSiteDashboard['search'] = null;
    if (site.gsc) {
        const siteUrl = site.gsc.siteUrl;
        const w = portfolio.windows.search ? windowDays(portfolio.windows.search) : dayWindow(today - GSC_LAG_DAYS, days);
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
            totals: card.search ?? { cur: searchTotals(cur, data), prev: searchTotals(prev, data) },
            queries: queries.sort((a, b) => b.clicks - a.clicks),
            pages: pages.sort((a, b) => b.value - a.value),
        };
    }

    return { site: card, range, traffic, search };
}

