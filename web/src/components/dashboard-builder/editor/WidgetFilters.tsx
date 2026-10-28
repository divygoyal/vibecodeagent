'use client';

/**
 * Per-widget filters (round 2, C1). The engine has always applied widget.filters and
 * widget.ignoreControls; this is the editor UI: up to 5 rows (dimension, operator, value),
 * ready-made segments (AI assistants, brand / non-brand, mobile, organic search ...), a note when
 * a filter only reaches one data family, and which dashboard controls the widget ignores.
 */
import { Plus, X } from 'lucide-react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Button } from '@/components/ui';
import { dimLabel, getDim, metricFamilies } from '@/lib/builder/catalog';
import { widgetMetrics } from '@/lib/builder/registry';
import { brandRegex } from '@/lib/builder/templates.round2';
import { AI_SOURCE_PATTERN } from '@/components/site/lib/rules';
import { variableControls } from '@/lib/builder/variables';
import type { DashboardDocV2, FilterClause, FilterControl, FilterOp, WidgetDef } from '@/lib/builder/types';
import { drillOptionsFor } from '@/lib/builder/drill';
import { SEARCH_TYPES, searchTypeEligible, searchTypesFor } from '@/lib/builder/searchType';
import { Choice, DimensionPicker, Field, Toggle } from './Fields';

const MAX = 5;

export const FILTER_OPS: Array<{ value: FilterOp; label: string }> = [
    { value: 'eq', label: 'is' },
    { value: 'neq', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'starts', label: 'starts with' },
    { value: 'ends', label: 'ends with' },
    { value: 'in', label: 'is one of' },
    { value: 'not_in', label: 'is none of' },
    { value: 'regex', label: 'matches (regex)' },
    { value: 'not_regex', label: 'does not match (regex)' },
];

function segments(doc: DashboardDocV2): Array<{ label: string; hint: string; clause: FilterClause }> {
    const brand = brandRegex(doc.defaultSource.type === 'site' ? doc.defaultSource.siteId : undefined);
    return [
        { label: 'AI assistants', hint: 'ChatGPT, Perplexity, Claude, Gemini, Copilot … (Analytics)', clause: { dimension: 'source', op: 'regex', value: AI_SOURCE_PATTERN } },
        { label: 'Brand searches', hint: `Queries matching ${brand} (Search Console)`, clause: { dimension: 'query', op: 'regex', value: brand } },
        { label: 'Non-brand searches', hint: `Queries not matching ${brand}`, clause: { dimension: 'query', op: 'not_regex', value: brand } },
        { label: 'Organic search only', hint: 'Channel = Organic Search (Analytics)', clause: { dimension: 'channel', op: 'eq', value: 'Organic Search' } },
        { label: 'Mobile only', hint: 'Device = mobile', clause: { dimension: 'device', op: 'eq', value: 'mobile' } },
        { label: 'Desktop only', hint: 'Device = desktop', clause: { dimension: 'device', op: 'eq', value: 'desktop' } },
        { label: 'Blog pages', hint: 'Page contains /blog/', clause: { dimension: 'page', op: 'contains', value: '/blog/' } },
    ];
}

/** Which data family a dimension reaches, given the widget's metrics. */
function familyNote(dim: string, metrics: string[]): string | null {
    const d = getDim(dim);
    if (!d) return null;
    const fams = new Set(metrics.flatMap((m) => metricFamilies(m)));
    if (fams.has('gsc') && fams.has('ga4')) {
        if (!d.gsc) return 'Applies to Analytics numbers only';
        if (!d.ga4) return 'Applies to Search Console numbers only';
    }
    if (fams.has('gsc') && !d.gsc) return 'Search Console has no such field: this filter is not applied';
    if (fams.has('ga4') && !fams.has('gsc') && !d.ga4) return 'Analytics has no such field: this filter is not applied';
    return null;
}

const valueText = (v: FilterClause['value']) => (Array.isArray(v) ? v.join(', ') : v);

