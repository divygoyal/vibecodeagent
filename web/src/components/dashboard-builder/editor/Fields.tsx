'use client';

/**
 * Form parts for the properties panel: labelled fields, the metric combobox (grouped by
 * Search Console / Analytics, synonym search, "More metrics" collapsed, metric-colour dots),
 * dimension and source pickers. Builder-specific; generic inputs come from components/ui.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Popover, PopoverContent, PopoverTrigger, SearchInput, Select, Switch } from '@/components/ui';
import { dimsForFamilies, getMetric, metricColor, metricLabel, searchMetrics, METRIC_LIST, type Family, dimLabel } from '@/lib/builder/catalog';
import type { MetricRef, SourceRef } from '@/lib/builder/types';

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={htmlFor} className="block text-body-sm font-medium text-fg">{label}</label>
            {children}
            {hint ? <p className="text-meta text-fg-muted">{hint}</p> : null}
        </div>
    );
}

export function TextInput({ id, value, onChange, placeholder, multiline, rows = 4, mono }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number; mono?: boolean }) {
    const cls = cn('w-full rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint', mono && 'font-mono text-meta');
    return multiline
        ? <textarea id={id} value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(cls, 'py-2')} />
        : <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(cls, 'h-9')} />;
}

export function NumberInput({ id, value, onChange, min, max }: { id?: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
    return (
        <input id={id} type="number" value={value} min={min} max={max}
            onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n)))); }}
            className="h-9 w-24 rounded-control border border-border bg-surface px-3 text-body text-fg tabular-nums" />
    );
}

export function Toggle({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
    return <Switch size="sm" checked={checked} onCheckedChange={onChange} label={label} description={description} />;
}

export function Choice<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; ariaLabel: string }) {
    return <Select<T> size="sm" ariaLabel={ariaLabel} value={value} onValueChange={onChange} options={options} className="w-full" />;
}

// ── Metric picker ────────────────────────────────────────────────────────

export function MetricPicker({ value, onChange, families, ariaLabel = 'Metric', exclude = [] }: { value: string; onChange: (id: string) => void; families?: Family[]; ariaLabel?: string; exclude?: string[] }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [more, setMore] = useState(false);
    const list = useMemo(() => searchMetrics(q, METRIC_LIST.filter((m) => (!families || families.includes(m.family)) && !exclude.includes(m.id))), [q, families, exclude]);
    const groups: Array<[string, typeof list]> = [
        ['Search Console', list.filter((m) => m.family === 'gsc')],
        ['Analytics', list.filter((m) => m.family === 'ga4' && (m.tier === 'core' || q))],
    ];
    const moreList = list.filter((m) => m.family === 'ga4' && m.tier === 'more' && !q);
    const def = getMetric(value);
    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
            <PopoverTrigger asChild>
                <button type="button" aria-label={`${ariaLabel}: ${metricLabel(value)}`} className="flex h-9 w-full items-center gap-2 rounded-control border border-border bg-surface px-3 text-left text-body text-fg hover:border-border-strong">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: metricColor(value) }} />
                    <span className="min-w-0 flex-1 truncate">{def?.label ?? value}</span>
                    <span className="text-caption text-fg-faint">{def?.family === 'gsc' ? 'Search' : 'Analytics'}</span>
                    <ChevronDown aria-hidden size={14} className="text-fg-muted" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" aria-label={ariaLabel}>
                <SearchInput value={q} onValueChange={setQ} placeholder="Search metrics (visitors, rank…)" size="sm" className="mb-2" autoFocus />
                <div role="listbox" aria-label={ariaLabel} className="max-h-72 overflow-y-auto">
                    {groups.map(([title, items]) => items.length ? (
                        <div key={title} className="mb-1">
                            <p className="px-2 py-1 text-caption uppercase tracking-[0.04em] text-fg-muted">{title}</p>
                            {items.map((m) => <MetricOption key={m.id} id={m.id} active={m.id === value} onPick={() => { onChange(m.id); setOpen(false); }} />)}
                        </div>
                    ) : null)}
                    {moreList.length ? (
                        <div>
                            <button type="button" onClick={() => setMore((v) => !v)} className="flex w-full items-center justify-between px-2 py-1 text-caption uppercase tracking-[0.04em] text-fg-muted hover:text-fg">
                                More metrics <ChevronDown aria-hidden size={12} className={cn('transition-transform', more && 'rotate-180')} />
                            </button>
                            {more ? moreList.map((m) => <MetricOption key={m.id} id={m.id} active={m.id === value} onPick={() => { onChange(m.id); setOpen(false); }} />) : null}
                        </div>
                    ) : null}
                    {!list.length ? <p className="px-2 py-3 text-body-sm text-fg-muted">No metric matches “{q}”.</p> : null}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function MetricOption({ id, active, onPick }: { id: string; active: boolean; onPick: () => void }) {
    const m = getMetric(id)!;
    return (
        <button type="button" role="option" aria-selected={active} onClick={onPick} title={m.description} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-sm text-fg hover:bg-subtle">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: metricColor(id) }} />
            <span className="min-w-0 flex-1 truncate">{m.label}</span>
            {active ? <Check aria-hidden size={14} className="text-brand-text" /> : null}
        </button>
    );
}

/** 1..max metrics with add / remove. */
export function MetricList({ value, onChange, max, min = 1, families }: { value: MetricRef[]; onChange: (v: MetricRef[]) => void; max: number; min?: number; families?: Family[] }) {
    return (
        <div className="space-y-2">
            {value.map((m, i) => (
                <div key={`${m.id}-${i}`} className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1"><MetricPicker value={m.id} families={families} onChange={(id) => onChange(value.map((x, j) => (j === i ? { ...x, id } : x)))} ariaLabel={`Metric ${i + 1}`} /></div>
                    {value.length > min ? (
                        <button type="button" aria-label={`Remove ${metricLabel(m.id)}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-1 text-fg-muted hover:bg-subtle hover:text-fg"><X aria-hidden size={14} /></button>
                    ) : null}
                </div>
            ))}
            {value.length < max ? (
                <button type="button" onClick={() => {
                    const used = new Set(value.map((m) => m.id));
                    const fam = families ?? (value[0] ? [value[0].id.startsWith('gsc:') ? 'gsc' : 'ga4'] as Family[] : undefined);
                    const next = METRIC_LIST.find((m) => !used.has(m.id) && m.tier === 'core' && (!fam || fam.includes(m.family)));
                    if (next) onChange([...value, { id: next.id }]);
                }} className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                    <Plus aria-hidden size={14} /> Add metric
                </button>
            ) : null}
        </div>
    );
}

// ── Dimension and source ─────────────────────────────────────────────────

export function DimensionPicker({ value, onChange, metrics, allowNone, allowSite, allowTime, ariaLabel = 'Dimension' }: { value: string | undefined; onChange: (v: string | undefined) => void; metrics: string[]; allowNone?: boolean; allowSite?: boolean; allowTime?: boolean; ariaLabel?: string }) {
    const families = [...new Set(metrics.map((m) => (m.startsWith('gsc:') ? 'gsc' : 'ga4')))] as Family[];
    const dims = dimsForFamilies(families.length ? families : ['ga4']).filter((d) => allowTime || d.kind !== 'time');
    const options = [
        ...(allowNone ? [{ value: '__none', label: 'None' }] : []),
        ...(allowSite ? [{ value: 'site', label: 'Site' }] : []),
        ...dims.map((d) => ({ value: d.id, label: d.label })),
    ];
    if (value && !options.some((o) => o.value === value)) options.unshift({ value, label: `${dimLabel(value)} (not available for these metrics)` });
    return <Select size="sm" ariaLabel={ariaLabel} value={value ?? (allowNone ? '__none' : undefined)} onValueChange={(v) => onChange(v === '__none' ? undefined : v)} options={options} className="w-full" />;
}

export interface SiteOption { siteId: string; label: string; ga4: string | null; gsc: string | null; ga4Name: string | null }

export function sourceKey(s: SourceRef): string {
    if (s.type === 'default') return 'default';
    if (s.type === 'portfolio') return 'portfolio';
    return `site:${s.siteId}`;
}

export function SourcePicker({ value, onChange, sites, defaultLabel, allowDefault = true, portfolioOnly }: { value: SourceRef; onChange: (s: SourceRef) => void; sites: SiteOption[]; defaultLabel?: string; allowDefault?: boolean; portfolioOnly?: boolean }) {
    const options = [
        ...(allowDefault && !portfolioOnly ? [{ value: 'default', label: `Default (${defaultLabel ?? 'dashboard site'})` }] : []),
        { value: 'portfolio', label: 'All sites (portfolio)' },
        ...(portfolioOnly ? [] : sites.map((s) => ({ value: `site:${s.siteId}`, label: `${s.label}${s.ga4 && s.gsc ? '' : s.gsc ? ' · Search Console' : ' · Analytics'}` }))),
    ];
    const current = sourceKey(value);
    if (!options.some((o) => o.value === current) && value.type === 'site') options.push({ value: current, label: value.siteId });
    return (
        <Select size="sm" ariaLabel="Data source" value={current} className="w-full" options={options}
            onValueChange={(v) => {
                if (v === 'default') onChange({ type: 'default' });
                else if (v === 'portfolio') onChange({ type: 'portfolio', include: 'all' });
                else {
                    const s = sites.find((x) => `site:${x.siteId}` === v);
                    onChange({ type: 'site', siteId: v.slice(5), ga4: s?.ga4 ?? undefined, gsc: s?.gsc ?? undefined });
                }
            }} />
    );
}
