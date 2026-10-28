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

// ── union ────────────────────────────────────────────────────────────────

export type ChartWidgetDef = HeatmapWidget;
export type ChartType = ChartWidgetDef['type'];
export const CHART_TYPES: ChartType[] = ['heatmap'];

export type { DimId };
