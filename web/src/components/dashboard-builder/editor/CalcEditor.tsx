'use client';

/**
 * Calculated metrics in the editor (round 7, gap #4): a small dialog (pick a calculation, A and
 * B from the catalogue, a name, a format and which way is good) and the list in Dashboard
 * settings. No formula language, the way Looker Studio's and Lightdash's simple calculations
 * start; the maths runs in the engine after the GA4 and Search Console join.
 */
import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { Button, Modal } from '@/components/ui';
import { CALC_OPS, calcAutoLabel, calcId, parseCalcId, registerCalcs, replaceMetricId, unregisterCalc, usesMetric, type CalcBetter, type CalcFormat, type CalcOp } from '@/lib/builder/calc';
import { getMetric, metricLabel } from '@/lib/builder/catalog';
import type { CalculatedMetric, DashboardDocV2 } from '@/lib/builder/types';
import { useEditorStore } from '@/stores/dashboardEditorStore';
import { Choice, Field, MetricPicker, TextInput } from './Fields';

export const MAX_CALCS = 30;

const B_LABEL: Record<CalcOp, string> = { ratio: 'Divided by (B)', per1k: 'Per 1,000 of (B)', diff: 'Minus (B)', share: '' };

function formulaText(op: CalcOp, a: string, b: string): string {
    const A = metricLabel(a);
    const B = b ? metricLabel(b) : '';
    switch (op) {
        case 'ratio': return `${A} ÷ ${B}`;
        case 'per1k': return `${A} ÷ ${B} × 1,000`;
        case 'diff': return `${A} − ${B}`;
        case 'share': return `${A} in the row ÷ ${A} in all rows`;
    }
}

/** A sensible format for a new calculation: money stays money, shares are percentages. */
function defaultFormat(op: CalcOp, a: string, b: string): CalcFormat {
    if (op === 'share') return 'pct';
    const fa = getMetric(a)?.format;
    const fb = b ? getMetric(b)?.format : undefined;
    if (op === 'diff') return fa === 'currency' ? 'cur' : fa === 'percent' ? 'pct' : 'num';
    if (op === 'ratio' && fa === 'currency' && fb !== 'currency') return 'cur';
    return 'num';
}

export function CalcDialog({ open, onOpenChange, editing, onSaved }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    /** Edit this calc; omit to add one. */
    editing?: CalculatedMetric;
    onSaved?: (id: string) => void;
}) {
    const spec = editing ? parseCalcId(editing.id) : null;
    const [op, setOp] = useState<CalcOp>(spec?.op ?? 'per1k');
    const [a, setA] = useState(spec?.a ?? 'ga4:keyEvents');
    const [b, setB] = useState(spec?.b ?? 'ga4:sessions');
    const [name, setName] = useState(editing?.label ?? '');
    const [format, setFormat] = useState<CalcFormat>(spec?.format ?? 'num');
    const [better, setBetter] = useState<CalcBetter>(spec?.better ?? 'up');
    const [formatTouched, setFormatTouched] = useState(Boolean(editing));
    const apply = useEditorStore((s) => s.apply);
    const needsB = op !== 'share';
    const auto = calcAutoLabel({ op, a, b: needsB ? b : undefined }, metricLabel);
    const sameInputs = needsB && a === b;

    const pick = (next: { op?: CalcOp; a?: string; b?: string }) => {
        const o = next.op ?? op;
        const na = next.a ?? a;
        const nb = next.b ?? b;
        if (next.op) setOp(o);
        if (next.a) setA(na);
        if (next.b) setB(nb);
        if (!formatTouched) setFormat(defaultFormat(o, na, nb));
        if (next.a && !editing) setBetter(getMetric(na)?.better === 'down' ? 'down' : 'up');
    };

    const save = () => {
        if (sameInputs) return;
        const id = calcId({ op, a, b: needsB ? b : undefined, format, better, token: spec?.token });
        const label = (name.trim() || auto).slice(0, 60);
        registerCalcs([{ id, label }]);
        apply((d) => {
            const list = d.calcs ?? [];
            let next: DashboardDocV2 = d;
            if (editing && editing.id !== id) {
                // A changed calculation is a new id: every widget and metric control follows it.
                next = { ...d, widgets: replaceMetricId(d.widgets, editing.id, id), controls: replaceMetricId(d.controls, editing.id, id) };
                unregisterCalc(editing.id);
            }
            const calcs = editing
                ? list.map((c) => (c.id === editing.id ? { id, label } : c))
                : [...list.filter((c) => c.id !== id), { id, label }].slice(0, MAX_CALCS);
            return { ...next, calcs };
        }, { announce: editing ? `Updated ${label}` : `Added ${label}` });
        onSaved?.(id);
        onOpenChange(false);
    };

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            size="md"
            title={editing ? 'Edit calculated metric' : 'New calculated metric'}
            description="Made from two metrics you already have. It works in every widget, with its change against the comparison period."
            footer={(
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={save} disabled={sameInputs}>{editing ? 'Save' : 'Add metric'}</Button>
                </div>
            )}
        >
            <div className="space-y-4">
                <Field label="Calculation" hint={CALC_OPS.find((x) => x.op === op)?.example}>
                    <Choice<CalcOp> ariaLabel="Calculation" value={op} onChange={(v) => pick({ op: v })} options={CALC_OPS.map((x) => ({ value: x.op, label: x.label }))} />
                </Field>
                <Field label={needsB ? 'Metric (A)' : 'Metric'}>
                    <MetricPicker value={a} onChange={(v) => pick({ a: v })} calcs={false} ariaLabel="Metric A" />
                </Field>
                {needsB ? (
                    <Field label={B_LABEL[op]} hint={sameInputs ? <span className="text-down">Pick two different metrics.</span> : undefined}>
                        <MetricPicker value={b} onChange={(v) => pick({ b: v })} calcs={false} ariaLabel="Metric B" />
                    </Field>
                ) : null}
                <p className="rounded-control bg-surface-sunken px-3 py-2 text-meta text-fg-secondary">
                    <span className="font-medium text-fg">{name.trim() || auto}</span> = {formulaText(op, a, needsB ? b : '')}.{' '}
                    {op === 'share'
                        ? 'In a table, bar list or donut each row’s share of the whole column; in a chart each day’s share of the period.'
                        : 'Totals, weeks and all-sites views divide the summed metrics, never an average of rows. Dividing by zero shows a dash.'}
                </p>
                <Field label="Name">
                    <TextInput value={name} onChange={(v) => setName(v.slice(0, 60))} placeholder={auto} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Format">
                        <Choice<CalcFormat> ariaLabel="Format" value={format} onChange={(v) => { setFormat(v); setFormatTouched(true); }}
                            options={[{ value: 'num', label: 'Number' }, { value: 'pct', label: 'Percent' }, { value: 'cur', label: 'Currency' }]} />
                    </Field>
                    <Field label="Good direction">
                        <Choice<CalcBetter> ariaLabel="Good direction" value={better} onChange={setBetter}
                            options={[{ value: 'up', label: 'Higher is better' }, { value: 'down', label: 'Lower is better' }, { value: 'flat', label: 'Neither' }]} />
                    </Field>
                </div>
            </div>
        </Modal>
    );
}

