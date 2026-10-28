/**
 * Date ranges for MCP tools (MCP.md 7.1 "Dates"). All dates are UTC
 * YYYY-MM-DD. Windows end at the latest complete day: GA4 yesterday,
 * Search Console two days ago (yesterday with fresh=true).
 */
import { SOURCE_LAG_DAYS } from '@/lib/dateRange';
import { ToolError } from './errors';

export const PRESETS = ['last_7d', 'last_14d', 'last_28d', 'last_30d', 'last_90d', 'last_180d', 'last_365d', 'this_month', 'last_month', 'last_quarter', 'ytd'] as const;
export type Preset = (typeof PRESETS)[number];

export interface DateRangeInput {
    preset?: Preset;
    start_date?: string;
    end_date?: string;
}

export interface Period {
    start: string;
    end: string;
    days: number;
}

const DAY = 86_400_000;
export const GSC_MAX_DAYS_BACK = 486; // ~16 months
export const GA4_MAX_SPAN = 800;
export const GA4_MAX_SPAN_WITH_DATE = 400;

export function dayIndex(iso: string): number {
    return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
}

export function isoFromDay(day: number): string {
    return new Date(day * DAY).toISOString().slice(0, 10);
}

export function todayDay(now = Date.now()): number {
    return Math.floor(now / DAY);
}

/** The app's one window rule (lib/dateRange SOURCE_LAG_DAYS): GA4 yesterday, Search Console 2 days ago. */
export function latestCompleteDay(source: 'ga4' | 'gsc', fresh = false, now = Date.now()): number {
    const today = todayDay(now);
    return today - (source === 'gsc' && fresh ? 1 : SOURCE_LAG_DAYS[source]);
}

function parseToken(token: string, field: string, now: number): number {
    const v = token.trim();
    const today = todayDay(now);
    if (v === 'today') return today;
    if (v === 'yesterday') return today - 1;
    const ago = /^(\d{1,4})daysAgo$/.exec(v);
    if (ago) return today - Number(ago[1]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const d = dayIndex(v);
        if (Number.isFinite(d) && isoFromDay(d) === v) return d;
    }
    throw new ToolError('invalid_argument', `${field} "${v.slice(0, 20)}" is not a date. Use YYYY-MM-DD, today, yesterday or NdaysAgo.`);
}

function presetRange(preset: Preset, last: number): [number, number] {
    const lastDate = new Date(last * DAY);
    const y = lastDate.getUTCFullYear();
    const m = lastDate.getUTCMonth();
    const n = /^last_(\d+)d$/.exec(preset);
    if (n) return [last - Number(n[1]) + 1, last];
    switch (preset) {
        case 'this_month':
            return [Math.floor(Date.UTC(y, m, 1) / DAY), last];
        case 'last_month':
            return [Math.floor(Date.UTC(y, m - 1, 1) / DAY), Math.floor(Date.UTC(y, m, 1) / DAY) - 1];
        case 'last_quarter': {
            const q = Math.floor(m / 3);
            return [Math.floor(Date.UTC(y, (q - 1) * 3, 1) / DAY), Math.floor(Date.UTC(y, q * 3, 1) / DAY) - 1];
        }
        case 'ytd':
            return [Math.floor(Date.UTC(y, 0, 1) / DAY), last];
        default:
            return [last - 27, last];
    }
}

export interface ResolveOptions {
    source: 'ga4' | 'gsc';
    fresh?: boolean;
    /** GA4 span cap is 400 days when the report has a date dimension. */
    hasDateDimension?: boolean;
    now?: number;
    defaultPreset?: Preset;
}

/** Resolve a {preset} or {start_date,end_date} input. Returns warnings for clamps. */
export function resolvePeriod(input: DateRangeInput | undefined, opts: ResolveOptions): { period: Period; warnings: string[] } {
    const now = opts.now ?? Date.now();
    const last = latestCompleteDay(opts.source, opts.fresh, now);
    const warnings: string[] = [];
    let start: number;
    let end: number;
    if (input?.start_date || input?.end_date) {
        end = input.end_date ? parseToken(input.end_date, 'end_date', now) : last;
        start = input.start_date ? parseToken(input.start_date, 'start_date', now) : end - 27;
    } else {
        [start, end] = presetRange(input?.preset ?? opts.defaultPreset ?? 'last_28d', last);
    }
    if (end > last) {
        if (opts.source === 'gsc') warnings.push(`end_date moved to ${isoFromDay(last)}: Search Console data is not final for later days (pass fresh:true for partial data)`);
        else if (end > todayDay(now)) warnings.push(`end_date moved to ${isoFromDay(todayDay(now))}`);
        end = opts.source === 'gsc' ? last : Math.min(end, todayDay(now));
    }
    if (start > end) {
        if (input?.start_date) throw new ToolError('date_out_of_range', `start_date ${isoFromDay(start)} is after end_date ${isoFromDay(end)}`);
        start = end;
    }
    if (opts.source === 'gsc') {
        const floor = todayDay(now) - GSC_MAX_DAYS_BACK;
        if (end < floor) throw new ToolError('date_out_of_range', 'Search Console keeps about 16 months of data; this range is older');
        if (start < floor) {
            warnings.push(`start_date moved to ${isoFromDay(floor)}: Search Console keeps about 16 months of data`);
            start = floor;
        }
    } else {
        const cap = opts.hasDateDimension ? GA4_MAX_SPAN_WITH_DATE : GA4_MAX_SPAN;
        if (end - start + 1 > cap) throw new ToolError('date_out_of_range', `GA4 ranges are limited to ${cap} days${opts.hasDateDimension ? ' with the date dimension' : ''}`);
    }
    return { period: { start: isoFromDay(start), end: isoFromDay(end), days: end - start + 1 }, warnings };
}

export function previousPeriod(p: Period, mode: 'previous_period' | 'previous_year'): Period {
    const s = dayIndex(p.start);
    const e = dayIndex(p.end);
    if (mode === 'previous_year') {
        const shift = (iso: string) => {
            const d = new Date(`${iso}T00:00:00Z`);
            d.setUTCFullYear(d.getUTCFullYear() - 1);
            return d.toISOString().slice(0, 10);
        };
        const start = shift(p.start);
        const end = shift(p.end);
        return { start, end, days: dayIndex(end) - dayIndex(start) + 1 };
    }
    const len = e - s + 1;
    return { start: isoFromDay(s - len), end: isoFromDay(s - 1), days: len };
}

export function fmtPeriod(p: Period): string {
    return `${p.start}..${p.end}`;
}
