/**
 * Round 9 chart widgets: one place the shared builder code asks ("is this one of the new charts, and
 * what does it need?"). Each chart lives in its own file (heatmap.ts ...); the shared registries
 * (registry, compile, schema, search type, clipboard) only call the functions below, so a merge with
 * other widget work touches a handful of grouped lines. Isomorphic: no React, no zod.
 */
import type { WidgetMeta, DefaultCtx } from '../registry';
import type { DataFrame, DimId, MetricId, WidgetDef, WidgetId, WidgetQuery, WidgetResultOk } from '../types';
import { compileFunnel, defaultFunnelConfig, funnelCsvFrame, funnelMetrics, funnelProblem, funnelTitle } from './funnel';
import { compileHeatmap, defaultHeatmapConfig, heatmapProblem, heatmapTitle } from './heatmap';
import { compileScatter, defaultScatterConfig, scatterMetrics, scatterProblem, scatterTitle } from './scatter';
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
    heatmap: { type: 'heatmap', label: 'Heatmap', description: 'Busiest weekday and hour, or a calendar of days, for one metric', icon: 'Grid3x3', group: 'Charts', defaultSize: { w: 6, h: 8 }, minSize: { w: 4, h: 7 }, maxSize: { w: 12, h: 12 }, phoneH: 8, static: false, keywords: ['heatmap', 'heat map', 'calendar', 'weekday', 'hour', 'peak hours', 'busiest', 'when'] },
    scatter: { type: 'scatter', label: 'Scatter plot', description: 'Two metrics by page, query or country, with median guides', icon: 'ScatterChart', group: 'Charts', defaultSize: { w: 6, h: 9 }, minSize: { w: 4, h: 7 }, maxSize: { w: 12, h: 14 }, phoneH: 9, static: false, keywords: ['scatter', 'bubble', 'quadrant', 'opportunity', 'correlation', 'impressions', 'ctr', 'compare'] },
    funnel: { type: 'funnel', label: 'Funnel', description: 'Events or pages as steps, with the conversion between them', icon: 'Filter', group: 'Charts', defaultSize: { w: 6, h: 8 }, minSize: { w: 4, h: 6 }, maxSize: { w: 12, h: 14 }, phoneH: 9, static: false, keywords: ['funnel', 'steps', 'conversion', 'checkout', 'drop-off', 'journey', 'events'] },
};

/** Where each chart goes in the palette (after the existing charts). */
export const CHART_PALETTE_ORDER: ChartType[] = ['heatmap', 'scatter', 'funnel'];

// ── defaults ─────────────────────────────────────────────────────────────

/** A new chart of this type that renders data straight away. `base` = { id, source }. */
export function chartDefaultWidget(type: ChartType, ctx: DefaultCtx, base: { id: WidgetId; source: WidgetDef['source'] }): ChartWidgetDef {
    switch (type) {
        case 'heatmap':
            // Weekday and hour needs Analytics; a Search Console only site gets the calendar.
            return ctx.families.ga4
                ? { ...base, type, title: 'Sessions by weekday and hour', config: defaultHeatmapConfig('weekday-hour', 'ga4:sessions') }
                : { ...base, type, title: 'Clicks by day', config: defaultHeatmapConfig('calendar', 'gsc:clicks') };
        case 'funnel': return { ...base, type, title: 'Users by step', config: defaultFunnelConfig() };
        case 'scatter': {
            const config = defaultScatterConfig(ctx.families);
            return { ...base, type, title: scatterTitle(config), config };
        }
    }
}

// ── derived info ─────────────────────────────────────────────────────────

/** Every metric a chart reads (empty for a widget that is not one of the new charts). */
export function chartMetrics(w: WidgetDef): MetricId[] {
    switch (w.type) {
        case 'heatmap': return [w.config.metric.id];
        case 'scatter': return scatterMetrics(w.config);
        case 'funnel': return funnelMetrics(w.config);
        default: return [];
    }
}

/** Dimensions a chart splits its data by (for search type and click rules). */
export function chartDimensions(w: WidgetDef): DimId[] {
    switch (w.type) {
        case 'heatmap': return w.config.variant === 'calendar' ? [] : ['dayOfWeek', 'hour'];
        case 'scatter': return [w.config.dimension];
        case 'funnel': return w.config.steps.map((s) => (s.kind === 'event' ? 'eventName' : 'page'));
        default: return [];
    }
}

export function chartTitle(w: WidgetDef): string {
    switch (w.type) {
        case 'heatmap': return heatmapTitle(w.config);
        case 'scatter': return scatterTitle(w.config);
        case 'funnel': return funnelTitle(w.config);
        default: return 'Chart';
    }
}

/** The queries a chart needs (compile.ts calls this for every new type). */
export function compileChart(w: WidgetDef, base: QueryBase): WidgetQuery[] {
    switch (w.type) {
        case 'heatmap': return compileHeatmap(w, base);
        case 'scatter': return compileScatter(w, base);
        case 'funnel': return compileFunnel(w, base);
        default: return [];
    }
}

/** A chart as the metric switcher shows it: `from` replaced by `to` (labels and formats of `from` dropped). */
export function swapChartMetric(w: WidgetDef, from: MetricId, to: MetricId): WidgetDef {
    switch (w.type) {
        case 'heatmap': return w.config.metric.id === from ? { ...w, config: { ...w.config, metric: { id: to } } } : w;
        case 'funnel': return w.config.metric.id === from ? { ...w, config: { ...w.config, metric: { id: to } } } : w;
        case 'scatter': {
            const c = w.config;
            const swap = <T extends { id: MetricId } | undefined>(m: T): T => (m && m.id === from ? ({ id: to } as T) : m);
            return { ...w, config: { ...c, x: swap(c.x), y: swap(c.y), size: swap(c.size) } };
        }
        default: return w;
    }
}

/** Why a chart cannot work as saved (null = fine); schema.ts refuses the save with this text. */
export function chartProblem(w: WidgetDef): string | null {
    switch (w.type) {
        case 'heatmap': return heatmapProblem(w);
        case 'scatter': return scatterProblem(w);
        case 'funnel': return funnelProblem(w);
        default: return null;
    }
}

/** A frame for "Download CSV" when the chart's data is not one frame called rows / series. */
export function chartCsvFrame(w: WidgetDef, r: WidgetResultOk): DataFrame | undefined {
    return w.type === 'funnel' ? funnelCsvFrame(w, r) : undefined;
}
