/**
 * Client-safe types for the public demo (home hero + /demo).
 * The portfolio is the app's own `PortfolioResponse` (built by
 * `buildDemoPortfolio()` in lib/portfolio/demo.ts); only the per-site sample
 * dashboard has its own shape.
 */
import type {
    Compared,
    DateWindow,
    PortfolioAlert,
    PortfolioResponse,
    PortfolioSite,
    SearchTotals,
    TrafficTotals,
} from '@/lib/portfolio/types';

export type { Compared, DateWindow, SearchTotals, TrafficTotals };

export type DemoRange = '7d' | '28d' | '3m' | '12m';

export const DEMO_RANGES: Array<{ value: DemoRange; label: string; days: number; long: string }> = [
    { value: '7d', label: '7d', days: 7, long: 'previous 7 days' },
    { value: '28d', label: '28d', days: 28, long: 'previous 28 days' },
    { value: '3m', label: '3m', days: 90, long: 'previous 3 months' },
    { value: '12m', label: '12m', days: 364, long: 'previous 12 months' },
];

export type DemoAlert = PortfolioAlert;
/** A portfolio card; `slug` is the /demo/[slug] page of that site. */
export type DemoPortfolioSite = PortfolioSite;
export type DemoPortfolio = PortfolioResponse;

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
