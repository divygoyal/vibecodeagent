/**
 * Comparison modes of the dashboard date control (round 9): the picker's options, the words KPI deltas and chart
 * tooltips use ("vs Sep 2 – Sep 29", "vs last year") and the share-link permission. Pure and isomorphic.
 */
import { fmtDateRange } from '@/lib/format';
import { daysBetween, isIso } from './dates';
import type { CompareSpec, DateControl, Iso } from './types';

export interface CompareOption {
    /** Stable id of the picker row (also the `compare` URL value, custom excepted). */
    id: 'prev' | 'prevw' | 'yoy' | 'yoyw' | 'custom' | 'none';
    label: string;
    hint?: string;
    spec: CompareSpec | null;
}

/** The picker's rows, in order. `custom` has no spec until the viewer picks two days. */
export const COMPARE_OPTIONS: CompareOption[] = [
    { id: 'prev', label: 'Previous period', spec: { mode: 'previous_period' } },
    { id: 'prevw', label: 'Previous period, same weekdays', hint: 'Shifted back by whole weeks', spec: { mode: 'previous_period', align: 'weekday' } },
    { id: 'yoy', label: 'Same period last year', spec: { mode: 'previous_year' } },
    { id: 'yoyw', label: 'Last year, same weekdays', hint: 'Shifted back 52 weeks', spec: { mode: 'previous_year', align: 'weekday' } },
    { id: 'custom', label: 'Custom range', spec: null },
    { id: 'none', label: 'No comparison', spec: { mode: 'none' } },
];

/** Which picker row a spec belongs to. */
export function compareOptionId(spec: CompareSpec): CompareOption['id'] {
    if (spec.mode === 'previous_period') return spec.align === 'weekday' ? 'prevw' : 'prev';
    if (spec.mode === 'previous_year') return spec.align === 'weekday' ? 'yoyw' : 'yoy';
    return spec.mode === 'custom' ? 'custom' : 'none';
}

export interface CompareText {
    /** Inline line under a number: "vs Sep 2 – Sep 29" / "vs last year" / "vs previous period". */
    short: string;
    /** Legend / tooltip row name: "Previous period" / "Last year" / "Sep 2 – Sep 29". */
    legend: string;
    /** Full sentence for tooltips and screen readers. */
    title: string;
}

/** The words for a comparison; `range` is its resolved window (missing: only the mode is named). */
export function compareText(spec: CompareSpec, range?: { start: Iso; end: Iso }): CompareText {
    const days = range ? fmtDateRange(range.start, range.end) : '';
    switch (spec.mode) {
        case 'previous_period': {
            const how = spec.align === 'weekday' ? 'previous period, same weekdays' : 'previous period';
            return { short: days ? `vs ${days}` : 'vs previous period', legend: 'Previous period', title: days ? `Compared with ${days} (${how})` : `Compared with the ${how}` };
        }
        case 'previous_year': {
            const how = spec.align === 'weekday' ? 'last year, same weekdays' : 'the same period last year';
            return { short: 'vs last year', legend: 'Last year', title: days ? `Compared with ${days} (${how})` : `Compared with ${how}` };
        }
        case 'custom':
            return { short: days ? `vs ${days}` : 'vs custom period', legend: days || 'Custom period', title: days ? `Compared with ${days}` : 'Compared with a custom period' };
        default:
            return { short: '', legend: '', title: '' };
    }
}

/** The part after "vs <value>" in a KPI line: "(Sep 2 – Sep 29)", "last year" or "previous period". */
export function compareTail(t: CompareText): string {
    const rest = t.short.replace(/^vs /, '');
    return /\d/.test(rest) ? `(${rest})` : rest;
}

/**
 * Viewers may change the comparison only when the share lets them change dates too (the comparison lives
 * in the date control, so a locked date control locks it) and the owner kept "viewers can compare" on.
 */
export function viewerMayCompare(share: { date: boolean; compare: boolean }, dc: Pick<DateControl, 'viewerCanChange' | 'viewerCanCompare'>): boolean {
    return share.date && share.compare && dc.viewerCanChange && dc.viewerCanCompare;
}

/** A custom comparison as the picker builds it: two valid days, any order. */
export function customCompare(start: string, end: string): CompareSpec | null {
    if (!isIso(start) || !isIso(end)) return null;
    return start <= end ? { mode: 'custom', start, end } : { mode: 'custom', start: end, end: start };
}

/**
 * A custom comparison of another length than the range compares unlike totals (28 days against 31). The words for the
 * date popover, or null when the lengths match. Both ranges are inclusive.
 */
export function compareLengthNote(range: { start: Iso; end: Iso }, cmp: { start: Iso; end: Iso }): string | null {
    const a = daysBetween(range.start, range.end);
    const b = daysBetween(cmp.start, cmp.end);
    if (a === b) return null;
    const d = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
    return `Your range is ${d(a)} but this comparison is ${d(b)}. Totals will not be like for like; pick ${d(a)} to compare fairly.`;
}
