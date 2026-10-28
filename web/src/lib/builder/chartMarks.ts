/**
 * Chart context for builder time series (round 7): dated markers (the owner's chart notes and
 * Google ranking updates) and horizontal goal / reference / average lines. Pure and isomorphic:
 * the chart, the editor, the notes routes and the tests import it.
 *
 * Notes are the site pages' notes (admin `annotations`, /api/annotations): one store, scoped by the
 * site's GA4 property, else its Search Console property (null = every site), exactly as
 * components/site/chart/ChartExtras.tsx reads them.
 */
import { GOOGLE_UPDATES, type GoogleUpdate } from '@/lib/googleUpdates';
import { getMetric } from './catalog';
import { daysBetween, resolveRange } from './dates';
import type { AnnotationMode, CellValue, Iso, MetricId, RefLine, ResolvedDates, WidgetDef } from './types';

// ── Ranges ───────────────────────────────────────────────────────────────

/** The days a widget shows: its own date override, else the dashboard range. */
export function widgetRange(widget: Pick<WidgetDef, 'dateOverride'>, resolved: Pick<ResolvedDates, 'range' | 'today'>): { start: Iso; end: Iso } {
    return widget.dateOverride?.range ? resolveRange(widget.dateOverride.range, resolved.today) : resolved.range;
}

export function annotationMode(mode: AnnotationMode | undefined): AnnotationMode {
    return mode === 'notes' || mode === 'google' || mode === 'off' ? mode : 'all';
}

export const showsNotes = (mode: AnnotationMode | undefined) => ['all', 'notes'].includes(annotationMode(mode));
export const showsGoogle = (mode: AnnotationMode | undefined) => ['all', 'google'].includes(annotationMode(mode));

// ── Notes scope ──────────────────────────────────────────────────────────

/** Where a site's notes live: its GA4 property, else its Search Console property (as on the site pages). */
export function noteScopeOf(site: { ga4?: string | null; gsc?: string | null } | null | undefined): string | null {
    const s = site?.ga4 || site?.gsc || null;
    return s && s.length <= 100 ? s : null;
}

export interface StoredNote {
    id: number;
    date: string;
    title: string;
    description?: string | null;
    property_id?: string | null;
}

/** Notes for a set of scopes: global notes (no property) plus notes of those scopes. 'all' keeps every note. */
export function notesForScopes<T extends Pick<StoredNote, 'property_id'>>(notes: T[], scopes: string[] | 'all'): T[] {
    if (scopes === 'all') return notes;
    const want = new Set(scopes);
    return notes.filter((n) => !n.property_id || want.has(n.property_id));
}

/** What a share link may receive for a note: the day and the text, never ids or scopes. */
export interface PublicNote { date: Iso; title: string }

export function toPublicNotes(notes: Array<Pick<StoredNote, 'date' | 'title'>>): PublicNote[] {
    return notes
        .filter((n) => /^\d{4}-\d{2}-\d{2}/.test(String(n.date)) && typeof n.title === 'string' && n.title.trim())
        .map((n) => ({ date: String(n.date).slice(0, 10), title: n.title.trim().slice(0, 200) }));
}

// ── Markers ──────────────────────────────────────────────────────────────

export interface ChartMark {
    key: string;
    kind: 'note' | 'google';
    /** The day it happened (a rollout's first day). */
    date: Iso;
    /** Row it is drawn on: the bucket that holds `date` (day, week or month start). */
    at: Iso;
    /** Google rollouts: the row holding the last rollout day, when it is a later row. */
    endAt?: Iso;
    label: string;
    detail?: string;
    /** 1-based number on the chart and in the footnote. */
    n: number;
    noteId?: number;
}

/** The row a day falls in: the last row date on or before it (rows are bucket starts, ascending). */
export function snapToRow(day: Iso, rowDates: Iso[], range: { start: Iso; end: Iso }): Iso | null {
    if (!rowDates.length || day < range.start || day > range.end) return null;
    let found: Iso | null = null;
    for (const d of rowDates) {
        if (d <= day) found = d;
        else break;
    }
    return found;
}

export const MAX_MARKS = 12;

function googleKind(u: GoogleUpdate): string {
    return u.kind === 'core' ? 'core update' : u.kind === 'spam' ? 'spam update' : 'ranking update';
}

/**
 * Markers for one chart, oldest first and numbered. Google updates are drawn on their rollout start
 * (and shaded to its end); notes on their day. At most `max` (the most recent win), `hidden` counts the rest.
 */
