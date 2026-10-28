'use client';

/**
 * Setup panels of the round 9 chart widgets (heatmap, scatter, funnel, treemap, pivot). The properties
 * panel calls `ChartSetup` for any of them; the widget-wide fields (source, filters, title, style) stay
 * in PropertiesPanel.
 */
import type { ReactNode } from 'react';

import { metricFamilies } from '@/lib/builder/catalog';
import type { ChartWidgetDef, HeatmapWidget, ScatterWidget } from '@/lib/builder/charts/types';
import type { WidgetDef } from '@/lib/builder/types';
import { quadrantText, scatterMetrics } from '@/lib/builder/charts/scatter';
import type { Quadrant } from '@/lib/builder/charts/types';
import { Choice, DimensionPicker, Field, MetricPicker, NumberInput, Toggle } from './Fields';

export type ChartEdit = (fn: (w: WidgetDef) => WidgetDef, key?: string) => void;

interface Props<W extends ChartWidgetDef> { widget: W; edit: ChartEdit; source: ReactNode; portfolio: boolean }

/** `widget` with some config keys replaced (a typed helper for the setup panels). */
function patch<W extends ChartWidgetDef>(w: W, p: Partial<W['config']>): W {
    return { ...w, config: { ...w.config, ...p } } as W;
}

export function ChartSetup(props: Props<ChartWidgetDef>) {
    const { widget } = props;
    switch (widget.type) {
        case 'heatmap': return <HeatmapSetup {...props} widget={widget} />;
        case 'scatter': return <ScatterSetup {...props} widget={widget} />;
        default: return null;
    }
}

function HeatmapSetup({ widget, edit, source }: Props<HeatmapWidget>) {
    const c = widget.config;
    const set = (p: Partial<HeatmapWidget['config']>) => edit((w) => patch(w as HeatmapWidget, p));
    const gaOnly = c.variant === 'weekday-hour';
    return (
        <>
            {source}
            <Field label="Layout" hint={gaOnly ? 'Google Analytics only: it knows the hour of each visit.' : 'One cell per day, weeks across.'}>
                <Choice ariaLabel="Heatmap layout" value={c.variant}
                    onChange={(v) => set({ variant: v, metric: v === 'weekday-hour' && metricFamilies(c.metric.id).some((f) => f !== 'ga4') ? { id: 'ga4:sessions' } : c.metric })}
                    options={[{ value: 'weekday-hour', label: 'Weekday and hour' }, { value: 'calendar', label: 'Calendar (by day)' }]} />
            </Field>
            <Field label="Metric"><MetricPicker value={c.metric.id} families={gaOnly ? ['ga4'] : undefined} noShare onChange={(id) => set({ metric: { id } })} /></Field>
            {c.variant === 'calendar' ? (
                <Field label="Week starts on"><Choice ariaLabel="Week starts on" value={c.weekStart} onChange={(v) => set({ weekStart: v })} options={[{ value: 'mon', label: 'Monday' }, { value: 'sun', label: 'Sunday' }]} /></Field>
            ) : (
                <Toggle label="Name the busiest window" description="One line above the grid, for count metrics." checked={c.finding} onChange={(v) => set({ finding: v })} />
            )}
        </>
    );
}

function ScatterSetup({ widget, edit, source, portfolio }: Props<ScatterWidget>) {
    const c = widget.config;
    const set = (p: Partial<ScatterWidget['config']>, key?: string) => edit((w) => patch(w as ScatterWidget, p), key);
    const quads: Quadrant[] = ['br', 'tr', 'bl', 'tl'];
    return (
        <>
            {source}
            <Field label="One point per"><DimensionPicker value={c.dimension} metrics={scatterMetrics(c)} allowSite={portfolio} onChange={(d) => d && set({ dimension: d })} /></Field>
            <Field label="Across (x)"><MetricPicker value={c.x.id} ariaLabel="Metric across" exclude={[c.y.id]} noShare onChange={(id) => set({ x: { id } })} /></Field>
            <Field label="Up (y)"><MetricPicker value={c.y.id} ariaLabel="Metric up" exclude={[c.x.id]} noShare onChange={(id) => set({ y: { id } })} /></Field>
            <Toggle label="Size points by a metric" checked={Boolean(c.size)} onChange={(v) => set({ size: v ? { id: c.x.id === 'gsc:clicks' ? 'gsc:impressions' : 'gsc:clicks' } : undefined })} />
            {c.size ? <Field label="Size"><MetricPicker value={c.size.id} ariaLabel="Metric for size" noShare onChange={(id) => set({ size: { id } })} /></Field> : null}
            <Field label="Points" hint="The biggest ones are plotted (by size, else across)."><NumberInput value={c.top} min={5} max={200} onChange={(n) => set({ top: n }, 'top')} /></Field>
            <Field label="Across scale" hint="Log spreads out a few huge values."><Choice ariaLabel="Across scale" value={c.xScale ?? 'linear'} onChange={(v) => set({ xScale: v })} options={[{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }]} /></Field>
            <Field label="Up scale"><Choice ariaLabel="Up scale" value={c.yScale ?? 'linear'} onChange={(v) => set({ yScale: v })} options={[{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }]} /></Field>
            <Toggle label="Median guides" description="Dashed lines at the medians split the plot in four." checked={c.quadrants !== false} onChange={(v) => set({ quadrants: v })} />
            {c.quadrants !== false ? (
                <Field label="Shade a quadrant" hint="It is counted under the chart, with its biggest points.">
                    <Choice ariaLabel="Shade a quadrant" value={c.highlight ?? 'none'} onChange={(v) => set({ highlight: v === 'none' ? undefined : (v as Quadrant) })}
                        options={[{ value: 'none', label: 'None' }, ...quads.map((q) => ({ value: q, label: quadrantText(q, c) }))]} />
                </Field>
            ) : null}
            <Toggle label="Name the biggest points" checked={c.labels} onChange={(v) => set({ labels: v })} />
        </>
    );
}
