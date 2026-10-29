/**
 * Round 9 chart widgets: config and widget types. Kept apart from lib/builder/types.ts so the
 * shared union only needs one line (`| ChartWidgetDef`). Isomorphic, no runtime code.
 */
import type { DimId, MetricRef, WidgetBase } from '../types';

// ── Heatmap ──────────────────────────────────────────────────────────────

/**
 * Heatmap (round 9). 'weekday-hour' = weekday x hour of day for one Analytics metric (peak hours);
 * 'calendar' = one cell per day (weeks across, weekdays down) for any metric. One metric, shaded
 * in the metric's colour.
 */
export interface HeatmapConfig {
    variant: 'weekday-hour' | 'calendar';
    metric: MetricRef;
    /** Calendar only: which weekday the rows start with. */
    weekStart: 'mon' | 'sun';
    /** Weekday x hour only: one line under the title that names the busiest window. */
    finding: boolean;
}
export type HeatmapWidget = WidgetBase<'heatmap', HeatmapConfig>;

// ── Scatter ──────────────────────────────────────────────────────────────

export type Quadrant = 'tl' | 'tr' | 'bl' | 'br';

/**
 * Scatter (round 9): one point per value of a dimension, two metrics on the axes (and an optional third
 * for the point size). Guides at the medians of the plotted points split the plot in four; one quadrant
 * can be shaded ("pages with many impressions and a low CTR").
 */
export interface ScatterConfig {
    dimension: DimId;
    x: MetricRef;
    y: MetricRef;
    size?: MetricRef;
    /** Points plotted (the biggest by size, else by x). */
    top: number;
    /** Draw the median guides. */
    quadrants: boolean;
    /** The quadrant to shade: x high / low (right / left) and y high / low (top / bottom). */
    highlight?: Quadrant;
    xScale: 'linear' | 'log';
    yScale: 'linear' | 'log';
    /** Name up to 10 of the largest points instead of the 5 biggest, which are always named. */
    labels: boolean;
}
export type ScatterWidget = WidgetBase<'scatter', ScatterConfig>;

// ── Funnel ───────────────────────────────────────────────────────────────

/** One step of a funnel: an Analytics event name, or a page (exact path, or a path prefix or fragment). */
export interface FunnelStep {
    /** Up to 40 characters; default: the event name or the page path. */
    label?: string;
    kind: 'event' | 'page';
    /** Pages only; default exact. */
    match?: 'exact' | 'starts' | 'contains';
    /** The event name, or the page path ('/pricing'). */
    value: string;
}

/**
 * Funnel (round 9) built from "step counts": each step is counted on its own (users, sessions or events
 * that reached it in the date range) and the conversion between steps is the ratio of two counts. It is
 * not a sequenced funnel (Google's funnel exploration follows each visitor through the steps in order),
 * and the widget says so. Analytics metrics only.
 */
export interface FunnelConfig {
    metric: MetricRef;
    /** 2 to 8 steps, in order. */
    steps: FunnelStep[];
    /** Show the step-to-step conversion and drop-off lines. */
    showDropoff: boolean;
}
export type FunnelWidget = WidgetBase<'funnel', FunnelConfig>;

// ── Treemap ──────────────────────────────────────────────────────────────

/**
 * Treemap (round 9): boxes sized by one additive metric, one per value of a dimension, optionally
 * grouped under a parent dimension (Channel, then Source). Counts only: the boxes of a group add up to
 * the group, which a rate or an average cannot do.
 */
export interface TreemapConfig {
    dimension: DimId;
    /** Groups the boxes (channel -> source). Missing = one flat set of boxes. */
    parent?: DimId;
    metric: MetricRef;
    /** Boxes drawn (the biggest by the metric). */
    top: number;
    /** 'group' = a colour per group (per box without a parent); 'value' = one colour, darker for bigger. */
    colorBy: 'group' | 'value';
    /** Name boxes with their value when they are big enough. */
    showValues: boolean;
}
export type TreemapWidget = WidgetBase<'treemap', TreemapConfig>;

// ── Pivot table ──────────────────────────────────────────────────────────

/**
 * Pivot table (round 9): one metric across two dimensions, rows by columns (channel by device), with
 * row and column totals and an optional heat colour. Counts (and calculated metrics) only: cells of a
 * rate or an average cannot be ranked or added up.
 */
export interface PivotConfig {
    rows: DimId;
    columns: DimId;
    metric: MetricRef;
    /** Rows shown (the biggest by the metric). */
    topRows: number;
    /** Columns shown (the biggest by the metric). */
    topColumns: number;
    /** Fold the columns beyond the top ones into one "Other" column (counts only). */
    other: boolean;
    /** A total column and a total row (counts only; they add up the cells shown). */
    totals: boolean;
    /** Shade cells: against all cells, within their row, or within their column. */
    heat: 'none' | 'cell' | 'row' | 'column';
}
export type PivotWidget = WidgetBase<'pivot', PivotConfig>;

// ── union ────────────────────────────────────────────────────────────────

export type ChartWidgetDef = HeatmapWidget | ScatterWidget | FunnelWidget | TreemapWidget | PivotWidget;
export type ChartType = ChartWidgetDef['type'];
export const CHART_TYPES: ChartType[] = ['heatmap', 'scatter', 'funnel', 'treemap', 'pivot'];

export type { DimId };
