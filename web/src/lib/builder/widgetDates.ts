/**
 * Per-widget dates (round 9, BUILDER-COMPARISON row 20). A widget either follows the dashboard's dates (no
 * `dateOverride`), reads its own fixed range (`range`), or reads the dashboard's range moved back in time
 * (`shift`, "same widget one year earlier"). Precedence, strongest first: own range > time shift > dashboard.
 * The comparison of a widget with its own dates: its own `compare`, else the dashboard's comparison mode
 * applied to the widget's range (a custom dashboard comparison stays the same fixed days), else the dashboard's.
 *
 * One function resolves it for the engine (server) and for the labels and chips (browser), so they never differ.
 */
import { fmtDateRange, fmtDateRangeShort } from '@/lib/format';
import { addDays, addMonths, PRESETS, resolveCompare, resolveRange } from './dates';
import { compareText, type CompareText } from './compare';
import type { CompareSpec, DatePresetId, DateRangeSpec, DateShift, Iso, WidgetDef } from './types';

export type DateOverride = NonNullable<WidgetDef['dateOverride']>;
type Range = { start: Iso; end: Iso };

/** The fixed ranges the editor offers for one widget. */
export const OVERRIDE_PRESETS: DatePresetId[] = ['7d', '28d', '90d', 'this_month', 'last_month', 'this_year'];

export const SHIFT_UNITS: Array<{ unit: DateShift['unit']; one: string; many: string }> = [
    { unit: 'week', one: 'week', many: 'weeks' },
    { unit: 'month', one: 'month', many: 'months' },
    { unit: 'year', one: 'year', many: 'years' },
    { unit: 'day', one: 'day', many: 'days' },
];

export const MAX_SHIFT = 60;

/** True when the override changes anything (an empty `{}` follows the dashboard). */
export function hasOwnDates(o: WidgetDef['dateOverride'] | undefined): o is DateOverride {
    return Boolean(o && (o.range || o.shift || o.compare));
}

/** A range moved `shift.amount` units into the past (Feb 29 - 1 year = Feb 28). */
export function shiftRange(range: Range, shift: DateShift): Range {
    const n = Math.max(1, Math.min(MAX_SHIFT, Math.floor(shift.amount || 1)));
    switch (shift.unit) {
        case 'year': return { start: addMonths(range.start, -12 * n), end: addMonths(range.end, -12 * n) };
        case 'month': return { start: addMonths(range.start, -n), end: addMonths(range.end, -n) };
        case 'week': return { start: addDays(range.start, -7 * n), end: addDays(range.end, -7 * n) };
        default: return { start: addDays(range.start, -n), end: addDays(range.end, -n) };
    }
}

export interface WidgetDates {
    range: Range;
    compare: Range | undefined;
    /** The comparison rule the widget reads: its own, or the dashboard's. */
    compareSpec: CompareSpec;
    /** The widget does not follow the dashboard's dates. */
    own: boolean;
}

export function resolveWidgetDates(
    override: WidgetDef['dateOverride'] | undefined,
    base: { range: Range; compare: Range | undefined; compareSpec: CompareSpec; today: Iso },
): WidgetDates {
    if (!hasOwnDates(override)) return { range: base.range, compare: base.compare, compareSpec: base.compareSpec, own: false };
    const range = override.range ? resolveRange(override.range, base.today) : override.shift ? shiftRange(base.range, override.shift) : base.range;
    const moved = range !== base.range;
    const compareSpec = override.compare ?? base.compareSpec;
    const compare = override.compare || moved ? resolveCompare(range, compareSpec, base.today) : base.compare;
    return { range, compare, compareSpec, own: true };
}

/** What the viewer sees on a widget's own-dates chip: "Last 7 days", "Previous year", "2 weeks earlier". */
export function overrideLabel(o: DateOverride): string {
    if (o.range) return rangeText(o.range);
    if (o.shift) {
        const u = SHIFT_UNITS.find((x) => x.unit === o.shift!.unit) ?? SHIFT_UNITS[0];
        const n = Math.max(1, Math.floor(o.shift.amount || 1));
        return n === 1 && o.shift.unit === 'year' ? 'Previous year' : `${n === 1 ? '1' : n} ${n === 1 ? u.one : u.many} earlier`;
    }
    return o.compare ? 'Own comparison' : '';
}

/**
 * The text of a widget's own-dates chip: the real days ("Oct 14–20", "Sep 30–Oct 27, 2025"), so the chip says
 * what the widget shows, not how it was set up ("Last 7 days", "2 weeks earlier"). A widget that only has its own
 * comparison reads the dashboard's days, so its chip says "Own comparison". `now` is for tests.
 */
export function chipText(o: DateOverride, dates: Pick<WidgetDates, 'range'>, now?: Date): string {
    if (!o.range && !o.shift) return o.compare ? 'Own comparison' : '';
    return fmtDateRangeShort(dates.range.start, dates.range.end, now);
}

/** Full words for the chip's tooltip and screen readers: the rule and the days ("Own dates: Last 7 days (Oct 14 – Oct 20)"). */
export function chipTitle(o: DateOverride, dates: WidgetDates): string {
    const rule = overrideLabel(o);
    const days = fmtDateRange(dates.range.start, dates.range.end);
    const own = o.range || o.shift ? `Own dates: ${rule && rule !== days ? `${rule} (${days})` : days}` : 'Own comparison';
    return dates.compare ? `${own}. ${widgetCompareText(dates).title}` : own;
}

function rangeText(r: DateRangeSpec): string {
    if (r.kind === 'preset') return PRESETS.find((p) => p.id === r.id)?.label ?? r.id;
    if (r.kind === 'rolling') return `Last ${r.days} days`;
    return `${r.start} to ${r.end}`;
}

/** The comparison words of a widget (same words as the dashboard's when it follows the dashboard). */
export function widgetCompareText(w: WidgetDates): CompareText {
    return compareText(w.compareSpec, w.compare);
}

/**
 * Normalises an override the editor or a pasted doc produced: drops empty parts, clamps the shift, and keeps
 * only one of range / shift (range wins, as at query time).
 */
export function cleanOverride(o: WidgetDef['dateOverride'] | undefined): DateOverride | undefined {
    if (!o) return undefined;
    const out: DateOverride = {};
    if (o.range) out.range = o.range;
    else if (o.shift && o.shift.amount >= 1) out.shift = { unit: o.shift.unit, amount: Math.min(MAX_SHIFT, Math.floor(o.shift.amount)) };
    if (o.compare) out.compare = o.compare;
    return hasOwnDates(out) ? out : undefined;
}
