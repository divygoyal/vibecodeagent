'use client';

/**
 * Time series settings for chart context (round 7): which markers to draw (your notes, Google
 * updates) and up to three horizontal lines (goal, reference, average of the period). A scorecard
 * target on the same metric can be reused as a goal line for the period.
 */
import { useState } from 'react';
import { Plus, Target, X } from 'lucide-react';

import { Button } from '@/components/ui';
import { fmtMetricValue, getMetric, metricLabel } from '@/lib/builder/catalog';
import { annotationMode } from '@/lib/builder/chartMarks';
import type { AnnotationMode, DashboardDocV2, RefLine, TimeSeriesWidget, WidgetDef } from '@/lib/builder/types';
import { Choice, Field } from './Fields';

type Edit = (fn: (w: WidgetDef) => WidgetDef, key?: string) => void;

const MAX_LINES = 3;

function setLines(w: WidgetDef, lines: RefLine[]): WidgetDef {
    const t = w as TimeSeriesWidget;
    const config = { ...t.config, refLines: lines.length ? lines : undefined };
    if (!config.refLines) delete config.refLines;
    return { ...t, config };
}

export function ChartMarksEditor({ widget, edit, doc }: { widget: TimeSeriesWidget; edit: Edit; doc: DashboardDocV2 }) {
    const c = widget.config;
    const lines = c.refLines ?? [];
    const metrics = c.series.map((s) => s.metric.id);
    const update = (i: number, patch: Partial<RefLine>, key?: string) =>
        edit((w) => setLines(w, ((w as TimeSeriesWidget).config.refLines ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l))), key ? `rl${i}:${key}` : undefined);
    const remove = (i: number) => edit((w) => setLines(w, ((w as TimeSeriesWidget).config.refLines ?? []).filter((_, j) => j !== i)));
    const add = (line: RefLine) => edit((w) => setLines(w, [...((w as TimeSeriesWidget).config.refLines ?? []), line].slice(0, MAX_LINES)));

    // Scorecard targets on a metric of this chart (round 2 concept): one click makes them a goal line.
    const targets = Object.values(doc.widgets)
        .filter((w): w is Extract<WidgetDef, { type: 'scorecard' }> => w.type === 'scorecard' && Boolean(w.config.target) && metrics.includes(w.config.metric.id))
        .map((w) => ({ metric: w.config.metric.id, value: w.config.target!.value, label: w.config.target!.label }))
        .filter((t, i, all) => all.findIndex((x) => x.metric === t.metric && x.value === t.value) === i)
        .filter((t) => !lines.some((l) => l.kind === 'goal' && l.metric === t.metric && l.value === t.value));

    return (
        <div className="space-y-4">
            <p className="text-caption uppercase tracking-[0.04em] text-fg-muted">Markers and lines</p>
            <Field label="Markers" hint="Your notes come from the site charts; add one with the note button on this chart in the dashboard view. Share links show notes only if you allow it in Share.">
                <Choice<AnnotationMode> ariaLabel="Markers" value={annotationMode(c.annotations)}
                    onChange={(v) => edit((w) => ({ ...w, config: { ...(w as TimeSeriesWidget).config, annotations: v } }) as WidgetDef)}
                    options={[{ value: 'all', label: 'Your notes and Google updates' }, { value: 'notes', label: 'Your notes' }, { value: 'google', label: 'Google updates' }, { value: 'off', label: 'None' }]} />
            </Field>
            <div className="space-y-2">
                <p className="text-body-sm font-medium text-fg">Lines</p>
                {lines.map((l, i) => <LineRow key={`${i}:${lines.length}`} index={i} line={l} metrics={metrics} onChange={(p, k) => update(i, p, k)} onRemove={() => remove(i)} />)}
                {lines.length < MAX_LINES ? (
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" icon={Plus} onClick={() => add({ kind: 'goal', per: 'point' })}>Goal or reference</Button>
                        {!lines.some((l) => l.kind === 'average') ? <Button size="sm" variant="ghost" icon={Plus} onClick={() => add({ kind: 'average' })}>Average</Button> : null}
                    </div>
                ) : <p className="text-meta text-fg-muted">Up to {MAX_LINES} lines.</p>}
                {lines.length < MAX_LINES ? targets.slice(0, 2).map((t) => (
                    <Button key={`${t.metric}-${t.value}`} size="sm" variant="ghost" icon={Target} className="h-auto min-h-8 whitespace-normal py-1 text-left"
                        onClick={() => add({ kind: 'goal', value: t.value, per: 'period', label: t.label || 'Goal', metric: t.metric })}>
                        Use the scorecard target ({fmtMetricValue(t.metric, t.value)} {metricLabel(t.metric).toLowerCase()} for the period)
                    </Button>
                )) : null}
            </div>
        </div>
    );
}

