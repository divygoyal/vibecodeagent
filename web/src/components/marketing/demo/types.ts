/**
 * Client-safe types for the public demo (home hero + /demo).
 *
 * Deliberately a structural subset of tc/portfolio's `PortfolioResponse`
 * (web/src/lib/portfolio/types.ts) with the same field names, so the marketing
 * adapter in ./data.ts can be swapped for `buildDemoPortfolio()` once that
 * branch is merged without touching the UI components.
 */

export type DemoRange = '7d' | '28d' | '3m' | '12m';

export const DEMO_RANGES: Array<{ value: DemoRange; label: string; days: number; long: string }> = [
    { value: '7d', label: '7d', days: 7, long: 'previous 7 days' },
    { value: '28d', label: '28d', days: 28, long: 'previous 28 days' },
    { value: '3m', label: '3m', days: 90, long: 'previous 3 months' },
    { value: '12m', label: '12m', days: 364, long: 'previous 12 months' },
];

export interface SearchTotals {
    clicks: number;
    impressions: number;
    ctr: number | null;
    position: number | null;
}

export interface TrafficTotals {
    users: number;
    sessions: number;
    pageviews: number;
    keyEvents: number;
    engagementRate: number | null;
}

export interface Compared<T> {
    cur: T;
    prev: T | null;
}

export interface DateWindow {
    curStart: string;
    curEnd: string;
    prevStart: string;
    prevEnd: string;
}

export interface DemoAlert {
    id: string;
    siteKey: string;
    host: string;
    slug: string;
    metric: 'clicks' | 'users';
    type: 'drop' | 'zero';
    severity: 'critical' | 'warning';
    current: number;
    previous: number | null;
    changePct?: number;
    days?: number;
    message: string;
}

export interface DemoPortfolioSite {
    key: string;
    host: string;
    /** What the card shows (host, or the full prefix when two properties share a host). */
    label: string;
    /** URL segment for /demo/[slug]. */
    slug: string;
    name: string;
    gsc: { siteUrl: string; propertyType: 'domain' | 'prefix'; permissionLevel: string | null } | null;
    ga4: { property: string; propertyId: string; displayName: string; accountName: string | null } | null;
    starred: boolean;
    status: 'synced';
    search: Compared<SearchTotals> | null;
    traffic: Compared<TrafficTotals> | null;
    series: { clicks?: number[]; impressions?: number[]; users?: number[]; sessions?: number[] };
    alerts: DemoAlert[];
}

export interface DemoPortfolio {
    range: DemoRange;
    generatedAt: number;
    windows: { search: DateWindow | null; traffic: DateWindow | null };
    /** Bucket size of the series (1 = daily, 7 = weekly). */
    bucketDays: number;
    /** Bucket end date (YYYY-MM-DD) per series point. */
    dates: { search: string[]; traffic: string[] };
    sites: DemoPortfolioSite[];
    totals: {
        search: Compared<SearchTotals> | null;
        traffic: Compared<TrafficTotals> | null;
        sites: { total: number; synced: number; up: number; down: number; new: number; hidden: number };
    };
    combined: { clicks: number[]; impressions: number[]; position: (number | null)[]; users: number[]; sessions: number[] };
    combinedPrev: Partial<{ clicks: number[]; impressions: number[]; position: (number | null)[]; users: number[]; sessions: number[] }>;
    alerts: DemoAlert[];
    demo: true;
}

export interface NamedValue {
    name: string;
    value: number;
}

/** One demo site as a read-only sample dashboard (/demo/[slug]). */
export interface DemoSiteDashboard {
    site: DemoPortfolioSite;
    range: DemoRange;
    traffic: null | {
        window: DateWindow;
        dates: string[];
        prevDates: string[];
        users: number[];
        sessions: number[];
        pageviews: number[];
        prevUsers: number[];
        prevSessions: number[];
        prevPageviews: number[];
        totals: Compared<TrafficTotals>;
        channels: NamedValue[];
        devices: NamedValue[];
        countries: NamedValue[];
        pages: NamedValue[];
    };
    search: null | {
        window: DateWindow;
        dates: string[];
        prevDates: string[];
        clicks: number[];
        impressions: number[];
        prevClicks: number[];
        prevImpressions: number[];
        totals: Compared<SearchTotals>;
        queries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
        pages: NamedValue[];
    };
}