export function WidgetFilters({ widget, doc, edit }: { widget: WidgetDef; doc: DashboardDocV2; edit: (fn: (w: WidgetDef) => WidgetDef, key?: string) => void }) {
    const filters = widget.filters ?? [];
    const metrics = widgetMetrics(widget);
    const controls = doc.controls.filter((c): c is FilterControl => c.type === 'filter');
    const ignore = new Set(widget.ignoreControls ?? []);
    const setFilters = (next: FilterClause[], key?: string) => edit((w) => ({ ...w, filters: next.length ? next : undefined }) as WidgetDef, key);
    const setRow = (i: number, patch: Partial<FilterClause>, key?: string) => setFilters(filters.map((f, j) => {
        if (j !== i) return f;
        const n = { ...f, ...patch };
        const multi = n.op === 'in' || n.op === 'not_in';
        if (multi && !Array.isArray(n.value)) n.value = String(n.value).split(',').map((s) => s.trim()).filter(Boolean);
        if (!multi && Array.isArray(n.value)) n.value = n.value.join(', ');
        return n;
    }), key);
    const firstDim = metrics.some((m) => metricFamilies(m).includes('gsc')) ? 'query' : 'page';
    const varNames = variableControls(doc.controls).map((v) => `{{var:${v.id}}}`);
    const clickable = widget.type === 'bar' || widget.type === 'table' || widget.type === 'geo';
    return (
        <div className="space-y-3">
            <Field label="Filters" hint={filters.length ? 'All rows must match. Dashboard filter controls still apply unless ignored below.' : 'Show only part of the data in this widget, for example AI traffic or brand searches.'}>
                <div className="space-y-2">
                    {filters.map((f, i) => {
                        const note = familyNote(f.dimension, metrics);
                        return (
                            <div key={i} className="space-y-1.5 rounded-control border border-border-subtle bg-surface-sunken p-2">
                                <div className="flex items-center gap-1.5">
                                    <div className="min-w-0 flex-1"><DimensionPicker value={f.dimension} metrics={metrics.length ? metrics : ['ga4:sessions', 'gsc:clicks']} ariaLabel={`Filter ${i + 1} field`} onChange={(d) => d && setRow(i, { dimension: d })} /></div>
                                    <button type="button" aria-label={`Remove filter ${i + 1}`} onClick={() => setFilters(filters.filter((_, j) => j !== i))} className="rounded p-1 text-fg-muted hover:bg-subtle hover:text-fg"><X aria-hidden size={14} /></button>
                                </div>
                                <select aria-label={`Filter ${i + 1} condition`} value={f.op} onChange={(e) => setRow(i, { op: e.target.value as FilterOp })} className="h-8 w-full rounded-control border border-border bg-surface px-2 text-body-sm text-fg">
                                    {FILTER_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                <input aria-label={`Filter ${i + 1} value`} value={valueText(f.value)} placeholder={f.op === 'in' || f.op === 'not_in' ? 'value one, value two' : f.op.includes('regex') ? 'chatgpt|perplexity' : `${dimLabel(f.dimension)} value`}
                                    onChange={(e) => setRow(i, { value: f.op === 'in' || f.op === 'not_in' ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100) : e.target.value.slice(0, 500) }, `filter-${i}`)}
                                    className="h-8 w-full rounded-control border border-border bg-surface px-2 font-mono text-meta text-fg placeholder:font-sans placeholder:text-fg-faint" />
                                {note ? <p className="text-caption text-warn">{note}</p> : null}
                                {varNames.length ? <p className="text-caption text-fg-muted">Variables: {varNames.join(', ')}</p> : null}
                            </div>
                        );
                    })}
                    {filters.length < MAX ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => setFilters([...filters, { dimension: firstDim, op: 'contains', value: '' }])} className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                                <Plus aria-hidden size={14} /> Add filter
                            </button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button size="sm" variant="ghost">Segments</Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-72">
                                    {segments(doc).map((s) => (
                                        <DropdownMenuItem key={s.label} onSelect={() => setFilters([...filters, s.clause])}>
                                            <span className="flex flex-col"><span>{s.label}</span><span className="text-caption text-fg-muted">{s.hint}</span></span>
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ) : null}
                </div>
            </Field>
            <DrillSetting widget={widget} edit={edit} />
            <SearchTypeSetting widget={widget} edit={edit} />
            {clickable ? (
                <Toggle label="Click to filter the page" description={widget.type === 'geo' ? 'A click on a country filters the other widgets.' : widget.type === 'table' ? 'A click on a row filters the other widgets by it.' : 'A click on a bar filters the other widgets by it.'}
                    checked={Boolean(widget.interactions?.clickToFilter)} onChange={(v) => edit((w) => ({ ...w, interactions: v ? { ...(w.interactions ?? {}), clickToFilter: true } : undefined }) as WidgetDef)} />
            ) : null}
            {controls.length ? (
                <Field label="Dashboard filters">
                    <div className="space-y-1">
                        {controls.map((c) => (
                            <Toggle key={c.id} label={`Follow “${c.label}”`} checked={!ignore.has(c.id) && !ignore.has('filters')}
                                onChange={(v) => edit((w) => {
                                    const cur = new Set((w.ignoreControls ?? []).filter((x) => x !== 'filters'));
                                    if (ignore.has('filters')) for (const x of controls) cur.add(x.id);
                                    if (v) cur.delete(c.id); else cur.add(c.id);
                                    const next = [...cur];
                                    return { ...w, ignoreControls: next.length ? next : undefined } as WidgetDef;
                                })} />
                        ))}
                    </div>
                </Field>
            ) : null}
        </div>
    );
}

/** Drill down (round 8): the levels a click on a bar, slice or row opens, from the ready-made hierarchies. */
function DrillSetting({ widget, edit }: { widget: WidgetDef; edit: (fn: (w: WidgetDef) => WidgetDef, key?: string) => void }) {
    const options = drillOptionsFor(widget);
    const current = widget.interactions?.drill;
    if (!options.length && !current?.length) return null;
    const match = options.find((o) => JSON.stringify(o.levels) === JSON.stringify(current));
    const set = (id: string) => {
        const levels = options.find((o) => o.id === id)?.levels;
        edit((w) => {
            const { drill: _drop, ...rest } = w.interactions ?? {};
            void _drop;
            const interactions = { ...rest, ...(levels ? { drill: levels } : {}) };
            return { ...w, interactions: Object.keys(interactions).length ? interactions : undefined } as WidgetDef;
        });
    };
    return (
        <Field label="Drill down" hint={current?.length
            ? `A click on a value goes one level down; “Up” in the breadcrumb comes back.${widget.interactions?.clickToFilter ? ' On the last level a click filters the page.' : ''}`
            : 'Let viewers click a value to see what is inside it, one level at a time.'}>
            <Choice ariaLabel="Drill down" value={match?.id ?? (current?.length ? '__custom' : '__off')}
                onChange={(v) => set(v === '__off' ? '' : v)}
                options={[{ value: '__off', label: 'Off' }, ...options.map((o) => ({ value: o.id, label: o.label })), ...(current?.length && !match ? [{ value: '__custom', label: 'Custom levels' }] : [])]} />
        </Field>
    );
}

/** Search Console search type (round 8): only for widgets that read Search Console alone. */
function SearchTypeSetting({ widget, edit }: { widget: WidgetDef; edit: (fn: (w: WidgetDef) => WidgetDef, key?: string) => void }) {
    if (!searchTypeEligible(widget)) return null;
    const allowed = new Set(searchTypesFor(widget));
    const current = widget.searchType ?? 'web';
    const hidden = SEARCH_TYPES.filter((t) => !allowed.has(t.id));
    return (
        <Field label="Search type" hint={hidden.length ? `${hidden.map((t) => t.short).join(' and ')} have no search queries or position, so they are not offered while this widget uses them.` : 'Which Google search the numbers come from.'}>
            <Choice ariaLabel="Search type" value={current}
                onChange={(v) => edit((w) => ({ ...w, searchType: v === 'web' ? undefined : v }) as WidgetDef)}
                options={SEARCH_TYPES.filter((t) => allowed.has(t.id) || t.id === current).map((t) => ({ value: t.id, label: t.label }))} />
        </Field>
    );
}
