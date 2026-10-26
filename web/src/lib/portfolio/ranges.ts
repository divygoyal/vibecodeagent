/**
 * Portfolio ranges and date windows (UTC days, 'YYYY-MM-DD'). Client-safe.
 *
 * GA4 windows end yesterday (today is partial). Search Console windows end on
 * the newest stored GSC date (it lags 2-3 days), clamped to 1-6 days ago.
 */
import type { PortfolioRange } from './types';

export const PORTFOLIO_RANGES: readonly PortfolioRange[] = ['7d', '28d', '3m', '12m'];
export const DEFAULT_RANGE: PortfolioRange = '3m';

export const RANGE_DAYS: Record<PortfolioRange, number> = { '7d': 7, '28d': 28, '3m': 90, '12m': 365 };

export const RANGE_LABEL: Record<PortfolioRange, string> = {
    '7d': 'last 7 days',
    '28d': 'last 28 days',
    '3m': 'last 3 months',
    '12m': 'last 12 months',
};

/** History kept per kind. GSC keeps 16 months; GA4 gets 25 so 12m has a full previous year. */
export const HISTORY_DAYS = { ga4: 760, gsc: 486 } as const;

/** Data older than this triggers a sync on page open. */
export const STALE_AFTER_S = 6 * 3600;

export function parseRange(value: string | null | undefined): PortfolioRange {
    return (PORTFOLIO_RANGES as readonly string[]).includes(value ?? '') ? (value as PortfolioRange) : DEFAULT_RANGE;
}

/** Sparkline bucket size: daily up to 3 months, weekly for 12 months. */
export function bucketDaysFor(range: PortfolioRange): number {
    return range === '12m' ? 7 : 1;
}

const DAY_MS = 86_400_000;

export function isoDay(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

export function todayIso(now: number = Date.now()): string {
    return isoDay(now);
}

export function addDays(iso: string, days: number): string {
    return isoDay(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS);
}

export function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export interface WindowRequest {
    days: number;
    end?: string;
    end_min?: string;
    end_max?: string;
}

/** Window requests for the admin snapshot (and the demo aggregator). */
export function windowRequests(range: PortfolioRange, now: number = Date.now()): { ga4: WindowRequest; gsc: WindowRequest } {
    const today = todayIso(now);
    const days = RANGE_DAYS[range];
    return {
        ga4: { days, end: addDays(today, -1) },
        gsc: { days, end_min: addDays(today, -6), end_max: addDays(today, -1) },
    };
}

/** Last day the sync asks Google for, per kind. */
export function syncEndDay(now: number = Date.now()): string {
    return addDays(todayIso(now), -1);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jul 13 – Oct 10"; adds years when the range is not inside the current year. */
export function formatDateRange(start: string, end: string, now: number = Date.now()): string {
    const [ys, ms, ds] = start.split('-').map(Number);
    const [ye, me, de] = end.split('-').map(Number);
    const thisYear = new Date(now).getUTCFullYear();
    const withYear = ys !== ye || ye !== thisYear;
    const a = `${MONTHS[ms - 1]} ${ds}${withYear ? `, ${ys}` : ''}`;
    const b = `${MONTHS[me - 1]} ${de}${withYear ? `, ${ye}` : ''}`;
    return `${a} – ${b}`;
}

/** "Oct 13" */
export function formatDay(iso: string): string {
    const [, m, d] = iso.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}`;
}
