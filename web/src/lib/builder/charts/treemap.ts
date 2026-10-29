/**
 * Treemap (round 9): query plan, defaults, validation, data shaping and the squarified layout. Pure and
 * isomorphic, so the layout is tested without a browser.
 *
 * One ranked report (dimension, or parent then dimension) of one additive metric; the boxes are laid out
 * with the squarified algorithm (Bruls, Huizing, van Wijk, 2000) so they stay close to squares.
 */
import { dimLabel, getMetric, metricLabel } from '../catalog';
import type { CellValue, MetricId, WidgetQuery } from '../types';
import type { TreemapConfig, TreemapWidget } from './types';
import type { QueryBase } from './index';

export const TREEMAP_MAX_BOXES = 60;

export function defaultTreemapConfig(ctx: { ga4: boolean; gsc: boolean }): TreemapConfig {
    return ctx.ga4
        ? { dimension: 'source', parent: 'channel', metric: { id: 'ga4:sessions' }, top: 30, colorBy: 'group', showValues: true }
        : { dimension: 'page', metric: { id: 'gsc:clicks' }, top: 30, colorBy: 'value', showValues: true };
}

export function treemapMetrics(c: TreemapConfig): MetricId[] {
    return [c.metric.id];
}

export function treemapTitle(c: TreemapConfig): string {
    const m = c.metric.label || metricLabel(c.metric.id);
    return `${m} by ${c.parent ? `${dimLabel(c.parent).toLowerCase()} and ${dimLabel(c.dimension).toLowerCase()}` : dimLabel(c.dimension).toLowerCase()}`;
}

export function compileTreemap(w: TreemapWidget, base: QueryBase): WidgetQuery[] {
    const c = w.config;
    const n = Math.min(TREEMAP_MAX_BOXES, Math.max(5, Math.round(c.top)));
    const dims = c.parent && c.parent !== c.dimension ? [c.parent, c.dimension] : [c.dimension];
    return [{
        ...base, part: 'rows', metrics: [c.metric.id], dimensions: dims,
        sort: { by: c.metric.id, dir: 'desc' },
        // A flat treemap folds the rest into one "Other" box (the total stays honest); grouped boxes cannot
        // (an Other of two dimensions belongs to no group), so the footnote says how many are shown.
        top: { n, other: dims.length === 1 && Boolean(getMetric(c.metric.id)?.additive) },
        limit: Math.min(1000, Math.max(250, n * 4)),
        compare: false,
    }];
}

/** Why a treemap cannot work as saved (null = fine). */
export function treemapProblem(w: TreemapWidget): string | null {
    const c = w.config;
    if (!getMetric(c.metric.id)?.additive) return 'A treemap sizes boxes by a count that adds up (sessions, clicks, revenue). Rates and averages cannot be added; use a bar chart.';
    if (c.parent && c.parent === c.dimension) return 'The group and the box dimension must differ.';
    if (['date', 'week', 'month'].includes(c.dimension)) return 'A treemap compares categories; use a time series for dates.';
    return null;
}

// ── layout ───────────────────────────────────────────────────────────────

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Squarified treemap (Bruls et al. 2000): items in descending order are added to a row along the shorter
 * side of the free rectangle while the worst aspect ratio of the row keeps improving. Items with no value
 * are dropped; the rectangles tile `rect` exactly (up to float rounding).
 */
export function squarify<T extends { value: number }>(items: T[], rect: Rect): Array<T & Rect> {
    const list = items.filter((i) => i.value > 0 && Number.isFinite(i.value)).sort((a, b) => b.value - a.value);
    const total = list.reduce((s, i) => s + i.value, 0);
    if (!list.length || rect.w <= 0 || rect.h <= 0 || total <= 0) return [];
    const scale = (rect.w * rect.h) / total;
    const out: Array<T & Rect> = [];
    let { x, y, w, h } = rect;
    let row: Array<{ item: T; area: number }> = [];
    const worst = (r: typeof row, side: number): number => {
        const s = r.reduce((a, b) => a + b.area, 0);
        const max = Math.max(...r.map((b) => b.area));
        const min = Math.min(...r.map((b) => b.area));
        return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
    };
    const flush = () => {
        if (!row.length) return;
        const s = row.reduce((a, b) => a + b.area, 0);
        if (w >= h) {
            // A column down the left side.
            const cw = s / h;
            let cy = y;
            for (const r of row) {
                const ch = r.area / cw;
                out.push({ ...r.item, x, y: cy, w: cw, h: ch });
                cy += ch;
            }
            x += cw;
            w -= cw;
        } else {
            // A row along the top.
            const rh = s / w;
            let cx = x;
            for (const r of row) {
                const cw = r.area / rh;
                out.push({ ...r.item, x: cx, y, w: cw, h: rh });
                cx += cw;
            }
            y += rh;
            h -= rh;
        }
        row = [];
    };
    for (const item of list) {
        const cell = { item, area: item.value * scale };
        const side = Math.min(w, h);
        if (!row.length || worst([...row, cell], side) <= worst(row, side)) row.push(cell);
        else {
            flush();
            row = [cell];
        }
    }
    flush();
    return out;
}

// ── shaping ──────────────────────────────────────────────────────────────

export interface TreemapLeaf {
    key: string;
    /** The raw dimension value ('(other)' for the folded rest). */
    value: string;
    amount: number;
    other?: boolean;
}
export interface TreemapGroup {
    key: string;
    /** The raw parent value; null for a flat treemap. */
    parent: string | null;
    amount: number;
    leaves: TreemapLeaf[];
}
export interface TreemapModel {
    groups: TreemapGroup[];
    total: number;
    leafCount: number;
    /** Rows left out for having no positive value. */
    skipped: number;
}

