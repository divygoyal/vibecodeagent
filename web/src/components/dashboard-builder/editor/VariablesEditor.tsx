'use client';

/**
 * Dashboard variables in Dashboard settings (round 2, C3): define a value once (brand words, a
 * list of AI sources, a threshold) and use it as {{var:name}} in widget filters and text.
 */
import { Copy, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { cleanVariable, variableControls, variableId } from '@/lib/builder/variables';
import type { ControlDef, DashboardDocV2, VariableControl } from '@/lib/builder/types';
import { Field, Toggle } from './Fields';

const KINDS: Array<{ value: VariableControl['kind']; label: string }> = [
    { value: 'text', label: 'Text' },
    { value: 'regex', label: 'Pattern (regex)' },
    { value: 'number', label: 'Number' },
];

export function VariablesEditor({ doc, set }: { doc: DashboardDocV2; set: (fn: (d: DashboardDocV2) => DashboardDocV2, key?: string) => void }) {
    const list = variableControls(doc.controls);
    const update = (id: string, patch: Partial<VariableControl>, key?: string) => set((d) => ({ ...d, controls: d.controls.map((c): ControlDef => (c.type === 'variable' && c.id === id ? { ...c, ...patch } : c)) }), key);
    return (
        <Field label="Variables" hint={list.length ? 'Use them as {{var:name}} in widget filters and text. Viewers can change the ones you allow.' : 'Define a value once, such as your brand words, and use it as {{var:name}} in widget filters and text.'}>
            <div className="space-y-2">
                {list.map((v) => {
                    const bad = v.default !== '' && cleanVariable(v, v.default) !== v.default;
                    return (
                        <div key={v.id} className="space-y-1.5 rounded-control border border-border-subtle bg-surface-sunken p-2">
                            <div className="flex items-center gap-1.5">
                                <input aria-label="Variable label" value={v.label} maxLength={60} onChange={(e) => update(v.id, { label: e.target.value || v.id }, `var-label-${v.id}`)} className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-body-sm text-fg" />
                                <button type="button" aria-label={`Remove ${v.label}`} onClick={() => set((d) => ({ ...d, controls: d.controls.filter((c) => !(c.type === 'variable' && c.id === v.id)) }))} className="rounded p-1 text-fg-muted hover:bg-subtle hover:text-fg"><X aria-hidden size={14} /></button>
                            </div>
                            <button type="button" onClick={() => { void navigator.clipboard?.writeText(`{{var:${v.id}}}`); toast.success('Copied'); }} className="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5 font-mono text-caption text-fg-secondary hover:text-fg" title="Copy">
                                {`{{var:${v.id}}}`}<Copy aria-hidden size={11} />
                            </button>
                            <select aria-label="Variable type" value={v.kind} onChange={(e) => update(v.id, { kind: e.target.value as VariableControl['kind'] })} className="h-8 w-full rounded-control border border-border bg-surface px-2 text-body-sm text-fg">
                                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                            </select>
                            <input aria-label="Default value" value={v.default} maxLength={300} placeholder="Default value" onChange={(e) => update(v.id, { default: e.target.value }, `var-def-${v.id}`)}
                                className={`h-8 w-full rounded-control border bg-surface px-2 font-mono text-meta text-fg ${bad ? 'border-down' : 'border-border'}`} />
                            {bad ? <p className="text-caption text-down">{v.kind === 'number' ? 'Type a number.' : 'This pattern is not valid.'}</p> : null}
                            <Toggle label="Viewers can change it" checked={v.viewerCanChange} onChange={(on) => update(v.id, { viewerCanChange: on })} />
                        </div>
                    );
                })}
                {list.length < 10 ? (
                    <button type="button" onClick={() => set((d) => {
                        const id = variableId(`Variable ${variableControls(d.controls).length + 1}`, d.controls.map((c) => c.id));
                        return { ...d, controls: [...d.controls, { id, type: 'variable', label: `Variable ${variableControls(d.controls).length + 1}`, kind: 'text', default: '', viewerCanChange: false }] };
                    })} className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                        <Plus aria-hidden size={14} /> Add variable
                    </button>
                ) : null}
            </div>
        </Field>
    );
}
