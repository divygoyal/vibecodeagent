'use client';

/**
 * Setup panels of the round 9 chart widgets (heatmap, scatter, funnel, treemap, pivot). The properties
 * panel calls `ChartSetup` for any of them; the widget-wide fields (source, filters, title, style) stay
 * in PropertiesPanel.
 */
import type { ReactNode } from 'react';

import { metricFamilies } from '@/lib/builder/catalog';
import type { ChartWidgetDef, HeatmapWidget } from '@/lib/builder/charts/types';
import type { WidgetDef } from '@/lib/builder/types';
import { Choice, Field, MetricPicker, Toggle } from './Fields';

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