export function buildChartMarks(opts: {
    rowDates: Iso[];
    range: { start: Iso; end: Iso };
    mode: AnnotationMode | undefined;
    notes?: Array<{ id?: number; date: string; title: string; description?: string | null }>;
    google?: GoogleUpdate[];
    max?: number;
}): { marks: ChartMark[]; hidden: number } {
    const { rowDates, range } = opts;
    const mode = annotationMode(opts.mode);
    const out: Omit<ChartMark, 'n'>[] = [];
    if (mode === 'off' || !rowDates.length) return { marks: [], hidden: 0 };
    if (showsGoogle(mode)) {
        for (const u of opts.google ?? GOOGLE_UPDATES) {
            const at = snapToRow(u.start, rowDates, range);
            if (!at) continue;
            const last = snapToRow(u.end < range.end ? u.end : range.end, rowDates, range);
            out.push({
                key: `g-${u.start}-${u.name}`, kind: 'google', date: u.start, at, label: u.name,
                detail: `Google ${googleKind(u)}, rolled out ${u.start} to ${u.end}`,
                ...(last && last > at ? { endAt: last } : {}),
            });
        }
    }
    if (showsNotes(mode)) {
        for (const n of opts.notes ?? []) {
            const day = String(n.date).slice(0, 10);
            const at = snapToRow(day, rowDates, range);
            if (!at || !n.title) continue;
            out.push({ key: `n-${n.id ?? `${day}-${n.title}`}`, kind: 'note', date: day, at, label: n.title, detail: n.description || undefined, ...(n.id !== undefined ? { noteId: n.id } : {}) });
        }
    }
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === b.kind ? 0 : a.kind === 'google' ? -1 : 1));
    const max = opts.max ?? MAX_MARKS;
    const kept = out.length > max ? out.slice(out.length - max) : out;
    return { marks: kept.map((m, i) => ({ ...m, n: i + 1 })), hidden: out.length - kept.length };
}

// ── Reference and goal lines ─────────────────────────────────────────────

export interface ResolvedRefLine {
    key: string;
    kind: RefLine['kind'];
    /** The axis it is drawn on (a series metric). */
    metric: MetricId;
    y: number;
    label: string;
}

const BUCKET_DAYS = { day: 1, week: 7, month: 30.4375 } as const;

/** A goal / reference value as one point of the chart (rates and period totals scaled to the granularity). */
export function lineValuePerPoint(value: number, per: RefLine['per'], granularity: 'day' | 'week' | 'month', rangeDays: number, additive: boolean): number {
    if (!additive || !per || per === 'point') return value;
    const bucket = BUCKET_DAYS[granularity];
    if (per === 'period') return rangeDays > 0 ? (value * Math.min(bucket, rangeDays)) / rangeDays : value;
    return (value * bucket) / BUCKET_DAYS[per];
}

/** Mean of the plotted points (complete rows only: Search Console's preliminary tail is left out). */
export function seriesAverage(rows: Array<Record<string, CellValue>>, keys: string[], partialFrom?: number): number | null {
    const end = typeof partialFrom === 'number' && partialFrom > 0 && partialFrom < rows.length ? partialFrom : rows.length;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < end; i++) {
        let v = 0;
        let any = false;
        for (const k of keys) {
            const x = rows[i][k];
            if (typeof x === 'number' && Number.isFinite(x)) { v += x; any = true; }
        }
        if (!any) continue;
        sum += v;
        n++;
    }
    return n ? sum / n : null;
}

const DEFAULT_LABEL: Record<RefLine['kind'], string> = { goal: 'Goal', reference: 'Reference', average: 'Average' };
const PER_SUFFIX = { day: '/day', week: '/week', month: '/month' } as const;

/**
 * Lines to draw on a chart. A line whose metric is not on the chart, or without a usable value, is
 * skipped. `fmt` formats a value of a metric for the label.
 */
export function resolveRefLines(lines: RefLine[] | undefined, ctx: {
    rows: Array<Record<string, CellValue>>;
    /** Metrics on the chart, first = default. */
    metrics: MetricId[];
    /** Breakdown chart: the one metric and its series keys (stacked: the average is of the totals). */
    breakdown?: { metric: MetricId; keys: string[]; stacked: boolean };
    granularity: 'day' | 'week' | 'month';
    range: { start: Iso; end: Iso };
    partialFrom?: number;
    fmt: (metric: MetricId, v: number) => string;
}): ResolvedRefLine[] {
    if (!lines?.length || !ctx.metrics.length) return [];
    const rangeDays = daysBetween(ctx.range.start, ctx.range.end);
    const out: ResolvedRefLine[] = [];
    lines.slice(0, 3).forEach((l, i) => {
        const metric = l.metric && ctx.metrics.includes(l.metric) ? l.metric : l.metric && !ctx.breakdown ? null : ctx.metrics[0];
        if (!metric) return;
        const name = l.label?.trim() || DEFAULT_LABEL[l.kind];
        let y: number | null;
        let suffix = '';
        if (l.kind === 'average') {
            if (ctx.breakdown && !ctx.breakdown.stacked) return;
            y = seriesAverage(ctx.rows, ctx.breakdown ? ctx.breakdown.keys : [`m:${metric}`], ctx.partialFrom);
        } else {
            if (typeof l.value !== 'number' || !Number.isFinite(l.value)) return;
            const additive = Boolean(getMetric(metric)?.additive);
            y = lineValuePerPoint(l.value, l.per, ctx.granularity, rangeDays, additive);
            if (additive && l.per && l.per !== 'point') suffix = PER_SUFFIX[ctx.granularity];
        }
        if (y === null || !Number.isFinite(y)) return;
        out.push({ key: `rl-${i}`, kind: l.kind, metric, y, label: `${name} ${ctx.fmt(metric, y)}${suffix}` });
    });
    return out;
}
