/**
 * Heatmap (round 9): query plan, defaults, validation and data shaping. Pure and isomorphic.
 *
 * Weekday x hour asks Google Analytics for (day of week, hour of day) and one metric: 168 rows, one
 * report, the same one the site pages' "Peak hours" card draws. The calendar asks for one metric by
 * date (zero-filled by the engine) and lays the days out in weeks.
 */
import { addDays, fromDay, toDay } from '../dates';
import { metricFamilies, metricLabel } from '../catalog';
import type { CellValue, MetricId, WidgetQuery } from '../types';
import type { HeatmapConfig, HeatmapWidget } from './types';

export const HEATMAP_WEEKDAY_HOUR_DIMS = ['dayOfWeek', 'hour'] as const;

export function defaultHeatmapConfig(variant: HeatmapConfig['variant'] = 'weekday-hour', metric: MetricId = 'ga4:sessions'): HeatmapConfig {
    return { variant, metric: { id: metric }, weekStart: 'mon', finding: true };
}

export function heatmapTitle(c: HeatmapConfig): string {
    const m = c.metric.label || metricLabel(c.metric.id);
    return c.variant === 'calendar' ? `${m} by day` : `${m} by weekday and hour`;
}

/** The queries a heatmap needs (the engine merges identical ones across widgets). */
export function compileHeatmap(w: HeatmapWidget, base: Pick<WidgetQuery, 'source' | 'filters' | 'searchType'>): WidgetQuery[] {
    const metric = w.config.metric.id;
    if (w.config.variant === 'calendar') {
        return [{ ...base, part: 'series', metrics: [metric], dimensions: ['date'], granularity: 'day', compare: false, fillDates: true }];
    }
    return [{ ...base, part: 'rows', metrics: [metric], dimensions: [...HEATMAP_WEEKDAY_HOUR_DIMS], limit: 200, compare: false }];
}

/** Why a heatmap cannot work as saved (null = fine). Weekday and hour exist for Analytics metrics only. */
export function heatmapProblem(w: HeatmapWidget): string | null {
    if (w.config.variant === 'weekday-hour' && metricFamilies(w.config.metric.id).some((f) => f !== 'ga4')) {
        return 'A weekday and hour heatmap needs an Analytics metric. Search Console cannot split by hour.';
    }
    return null;
}

// ── shaping ──────────────────────────────────────────────────────────────

const DAY_PREFIX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** 0 = Sunday (GA4's dayOfWeek) from a day name ('Monday', 'mon') or a digit; -1 when unknown. */
export function dayIndex(v: CellValue): number {
    if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 6 ? v : -1;
    const s = String(v ?? '').trim().toLowerCase();
    if (/^[0-6]$/.test(s)) return Number(s);
    return DAY_PREFIX.indexOf(s.slice(0, 3));
}

/** The grid [day 0 = Sunday][hour 0-23] for the shared weekday x hour component; missing cells are 0. */
export function weekdayHourGrid(rows: Array<Record<string, CellValue>>, metric: MetricId): { grid: number[][]; total: number; cells: number } {
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    let total = 0;
    let cells = 0;
    for (const r of rows) {
        const d = dayIndex(r['d:dayOfWeek']);
        const h = Number(r['d:hour']);
        const v = r[`m:${metric}`];
        if (d < 0 || !Number.isInteger(h) || h < 0 || h > 23 || typeof v !== 'number' || !Number.isFinite(v)) continue;
        grid[d][h] += v;
        total += v;
        cells++;
    }
    return { grid, total, cells };
}

/**
 * Cut points for `steps` colour levels from the values themselves (quantiles of the positive values), so a
 * few spikes do not wash every other cell out. Returns steps - 1 ascending thresholds.
 */
export function heatThresholds(values: number[], steps = 5): number[] {
    const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (!v.length) return [];
    const out: number[] = [];
    for (let i = 1; i < steps; i++) out.push(v[Math.min(v.length - 1, Math.floor((i / steps) * v.length))]);
    return out;
}

/** 0 = no value (empty cell), 1..steps = the colour level of a value. */
export function heatLevel(value: number | null | undefined, thresholds: number[]): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
    let level = 1;
    for (const t of thresholds) if (value > t) level++;
    return Math.min(level, thresholds.length + 1);
}

export interface CalendarCell { date: string; value: number | null }
export interface CalendarModel {
    /** Columns, oldest first; each has 7 slots in row order (first slot = weekStart); null = outside the range. */
    weeks: Array<Array<CalendarCell | null>>;
    /** Month labels: the week column where each month starts (its first visible day). */
    months: Array<{ col: number; label: string }>;
    thresholds: number[];
    min: number;
    max: number;
    /** Sum of the cells (meaningful for counts only). */
    total: number;
    days: number;
    /** Row labels in row order. */
    rows: string[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday of an ISO date, 0 = Sunday (1970-01-01 was a Thursday). */
export function weekdayOf(iso: string): number {
    return (((toDay(iso) + 4) % 7) + 7) % 7;
}

/** The days of the date axis laid out in weeks. Null when there are no dated rows. */
export function calendarModel(rows: Array<Record<string, CellValue>>, metric: MetricId, weekStart: 'mon' | 'sun' = 'mon'): CalendarModel | null {
    const byDate = new Map<string, number | null>();
    for (const r of rows) {
        const d = r['d:date'];
        if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
        const v = r[`m:${metric}`];
        byDate.set(d, typeof v === 'number' && Number.isFinite(v) ? v : null);
    }
    if (!byDate.size) return null;
    const dates = [...byDate.keys()].sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    const offset = weekStart === 'mon' ? 1 : 0;
    const rowOf = (iso: string) => (weekdayOf(iso) - offset + 7) % 7;
    const gridStart = addDays(first, -rowOf(first));
    const weeks: CalendarModel['weeks'] = [];
    const months: CalendarModel['months'] = [];
    let seenMonth = '';
    for (let day = toDay(gridStart); day <= toDay(last); day += 7) {
        const col: Array<CalendarCell | null> = [];
        for (let r = 0; r < 7; r++) {
            const iso = fromDay(day + r);
            col.push(iso >= first && iso <= last ? { date: iso, value: byDate.get(iso) ?? null } : null);
        }
        const firstCell = col.find(Boolean);
        if (firstCell) {
            // A month label sits over the first week that holds one of its first 7 days (or the first week shown).
            const m = firstCell.date.slice(0, 7);
            const startsHere = col.some((c) => c && c.date.slice(0, 7) === m && Number(c.date.slice(8)) <= 7) || weeks.length === 0;
            if (m !== seenMonth && startsHere) {
                months.push({ col: weeks.length, label: MONTHS[Number(m.slice(5)) - 1] });
                seenMonth = m;
            }
        }
        weeks.push(col);
    }
    const values = [...byDate.values()].filter((v): v is number => typeof v === 'number');
    const order = weekStart === 'mon' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
    return {
        weeks,
        months,
        thresholds: heatThresholds(values),
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
        total: values.reduce((a, b) => a + b, 0),
        days: byDate.size,
        rows: order.map((d) => WEEKDAY_SHORT[d]),
    };
}
