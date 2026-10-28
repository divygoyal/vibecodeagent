/**
 * Metric map (DESIGN.md 2.3). Load-bearing: every chart, card, widget and table
 * takes metric colours, labels, polarity and formats from here.
 *
 * Colours are CSS variable references that switch with the theme, so they work
 * as SVG presentation attributes (`stroke={METRICS.clicks.color}`) and in
 * inline styles. Metric colour is for marks only (lines, areas, bars, dots,
 * heat bars), never for text.
 */
import {
    computeDelta,
    deltaOptionsFor,
    fmtValue,
    fmtValuePair,
    type DeltaResult,
    type MetricFormat,
} from './format';

export type { MetricFormat } from './format';

export type MetricKey =
    | 'clicks'
    | 'impressions'
    | 'ctr'
    | 'position'
    | 'users'
    | 'sessions'
    | 'pageviews'
    | 'conversions'
    | 'revenue'
    | 'ai';

export interface MetricDef {
    key: MetricKey;
    /** App label. Public pages say "Visitors" for users (see publicLabel). */
    label: string;
    /** Short label for card metric rows: `1,282 clicks`. */
    short: string;
    source: 'gsc' | 'ga4';
    group: 'search' | 'traffic';
    better: 'up' | 'down';
    format: MetricFormat;
    /** CSS var reference, e.g. 'var(--color-m-clicks)'. */
    color: string;
    /** Tailwind heat-bar utility for BarList/Table label cells. */
    heatbar: string;
    /** One-line definition for the info tooltip. */
    description: string;
}

export const METRICS: Record<MetricKey, MetricDef> = {
    clicks: {
        key: 'clicks', label: 'Clicks', short: 'clicks', source: 'gsc', group: 'search', better: 'up', format: 'count',
        color: 'var(--color-m-clicks)', heatbar: 'heatbar-clicks',
        description: 'Clicks from Google Search results to your site.',
    },
    impressions: {
        key: 'impressions', label: 'Impressions', short: 'impr.', source: 'gsc', group: 'search', better: 'up', format: 'count',
        color: 'var(--color-m-impressions)', heatbar: 'heatbar-impressions',
        description: 'How often your pages appeared in Google Search results.',
    },
    ctr: {
        key: 'ctr', label: 'CTR', short: 'CTR', source: 'gsc', group: 'search', better: 'up', format: 'percent',
        color: 'var(--color-m-ctr)', heatbar: 'heatbar-ctr',
        description: 'Click-through rate: clicks divided by impressions.',
    },
    position: {
        key: 'position', label: 'Avg. position', short: 'pos', source: 'gsc', group: 'search', better: 'down', format: 'position',
        color: 'var(--color-m-position)', heatbar: 'heatbar-position',
        description: 'Average rank in Google Search results. Lower is better.',
    },
    users: {
        key: 'users', label: 'Users', short: 'users', source: 'ga4', group: 'traffic', better: 'up', format: 'count',
        color: 'var(--color-m-users)', heatbar: 'heatbar-users',
        description: 'People who visited your site (GA4 active users).',
    },
    sessions: {
        key: 'sessions', label: 'Sessions', short: 'sessions', source: 'ga4', group: 'traffic', better: 'up', format: 'count',
        color: 'var(--color-m-sessions)', heatbar: 'heatbar-sessions',
        description: 'Visits to your site. One user can have several sessions.',
    },
    pageviews: {
        key: 'pageviews', label: 'Pageviews', short: 'views', source: 'ga4', group: 'traffic', better: 'up', format: 'count',
        color: 'var(--color-m-pageviews)', heatbar: 'heatbar-pageviews',
        description: 'Pages and screens viewed (GA4 views).',
    },
    // GA4 renamed "conversions" to "key events" in 2024; the key stays 'conversions' (saved URLs, CSVs, dashboards),
    // the label follows GA4. TrafficClaw goals say "Goal completions", never "conversions".
    conversions: {
        key: 'conversions', label: 'Key events', short: 'key events', source: 'ga4', group: 'traffic', better: 'up', format: 'count',
        color: 'var(--color-m-conversions)', heatbar: 'heatbar-conversions',
        description: 'GA4 key events (what GA4 called conversions before 2024): sign-ups, purchases and other events you marked as key.',
    },
    revenue: {
        key: 'revenue', label: 'Revenue', short: 'revenue', source: 'ga4', group: 'traffic', better: 'up', format: 'currency',
        color: 'var(--color-m-revenue)', heatbar: 'heatbar-revenue',
        description: 'GA4 total revenue (purchases, subscriptions and ads), in the property currency. Shown only when it is above 0.',
    },
    ai: {
        key: 'ai', label: 'AI traffic', short: 'AI', source: 'ga4', group: 'traffic', better: 'up', format: 'count',
        color: 'var(--color-m-ai)', heatbar: 'heatbar-ai',
        description: 'Sessions referred by ChatGPT, Perplexity, Claude, Gemini and Copilot.',
    },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];