function LineRow({ index, line, metrics, onChange, onRemove }: { index: number; line: RefLine; metrics: string[]; onChange: (p: Partial<RefLine>, key?: string) => void; onRemove: () => void }) {
    const metric = line.metric && metrics.includes(line.metric) ? line.metric : metrics[0];
    const def = getMetric(metric);
    const pct = def?.format === 'percent';
    const [draft, setDraft] = useState(line.value === undefined ? '' : String(pct ? Math.round(line.value * 10000) / 100 : line.value));
    const commit = (raw: string) => {
        setDraft(raw);
        const n = Number(raw.replace(/[,\s%]/g, ''));
        onChange({ value: raw.trim() && Number.isFinite(n) ? (pct ? n / 100 : n) : undefined }, 'value');
    };
    const isAvg = line.kind === 'average';
    const field = 'h-9 rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint';
    return (
        <div className="space-y-2 rounded-control border border-border-subtle p-2.5" role="group" aria-label={`Line ${index + 1}`}>
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                    <Choice<RefLine['kind']> ariaLabel={`Line ${index + 1} type`} value={line.kind} onChange={(k) => onChange({ kind: k })}
                        options={[{ value: 'goal', label: 'Goal' }, { value: 'reference', label: 'Reference' }, { value: 'average', label: 'Average of the period' }]} />
                </div>
                <Button size="sm" variant="ghost" iconOnly icon={X} aria-label={`Remove line ${index + 1}`} onClick={onRemove} />
            </div>
            {metrics.length > 1 ? (
                <Choice ariaLabel={`Line ${index + 1} metric`} value={metric} onChange={(m) => onChange({ metric: m })} options={metrics.map((m) => ({ value: m, label: metricLabel(m) }))} />
            ) : null}
            {!isAvg ? (
                <div className="flex items-center gap-2">
                    <input aria-label={`Line ${index + 1} value`} inputMode="decimal" value={draft} placeholder={pct ? 'e.g. 3 (%)' : 'e.g. 500'} onChange={(e) => commit(e.target.value)} className={`${field} w-28 tabular-nums`} />
                    {def?.additive ? (
                        <div className="min-w-0 flex-1">
                            <Choice<NonNullable<RefLine['per']>> ariaLabel={`Line ${index + 1} counts`} value={line.per ?? 'point'} onChange={(p) => onChange({ per: p })}
                                options={[{ value: 'point', label: 'Per point' }, { value: 'day', label: 'Per day' }, { value: 'week', label: 'Per week' }, { value: 'month', label: 'Per month' }, { value: 'period', label: 'For the period' }]} />
                        </div>
                    ) : null}
                </div>
            ) : null}
            <input aria-label={`Line ${index + 1} label`} value={line.label ?? ''} maxLength={40} placeholder={line.kind === 'goal' ? 'Label (Goal)' : line.kind === 'reference' ? 'Label (Reference)' : 'Label (Average)'}
                onChange={(e) => onChange({ label: e.target.value || undefined }, 'label')} className={`${field} w-full`} />
            {!isAvg && def?.additive && line.per && line.per !== 'point' ? (
                <p className="text-meta text-fg-muted">Drawn per point of the chart: a month or period total is spread over its days.</p>
            ) : null}
        </div>
    );
}
