'use client';

/**
 * Dashboard controls (BUILDER.md 6.2 and 11): date range with presets, custom dates and compare
 * (previous period / previous year), filter controls (multiselect, select, chips, search), and the
 * page tab strip. Controlled components: the viewer keeps the state in the URL, the editor in its
 * store.
 */
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { CalendarDays, Check, ChevronDown, Filter, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button, Checkbox, Drawer, Popover, PopoverContent, PopoverTrigger, SearchInput, SegmentedControl } from '@/components/ui';
import { fmtDateRange } from '@/lib/format';
import { MENU_PRESETS, PRESETS, QUICK_PRESETS, isIso } from '@/lib/builder/dates';
import { countryName } from '@/lib/builder/countries';
import type { CompareSpec, ControlState, DatePresetId, DateRangeSpec, FilterControl, PageDef, ResolvedDates } from '@/lib/builder/types';

// ── Date range ───────────────────────────────────────────────────────────

export interface DateControlProps {
    range: DateRangeSpec;
    compare: CompareSpec;
    onChange: (range: DateRangeSpec, compare: CompareSpec) => void;
    canChange?: boolean;
    canCompare?: boolean;
    resolved?: ResolvedDates;
    size?: 'sm' | 'md';
}

export function DateControl({ range, compare, onChange, canChange = true, canCompare = true, resolved, size = 'md' }: DateControlProps) {
    const [open, setOpenRaw] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const setOpen = (o: boolean) => {
        if (o) {
            setFrom(range.kind === 'custom' ? range.start : resolved?.range.start ?? '');
            setTo(range.kind === 'custom' ? range.end : resolved?.range.end ?? '');
        }
        setOpenRaw(o);
    };
    const quick = range.kind === 'preset' && QUICK_PRESETS.includes(range.id) ? range.id : null;
    const label = range.kind === 'preset' ? PRESETS.find((p) => p.id === range.id)?.label ?? range.id : resolved ? fmtDateRange(resolved.range.start, resolved.range.end) : 'Custom range';
    const today = resolved?.today ?? new Date().toISOString().slice(0, 10);

    if (!canChange) {
        return (
            <span className="inline-flex h-9 items-center gap-2 rounded-control border border-border-subtle px-3 text-body-sm text-fg-secondary">
                <CalendarDays aria-hidden size={16} strokeWidth={1.75} />
                {resolved ? fmtDateRange(resolved.range.start, resolved.range.end) : label}
            </span>
        );
    }
    return (
        <div className="flex items-center gap-2">
            <SegmentedControl<DatePresetId>
                ariaLabel="Date range"
                size={size}
                value={quick}
                onChange={(id) => onChange({ kind: 'preset', id }, compare)}
                options={QUICK_PRESETS.map((id) => ({ value: id, label: PRESETS.find((p) => p.id === id)?.short ?? id }))}
            />
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label={quick ? 'More date ranges and compare' : `Date range: ${label}`}
                        className={cn(
                            'inline-flex h-9 items-center gap-1.5 rounded-control border px-2.5 text-body-sm font-medium transition-colors duration-120',
                            quick ? 'border-border bg-surface text-fg-secondary hover:text-fg' : 'border-transparent bg-brand-soft text-brand-soft-fg',
                        )}
                    >
                        <CalendarDays aria-hidden size={16} strokeWidth={1.75} />
                        {quick ? null : <span className="max-w-[160px] truncate">{label}</span>}
                        <ChevronDown aria-hidden size={14} />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-1" aria-label="Date range">
                    <div role="listbox" aria-label="Presets" className="max-h-72 overflow-y-auto">
                        {MENU_PRESETS.map((id) => {
                            const active = range.kind === 'preset' && range.id === id;
                            return (
                                <button key={id} type="button" role="option" aria-selected={active} onClick={() => { onChange({ kind: 'preset', id }, compare); setOpen(false); }}
                                    className="flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-body-sm text-fg hover:bg-subtle">
                                    {PRESETS.find((p) => p.id === id)?.label}
                                    {active ? <Check aria-hidden size={16} className="text-brand-text" /> : null}
                                </button>
                            );
                        })}
                    </div>
                    <div className="my-1 h-px bg-border-subtle" />
                    <form className="space-y-2 px-2.5 py-2" onSubmit={(e) => { e.preventDefault(); if (isIso(from) && isIso(to)) { onChange({ kind: 'custom', start: from <= to ? from : to, end: from <= to ? to : from }, compare); setOpen(false); } }}>
                        <p className="text-meta font-medium text-fg-muted">Custom range</p>
                        <div className="flex items-center gap-2">
                            <input aria-label="Start date" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-body-sm text-fg" />
                            <span className="text-fg-muted">–</span>
                            <input aria-label="End date" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-body-sm text-fg" />
                        </div>
                        <Button type="submit" size="sm" variant="secondary" disabled={!isIso(from) || !isIso(to)} className="w-full">Apply dates</Button>
                    </form>
                    {canCompare ? (
                        <>
                            <div className="my-1 h-px bg-border-subtle" />
                            <p className="px-2.5 pt-1 text-meta font-medium text-fg-muted">Compare to</p>
                            <div role="radiogroup" aria-label="Compare to" className="pb-1">
                                {([['previous_period', 'Previous period'], ['previous_year', 'Same period last year'], ['none', 'No comparison']] as const).map(([mode, text]) => (
                                    <button key={mode} type="button" role="radio" aria-checked={compare.mode === mode} onClick={() => onChange(range, { mode })}
                                        className="flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-body-sm text-fg hover:bg-subtle">
                                        {text}
                                        {compare.mode === mode ? <Check aria-hidden size={16} className="text-brand-text" /> : null}
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : null}
                </PopoverContent>
            </Popover>
        </div>
    );
}

// ── Filters ──────────────────────────────────────────────────────────────

export interface OptionsSource {
    /** Loads option values (owner: /api/dashboards/options). Absent for public viewers. */
    load?: (control: FilterControl, q: string) => Promise<Array<{ value: string; label: string }>>;
}

function valueLabel(dim: string, v: string): string {
    if (dim === 'country') return countryName(v);
    if (dim === 'device') return v.charAt(0).toUpperCase() + v.slice(1);
    return v;
}

const STATIC_OPTIONS: Record<string, string[]> = { device: ['desktop', 'mobile', 'tablet'] };

export function FilterControlView({ control, value, onChange, options, disabled }: { control: FilterControl; value: string[]; onChange: (v: string[]) => void; options: OptionsSource; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const { data, isLoading } = useSWR(open && options.load && !STATIC_OPTIONS[control.dimension] ? ['dopt', control.id, control.dimension, q] : null, () => options.load!(control, q), { revalidateOnFocus: false, keepPreviousData: true });
    const list = useMemo(() => {
        const base = STATIC_OPTIONS[control.dimension]?.map((v) => ({ value: v, label: valueLabel(control.dimension, v) })) ?? data ?? [];
        const extra = value.filter((v) => !base.some((o) => o.value === v)).map((v) => ({ value: v, label: valueLabel(control.dimension, v) }));
        const all = [...extra, ...base];
        const s = q.trim().toLowerCase();
        return s ? all.filter((o) => o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s)) : all;
    }, [data, value, control.dimension, q]);

    if (control.ui === 'search') {
        return <SearchFilter key={value[0] ?? ''} control={control} initial={value[0] ?? ''} onChange={onChange} disabled={disabled} />;
    }
    const multi = control.ui === 'multiselect' || control.ui === 'chips';
    const summary = value.length === 0 ? 'All' : value.length === 1 ? valueLabel(control.dimension, value[0]) : `${value.length} selected`;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" disabled={disabled} className={cn('inline-flex h-9 max-w-[220px] items-center gap-1.5 rounded-control border px-2.5 text-body-sm transition-colors', value.length ? 'border-transparent bg-brand-soft text-brand-soft-fg' : 'border-border bg-surface text-fg-secondary hover:text-fg')}>
                    <span className="text-fg-muted">{control.label}:</span>
                    <span className="truncate font-medium">{summary}</span>
                    {value.length ? (
                        <span role="button" tabIndex={0} aria-label={`Clear ${control.label}`} onClick={(e) => { e.stopPropagation(); onChange([]); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); } }} className="rounded p-0.5 hover:bg-subtle">
                            <X aria-hidden size={12} />
                        </span>
                    ) : <ChevronDown aria-hidden size={14} />}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" aria-label={control.label}>
                {!STATIC_OPTIONS[control.dimension] ? <SearchInput value={q} onValueChange={setQ} placeholder="Search" size="sm" className="mb-2" /> : null}
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                    {isLoading && !list.length ? <p className="px-2 py-3 text-body-sm text-fg-muted">Loading…</p> : null}
                    {!isLoading && !list.length ? <p className="px-2 py-3 text-body-sm text-fg-muted">{options.load || STATIC_OPTIONS[control.dimension] ? 'No values' : 'Type in the search box'}</p> : null}
                    {list.map((o) => {
                        const on = value.includes(o.value);
                        return multi ? (
                            <div key={o.value} className="rounded-md px-2 py-1.5 hover:bg-subtle">
                                <Checkbox checked={on} onCheckedChange={(c) => onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))} label={o.label} />
                            </div>
                        ) : (
                            <button key={o.value} type="button" onClick={() => { onChange(on ? [] : [o.value]); setOpen(false); }} className="flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-body-sm hover:bg-subtle">
                                <span className="truncate">{o.label}</span>
                                {on ? <Check aria-hidden size={14} className="text-brand-text" /> : null}
                            </button>
                        );
                    })}
                    {!options.load && !STATIC_OPTIONS[control.dimension] && q.trim() ? (
                        <button type="button" onClick={() => onChange(multi ? [...value, q.trim()] : [q.trim()])} className="flex h-8 w-full items-center rounded-md px-2 text-left text-body-sm hover:bg-subtle">Use “{q.trim()}”</button>
                    ) : null}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function SearchFilter({ control, initial, onChange, disabled }: { control: FilterControl; initial: string; onChange: (v: string[]) => void; disabled?: boolean }) {
    const [text, setText] = useState(initial);
    const commit = () => {
        const t = text.trim();
        if (t !== initial) onChange(t ? [t] : []);
    };
    return (
        <form className="flex items-center" onSubmit={(e) => { e.preventDefault(); commit(); }}>
            <SearchInput aria-label={control.label} value={text} onValueChange={setText} onBlur={commit} placeholder={control.label} size="sm" className="w-44" disabled={disabled} />
        </form>
    );
}

// ── Controls bar ─────────────────────────────────────────────────────────

export interface ControlsBarProps {
    filters: FilterControl[];
    state: ControlState;
    onFilters: (id: string, values: string[]) => void;
    options: OptionsSource;
    canFilter?: boolean;
    /** Phones: filters collapse into a drawer. */
    compact?: boolean;
    children?: React.ReactNode;
}

export function ControlsBar({ filters, state, onFilters, options, canFilter = true, compact, children }: ControlsBarProps) {
    const [drawer, setDrawer] = useState(false);
    const active = filters.filter((f) => (state.filters[f.id] ?? []).length > 0).length;
    const visible = filters.filter((f) => f.viewerCanChange || canFilter);
    if (compact && visible.length) {
        return (
            <div className="flex flex-wrap items-center gap-2">
                {children}
                <Button variant="secondary" size="md" icon={Filter} onClick={() => setDrawer(true)}>Filters{active ? ` (${active})` : ''}</Button>
                <Drawer open={drawer} onOpenChange={setDrawer} title="Filters" side="right">
                    <div className="flex flex-col gap-3 p-4">
                        {visible.map((f) => (
                            <FilterControlView key={f.id} control={f} value={state.filters[f.id] ?? []} onChange={(v) => onFilters(f.id, v)} options={options} disabled={!canFilter || !f.viewerCanChange} />
                        ))}
                    </div>
                </Drawer>
            </div>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-2">
            {children}
            {visible.map((f) => (
                <FilterControlView key={f.id} control={f} value={state.filters[f.id] ?? []} onChange={(v) => onFilters(f.id, v)} options={options} disabled={!canFilter || !f.viewerCanChange} />
            ))}
        </div>
    );
}

// ── Page tabs ────────────────────────────────────────────────────────────

export function PageTabs({ pages, value, onChange, trailing }: { pages: PageDef[]; value: string; onChange: (id: string) => void; trailing?: React.ReactNode }) {
    return (
        <div role="tablist" aria-label="Pages" className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle [scrollbar-width:none]">
            {pages.map((p) => {
                const on = p.id === value;
                return (
                    <button key={p.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(p.id)}
                        className={cn('relative h-10 shrink-0 px-3 text-body-sm font-medium transition-colors', on ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
                        {p.title}
                        {p.hidden ? <span className="ml-1 text-caption text-fg-faint">(hidden)</span> : null}
                        {on ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" /> : null}
                    </button>
                );
            })}
            {trailing}
        </div>
    );
}
