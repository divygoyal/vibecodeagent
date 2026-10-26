/**
 * The two Google requests the portfolio makes per asset, and their parsers.
 * Pure: the sync sends them to Google, the public demo to the demo generator.
 */
import type { DailyRow } from './snapshot';

/** GA4 metrics, in request order. keyEvents falls back to conversions on old properties. */
export const GA4_METRICS = ['activeUsers', 'sessions', 'screenPageViews', 'keyEvents', 'engagementRate'] as const;
export const GA4_METRICS_LEGACY = ['activeUsers', 'sessions', 'screenPageViews', 'conversions', 'engagementRate'] as const;

export function ga4DailyRequest(startDate: string, endDate: string, legacy = false) {
    return {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: (legacy ? GA4_METRICS_LEGACY : GA4_METRICS).map((name) => ({ name })),
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 1000,
    };
}

export function gscDailyRequest(startDate: string, endDate: string) {
    return { startDate, endDate, dimensions: ['date'], type: 'web', rowLimit: 1000 };
}

const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : 0;
};

interface Ga4Report {
    rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
}

export function parseGa4Daily(property: string, report: Ga4Report): DailyRow[] {
    const out: DailyRow[] = [];
    for (const r of report.rows ?? []) {
        const raw = r.dimensionValues?.[0]?.value ?? '';
        if (!/^\d{8}$/.test(raw)) continue;
        const m = r.metricValues ?? [];
        out.push({
            kind: 'ga4',
            asset_id: property,
            date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
            users: Math.round(num(m[0]?.value)),
            sessions: Math.round(num(m[1]?.value)),
            pageviews: Math.round(num(m[2]?.value)),
            key_events: num(m[3]?.value),
            engagement_rate: num(m[4]?.value),
        });
    }
    return out;
}

interface GscResponse {
    rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[];
}

export function parseGscDaily(siteUrl: string, res: GscResponse): DailyRow[] {
    const out: DailyRow[] = [];
    for (const r of res.rows ?? []) {
        const date = r.keys?.[0] ?? '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        out.push({
            kind: 'gsc',
            asset_id: siteUrl,
            date,
            clicks: Math.round(num(r.clicks)),
            impressions: Math.round(num(r.impressions)),
            ctr: num(r.ctr),
            position: num(r.position),
        });
    }
    return out;
}
