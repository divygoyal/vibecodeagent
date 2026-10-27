/**
 * Server-only data for the home page, all from the demo generator (no Google, deterministic per UTC day):
 * the portfolio for every range (hero), the three-beat story (sites, a flagged drop, its top fix) and the
 * product tour's deep links. Pure: tests call it with a fixed `now`.
 *
 * Demo hosts come from lib/demo/catalog.ts and the app slugs from the portfolio builder, never from a
 * hard-coded list, so links follow the generator.
 */
import { getDemoSites } from '@/lib/demo/catalog';
import { buildDemoPortfolio } from '@/lib/portfolio/demo';
import type { PortfolioRange, PortfolioResponse } from '@/lib/portfolio/types';
import { buildMarketingDemoActions } from '../demo/data';
import { demoHref } from './demoLinks';

export const HOME_RANGES: PortfolioRange[] = ['7d', '28d', '3m', '12m'];

/** The site the tour opens (the generator's growing SaaS), by catalogue key. */
export const TOUR_SITE_KEY = 'acme';

export interface HomeStory {
    totalSites: number;
    sites: Array<{ key: string; label: string; host: string; clicks: number; prevClicks: number | null }>;
    drop: { label: string; host: string; changePct: number; period: string } | null;
    fix: { title: string; gain: number; page: string } | null;
    fixHref: string;
}

export interface HomeTourLinks {
    /** App slug of the tour site (/dashboard/s/<slug>). */
    slug: string;
    host: string;
    portfolio: string;
    site: string;
    fixes: string;
    traffic: string;
    dashboards: string;
    connectAi: string;
}

export interface HomeData {
    byRange: Record<PortfolioRange, PortfolioResponse>;
    story: HomeStory;
    tour: HomeTourLinks;
}

const bareHost = (h: string) => h.replace(/^www\./, '').toLowerCase();

/** The app slug of a host in a portfolio (the plain-slug "main" site of that host). */
export function appSlugFor(portfolio: PortfolioResponse, host: string): string | null {
    const h = bareHost(host);
    const sites = portfolio.sites.filter((s) => bareHost(s.host) === h);
    if (!sites.length) return null;
    return (sites.find((s) => s.slug === h) ?? sites.find((s) => s.ga4 && s.gsc) ?? sites[0]).slug;
}

/** Catalogue key of a host (for the marketing actions builder). */
function catalogKeyFor(host: string): string | null {
    const h = bareHost(host);
    return getDemoSites().find((s) => bareHost(s.host) === h)?.key ?? null;
}

const pctChange = (cur: number, prev: number | null | undefined) => (prev && prev > 0 ? ((cur - prev) / prev) * 100 : null);

export function buildStory(byRange: Record<PortfolioRange, PortfolioResponse>, now: number): HomeStory {
    const p28 = byRange['28d'];
    const sites = p28.sites
        .filter((s) => s.search && !s.hidden)
        .sort((a, b) => b.search!.cur.clicks - a.search!.cur.clicks)
        .slice(0, 4)
        .map((s) => ({ key: s.key, label: s.label, host: s.host, clicks: s.search!.cur.clicks, prevClicks: s.search!.prev?.clicks ?? null }));

    // A real alert from the app's own rules (3 months shows the core-update drop); else the biggest 28-day fall.
    let drop: HomeStory['drop'] = null;
    const alert = byRange['3m'].alerts.find((a) => a.metric === 'clicks' && a.type === 'drop' && typeof a.changePct === 'number');
    if (alert) {
        const site = byRange['3m'].sites.find((s) => s.key === alert.siteKey);
        drop = { label: site?.label ?? alert.host, host: alert.host, changePct: alert.changePct!, period: 'last 3 months vs previous' };
    } else {
        const worst = p28.sites
            .map((s) => ({ s, pct: s.search ? pctChange(s.search.cur.clicks, s.search.prev?.clicks) : null }))
            .filter((x): x is { s: typeof x.s; pct: number } => x.pct !== null && x.pct < 0 && (x.s.search?.prev?.clicks ?? 0) >= 100)
            .sort((a, b) => a.pct - b.pct)[0];
        if (worst) drop = { label: worst.s.label, host: worst.s.host, changePct: worst.pct, period: 'last 28 days vs previous' };
    }

    let fix: HomeStory['fix'] = null;
    let fixHref = demoHref('/dashboard');
    const fixHost = drop?.host ?? sites[0]?.host;
    if (fixHost) {
        const key = catalogKeyFor(fixHost);
        const top = key ? buildMarketingDemoActions(key, 1, now)?.actions[0] : undefined;
        if (top) fix = { title: top.title, gain: top.gain, page: top.page ?? '' };
        const slug = appSlugFor(p28, fixHost);
        if (slug) fixHref = demoHref(`/dashboard/s/${encodeURIComponent(slug)}/actions`);
    }
    return { totalSites: p28.totals.sites.total, sites, drop, fix, fixHref };
}

export function buildTourLinks(portfolio: PortfolioResponse): HomeTourLinks {
    const site = getDemoSites().find((s) => s.key === TOUR_SITE_KEY) ?? getDemoSites()[0];
    const host = bareHost(site.host);
    const slug = appSlugFor(portfolio, host) ?? host;
    const base = `/dashboard/s/${encodeURIComponent(slug)}`;
    return {
        slug,
        host,
        portfolio: demoHref('/dashboard'),
        site: demoHref(base),
        fixes: demoHref(`${base}/actions`),
        traffic: demoHref(`${base}/traffic`),
        dashboards: demoHref('/dashboard/dashboards'),
        connectAi: demoHref('/dashboard/connect-ai'),
    };
}

export function buildHomeData(now: number = Date.now()): HomeData {
    // buildDemoPortfolio memoises per range and UTC day, so the live page pays the generator once per 10 minutes.
    const byRange = Object.fromEntries(HOME_RANGES.map((range) => [range, buildDemoPortfolio({ range, now })])) as Record<PortfolioRange, PortfolioResponse>;
    return { byRange, story: buildStory(byRange, now), tour: buildTourLinks(byRange['28d']) };
}
