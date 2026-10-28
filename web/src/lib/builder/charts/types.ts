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
    /** Write the names of the largest points next to them. */
    labels: boolean;
}
export type ScatterWidget = WidgetBase<'scatter', ScatterConfig>;

// ── union ────────────────────────────────────────────────────────────────

export type ChartWidgetDef = HeatmapWidget | ScatterWidget;
export type ChartType = ChartWidgetDef['type'];
export const CHART_TYPES: ChartType[] = ['heatmap', 'scatter'];

export type { DimId };
