/**
 * Round 9 chart widgets: one place the shared builder code asks ("is this one of the new charts, and
 * what does it need?"). Each chart lives in its own file (heatmap.ts ...); the shared registries
 * (registry, compile, schema, search type, clipboard) only call the functions below, so a merge with
 * other widget work touches a handful of grouped lines. Isomorphic: no React, no zod.
 */
import type { WidgetMeta, DefaultCtx } from '../registry';
import type { DataFrame, DimId, MetricId, WidgetDef, WidgetId, WidgetQuery, WidgetResultOk } from '../types';
import { compileHeatmap, defaultHeatmapConfig, heatmapProblem, heatmapTitle } from './heatmap';
import { CHART_TYPES, type ChartType, type ChartWidgetDef } from './types';

export { CHART_TYPES };
export type { ChartType, ChartWidgetDef };

/** Query fields every widget query shares (source, widget + control filters, search type). */
export type QueryBase = Pick<WidgetQuery, 'source' | 'filters' | 'searchType'>;

export function isChartType(type: string): type is ChartType {
    return (CHART_TYPES as string[]).includes(type);
}

export function isChartWidget(w: WidgetDef): w is ChartWidgetDef {
    return isChartType(w.type);
}

// ── palette ──────────────────────────────────────────────────────────────

/** Palette entries, merged into WIDGET_META. */
export const CHART_META: Record<ChartType, WidgetMeta> = {
    heatmap: { type: 'heatmap', label: 'Heatmap', description: 'Busiest weekday and hour, or a calendar of days, for one metric', icon: 'Grid3x3', group: 'Charts', defaultSize: { w: 6, h: 7 }, minSize: { w: 4, h: 6 }, maxSize: { w: 12, h: 12 }, phoneH: 7, static: false, keywords: ['heatmap', 'heat map', 'calendar', 'weekday', 'hour', 'peak hours', 'busiest', 'when'] },
};

/** Where each chart goes in the palette (after the existing charts). */
export const CHART_PALETTE_ORDER: ChartType[] = ['heatmap'];

// ── defaults ─────────────────────────────────────────────────────────────

/** A new chart of this type that renders data straight away. `base` = { id, source }. */
export function chartDefaultWidget(type: ChartType, ctx: DefaultCtx, base: { id: WidgetId; source: WidgetDef['source'] }): ChartWidgetDef {
    switch (type) {
        case 'heatmap':
            // Weekday and hour needs Analytics; a Search Console only site gets the calendar.
            return ctx.families.ga4
                ? { ...base, type, title: 'Sessions by weekday and hour', config: defaultHeatmapConfig('weekday-hour', 'ga4:sessions') }
                : { ...base, type, title: 'Clicks by day', config: defaultHeatmapConfig('calendar', 'gsc:clicks') };
    }
}

// ── derived info ─────────────────────────────────────────────────────────

/** Every metric a chart reads (empty for a widget that is not one of the new charts). */
export function chartMetrics(w: WidgetDef): MetricId[] {
    switch (w.type) {
        case 'heatmap': return [w.config.metric.id];
        default: return [];
    }
}

/** Dimensions a chart splits its data by (for search type and click rules). */
export function chartDimensions(w: WidgetDef): DimId[] {
    switch (w.type) {
        case 'heatmap': return w.config.variant === 'calendar' ? [] : ['dayOfWeek', 'hour'];
        default: return [];
    }
}

export function chartTitle(w: WidgetDef): string {
    switch (w.type) {
        case 'heatmap': return heatmapTitle(w.config);
        default: return 'Chart';
    }
}

/** The queries a chart needs (compile.ts calls this for every new type). */
export function compileChart(w: WidgetDef, base: QueryBase): WidgetQuery[] {
    switch (w.type) {
        case 'heatmap': return compileHeatmap(w, base);
        default: return [];
    }
}

/** A chart as the metric switcher shows it: `from` replaced by `to` (labels and formats of `from` dropped). */
export function swapChartMetric(w: WidgetDef, from: MetricId, to: MetricId): WidgetDef {
    switch (w.type) {
        case 'heatmap': return w.config.metric.id === from ? { ...w, config: { ...w.config, metric: { id: to } } } : w;
        default: return w;
    }
}

/** Why a chart cannot work as saved (null = fine); schema.ts refuses the save with this text. */
export function chartProblem(w: WidgetDef): string | null {
    switch (w.type) {
        case 'heatmap': return heatmapProblem(w);
        default: return null;
    }
}

/** A frame for "Download CSV" when the chart's data is not one frame called rows / series. */
export function chartCsvFrame(_w: WidgetDef, _r: WidgetResultOk): DataFrame | undefined {
    return undefined;
}
