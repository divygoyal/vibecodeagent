/**
 * Pivot table (round 9): query plan, defaults, validation and data shaping. Pure and isomorphic.
 *
 * It rides on the engine's pivot frame (the one behind stacked bars and breakdown charts): rows are the
 * biggest values of the row dimension, columns the biggest values of the column dimension plus an optional
 * "Other", every cell one number. Totals add up the cells shown, so they are offered for counts only.
 */
import { dimLabel, getMetric, metricLabel } from '../catalog';
import type { CellValue, DataFrame, MetricId, WidgetQuery } from '../types';
import { heatLevel, heatThresholds } from './heatmap';
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
}

export const colValue = (key: string): string => key.slice(2);
export const isOtherCol = (key: string): boolean => key === PIVOT_OTHER;

const sum = (xs: Array<number | null>): number | null => {
    const v = xs.filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

export function shapePivot(frame: DataFrame, c: PivotConfig): PivotModel {
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
    const colTotals = totalsAvailable ? cols.map((_, j) => sum(cells.map((row) => row[j]))) : cols.map(() => null);
    const all = cells.flat().filter((v): v is number => v !== null);
    return {
        rows, cols, cells, totalsAvailable, rowTotals, colTotals,
        grand: totalsAvailable ? sum(rowTotals) : null,
        min: all.length ? Math.min(...all) : 0,
        max: all.length ? Math.max(...all) : 0,
    };
}

/**
 * Colour level (0 = none, 1..5) of every cell for a heat mode. 'cell' compares with all cells, 'row' and
 * 'column' within one row or column (so a small row still shows its own shape).
 */
export function pivotLevels(m: PivotModel, heat: PivotConfig['heat']): number[][] {
    if (heat === 'none') return m.cells.map((row) => row.map(() => 0));
    if (heat === 'cell') {
        const t = heatThresholds(m.cells.flat().filter((v): v is number => v !== null));
        return m.cells.map((row) => row.map((v) => heatLevel(v, t)));
    }
    if (heat === 'row') return m.cells.map((row) => {
        const t = heatThresholds(row.filter((v): v is number => v !== null));
        return row.map((v) => heatLevel(v, t));
    });
    const colT = m.cols.map((_, j) => heatThresholds(m.cells.map((row) => row[j]).filter((v): v is number => v !== null)));
    return m.cells.map((row) => row.map((v, j) => heatLevel(v, colT[j])));
}

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
