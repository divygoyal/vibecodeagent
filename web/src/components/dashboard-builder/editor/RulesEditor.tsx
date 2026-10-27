'use client';

/**
 * Conditional formatting rules for a table (round 2, C2): column, condition (value or change vs
 * the comparison period), threshold(s) and a style (good / warning / bad). First match wins.
 * Percent metrics and changes are typed in % and stored as fractions.
 */
import { Plus, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { metricLabel } from '@/lib/builder/catalog';
import { CF_OPS, rulePercent, ruleText } from '@/lib/builder/cfRules';
import type { ConditionalRule, TableWidget, WidgetDef } from '@/lib/builder/types';
import { Field } from './Fields';

const STYLES: Array<{ value: ConditionalRule['style']; label: string; dot: string }> = [
    { value: 'good', label: 'Good (green)', dot: 'bg-up' },
    { value: 'warn', label: 'Warning (amber)', dot: 'bg-warn' },
    { value: 'bad', label: 'Bad (red)', dot: 'bg-down' },
];

const toUi = (v: number, pct: boolean) => (pct ? Math.round(v * 10000) / 100 : v);
const fromUi = (v: number, pct: boolean) => (pct ? v / 100 : v);

function NumberBox({ value, onChange, label, pct }: { value: number; onChange: (n: number) => void; label: string; pct: boolean }) {
    return (
        <span className="relative inline-flex">
            <input type="number" aria-label={label} value={Number.isFinite(value) ? toUi(value, pct) : ''} step="any"
                onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(fromUi(n, pct)); }}
                className={cn('h-8 w-24 rounded-control border border-border bg-surface px-2 text-body-sm tabular-nums text-fg', pct && 'pr-6')} />
            {pct ? <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-meta text-fg-muted">%</span> : null}
        </span>
    );
}

export function RulesEditor({ widget, edit }: { widget: TableWidget; edit: (fn: (w: WidgetDef) => WidgetDef, key?: string) => void }) {
    const c = widget.config;
    const rules = c.rules ?? [];
    const metricCols = c.columns.filter((col) => col.kind === 'metric' && !col.hidden);
    const set = (next: ConditionalRule[], key?: string) => edit((w) => ({ ...w, config: { ...(w as TableWidget).config, rules: next.length ? next : undefined } }) as WidgetDef, key);
    const setRule = (i: number, patch: Partial<ConditionalRule>, key?: string) => set(rules.map((r, j) => {
        if (j !== i) return r;
        const n = { ...r, ...patch };
        if (n.op === 'between' && !Array.isArray(n.value)) n.value = [n.value, n.value];
        if (n.op !== 'between' && Array.isArray(n.value)) n.value = n.value[0];
        return n;
    }), key);
    const refOf = (column: string) => metricCols.find((m) => m.id === column || `m:${m.ref}` === column)?.ref ?? column.replace(/^m:/, '');
    if (!metricCols.length) return null;
    return (
        <Field label="Conditional formatting" hint={rules.length ? 'Cells are coloured by the first rule that matches.' : 'Colour cells that need attention, for example CTR under 1 % or a drop of more than 20 %.'}>
            <div className="space-y-2">
                {rules.map((r, i) => {
                    const ref = refOf(r.column);
                    const pct = rulePercent(ref, r.on);
                    return (
                        <div key={i} className="space-y-1.5 rounded-control border border-border-subtle bg-surface-sunken p-2">
                            <div className="flex items-center gap-1.5">
                                <select aria-label={`Rule ${i + 1} column`} value={metricCols.find((m) => m.id === r.column || `m:${m.ref}` === r.column)?.id ?? r.column} onChange={(e) => setRule(i, { column: e.target.value })} className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-body-sm text-fg">
                                    {metricCols.map((m) => <option key={m.id} value={m.id}>{m.label ?? metricLabel(m.ref)}</option>)}
                                </select>
                                <button type="button" aria-label={`Remove rule ${i + 1}`} onClick={() => set(rules.filter((_, j) => j !== i))} className="rounded p-1 text-fg-muted hover:bg-subtle hover:text-fg"><X aria-hidden size={14} /></button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <select aria-label={`Rule ${i + 1} measures`} value={r.on ?? 'value'} onChange={(e) => setRule(i, { on: e.target.value === 'change' ? 'change' : undefined })} className="h-8 rounded-control border border-border bg-surface px-2 text-body-sm text-fg">
                                    <option value="value">Value</option>
                                    <option value="change">Change vs comparison</option>
                                </select>
                                <select aria-label={`Rule ${i + 1} condition`} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as ConditionalRule['op'] })} className="h-8 rounded-control border border-border bg-surface px-2 text-body-sm text-fg">
                                    {CF_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {Array.isArray(r.value) ? (
                                    <>
                                        <NumberBox label={`Rule ${i + 1} from`} pct={pct} value={r.value[0]} onChange={(n) => setRule(i, { value: [n, (r.value as [number, number])[1]] }, `rule-${i}-a`)} />
                                        <span className="text-meta text-fg-muted">and</span>
                                        <NumberBox label={`Rule ${i + 1} to`} pct={pct} value={r.value[1]} onChange={(n) => setRule(i, { value: [(r.value as [number, number])[0], n] }, `rule-${i}-b`)} />
                                    </>
                                ) : (
                                    <NumberBox label={`Rule ${i + 1} value`} pct={pct} value={r.value} onChange={(n) => setRule(i, { value: n }, `rule-${i}`)} />
                                )}
                                <select aria-label={`Rule ${i + 1} style`} value={r.style} onChange={(e) => setRule(i, { style: e.target.value as ConditionalRule['style'] })} className="h-8 rounded-control border border-border bg-surface px-2 text-body-sm text-fg">
                                    {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                            <p className="flex items-center gap-1.5 text-caption text-fg-muted">
                                <span aria-hidden className={cn('size-2 rounded-full', STYLES.find((s) => s.value === r.style)?.dot)} />
                                {ruleText(r, metricLabel(ref), ref)}
                            </p>
                        </div>
                    );
                })}
                {rules.length < 10 ? (
                    <button type="button" onClick={() => {
                        const col = metricCols[0];
                        const pct = rulePercent(col.ref);
                        set([...rules, { column: col.id, op: 'lt', value: pct ? 0.01 : 10, style: 'bad' }]);
                    }} className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                        <Plus aria-hidden size={14} /> Add rule
                    </button>
                ) : null}
                {rules.some((r) => r.on === 'change') && !metricCols.some((m) => m.showDelta || m.visual === 'delta') && !c.sortByChange ? (
                    <p className="text-caption text-warn">Change rules need “Show change vs comparison” on.</p>
                ) : null}
            </div>
        </Field>
    );
}
