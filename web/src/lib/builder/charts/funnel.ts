/**
 * Funnel (round 9): query plan, defaults, validation and data shaping. Pure and isomorphic.
 *
 * A "step counts" funnel: one small Analytics report per step (the metric filtered to that event or page),
 * so each step is counted on its own and the conversion between two steps is the ratio of their counts.
 * Visitors are not followed through the steps in order (Google's funnel exploration does that), so a later
 * step can even be bigger than the one before it; the widget says so. One report per step, cached like any
 * other leaf, merged into batches of five by the engine.
 */
import { getMetric, metricFamilies, metricLabel } from '../catalog';
import type { CellValue, DataFrame, FilterClause, MetricId, WidgetQuery, WidgetResultOk } from '../types';
import type { FunnelConfig, FunnelStep, FunnelWidget } from './types';
import type { QueryBase } from './index';

export const FUNNEL_MIN_STEPS = 2;
export const FUNNEL_MAX_STEPS = 8;

export const FUNNEL_NOTE = 'Step counts: each step is counted on its own, visitors are not followed through the steps in order.';

export function defaultFunnelConfig(): FunnelConfig {
    return {
        metric: { id: 'ga4:activeUsers' },
        steps: [
            { label: 'Visited', kind: 'event', value: 'session_start' },
            { label: 'Engaged', kind: 'event', value: 'user_engagement' },
            { label: 'Scrolled', kind: 'event', value: 'scroll' },
            { label: 'Clicked', kind: 'event', value: 'click' },
        ],
        showDropoff: true,
    };
}

export function funnelMetrics(c: FunnelConfig): MetricId[] {
    return [c.metric.id];
}

export function funnelTitle(c: FunnelConfig): string {
    return `${c.metric.label || metricLabel(c.metric.id)} by step`;
}

/** What a step is called: its label, else the page path or the event name. */
export function stepLabel(s: FunnelStep): string {
    return s.label?.trim() || s.value;
}

/** The filter that picks one step out of the Analytics data. */
export function stepFilter(s: FunnelStep): FilterClause {
    if (s.kind === 'event') return { dimension: 'eventName', op: 'eq', value: s.value };
    return { dimension: 'page', op: s.match === 'starts' ? 'starts' : s.match === 'contains' ? 'contains' : 'eq', value: s.value };
}

export const stepPart = (i: number) => `s${i}`;

/** The steps that name an event or page (a step just added in the editor is blank until filled in). */
export function activeSteps(c: FunnelConfig): FunnelStep[] {
    return c.steps.slice(0, FUNNEL_MAX_STEPS).filter((s) => s.value.trim());
}

export function compileFunnel(w: FunnelWidget, base: QueryBase): WidgetQuery[] {
    const c = w.config;
    const steps = activeSteps(c);
    return (steps.length >= FUNNEL_MIN_STEPS ? steps : []).map((s, i) => ({
        ...base, part: stepPart(i), metrics: [c.metric.id], dimensions: [], compare: false, stepFilters: [stepFilter(s)],
    }));
}

/** Why a funnel cannot work as saved (null = fine). */
export function funnelProblem(w: FunnelWidget): string | null {
    const c = w.config;
    if (metricFamilies(c.metric.id).some((f) => f !== 'ga4')) return 'A funnel counts Analytics events and pages. Pick an Analytics metric.';
    if (c.steps.length < FUNNEL_MIN_STEPS || c.steps.length > FUNNEL_MAX_STEPS) return `A funnel has ${FUNNEL_MIN_STEPS} to ${FUNNEL_MAX_STEPS} steps.`;
    return null;
}

// ── shaping ──────────────────────────────────────────────────────────────

export interface FunnelRow {
    label: string;
    value: number;
    /** Share of the first step (0..n; 1 = as many as the first step). */
    ofFirst: number;
    /** Share of the previous step; null on the first step or when the previous step is empty. */
    ofPrev: number | null;
    /** Lost since the previous step (previous - this, never negative); null on the first step. */
    lost: number | null;
}

export interface FunnelModel {
    rows: FunnelRow[];
    /** Last step against the first step; null when the first step is empty. */
    overall: number | null;
    /** The largest step (bar widths are drawn against it). */
    max: number;
    /** Some step has more than the step before it (the counts are not sequenced). */
    outOfOrder: boolean;
    /** Every step is empty. */
    empty: boolean;
    /** Fewer than two steps are filled in (nothing was asked of Google). */
    needsSteps: boolean;
}

function valueOf(parts: Record<string, DataFrame>, i: number, metric: MetricId): number {
    const v: CellValue | undefined = parts[stepPart(i)]?.rows?.[0]?.[`m:${metric}`];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function shapeFunnel(parts: Record<string, DataFrame>, c: FunnelConfig): FunnelModel {
    const steps = activeSteps(c);
    const values = steps.map((_, i) => valueOf(parts, i, c.metric.id));
    const first = values[0] ?? 0;
    const rows: FunnelRow[] = steps.map((s, i) => ({
        label: stepLabel(s),
        value: values[i],
        ofFirst: first > 0 ? values[i] / first : 0,
        ofPrev: i === 0 || values[i - 1] <= 0 ? null : values[i] / values[i - 1],
        lost: i === 0 ? null : Math.max(0, values[i - 1] - values[i]),
    }));
    return {
        rows,
        overall: first > 0 && values.length > 1 ? values[values.length - 1] / first : null,
        max: Math.max(0, ...values),
        outOfOrder: values.some((v, i) => i > 0 && v > values[i - 1]),
        empty: values.every((v) => v === 0),
        needsSteps: steps.length < FUNNEL_MIN_STEPS,
    };
}

/** "Download CSV" frame: one row per step with its count and both conversion ratios. */
export function funnelCsvFrame(w: FunnelWidget, r: WidgetResultOk): DataFrame {
    const c = w.config;
    const m = shapeFunnel(r.parts, c);
    return {
        columns: [
            { id: 'd:step', kind: 'dimension', label: 'Step' },
            { id: `m:${c.metric.id}`, kind: 'metric', label: getMetric(c.metric.id)?.label ?? metricLabel(c.metric.id) },
            { id: 'm:ofPrev', kind: 'metric', label: '% of previous step' },
            { id: 'm:ofFirst', kind: 'metric', label: '% of first step' },
        ],
        rows: m.rows.map((x) => ({ 'd:step': x.label, [`m:${c.metric.id}`]: x.value, 'm:ofPrev': x.ofPrev === null ? null : Math.round(x.ofPrev * 1000) / 10, 'm:ofFirst': Math.round(x.ofFirst * 1000) / 10 })),
        rowCount: m.rows.length,
    };
}
