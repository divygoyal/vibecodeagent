'use client';

/**
 * Round 2 viewer controls: dashboard variables (a chip that opens a small editor) and the
 * click-to-filter chip bar ("Filtered by Country: Germany ×"). Both render nothing for
 * dashboards that use neither, so today's dashboards are unchanged.
 */
import { useState } from 'react';
import { Braces, MousePointerClick, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { dimLabel } from '@/lib/builder/catalog';
import { cleanVariable } from '@/lib/builder/variables';
import type { FilterClause, VariableControl } from '@/lib/builder/types';
import { dimText } from './widgets/Charts';

export function VariableInput({ control, value, onChange, disabled }: { control: VariableControl; value: string; onChange: (v: string | null) => void; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(value);
    const changed = value !== control.default;
    const invalid = draft.trim() !== '' && cleanVariable(control, draft) !== draft.trim();
    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(value); }}>
            <PopoverTrigger asChild>
                <button type="button" disabled={disabled} title={disabled ? `${control.label}: ${value}` : `Change ${control.label}`}
                    className={cn('inline-flex h-9 max-w-[260px] items-center gap-1.5 rounded-control border px-2.5 text-body-sm transition-colors disabled:cursor-default',
                        changed ? 'border-transparent bg-brand-soft text-brand-soft-fg' : 'border-border bg-surface text-fg-secondary hover:text-fg')}>
                    <Braces aria-hidden size={14} className="shrink-0 text-fg-muted" />
                    <span className="text-fg-muted">{control.label}:</span>
                    <span className={cn('truncate font-medium', control.kind === 'regex' && 'font-mono text-meta')}>{value || '—'}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" aria-label={control.label}>
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (!invalid) { onChange(draft.trim() && draft.trim() !== control.default ? draft.trim() : null); setOpen(false); } }}>
                    <label className="block space-y-1">
                        <span className="text-body-sm font-medium text-fg">{control.label}</span>
                        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 300))} inputMode={control.kind === 'number' ? 'decimal' : undefined}
                            className={cn('h-9 w-full rounded-control border bg-surface px-3 text-body text-fg', control.kind === 'regex' && 'font-mono text-meta', invalid ? 'border-down' : 'border-border')} />
                    </label>
                    <p className={cn('text-meta', invalid ? 'text-down' : 'text-fg-muted')}>
                        {invalid ? (control.kind === 'number' ? 'Type a number.' : 'This pattern is not valid.') : control.kind === 'regex' ? 'A pattern: separate alternatives with |, for example acme|acme analytics.' : 'Used by the widgets that mention it.'}
                    </p>
                    <div className="flex justify-between gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(null); setOpen(false); }} disabled={!changed}>Reset</Button>
                        <Button type="submit" size="sm" variant="primary" disabled={invalid}>Apply</Button>
                    </div>
                </form>
            </PopoverContent>
        </Popover>
    );
}

/** "Filtered by ..." chips for click-to-filter selections, with clear buttons. */
export function InteractionChips({ clauses, onRemove, onClear }: { clauses: FilterClause[]; onRemove: (i: number) => void; onClear: () => void }) {
    if (!clauses.length) return null;
    return (
        <div className="flex flex-wrap items-center gap-2" data-pdf-ignore="true" role="status" aria-live="polite">
            <span className="inline-flex items-center gap-1.5 text-meta text-fg-muted"><MousePointerClick aria-hidden size={14} />Filtered by</span>
            {clauses.map((c, i) => (
                <span key={`${c.dimension}-${i}`} className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-soft pl-2.5 pr-1 text-body-sm text-brand-soft-fg">
                    <span className="opacity-80">{dimLabel(c.dimension)}:</span>
                    <span className="max-w-[220px] truncate font-medium">{dimText(c.dimension, Array.isArray(c.value) ? c.value[0] : c.value)}</span>
                    <button type="button" aria-label={`Remove ${dimLabel(c.dimension)} filter`} onClick={() => onRemove(i)} className="tap-area rounded-full p-0.5 hover:bg-brand/15"><X aria-hidden size={12} /></button>
                </span>
            ))}
            {clauses.length > 1 ? <button type="button" onClick={onClear} className="text-meta font-medium text-brand-text hover:underline">Clear all</button> : null}
        </div>
    );
}

/** URL form of click-to-filter selections: x=<dim>:<value>|<dim>:<value> (values URI-encoded). */
export function interactionToParam(clauses: FilterClause[]): string | null {
    if (!clauses.length) return null;
    return clauses.map((c) => `${c.dimension}:${encodeURIComponent(String(Array.isArray(c.value) ? c.value[0] : c.value))}`).join('|');
}
