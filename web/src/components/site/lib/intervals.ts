/**
 * Day / week / month buckets for the site charts. Weeks are ISO weeks
 * (Monday first); a bucket is named by its first day inside the range, so the
 * first and last buckets can be partial. Pure (tests: web/tests/siteIntervals.test.mjs).
 */
import type { GscSeriesPoint } from './types';

export type Interval = 'day' | 'week' | 'month';
export const INTERVALS: Interval[] = ['day', 'week', 'month'];

const DAY_MS = 86_400_000;

function parse(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}
function fmt(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

export function isInterval(v: unknown): v is Interval {
    return v === 'day' || v === 'week' || v === 'month';
}

/** Which intervals make sense for a range: weeks from 14 days, months from 60. */
export function allowedIntervals(days: number): Interval[] {
    return INTERVALS.filter((i) => i === 'day' || (i === 'week' && days >= 14) || (i === 'month' && days >= 60));
}

/** The requested interval if allowed for the range, else the coarsest allowed one below it. */
export function effectiveInterval(requested: Interval | null | undefined, days: number): Interval {
    const ok = allowedIntervals(days);
    if (requested && ok.includes(requested)) return requested;
    return requested === 'month' && ok.includes('week') ? 'week' : 'day';
}

/** Monday of the ISO week, or the 1st of the month, for a day. */
export function bucketStart(iso: string, interval: Interval): string {
    if (interval === 'day') return iso;
    const t = parse(iso);
    if (interval === 'month') return `${iso.slice(0, 7)}-01`;
    const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
    return fmt(t - dow * DAY_MS);
}

/** Monday of ISO week `week` of `isoYear`. */
export function isoWeekMonday(isoYear: number, week: number): string {
    const jan4 = Date.UTC(isoYear, 0, 4);
    const dow = (new Date(jan4).getUTCDay() + 6) % 7;
    const week1 = jan4 - dow * DAY_MS;
    return fmt(week1 + (week - 1) * 7 * DAY_MS);
}

/**
 * GA4 bucket value -> first day of the bucket inside the range.
 * week: `isoYearIsoWeek` ('202643'); month: `yearMonth` ('202610'); day: `date` ('20261027').
 */
export function gaBucketDate(value: string, interval: Interval, rangeStart: string): string {
    let d: string;
    if (interval === 'week' && /^\d{6}$/.test(value)) d = isoWeekMonday(Number(value.slice(0, 4)), Number(value.slice(4)));
    else if (interval === 'month' && /^\d{6}$/.test(value)) d = `${value.slice(0, 4)}-${value.slice(4, 6)}-01`;
    else if (/^\d{8}$/.test(value)) d = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    else d = value;
    return d < rangeStart ? rangeStart : d;
}

/** Bucket names (first day inside the range) for a range, in order. */
export function bucketDates(start: string, end: string, interval: Interval): string[] {
    const out: string[] = [];
    for (let t = parse(start); t <= parse(end); t += DAY_MS) {
        const b = bucketStart(fmt(t), interval);
        const name = b < start ? start : b;
        if (out[out.length - 1] !== name) out.push(name);
    }
    return out;
}

/** The bucket (by name) a day falls in, or null when it is outside the buckets. */
export function snapToBucket(day: string, buckets: string[]): string | null {
    if (!buckets.length || day < buckets[0]) return null;
    let hit: string | null = null;
    for (const b of buckets) {
        if (b <= day) hit = b;
        else break;
    }
    return hit;
}

/**
 * Search Console daily series -> weekly / monthly buckets. Clicks and
 * impressions add up; CTR is recomputed; position is impression-weighted.
 */
export function bucketGscSeries(series: GscSeriesPoint[], interval: Interval): GscSeriesPoint[] {
    if (interval === 'day' || series.length === 0) return series;
    const start = series[0].date;
    const groups = new Map<string, GscSeriesPoint[]>();
    for (const p of series) {
        const b = bucketStart(p.date, interval);
        const key = b < start ? start : b;
        const g = groups.get(key) ?? [];
        g.push(p);
        groups.set(key, g);
    }
    const out: GscSeriesPoint[] = [];
    for (const [date, pts] of groups) {
        let clicks = 0;
        let impressions = 0;
        let posW = 0;
        let pc: number | null = null;
        let pi: number | null = null;
        let ppW = 0;
        let ppI = 0;
        let hasPrev = false;
        for (const p of pts) {
            clicks += p.clicks;
            impressions += p.impressions;
            posW += p.position * p.impressions;
            if (p.prevDate !== undefined) hasPrev = true;
            if (p.prev_clicks !== undefined && p.prev_clicks !== null) pc = (pc ?? 0) + p.prev_clicks;
            if (p.prev_impressions !== undefined && p.prev_impressions !== null) {
                pi = (pi ?? 0) + p.prev_impressions;
                if (p.prev_position) {
                    ppW += p.prev_position * p.prev_impressions;
                    ppI += p.prev_impressions;
                }
            }
        }
        const point: GscSeriesPoint = {
            date,
            clicks,
            impressions,
            ctr: impressions > 0 ? clicks / impressions : 0,
            position: impressions > 0 ? posW / impressions : 0,
        };
        if (hasPrev) {
            point.prevDate = pts.find((p) => p.prevDate)?.prevDate ?? null;
            point.prev_clicks = pc;
            point.prev_impressions = pi;
            point.prev_ctr = pc !== null && pi ? pc / pi : pi === 0 ? 0 : null;
            point.prev_position = ppI > 0 ? ppW / ppI : null;
        }
        out.push(point);
    }
    return out;
}

/** "per day" / "per week" / "per month". */
export function perInterval(interval: Interval): string {
    return `per ${interval}`;
}
