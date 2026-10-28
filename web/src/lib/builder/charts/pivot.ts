/**
 * Pivot table (round 9): query plan, defaults, validation and data shaping. Pure and isomorphic.
 *
 * It rides on the engine's pivot frame (the one behind stacked bars and breakdown charts): rows are the
 * biggest values of the row dimension, columns the biggest values of the column dimension plus an optional
 * "Other", every cell one number. Totals add up the cells shown, so they are offered for counts only.
 */
import { dimLabel, getMetric, metricLabel } from '../catalog';
import type { CellValue, DataFrame, MetricId, WidgetQuery } from '../types';
import type { PivotConfig, PivotWidget } from './types';
import type { QueryBase } from './index';

export const PIVOT_OTHER = 'b:__other';

export function defaultPivotConfig(ctx: { ga4: boolean; gsc: boolean }): PivotConfig {
    return ctx.ga4
        ? { rows: 'channel', columns: 'device', metric: { id: 'ga4:sessions' }, topRows: 8, topColumns: 3, other: true, totals: true, heat: 'cell' }
        : { rows: 'page', columns: 'device', metric: { id: 'gsc:clicks' }, topRows: 10, topColumns: 3, other: true, totals: true, heat: 'cell' };
}

export function pivotMetrics(c: PivotConfig): MetricId[] {
    return [c.metric.id];
}

export function pivotTitle(c: PivotConfig): string {
    return `${c.metric.label || metricLabel(c.metric.id)} by ${dimLabel(c.rows).toLowerCase()} and ${dimLabel(c.columns).toLowerCase()}`;
}

/** Counts add up; a calculated metric is computed per cell from its inputs (ratios have no total). */
export function pivotTotalsAvailable(id: MetricId): boolean {
    return Boolean(getMetric(id)?.additive);
}

export function compilePivot(w: PivotWidget, base: QueryBase): WidgetQuery[] {
    const c = w.config;
    const rows = Math.min(25, Math.max(3, Math.round(c.topRows)));
    const cols = Math.min(8, Math.max(2, Math.round(c.topColumns)));
    return [{
        ...base, part: 'rows', metrics: [c.metric.id], dimensions: [c.rows, c.columns],
        sort: { by: c.metric.id, dir: 'desc' },
        // The rest of the columns is folded into "Other" only where adding cells is right.
        pivot: { dimension: c.columns, top: cols, other: c.other && pivotTotalsAvailable(c.metric.id) },
        top: { n: rows, other: false },
        // Enough (row, column) pairs that the biggest rows are complete across their columns.
        limit: 2000,
        compare: false,
    }, ...totalsQueries(w, base)];
}

/** Part name of the column totals report (every row, not just the biggest ones). */
export const PIVOT_TOTALS_PART = 'colTotals';

/**
 * The true column totals: the same metric by the column dimension alone, folded the same way as the pivot's
 * columns. The pivot only shows its biggest rows, so the "Total" row and the "Other" row come from this
 * report: total minus the rows shown is what the rest of the rows add up to. Counts only (a ratio has none).
 */
function totalsQueries(w: PivotWidget, base: QueryBase): WidgetQuery[] {
    const c = w.config;
    if (c.totals === false || !pivotTotalsAvailable(c.metric.id)) return [];
    const cols = Math.min(8, Math.max(2, Math.round(c.topColumns)));
    return [{
        ...base, part: PIVOT_TOTALS_PART, metrics: [c.metric.id], dimensions: [c.columns],
        sort: { by: c.metric.id, dir: 'desc' },
        top: { n: cols, other: c.other },
        limit: 250,
        compare: false,
    }];
}

const TIME = ['date', 'week', 'month'];

/** Why a pivot cannot work as saved (null = fine). */
export function pivotProblem(w: PivotWidget): string | null {
    const c = w.config;
    const def = getMetric(c.metric.id);
    if (!def?.additive && !def?.calc) return 'A pivot table ranks and adds up its cells. Pick a count (sessions, clicks, revenue) or a calculated metric such as a ratio of two counts.';
    if (c.rows === c.columns) return 'Rows and columns must be different dimensions.';
    if (TIME.includes(c.rows) || TIME.includes(c.columns)) return 'A pivot table compares categories; use a time series for dates.';
    return null;
}

// ── shaping ──────────────────────────────────────────────────────────────

export interface PivotModel {
    /** Row values, in the order shown. */
    rows: string[];
    /** Column keys ('b:<value>', 'b:__other'), in the order shown. */
    cols: string[];
    /** cells[r][c]; null = no data. */
    cells: Array<Array<number | null>>;
    totalsAvailable: boolean;
    rowTotals: Array<number | null>;
    colTotals: Array<number | null>;
    grand: number | null;
    min: number;
    max: number;
    /** What the rows beyond the biggest ones add up to, per column (null = every row is shown, or unknown). */
    otherRow: { cells: Array<number | null>; total: number } | null;
    /**
     * true: the total row and the grand total cover every row (and every column) of the data.
     * false: they add up the rows and columns shown only, and the view says so ("Total (top 8)").
     */
    complete: boolean;
}

export const colValue = (key: string): string => key.slice(2);
export const isOtherCol = (key: string): boolean => key === PIVOT_OTHER;

