/**
 * Portfolio types shared by the API routes, the sync, the public demo and the UI.
 * Client-safe: no server imports here.
 */

export type PortfolioRange = '7d' | '28d' | '3m' | '12m';
export type AssetKind = 'ga4' | 'gsc';
export type AssetStatus = 'pending' | 'syncing' | 'synced' | 'error' | 'no_access';
/** Site-level status shown on the card pill. */
export type SiteStatus = 'synced' | 'syncing' | 'pending' | 'stale' | 'error' | 'no_access';

export interface SearchTotals {
    clicks: number;
    impressions: number;
    /** clicks / impressions, 0..1; null without impressions */
    ctr: number | null;
    /** impression-weighted average position; null without impressions */
    position: number | null;
}

export interface TrafficTotals {
    /** Sum of daily active users (GA4 activeUsers per day). */
    users: number;
    sessions: number;
    pageviews: number;
    keyEvents: number;
    /** session-weighted engagement rate, 0..1; null without sessions */
    engagementRate: number | null;
}

export interface Compared<T> {
    cur: T;
    /** null when the previous window is not covered by stored data */
    prev: T | null;
}

export interface DateWindow {
    curStart: string;
    curEnd: string;
    prevStart: string;
    prevEnd: string;
}

export interface SiteSeries {
    clicks?: number[];
    impressions?: number[];
    users?: number[];
    sessions?: number[];
}

export interface CombinedSeries {
    clicks: number[];
    impressions: number[];
    position: (number | null)[];
    users: number[];
    sessions: number[];
}

export type AlertMetric = 'clicks' | 'users';

export interface PortfolioAlert {
    id: string;
    siteKey: string;
    host: string;
    slug: string;
    metric: AlertMetric;
    type: 'drop' | 'zero';
    severity: 'critical' | 'warning';
    current: number;
    previous: number | null;
    /** Percent change (negative for drops), only for type "drop". */
    changePct?: number;
    /** Consecutive zero days, only for type "zero". */
    days?: number;
    message: string;
}

export interface SiteGsc {
    siteUrl: string;
    propertyType: 'domain' | 'prefix';
    permissionLevel: string | null;
    status: AssetStatus;
    lastSyncedAt: number | null;
    lastError: string | null;
    missing: boolean;
    hasData: boolean;
}

export interface SiteGa4 {
    property: string;
    /** numeric id, "123456789" */
    propertyId: string;
    displayName: string;
    accountName: string | null;
    status: AssetStatus;
    lastSyncedAt: number | null;
    lastError: string | null;
    missing: boolean;
    hasData: boolean;
}

export interface PortfolioSite {
    /** Stable key (pairing key): "gsc:<siteUrl>" or "ga4:properties/<id>". */
    key: string;
    host: string;
    /** Card title: the normalized host (or the GA4 name when there is no host). */
    label: string;
    /** Short chip that tells apart sites sharing a host: "http", "www", "/blog", "domain". */
    variant: string | null;
    /** URL segment for /dashboard/s/[slug] (host, "--2" on collisions). */
    slug: string;
    /** GA4 display name when there is one, else the host. */
    name: string;
    gsc: SiteGsc | null;
    ga4: SiteGa4 | null;
    pairing: 'auto' | 'manual' | 'none';
    starred: boolean;
    hidden: boolean;
    status: SiteStatus;
    lastSyncedAt: number | null;
    search: Compared<SearchTotals> | null;
    traffic: Compared<TrafficTotals> | null;
    series: SiteSeries;
    alerts: PortfolioAlert[];
}

export type PortfolioState =
    | 'ready'        // at least one site
    | 'no_google'    // Google not connected (or tokens gone)
    | 'first_sync'   // connected, nothing stored yet, inventory running
    | 'no_sites';    // connected, inventory found nothing

export interface PortfolioTotals {
    search: Compared<SearchTotals> | null;
    traffic: Compared<TrafficTotals> | null;
    sites: { total: number; synced: number; up: number; down: number; new: number; hidden: number };
}

export interface PortfolioResponse {
    range: PortfolioRange;
    state: PortfolioState;
    generatedAt: number;
    /** True while a sync runs for this user; the UI polls until it is false. */
    syncing: boolean;
    /** Newest successful sync of any asset (epoch seconds). */
    lastSyncedAt: number | null;
    /** Google connection problem (expired token, API disabled). */
    googleError: { status: number; message: string } | null;
    windows: { search: DateWindow | null; traffic: DateWindow | null };
    /** Bucket size of the series (1 = daily, 7 = weekly). */
    bucketDays: number;
    /** Label date (bucket end, YYYY-MM-DD) for each series point. */
    dates: { search: string[]; traffic: string[] };
    sites: PortfolioSite[];
    totals: PortfolioTotals;
    /** Sum over visible (not hidden) sites, aligned to `dates` (position: impression-weighted). */
    combined: CombinedSeries;
    /** Same for the previous period (aligned by bucket index); a metric is absent when no site covers it. */
    combinedPrev: Partial<CombinedSeries>;
    alerts: PortfolioAlert[];
    demo?: boolean;
}

export interface SitePatch {
    starred?: boolean;
    hidden?: boolean;
    /** Pair this site's Search Console property with a GA4 property, or null to unlink. */
    ga4Property?: string | null;
    /** Pair this GA4-only site with a Search Console site, or null to unlink. */
    gscSite?: string | null;
    /** Back to automatic (hostname) pairing. */
    resetPairing?: boolean;
}