/** Dashboard settings: the dashboard's calculated metrics, with edit and delete. */
export function CalcList({ doc }: { doc: DashboardDocV2 }) {
    const apply = useEditorStore((s) => s.apply);
    const [dialog, setDialog] = useState<{ editing?: CalculatedMetric } | null>(null);
    const list = doc.calcs ?? [];
    return (
        <Field label="Calculated metrics" hint={list.length ? 'Pick them in any metric menu, under Calculated.' : 'Ratios, differences, per-1,000 rates and shares of total, from metrics you already have.'}>
            <div className="space-y-1.5">
                {list.map((c) => {
                    const used = Object.values(doc.widgets).filter((w) => usesMetric(w, c.id)).length;
                    return (
                        <div key={c.id} className="flex items-center gap-1.5 rounded-control border border-border-subtle bg-surface-sunken px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-body-sm text-fg">{c.label}</p>
                                <p className="truncate text-caption text-fg-muted">{used ? `In ${used} widget${used === 1 ? '' : 's'}` : 'Not used yet'}</p>
                            </div>
                            <button type="button" aria-label={`Edit ${c.label}`} onClick={() => setDialog({ editing: c })} className="rounded p-1 text-fg-muted hover:bg-subtle hover:text-fg"><Pencil aria-hidden size={14} /></button>
                            <button
                                type="button"
                                aria-label={`Delete ${c.label}`}
                                title={used ? 'Widgets that use it keep working under its default name' : undefined}
                                onClick={() => { unregisterCalc(c.id); apply((d) => ({ ...d, calcs: (d.calcs ?? []).filter((x) => x.id !== c.id) }), { announce: `Deleted ${c.label}` }); }}
                                className="rounded p-1 text-fg-muted hover:bg-subtle hover:text-fg"
                            >
                                <Trash2 aria-hidden size={14} />
                            </button>
                        </div>
                    );
                })}
                {list.length < MAX_CALCS ? (
                    <button type="button" onClick={() => setDialog({})} className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                        <Plus aria-hidden size={14} /> New calculated metric
                    </button>
                ) : null}
            </div>
            {dialog ? <CalcDialog key={dialog.editing?.id ?? 'new'} open onOpenChange={(o) => { if (!o) setDialog(null); }} editing={dialog.editing} /> : null}
        </Field>
    );
}
