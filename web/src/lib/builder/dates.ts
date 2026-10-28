/**
 * Server-resolved dates for the builder (BUILDER.md 8.3 step 2). Pure: every range becomes
 * absolute 'YYYY-MM-DD' (so cache keys are stable), the default range ends yesterday in the
 * property time zone, and comparison ranges are derived from the resolved range.
 */
import { resolveLegacyWindow } from '@/lib/dateRange';
import type { CompareSpec, DatePresetId, DateRangeSpec, Iso } from './types';

const DAY_MS = 86_400_000;
/** Presets resolved by lib/dateRange (this_week stays here: the builder's weeks start on Monday; 16m keeps GSC's limit). */
const SHARED_PRESETS = new Set<DatePresetId>(['7d', '14d', '28d', '30d', '90d', '3m', '6m', '12m', 'this_month', 'this_year']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export const PRESETS: { id: DatePresetId; label: string; short: string }[] = [
    { id: '7d', label: 'Last 7 days', short: '7d' },
    { id: '14d', label: 'Last 14 days', short: '14d' },
    { id: '28d', label: 'Last 28 days', short: '28d' },
    { id: '30d', label: 'Last 30 days', short: '30d' },
    { id: '3m', label: 'Last 3 months', short: '3m' },
    { id: '6m', label: 'Last 6 months', short: '6m' },
    { id: '12m', label: 'Last 12 months', short: '12m' },
    { id: '16m', label: 'Last 16 months', short: '16m' },
    { id: 'today', label: 'Today', short: 'Today' },
    { id: 'yesterday', label: 'Yesterday', short: 'Yesterday' },
    { id: 'this_week', label: 'This week', short: 'This week' },
    { id: 'last_week', label: 'Last week', short: 'Last week' },
    { id: 'this_month', label: 'This month', short: 'This month' },
    { id: 'last_month', label: 'Last month', short: 'Last month' },
    { id: 'this_quarter', label: 'This quarter', short: 'This quarter' },
    { id: 'last_quarter', label: 'Last quarter', short: 'Last quarter' },
    { id: 'this_year', label: 'This year', short: 'This year' },
    { id: 'last_year', label: 'Last year', short: 'Last year' },
    { id: '90d', label: 'Last 90 days', short: '90d' },
];

export const QUICK_PRESETS: DatePresetId[] = ['7d', '28d', '3m'];
export const MENU_PRESETS: DatePresetId[] = ['7d', '14d', '28d', '3m', '6m', '12m', '16m', 'this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year'];

export function isPresetId(v: unknown): v is DatePresetId {
    return typeof v === 'string' && PRESETS.some((p) => p.id === v);
}

export function isIso(v: unknown): v is Iso {
    if (typeof v !== 'string' || !ISO_RE.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ── Day arithmetic on ISO strings (UTC, no time zone surprises) ──────────

export function toDay(iso: Iso): number {
    return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export function fromDay(day: number): Iso {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: Iso, n: number): Iso {
    return fromDay(toDay(iso) + n);
}

export function daysBetween(start: Iso, end: Iso): number {
    return toDay(end) - toDay(start) + 1;
}

function ymd(iso: Iso): [number, number, number] {
    return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
}

function mk(y: number, m: number, d: number): Iso {
    // Date.UTC normalises overflow (month 13, day 0).
    return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function daysInMonth(y: number, m: number): number {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Same calendar day n months away, clamped to the month end (Mar 31 - 1 month = Feb 28/29). */
export function addMonths(iso: Iso, n: number): Iso {
    const [y, m, d] = ymd(iso);
    const total = y * 12 + (m - 1) + n;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return mk(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Today's calendar day in a time zone ('UTC' when unknown). */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): Iso {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
        const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
        const v = `${get('year')}-${get('month')}-${get('day')}`;
        if (isIso(v)) return v;
    } catch {
        /* invalid time zone */
    }
    return now.toISOString().slice(0, 10);
}

// ── Resolution ───────────────────────────────────────────────────────────

/** Earliest day Google keeps (GSC: 16 months). Custom ranges are clamped to it. */
export function minHistoryDay(today: Iso): Iso {
    return addDays(addMonths(today, -16), 1);
}

export function resolveRange(spec: DateRangeSpec, today: Iso): { start: Iso; end: Iso } {
    const yesterday = addDays(today, -1);
    if (spec.kind === 'custom') {
        let start = isIso(spec.start) ? spec.start : addDays(yesterday, -27);
        let end = isIso(spec.end) ? spec.end : yesterday;
        if (start > end) [start, end] = [end, start];
        if (end > today) end = today;
        const min = minHistoryDay(today);
        if (start < min) start = min;
        if (end < start) end = start;
        return { start, end };
    }
    if (spec.kind === 'rolling') {
        const days = Math.max(1, Math.min(500, Math.floor(spec.days || 28)));
        const end = addDays(yesterday, -Math.max(0, Math.floor(spec.endOffsetDays ?? 0)));
        return { start: addDays(end, -(days - 1)), end };
    }
    // The app's one window rule (lib/dateRange): the presets every surface shares resolve there, so a dashboard's
    // "Last 28 days" is the site page's, the portfolio's and the share page's 28 days.
    if (!spec.includeToday && SHARED_PRESETS.has(spec.id)) {
        const w = resolveLegacyWindow(spec.id, 'ga4', today);
        if (w) return { start: w.start, end: w.end };
    }
    const last = spec.includeToday ? today : yesterday;
    const [ty, tm] = ymd(today);
    const n = (d: number) => ({ start: addDays(last, -(d - 1)), end: last });
    switch (spec.id) {
        case 'today': return { start: today, end: today };
        case 'yesterday': return { start: yesterday, end: yesterday };
        case '7d': return n(7);
        case '14d': return n(14);
        case '28d': return n(28);
        case '30d': return n(30);
        case '90d':
        case '3m': return n(90);
        case '6m': return { start: addDays(addMonths(last, -6), 1), end: last };
        case '12m': return { start: addDays(addMonths(last, -12), 1), end: last };
        case '16m': return { start: addDays(addMonths(last, -16), 2), end: last };
        case 'this_week': {
            // Monday start.
            const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
            const start = addDays(today, -dow);
            return { start, end: start > last ? start : last };
        }
        case 'last_week': {
            const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
            const end = addDays(today, -dow - 1);
            return { start: addDays(end, -6), end };
        }
        case 'this_month': {
            const start = mk(ty, tm, 1);
            return { start, end: start > last ? start : last };
        }
        case 'last_month': return { start: mk(ty, tm - 1, 1), end: mk(ty, tm, 0) };
        case 'this_quarter': {
            const qm = Math.floor((tm - 1) / 3) * 3 + 1;
            const start = mk(ty, qm, 1);
            return { start, end: start > last ? start : last };
        }
        case 'last_quarter': {
            const qm = Math.floor((tm - 1) / 3) * 3 + 1;
            return { start: mk(ty, qm - 3, 1), end: mk(ty, qm, 0) };
        }
        case 'this_year': {
            const start = mk(ty, 1, 1);
            return { start, end: start > last ? start : last };
        }
        case 'last_year': return { start: mk(ty - 1, 1, 1), end: mk(ty - 1, 12, 31) };
        default: return n(28);
    }
}

export function resolveCompare(range: { start: Iso; end: Iso }, spec: CompareSpec): { start: Iso; end: Iso } | undefined {
    switch (spec.mode) {
        case 'previous_period': {
            const len = daysBetween(range.start, range.end);
            const end = addDays(range.start, -1);
            return { start: addDays(end, -(len - 1)), end };
        }
        case 'previous_year':
            if (spec.align === 'weekday') return { start: addDays(range.start, -364), end: addDays(range.end, -364) };
            return { start: addMonths(range.start, -12), end: addMonths(range.end, -12) };
        case 'custom':
            if (isIso(spec.start) && isIso(spec.end)) return spec.start <= spec.end ? { start: spec.start, end: spec.end } : { start: spec.end, end: spec.start };
            return undefined;
        default:
            return undefined;
    }
}

/** All the days of a range, in order. */
export function eachDay(start: Iso, end: Iso): Iso[] {
    const out: Iso[] = [];
    const a = toDay(start);
    const b = toDay(end);
    for (let d = a; d <= b && out.length < 2000; d++) out.push(fromDay(d));
    return out;
}

/** Monday of the ISO week of a day. */
export function weekStart(iso: Iso): Iso {
    const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
    return addDays(iso, -dow);
}

export function monthStart(iso: Iso): Iso {
    return `${iso.slice(0, 7)}-01`;
}

/** auto granularity (DESIGN.md 6.2 for bars; BUILDER 7.2 for lines). */
export function autoGranularity(start: Iso, end: Iso, kind: 'line' | 'bar'): 'day' | 'week' | 'month' {
    const days = daysBetween(start, end);
    if (kind === 'bar') return days <= 31 ? 'day' : days <= 186 ? 'week' : 'month';
    return days <= 400 ? 'day' : 'week';
}

// ── URL form ─────────────────────────────────────────────────────────────

/** `range` URL value: a preset id or 'YYYY-MM-DD_YYYY-MM-DD'. */
export function rangeToParam(spec: DateRangeSpec): string {
    if (spec.kind === 'custom') return `${spec.start}_${spec.end}`;
    if (spec.kind === 'preset') return spec.id;
    return `${spec.days}d`;
}

export function rangeFromParam(v: string | null | undefined, from?: string | null, to?: string | null): DateRangeSpec | null {
    if (!v) return null;
    if (isPresetId(v)) return { kind: 'preset', id: v };
    const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(v);
    if (m && isIso(m[1]) && isIso(m[2])) return { kind: 'custom', start: m[1], end: m[2] };
    if (v === 'custom' && isIso(from) && isIso(to)) return { kind: 'custom', start: from, end: to };
    return null;
}

export function compareToParam(spec: CompareSpec): 'prev' | 'yoy' | 'none' {
    if (spec.mode === 'previous_period') return 'prev';
    if (spec.mode === 'previous_year') return 'yoy';
    return 'none';
}

export function compareFromParam(v: string | null | undefined): CompareSpec | null {
    if (v === 'prev') return { mode: 'previous_period' };
    if (v === 'yoy') return { mode: 'previous_year' };
    if (v === 'none') return { mode: 'none' };
    return null;
}

export function presetLabel(spec: DateRangeSpec): string {
    if (spec.kind === 'preset') return PRESETS.find((p) => p.id === spec.id)?.label ?? spec.id;
    if (spec.kind === 'rolling') return `Last ${spec.days} days`;
    return 'Custom range';
}

export function compareLabel(spec: CompareSpec): string {
    if (spec.mode === 'previous_period') return 'vs previous period';
    if (spec.mode === 'previous_year') return 'vs same period last year';
    if (spec.mode === 'custom') return 'vs custom period';
    return '';
}
