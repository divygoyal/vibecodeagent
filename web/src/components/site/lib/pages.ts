/** Join GA4 page rows with Search Console page rows by normalised host + path. */
import { displayPage, pageRef } from './rules';
import type { Ga4Row, GscMetrics, GscRow } from './types';

export interface MergedPage {
    key: string;
    path: string;
    /** '/pricing' or 'docs.acme.com/start'. */
    label: string;
    /** Full URL when known (from Search Console), for "open page" links and GSC filters. */
    url: string | null;
    /** The page's <title> from GA4 (most viewed, brand suffix removed), null when GA4 has none or the page is GSC-only. */
    title: string | null;
    /** The GA4 pagePath / hostName as reported (for GA4 page filters). */
    gaPath: string | null;
    gaHost: string | null;
    views: number | null;
    users: number | null;
    /** Average engagement time per user, seconds. */
    engagement: number | null;
    engagementRate: number | null;
    conversions: number | null;
    /** GA4 totalRevenue on this page (the page where purchases happened), in the property currency. */
    revenue: number | null;
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    position: number | null;
    prevViews: number | null | undefined;
    prevClicks: number | null | undefined;
}

export function mergePages(ga4: Ga4Row[] | undefined, gsc: GscRow[] | undefined, siteHost: string | null): MergedPage[] {
    const map = new Map<string, MergedPage>();
    const blank = (key: string, path: string, label: string): MergedPage => ({
        key, path, label, title: null, url: null, gaPath: null, gaHost: null, views: null, users: null, engagement: null, engagementRate: null, conversions: null, revenue: null,
        clicks: null, impressions: null, ctr: null, position: null, prevViews: undefined, prevClicks: undefined,
    });
    for (const r of ga4 ?? []) {
        const ref = pageRef(r.dims.pagePath ?? '/', r.dims.hostName || siteHost);
        const m = map.get(ref.key) ?? blank(ref.key, ref.path, displayPage(ref, siteHost));
        const views = r.cur.screenPageViews ?? 0;
        if (!m.gaPath || views > (m.views ?? 0)) {
            m.gaPath = r.dims.pagePath ?? '/';
            m.gaHost = r.dims.hostName || null;
            m.title = r.dims.pageTitle || m.title;
        }
        if (!m.title && r.dims.pageTitle) m.title = r.dims.pageTitle;
        const users = r.cur.activeUsers ?? 0;
        // Several GA4 paths can normalise to one key (trailing slash, case): add them up.
        const prevUsers = m.users ?? 0;
        m.views = (m.views ?? 0) + views;
        m.users = prevUsers + users;
        const eng = (m.engagement ?? 0) * prevUsers + (r.cur.userEngagementDuration ?? 0);
        m.engagement = m.users > 0 ? eng / m.users : 0;
        m.engagementRate = r.cur.engagementRate ?? m.engagementRate;
        m.conversions = (m.conversions ?? 0) + (r.cur.keyEvents ?? 0);
        m.revenue = (m.revenue ?? 0) + (r.cur.totalRevenue ?? 0);
        if (r.prev !== undefined) m.prevViews = r.prev === null ? null : (m.prevViews ?? 0) + (r.prev.screenPageViews ?? 0);
        map.set(ref.key, m);
    }
    for (const r of gsc ?? []) {
        const ref = pageRef(r.key);
        const m = map.get(ref.key) ?? blank(ref.key, ref.path, displayPage(ref, siteHost));
        const prior: GscMetrics = { clicks: m.clicks ?? 0, impressions: m.impressions ?? 0, ctr: 0, position: m.position ?? 0 };
        const impressions = prior.impressions + r.impressions;
        m.url = m.url ?? r.key;
        m.clicks = prior.clicks + r.clicks;
        m.impressions = impressions;
        m.ctr = impressions > 0 ? m.clicks / impressions : 0;
        m.position = impressions > 0 ? (prior.position * prior.impressions + r.position * r.impressions) / impressions : r.position;
        if (r.prev !== undefined) m.prevClicks = r.prev === null ? null : (m.prevClicks ?? 0) + r.prev.clicks;
        map.set(ref.key, m);
    }
    return [...map.values()];
}
