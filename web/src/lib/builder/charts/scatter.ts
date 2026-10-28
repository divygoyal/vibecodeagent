/**
 * Scatter (round 9): query plan, defaults, validation and data shaping. Pure and isomorphic.
 *
 * One ranked report of the dimension with up to three metrics (x, y, size); the engine already joins
 * Search Console and Analytics on page, country and device, so "impressions against CTR by page"
 * and "pageviews against engagement by page" are both one widget.
 */
import { dimLabel, getMetric, metricFamilies, metricLabel } from '../catalog';
import type { CellValue, MetricId, WidgetQuery } from '../types';
import type { Quadrant, ScatterConfig, ScatterWidget } from './types';
import type { QueryBase } from './index';

export const SCATTER_MAX_POINTS = 200;

export function defaultScatterConfig(ctx: { ga4: boolean; gsc: boolean }): ScatterConfig {
    const search = ctx.gsc;
    return search
        ? { dimension: 'page', x: { id: 'gsc:impressions' }, y: { id: 'gsc:ctr' }, size: { id: 'gsc:clicks' }, top: 50, quadrants: true, highlight: 'br', xScale: 'log', yScale: 'linear', labels: false }
        : { dimension: 'page', x: { id: 'ga4:screenPageViews' }, y: { id: 'ga4:engagementRate' }, size: { id: 'ga4:sessions' }, top: 50, quadrants: true, xScale: 'log', yScale: 'linear', labels: false };
}

export function scatterMetrics(c: ScatterConfig): MetricId[] {
    return [...new Set([c.x.id, c.y.id, ...(c.size ? [c.size.id] : [])])];
}

export function scatterTitle(c: ScatterConfig): string {
    return `${c.y.label || metricLabel(c.y.id)} against ${(c.x.label || metricLabel(c.x.id)).toLowerCase()} by ${dimLabel(c.dimension).toLowerCase()}`;
}

export function compileScatter(w: ScatterWidget, base: QueryBase): WidgetQuery[] {
    const c = w.config;
    const metrics = scatterMetrics(c);
    const top = Math.min(SCATTER_MAX_POINTS, Math.max(5, Math.round(c.top)));
    // The biggest points matter: rank by size when there is one, else by x.
    const rank = c.size?.id ?? c.x.id;
    return [{
        ...base, part: 'rows', metrics, dimensions: [c.dimension],
        sort: { by: rank, dir: 'desc' },
        top: { n: top, other: false },
        limit: Math.min(1000, Math.max(250, top * 4)),
        compare: false,
    }];
}

/** Why a scatter cannot work as saved (null = fine). */
export function scatterProblem(w: ScatterWidget): string | null {
    const c = w.config;
    if (c.x.id === c.y.id) return 'A scatter plot needs two different metrics on the axes.';
    if (c.dimension === 'date' || c.dimension === 'week' || c.dimension === 'month') return 'A scatter plot compares categories; use a time series for dates.';
    return null;
}

// ── shaping ──────────────────────────────────────────────────────────────

export interface ScatterPoint {
    /** The raw value of the dimension (a page path, a country code). */
    key: string;
    x: number;
    y: number;
    /** The size metric (null when the chart has none or the row has no value). */
    size: number | null;
}

export interface ScatterModel {
    points: ScatterPoint[];
    medianX: number;
    medianY: number;
    /** Rows left out: missing values, or non-positive values on a log axis. */
    skipped: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    sizeMin: number;
    sizeMax: number;
    counts: Record<Quadrant, number>;
}

export function median(values: number[]): number {
    if (!values.length) return 0;
    const v = [...values].sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The quadrant of a point against the medians: x right / left, y top / bottom (ties count as high). */
export function quadrantOf(p: { x: number; y: number }, mx: number, my: number): Quadrant {
    return `${p.y >= my ? 't' : 'b'}${p.x >= mx ? 'r' : 'l'}` as Quadrant;
}

export function shapeScatter(rows: Array<Record<string, CellValue>>, c: ScatterConfig): ScatterModel {
    const dim = `d:${c.dimension}`;
    const points: ScatterPoint[] = [];
    let skipped = 0;
    for (const r of rows) {
        if (r.__other) continue;
        const key = r[dim];
        const x = r[`m:${c.x.id}`];
        const y = r[`m:${c.y.id}`];
        const s = c.size ? r[`m:${c.size.id}`] : null;
        if (key === null || key === undefined || key === '' || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) { skipped++; continue; }
        if ((c.xScale === 'log' && x <= 0) || (c.yScale === 'log' && y <= 0)) { skipped++; continue; }
        points.push({ key: String(key), x, y, size: typeof s === 'number' && Number.isFinite(s) && s >= 0 ? s : null });
    }
    const medianX = median(points.map((p) => p.x));
    const medianY = median(points.map((p) => p.y));
    const counts: Record<Quadrant, number> = { tl: 0, tr: 0, bl: 0, br: 0 };
    for (const p of points) counts[quadrantOf(p, medianX, medianY)]++;
    const ext = (f: (p: ScatterPoint) => number) => ({ min: points.length ? Math.min(...points.map(f)) : 0, max: points.length ? Math.max(...points.map(f)) : 0 });
    const xe = ext((p) => p.x);
    const ye = ext((p) => p.y);
    const sizes = points.map((p) => p.size).filter((v): v is number => v !== null);
    return {
        points, medianX, medianY, skipped, counts,
        xMin: xe.min, xMax: xe.max, yMin: ye.min, yMax: ye.max,
        sizeMin: sizes.length ? Math.min(...sizes) : 0, sizeMax: sizes.length ? Math.max(...sizes) : 0,
    };
}

/** Point radius in px: 4 to 16 on a square-root scale (area follows the value); 5 without a size metric. */
export function pointRadius(size: number | null, min: number, max: number): number {
    if (size === null || max <= 0) return 5;
    if (max === min) return 8;
    return 4 + 12 * Math.sqrt(Math.max(0, Math.min(1, (size - min) / (max - min))));
}

/** 1-2-5 ticks of a log axis between two positive bounds (always at least two). */
export function logTicks(lo: number, hi: number): number[] {
    const out: number[] = [];
    const start = Math.floor(Math.log10(Math.max(lo, 1e-9)));
    const end = Math.ceil(Math.log10(Math.max(hi, lo * 1.01)));
    for (let e = start; e <= end; e++) for (const m of [1, 2, 5]) {
        const v = m * 10 ** e;
        if (v >= lo / 1.0001 && v <= hi * 1.0001) out.push(Number(v.toPrecision(12)));
    }
    return out.length >= 2 ? out : [lo, hi];
}

/** A metric label inside a sentence: "Impressions" -> "impressions", "CTR" stays. */
export function lowerLabel(label: string): string {
    return /^[A-Z]{2,}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

const levelWord = (id: MetricId, high: boolean) => `${high ? 'above' : 'below'}-median ${lowerLabel(getMetric(id)?.label ?? metricLabel(id))}`;

/** "Above-median impressions, below-median CTR". */
export function quadrantText(q: Quadrant, c: ScatterConfig): string {
    return `${levelWord(c.x.id, q[1] === 'r')}, ${levelWord(c.y.id, q[0] === 't')}`.replace(/^./, (ch) => ch.toUpperCase());
}

/** Families of the metrics on a scatter (the editor offers dimensions both can use). */
export function scatterFamilies(c: ScatterConfig) {
    return [...new Set(scatterMetrics(c).flatMap((m) => metricFamilies(m)))];
}