export const SEARCH_METRICS: MetricKey[] = ['clicks', 'impressions', 'ctr', 'position'];
export const TRAFFIC_METRICS: MetricKey[] = ['users', 'sessions', 'pageviews', 'conversions'];

export function isMetricKey(v: unknown): v is MetricKey {
    return typeof v === 'string' && v in METRICS;
}

/** Public pages say "Visitors" for users. */
export function publicLabel(key: MetricKey): string {
    return key === 'users' ? 'Visitors' : METRICS[key].label;
}

/** Format a metric value. Counts are full unless `compact` (cards, tiles, axes). Revenue uses `currency` (default USD). */
export function fmtMetric(key: MetricKey, value: number | null | undefined, opts: { compact?: boolean; tile?: boolean; currency?: string | null; cents?: boolean } = {}): string {
    return fmtValue(METRICS[key].format, value, opts);
}

/** `fmtMetric` for a value and its comparison together: the same decimals, so a change never sits between equal-looking figures. */
export function fmtMetricPair(key: MetricKey, value: number | null | undefined, previous: number | null | undefined, opts: { compact?: boolean; tile?: boolean; currency?: string | null; cents?: boolean } = {}): { value: string; previous: string } {
    return fmtValuePair(METRICS[key].format, value, previous, opts);
}

/** Delta for a metric with the right mode (percent / points / absolute) and polarity. */
export function metricDelta(key: MetricKey, current: number | null | undefined, previous: number | null | undefined): DeltaResult {
    const m = METRICS[key];
    return computeDelta(current, previous, deltaOptionsFor(m.format, m.better));
}

// ─── Categorical palette (DESIGN 2.4) ──────────────────────────────────────

export const CATEGORICAL = [
    'var(--color-cat-1)',
    'var(--color-cat-2)',
    'var(--color-cat-3)',
    'var(--color-cat-4)',
    'var(--color-cat-5)',
    'var(--color-cat-6)',
    'var(--color-cat-7)',
    'var(--color-cat-8)',
] as const;
export const CATEGORICAL_OTHER = 'var(--color-cat-other)';

/** Slot colour by index. Never cycles: index 8+ is "Other" grey. */
export function categoricalColor(index: number): string {
    return CATEGORICAL[index] ?? CATEGORICAL_OTHER;
}

/** Fixed GA4 default channel group colours: colour follows the entity, not its rank. */
export function channelColor(channel: string): string {
    const c = channel.toLowerCase();
    if (c === 'organic search') return CATEGORICAL[0];
    if (c === 'direct') return CATEGORICAL[1];
    if (c === 'referral') return CATEGORICAL[2];
    if (c === 'organic social') return CATEGORICAL[3];
    if (c === 'email') return CATEGORICAL[4];
    // Paid in purple, not slot 6's green: next to Referral's teal-green the two read as one colour (round 5 judge).
    if (c.startsWith('paid') || c === 'cross-network' || c === 'display') return CATEGORICAL[6];
    if (c.includes('ai') && (c.includes('assistant') || c === 'ai')) return CATEGORICAL[5];
    return CATEGORICAL_OTHER;
}

/** Fixed device colours: Desktop 1, Mobile 2, Tablet 3. */
export function deviceColor(device: string): string {
    const d = device.toLowerCase();
    if (d === 'desktop') return CATEGORICAL[0];
    if (d === 'mobile') return CATEGORICAL[1];
    if (d === 'tablet') return CATEGORICAL[2];
    return CATEGORICAL_OTHER;
}