export function shapeTreemap(rows: Array<Record<string, CellValue>>, c: TreemapConfig): TreemapModel {
    const grouped = Boolean(c.parent && c.parent !== c.dimension);
    const groups = new Map<string, TreemapGroup>();
    let skipped = 0;
    for (const r of rows) {
        const v = r[`m:${c.metric.id}`];
        const leaf = r[`d:${c.dimension}`];
        const parent = grouped ? r[`d:${c.parent}`] : null;
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || leaf === null || leaf === undefined) { skipped++; continue; }
        const gk = grouped ? String(parent ?? '') : '';
        const g = groups.get(gk) ?? { key: gk, parent: grouped ? gk : null, amount: 0, leaves: [] };
        const other = Boolean(r.__other) || leaf === '(other)';
        g.leaves.push({ key: `${gk}\u0001${String(leaf)}`, value: String(leaf), amount: v, other });
        g.amount += v;
        groups.set(gk, g);
    }
    const list = [...groups.values()].sort((a, b) => b.amount - a.amount);
    for (const g of list) g.leaves.sort((a, b) => (a.other ? 1 : b.other ? -1 : b.amount - a.amount));
    return { groups: list, total: list.reduce((s, g) => s + g.amount, 0), leafCount: list.reduce((s, g) => s + g.leaves.length, 0), skipped };
}

export interface TreemapNode extends Rect {
    key: string;
    value: string;
    amount: number;
    /** Share of the whole treemap (0..1). */
    share: number;
    group: number;
    /** Rank among the group's boxes (0 = biggest), for shading. */
    rank: number;
    groupSize: number;
    other?: boolean;
    /** Leaf coordinates are relative to its group's frame. */
}
export interface TreemapFrame extends Rect {
    key: string;
    parent: string | null;
    amount: number;
    share: number;
    index: number;
    /** Height of the group's title strip (0 = no strip: the group is too small or the treemap is flat). */
    header: number;
    leaves: TreemapNode[];
}

export const GROUP_HEADER = 18;
export const GROUP_PAD = 2;

/** Lay the model out in a width x height box: groups first, then each group's boxes inside its frame. */
export function layoutTreemap(model: TreemapModel, width: number, height: number): TreemapFrame[] {
    const flat = model.groups.length === 1 && model.groups[0].parent === null;
    const frames = squarify(model.groups.map((g, i) => ({ value: g.amount, g, index: i })), { x: 0, y: 0, w: width, h: height });
    return frames.map((f) => {
        const g = f.g;
        const header = !flat && f.w >= 70 && f.h >= 54 ? GROUP_HEADER : 0;
        const pad = flat ? 0 : GROUP_PAD;
        const inner: Rect = { x: pad, y: header + pad, w: Math.max(0, f.w - pad * 2), h: Math.max(0, f.h - header - pad * 2) };
        const leaves = squarify(g.leaves.map((l, rank) => ({ value: l.amount, l, rank })), inner).map((n): TreemapNode => ({
            x: n.x, y: n.y, w: n.w, h: n.h,
            key: n.l.key, value: n.l.value, amount: n.l.amount, share: model.total > 0 ? n.l.amount / model.total : 0,
            group: f.index, rank: n.rank, groupSize: g.leaves.length, other: n.l.other,
        }));
        return { key: g.key, parent: g.parent, amount: g.amount, share: model.total > 0 ? g.amount / model.total : 0, index: f.index, header, x: f.x, y: f.y, w: f.w, h: f.h, leaves };
    });
}

// ── labels ───────────────────────────────────────────────────────────────

/** Width of one character of the box text (caption size, medium weight) and the room a box keeps around it. */
export const TILE_CHAR_W = 6.3;
const TILE_PAD_X = 12;
const TILE_PAD_Y = 8;
const TILE_LINE_H = 14;
/** A name is cut only when at least this many characters survive; below that the box carries no text (its tooltip does). */
export const TILE_MIN_CHARS = 12;

export interface TileLabel {
    /** The name to draw, cut with an ellipsis when it must be; null = no text in this box. */
    name: string | null;
    /** "$12,742 · 21%", or just the value when the share does not fit; null = no second line. */
    detail: string | null;
}

const cut = (text: string, chars: number) => (text.length <= chars ? text : `${text.slice(0, Math.max(1, chars - 1)).trimEnd()}…`);

/**
 * What a box of w x h px says. The share goes first when room is short, then the value, and only then is the
 * name cut; a name that would lose more than it keeps (fewer than 12 characters left) is not drawn at all and
 * the box leaves it to its tooltip. Text never wraps, so a line either fits or is dropped.
 */
export function tileLabel(w: number, h: number, name: string, value: string, share: string, showValues: boolean): TileLabel {
    const inner = w - 2 - TILE_PAD_X;
    const lines = Math.floor((h - 2 - TILE_PAD_Y) / TILE_LINE_H);
    if (lines < 1 || inner <= 0) return { name: null, detail: null };
    const chars = Math.floor(inner / TILE_CHAR_W);
    if (name.length > chars && chars < Math.min(TILE_MIN_CHARS, name.length)) return { name: null, detail: null };
    let detail: string | null = null;
    if (showValues && lines >= 2) {
        const full = `${value} · ${share}`;
        detail = full.length <= chars ? full : value.length <= chars ? value : null;
    }
    return { name: cut(name, chars), detail };
}

/** A group's title strip: name and share while both fit, else the name alone (cut only if it must be). */
export function groupLabel(w: number, name: string, share: string): string {
    const chars = Math.floor((w - TILE_PAD_X) / TILE_CHAR_W);
    const full = `${name} · ${share}`;
    return full.length <= chars ? full : cut(name, Math.max(1, chars));
}
