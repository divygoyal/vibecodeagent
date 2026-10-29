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

/** A metric where a smaller number is better (average position: 1 is the top of the results). */
export function lowerIsBetter(id: MetricId): boolean {
    return getMetric(id)?.format === 'position';
}

const levelWord = (id: MetricId, high: boolean) => {
    const name = lowerLabel(getMetric(id)?.label ?? metricLabel(id));
    // "Above-median position" would read as a better rank, which it is not: a big position number is a worse rank.
    return lowerIsBetter(id) ? `${high ? 'worse' : 'better'}-than-median ${name}` : `${high ? 'above' : 'below'}-median ${name}`;
};

/** "Above-median impressions, below-median CTR"; for a position axis "worse-than-median avg. position". */
export function quadrantText(q: Quadrant, c: ScatterConfig): string {
    return `${levelWord(c.x.id, q[1] === 'r')}, ${levelWord(c.y.id, q[0] === 't')}`.replace(/^./, (ch) => ch.toUpperCase());
}

// ── axes and labels (pixel geometry, pure so it is tested without a browser) ──

export interface PlotBox { x0: number; y0: number; x1: number; y1: number }

/** Pixel position of a value on an axis (linear or log) between two pixel bounds; `reversed` flips the direction. */
export function axisPixel(v: number, domain: [number, number], scale: 'linear' | 'log', from: number, to: number, reversed = false): number {
    const [d0, d1] = domain;
    const t = scale === 'log' && d0 > 0 && v > 0 ? Math.log(v / d0) / Math.log(d1 / d0) : d1 === d0 ? 0.5 : (v - d0) / (d1 - d0);
    const u = reversed ? 1 - t : t;
    return from + u * (to - from);
}

export interface LabelRect { x: number; y: number; w: number; h: number }
const overlaps = (a: LabelRect, b: LabelRect, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export const LABEL_FONT = 10;
export const LABEL_CHAR_W = 5.6;
export const LABEL_H = 12;
export const LABEL_MIN_CHARS = 8;

/** Shorten to `max` characters with an ellipsis ("/blog/product-an…"). */
export function ellipsize(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export interface LabelInput { key: string; text: string; cx: number; cy: number; r: number }
export interface PlacedLabel extends LabelRect {
    key: string;
    /** What is drawn (possibly cut with an ellipsis). */
    text: string;
    full: string;
    /** x is the anchor: the start of the text ('start'), its end ('end') or its centre ('middle'). */
    anchor: 'start' | 'end' | 'middle';
    /** Baseline y of the text. */
    baseline: number;
    truncated: boolean;
}

/**
 * Place point labels so they do not cover each other, the median labels (`reserved`) or the edge of the
 * chart. Points come in priority order (the biggest first). A label goes to the right of its point; near the
 * right edge it flips to the left, then above, then below; long names are cut with an ellipsis to fit the
 * room there is. Among the places that are free the one that covers the fewest other points wins; when no
 * place is free the label is left out (the tooltip still names the point).
 */
export function placeLabels(items: LabelInput[], bounds: LabelRect, reserved: LabelRect[] = [], maxChars = 24, all: Array<{ cx: number; cy: number; r: number }> = items): PlacedLabel[] {
    const placed: PlacedLabel[] = [];
    const taken: LabelRect[] = [...reserved];
    const bx1 = bounds.x + bounds.w;
    const by1 = bounds.y + bounds.h;
    for (const it of items) {
        const width = (t: string) => Math.ceil(t.length * LABEL_CHAR_W);
        const h = LABEL_H;
        const tries: Array<{ anchor: PlacedLabel['anchor']; room: number; rect: (w: number) => LabelRect }> = [
            { anchor: 'start', room: bx1 - (it.cx + it.r + 3), rect: (w) => ({ x: it.cx + it.r + 3, y: it.cy - h / 2, w, h }) },
            { anchor: 'end', room: it.cx - it.r - 3 - bounds.x, rect: (w) => ({ x: it.cx - it.r - 3 - w, y: it.cy - h / 2, w, h }) },
            { anchor: 'middle', room: 2 * Math.min(it.cx - bounds.x, bx1 - it.cx), rect: (w) => ({ x: it.cx - w / 2, y: it.cy - it.r - 3 - h, w, h }) },
            { anchor: 'middle', room: 2 * Math.min(it.cx - bounds.x, bx1 - it.cx), rect: (w) => ({ x: it.cx - w / 2, y: it.cy + it.r + 3, w, h }) },
        ];
        let best: { label: PlacedLabel; score: number } | null = null;
        for (const t of tries) {
            const chars = Math.min(maxChars, Math.floor(t.room / LABEL_CHAR_W));
            // A cut name must still say something: with fewer characters than that, try the next side.
            if (chars < Math.min(LABEL_MIN_CHARS, it.text.length)) continue;
            const text = ellipsize(it.text, chars);
            const rect = t.rect(width(text));
            if (rect.x < bounds.x - 0.5 || rect.x + rect.w > bx1 + 0.5 || rect.y < bounds.y || rect.y + rect.h > by1) continue;
            if (taken.some((o) => overlaps(rect, o))) continue;
            const score = all.reduce((n, p) => n + (p.cx + p.r > rect.x && p.cx - p.r < rect.x + rect.w && p.cy + p.r > rect.y && p.cy - p.r < rect.y + rect.h && !(p.cx === it.cx && p.cy === it.cy) ? 1 : 0), 0);
            const label: PlacedLabel = { ...rect, key: it.key, text, full: it.text, anchor: t.anchor, baseline: rect.y + h - 3, truncated: text !== it.text };
            // Text drawn from its end or its middle is anchored there, so x is the anchor.
            if (!best || score < best.score) best = { label, score };
            if (score === 0) break;
        }
        if (best) {
            placed.push(best.label);
            taken.push(best.label);
        }
    }
    return placed;
}

/** Families of the metrics on a scatter (the editor offers dimensions both can use). */
export function scatterFamilies(c: ScatterConfig) {
    return [...new Set(scatterMetrics(c).flatMap((m) => metricFamilies(m)))];
}