const sum = (xs: Array<number | null>): number | null => {
    const v = xs.filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

/** The true total of every column from the column totals report; null when it does not line up with the pivot. */
function trueColumnTotals(cols: string[], totals: DataFrame | undefined, c: PivotConfig): { all: number[]; hidden: boolean } | null {
    if (!totals) return null;
    const dim = `d:${c.columns}`;
    const metric = `m:${c.metric.id}`;
    const byKey = new Map<string, number>();
    for (const r of totals.rows) {
        const v = r[metric];
        const k = r[dim];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        if (r.__other || k === '(other)') byKey.set(PIVOT_OTHER, v);
        else if (k !== null && k !== undefined) byKey.set(`b:${String(k)}`, v);
    }
    const all: number[] = [];
    for (const k of cols) {
        const v = byKey.get(k);
        if (v === undefined) return null;
        all.push(v);
    }
    // Columns the pivot dropped (no "Other" column): the totals still cover them, the rows shown do not.
    const hidden = !cols.includes(PIVOT_OTHER) && (totals.rowCount ?? totals.rows.length) > cols.length;
    return { all, hidden };
}

export function shapePivot(frame: DataFrame, c: PivotConfig, totals?: DataFrame): PivotModel {
    const cols = frame.seriesKeys ?? [];
    const rowKey = frame.columns[0]?.id ?? `d:${c.rows}`;
    const rows: string[] = [];
    const cells: PivotModel['cells'] = [];
    for (const r of frame.rows) {
        const k: CellValue | undefined = r[rowKey];
        if (k === null || k === undefined) continue;
        rows.push(String(k));
        cells.push(cols.map((col) => (typeof r[col] === 'number' && Number.isFinite(r[col] as number) ? (r[col] as number) : null)));
    }
    const totalsAvailable = pivotTotalsAvailable(c.metric.id);
    const rowTotals = totalsAvailable ? cells.map(sum) : cells.map(() => null);
    const shown = totalsAvailable ? cols.map((_, j) => sum(cells.map((row) => row[j]))) : cols.map(() => null);
    const truth = totalsAvailable ? trueColumnTotals(cols, totals, c) : null;
    let colTotals: Array<number | null> = shown;
    let otherRow: PivotModel['otherRow'] = null;
    let complete = false;
    if (truth) {
        colTotals = truth.all;
        const rest = truth.all.map((t, j) => {
            const d = t - (shown[j] ?? 0);
            return d > Math.max(1e-6, Math.abs(t) * 1e-9) ? d : 0;
        });
        if (rest.some((v) => v > 0)) otherRow = { cells: rest.map((v) => (v > 0 ? v : null)), total: rest.reduce((a, b) => a + b, 0) };
        complete = !truth.hidden;
    }
    const all = cells.flat().filter((v): v is number => v !== null);
    return {
        rows, cols, cells, totalsAvailable, rowTotals, colTotals, otherRow, complete,
        grand: totalsAvailable ? sum(colTotals) : null,
        min: all.length ? Math.min(...all) : 0,
        max: all.length ? Math.max(...all) : 0,
    };
}

/**
 * Heat of every cell as a position on a continuous scale: 0 = the smallest value in the scope, 1 = the
 * biggest (null = no value, or heat is off). The scope is all cells, one row or one column; a scope whose
 * values are all equal sits in the middle. A cell of 0 is a value like any other and takes the low end.
 */
export function pivotHeat(m: PivotModel, heat: PivotConfig['heat']): Array<Array<number | null>> {
    const scale = (v: number | null, lo: number, hi: number): number | null => (v === null ? null : hi > lo ? (v - lo) / (hi - lo) : 0.5);
    const range = (xs: Array<number | null>) => {
        const v = xs.filter((x): x is number => x !== null);
        return v.length ? { lo: Math.min(...v), hi: Math.max(...v) } : { lo: 0, hi: 0 };
    };
    if (heat === 'none') return m.cells.map((row) => row.map(() => null));
    if (heat === 'row') return m.cells.map((row) => { const r = range(row); return row.map((v) => scale(v, r.lo, r.hi)); });
    if (heat === 'column') {
        const ranges = m.cols.map((_, j) => range(m.cells.map((row) => row[j])));
        return m.cells.map((row) => row.map((v, j) => scale(v, ranges[j].lo, ranges[j].hi)));
    }
    const r = range(m.cells.flat());
    return m.cells.map((row) => row.map((v) => scale(v, r.lo, r.hi)));
}

/** How much of the metric colour a cell gets (percent) at a position of the heat scale: pale to strong, dark text stays readable. */
export const HEAT_MIN_PCT = 8;
export const HEAT_MAX_PCT = 70;
export const heatPct = (t: number): number => Math.round((HEAT_MIN_PCT + Math.max(0, Math.min(1, t)) * (HEAT_MAX_PCT - HEAT_MIN_PCT)) * 10) / 10;

/** Row order for a click on a column header: by that column (or the total), biggest first or smallest first. */
export function sortPivotRows(m: PivotModel, by: number | 'total' | null, dir: 'asc' | 'desc'): number[] {
    const idx = m.rows.map((_, i) => i);
    if (by === null) return idx;
    const val = (i: number) => (by === 'total' ? m.rowTotals[i] : m.cells[i][by]);
    return idx.sort((a, b) => {
        const av = val(a);
        const bv = val(b);
        if (av === null && bv === null) return a - b;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (dir === 'desc' ? bv - av : av - bv) || a - b;
    });
}
