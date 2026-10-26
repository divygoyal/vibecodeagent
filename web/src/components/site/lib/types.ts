/**
 * Response shapes of the /api/site/* routes. Shared by the routes and the
 * site pages (components/site, app/(dashboard)/dashboard/s/[host]).
 *
 * Conventions: dates are 'YYYY-MM-DD'; CTR and engagement rate are ratios
 * (0.034 = 3.4%); position is the impression-weighted average; durations are
 * seconds. `prev` is the comparison period (absent when compare is off, null
 * when the row had no data then).
 */

// ─── GA4 ──────────────────────────────────────────────────────────────────

export interface Ga4Totals {
    users: number;
    newUsers: number;
    sessions: number;
    engagedSessions: number;
    pageviews: number;
    conversions: number;
    engagementRate: number;
    avgDuration: number;
    /** Sessions referred by AI assistants (ChatGPT, Perplexity, Claude, Gemini, Copilot ...). */
    ai: number;
}

export interface Ga4SeriesPoint {
    date: string;
    users: number;
    sessions: number;
    pageviews: number;
    conversions: number;
    ai: number;
    engagementRate: number;
    /** Comparison values aligned by day index. */
    prevDate?: string | null;
    prev_users?: number | null;
    prev_sessions?: number | null;
    prev_pageviews?: number | null;
    prev_conversions?: number | null;
    prev_ai?: number | null;
}

export interface Ga4Summary {
    totals: Ga4Totals;
    previous: Ga4Totals | null;
    series: Ga4SeriesPoint[];
}

export type Ga4Breakdown =
    | 'channels' | 'sources' | 'referrers' | 'pages' | 'landing' | 'countries' | 'cities'
    | 'languages' | 'devices' | 'browsers' | 'os' | 'events' | 'newReturning';

export interface Ga4Row {
    /** Stable key (dimension values joined). */
    key: string;
    /** Dimension values by GA4 dimension name. */
    dims: Record<string, string>;
    /** Metrics by GA4 metric name. */
    cur: Record<string, number>;
    prev?: Record<string, number> | null;
}

export interface Ga4BreakdownResponse {
    report: Ga4Breakdown;
    rows: Ga4Row[];
    /** True when GA4 had more rows than were returned. */
    truncated: boolean;
}

export interface RealtimeResponse {
    activeUsers: number;
    /** Users per minute, index 0 = 29 minutes ago, 29 = now. */
    perMinute: number[];
    pages: { name: string; users: number }[];
    countries: { name: string; users: number }[];
    devices: { name: string; users: number }[];
    fetchedAt: string;
}

export interface RetentionResponse {
    mode: 'daily' | 'weekly' | 'monthly';
    cohorts: { date: string; users: number; retention: (number | null)[] }[];
    averages: { day1: number; day7: number; day14: number; day30: number };
    curve: { period: number; retention: number }[];
}

// ─── Search Console ─────────────────────────────────────────────────────────

export interface GscMetrics {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface GscSeriesPoint extends GscMetrics {
    date: string;
    prevDate?: string | null;
    prev_clicks?: number | null;
    prev_impressions?: number | null;
    prev_ctr?: number | null;
    prev_position?: number | null;
}

export interface GscSummary {
    totals: GscMetrics;
    previous: GscMetrics | null;
    series: GscSeriesPoint[];
    /** Last day with data (GSC lags about 2 days). */
    lastDate: string | null;
}

export type GscDimensionReport = 'queries' | 'pages' | 'countries' | 'devices' | 'appearance';

export interface GscRow extends GscMetrics {
    key: string;
    prev?: GscMetrics | null;
}

export interface GscRowsResponse {
    report: GscDimensionReport;
    rows: GscRow[];
    /** Rows that had clicks in the comparison period but none now. */
    lost: GscRow[];
    truncated: boolean;
}

export interface CannibalizedQuery {
    query: string;
    pages: (GscMetrics & { page: string; share: number })[];
    totalClicks: number;
    totalImpressions: number;
    bestPosition: number;
    severity: 'high' | 'medium' | 'low';
}

export interface OpportunityRow extends GscMetrics {
    kind: 'striking' | 'low_ctr';
    /** Query text, or page URL for page rows. */
    key: string;
    target: 'query' | 'page';
    /** Page with the most impressions for this query. */
    page: string | null;
    expectedCtr: number;
    /** Extra clicks per period if it reached position 5 (striking) or the usual CTR (low CTR). */
    potentialClicks: number;
}

export interface OpportunitiesResponse {
    striking: OpportunityRow[];
    lowCtr: OpportunityRow[];
    medianImpressions: number;
}

export interface GscDetailResponse {
    series: GscSeriesPoint[];
    totals: GscMetrics;
    previous: GscMetrics | null;
    /** Pages ranking for the query, or queries of the page. */
    related: GscRow[];
    countries: GscRow[];
}

export interface DecayRow {
    page: string;
    /** Clicks in the three 28-day windows, oldest first. */
    clicks: [number, number, number];
}

export interface SitemapRow {
    path: string;
    lastSubmitted: string | null;
    lastDownloaded: string | null;
    isPending: boolean;
    isSitemapsIndex: boolean;
    warnings: number;
    errors: number;
    submitted: number;
    indexed: number | null;
}

export interface InspectResponse {
    url: string;
    verdict: string;
    coverageState: string | null;
    indexingState: string | null;
    robotsTxtState: string | null;
    pageFetchState: string | null;
    lastCrawlTime: string | null;
    googleCanonical: string | null;
    userCanonical: string | null;
    crawledAs: string | null;
    mobileVerdict: string | null;
    richResultsVerdict: string | null;
    richResultTypes: string[];
    link: string | null;
}

// ─── Actions ──────────────────────────────────────────────────────────────

export type ActionType = 'decay' | 'striking' | 'low_ctr' | 'cannibalization' | 'traffic_drop' | 'search_drop' | 'audit';
export type ActionImpact = 'high' | 'medium' | 'low';
export type ActionStatus = 'open' | 'done' | 'dismissed';

export interface ActionEvidence {
    label: string;
    value: string;
}

export interface SiteAction {
    /** Stable id: type + subject, so done/dismissed states stick across loads. */
    id: string;
    type: ActionType;
    /** Badge: Search, Content, Technical, Traffic. */
    area: 'Search' | 'Content' | 'Technical' | 'Traffic';
    impact: ActionImpact;
    title: string;
    /** One sentence with the numbers that triggered it. */
    summary: string;
    evidence: ActionEvidence[];
    /** "+120 clicks / 28 days" or "Recover ~1.2K sessions". */
    expectedImpact: string;
    /** Sort score (estimated clicks or sessions at stake). */
    score: number;
    fix: string[];
    page: string | null;
    query: string | null;
    /** Prefilled Ask prompt. */
    askPrompt: string;
}

export interface ActionsResponse {
    actions: SiteAction[];
    /** Sources that could not be read (shown as a note, the rest still works). */
    partial: string[];
    window: { start: string; end: string; prevStart: string | null; prevEnd: string | null };
}

export interface ActionStateRow {
    actionId: string;
    status: ActionStatus;
    updatedAt: string | null;
}
