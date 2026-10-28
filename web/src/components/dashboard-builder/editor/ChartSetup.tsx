'use client';

/**
 * Setup panels of the round 9 chart widgets (heatmap, scatter, funnel, treemap, pivot). The properties
 * panel calls `ChartSetup` for any of them; the widget-wide fields (source, filters, title, style) stay
 * in PropertiesPanel.
 */
import { useId, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';

import { metricFamilies } from '@/lib/builder/catalog';
import { FUNNEL_MAX_STEPS, FUNNEL_MIN_STEPS, FUNNEL_NOTE } from '@/lib/builder/charts/funnel';
import type { ChartWidgetDef, FunnelStep, FunnelWidget, HeatmapWidget, ScatterWidget } from '@/lib/builder/charts/types';
import type { WidgetDef } from '@/lib/builder/types';
import { quadrantText, scatterMetrics } from '@/lib/builder/charts/scatter';
import type { Quadrant } from '@/lib/builder/charts/types';
import { Button } from '@/components/ui';
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
        case 'funnel': return <FunnelSetup {...props} widget={widget} />;
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

const COMMON_EVENTS = ['session_start', 'first_visit', 'page_view', 'user_engagement', 'scroll', 'click', 'view_item', 'add_to_cart', 'begin_checkout', 'add_payment_info', 'purchase', 'sign_up', 'login', 'generate_lead', 'form_start', 'form_submit', 'file_download'];

function FunnelSetup({ widget, edit, source }: Props<FunnelWidget>) {
    const c = widget.config;
    const listId = useId();
    const set = (p: Partial<FunnelWidget['config']>, key?: string) => edit((w) => patch(w as FunnelWidget, p), key);
    const setStep = (i: number, p: Partial<FunnelStep>, key?: string) => set({ steps: c.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) }, key);
    const move = (i: number, d: -1 | 1) => {
        const steps = [...c.steps];
        [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
        set({ steps });
    };
    const input = 'h-9 w-full rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint';
    return (
        <>
            {source}
            <Field label="Count" hint="Analytics only. Users who reached each step is the usual choice."><MetricPicker value={c.metric.id} families={['ga4']} noShare onChange={(id) => set({ metric: { id } })} /></Field>
            <p className="text-meta text-fg-muted">{FUNNEL_NOTE}</p>
            <datalist id={listId}>{COMMON_EVENTS.map((e) => <option key={e} value={e} />)}</datalist>
            <ol className="space-y-3" aria-label="Funnel steps">
                {c.steps.map((st, i) => (
                    <li key={i} className="space-y-2 rounded-control border border-border-subtle p-2">
                        <div className="flex items-center gap-1">
                            <span className="w-5 text-meta text-fg-muted tabular-nums">{i + 1}.</span>
                            <div className="min-w-0 flex-1">
                                <Choice ariaLabel={`Step ${i + 1} type`} value={st.kind} onChange={(v) => setStep(i, { kind: v })} options={[{ value: 'event', label: 'Event' }, { value: 'page', label: 'Page' }]} />
                            </div>
                            <button type="button" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-fg-muted hover:text-fg disabled:opacity-30"><ArrowUp aria-hidden size={14} /></button>
                            <button type="button" aria-label={`Move step ${i + 1} down`} disabled={i === c.steps.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-fg-muted hover:text-fg disabled:opacity-30"><ArrowDown aria-hidden size={14} /></button>
                            <button type="button" aria-label={`Remove step ${i + 1}`} disabled={c.steps.length <= FUNNEL_MIN_STEPS} onClick={() => set({ steps: c.steps.filter((_, j) => j !== i) })} className="rounded p-1 text-fg-muted hover:text-fg disabled:opacity-30"><X aria-hidden size={14} /></button>
                        </div>
                        {st.kind === 'page' ? (
                            <Choice ariaLabel={`Step ${i + 1} page match`} value={st.match ?? 'exact'} onChange={(v) => setStep(i, { match: v })} options={[{ value: 'exact', label: 'Page is exactly' }, { value: 'starts', label: 'Page starts with' }, { value: 'contains', label: 'Page contains' }]} />
                        ) : null}
                        <input aria-label={`Step ${i + 1} ${st.kind === 'event' ? 'event name' : 'page path'}`} className={input} list={st.kind === 'event' ? listId : undefined} value={st.value} maxLength={200}
                            placeholder={st.kind === 'event' ? 'event name, e.g. add_to_cart' : '/pricing'} onChange={(e) => setStep(i, { value: e.target.value.trim() }, `step${i}v`)} />
                        <input aria-label={`Step ${i + 1} label`} className={input} value={st.label ?? ''} maxLength={40} placeholder="Label (optional)" onChange={(e) => setStep(i, { label: e.target.value || undefined }, `step${i}l`)} />
                    </li>
                ))}
            </ol>
            <Button size="sm" variant="secondary" icon={Plus} disabled={c.steps.length >= FUNNEL_MAX_STEPS} onClick={() => set({ steps: [...c.steps, { kind: 'event', value: '' }] })}>Add a step</Button>
            <Toggle label="Show conversion between steps" checked={c.showDropoff} onChange={(v) => set({ showDropoff: v })} />
        </>
    );
}
