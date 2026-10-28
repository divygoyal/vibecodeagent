'use client';

/**
 * Right-hand properties panel (BUILDER.md 11.4, DESIGN.md 5.10): Setup | Style for the selected
 * widget, filter-control settings for a selected control, Dashboard settings when nothing is
 * selected. Every change goes through the editor store (undoable, coalesced while typing).
 */
import { useEffect, useState } from 'react';
import { Copy, Lock, Trash2 } from 'lucide-react';

import { Banner, Button, Tabs } from '@/components/ui';
import { dimLabel, getMetric, metricLabel } from '@/lib/builder/catalog';
import { tableColumns, widgetMeta, widgetMetrics } from '@/lib/builder/registry';
import { removeWidget, duplicateWidget, updateWidget } from '@/lib/builder/docOps';
import { MENU_PRESETS, PRESETS } from '@/lib/builder/dates';
import type { ControlDef, DashboardDocV2, FilterControl, MetricRef, SourceRef, TableColumn, WidgetDef } from '@/lib/builder/types';
import { useEditorStore } from '@/stores/dashboardEditorStore';
import { useResolvedTheme } from '@/lib/theme';
import { AppearanceSettings } from '../theme/AppearanceSettings';
import { Choice, DimensionPicker, Field, MetricList, MetricPicker, NumberInput, SourcePicker, TextInput, Toggle, type SiteOption } from './Fields';
import { ChartMarksEditor } from './ChartMarksEditor';
import { RulesEditor } from './RulesEditor';
import { GrainControlProps, MetricControlProps, SiteControlProps } from './SwitchControlProps';
import { VariablesEditor } from './VariablesEditor';
import { CalcList } from './CalcEditor';
import { TABLE_TREND_ROWS, TREND_DAILY_MAX_DAYS, trendMetric, trendUnsupported } from '@/lib/builder/trend';
import { WidgetFilters } from './WidgetFilters';

type Patch = (w: WidgetDef) => WidgetDef;

/** Window event that opens Dashboard settings on the Appearance tab. */
export const APPEARANCE_EVENT = 'tc:dash-appearance';
export function openAppearance() {
    (window as { __tcDashTab?: string }).__tcDashTab = 'appearance';
    window.dispatchEvent(new Event(APPEARANCE_EVENT));
    setTimeout(() => { (window as { __tcDashTab?: string }).__tcDashTab = undefined; }, 500);
}

function useWidgetEdit(widget: WidgetDef) {
    const apply = useEditorStore((s) => s.apply);
    return (fn: Patch, key?: string) => apply((doc) => (doc.widgets[widget.id] ? updateWidget(doc, fn(doc.widgets[widget.id])) : doc), { coalesce: key ? `${widget.id}:${key}` : undefined });
}

function cfg<W extends WidgetDef>(w: W, patch: Partial<W['config']>): W {
    return { ...w, config: { ...w.config, ...patch } } as W;
}


/** Menu presets, plus the saved one when it is not in the menu (older dashboards default to "Last 30 days"). */
function presetOptions(current: string | null) {
    const ids = current && !MENU_PRESETS.includes(current as (typeof MENU_PRESETS)[number]) && PRESETS.some((p) => p.id === current)
        ? [current as (typeof MENU_PRESETS)[number], ...MENU_PRESETS]
        : MENU_PRESETS;
    return ids.map((id) => ({ value: id, label: PRESETS.find((p) => p.id === id)!.label }));
}

export function PropertiesPanel({ doc, sites, defaultLabel }: { doc: DashboardDocV2; sites: SiteOption[]; defaultLabel: string }) {
    const selectedId = useEditorStore((s) => s.selectedId);
    const controlId = useEditorStore((s) => s.selectedControlId);
    const widget = selectedId ? doc.widgets[selectedId] : undefined;
    const control = controlId ? doc.controls.find((c) => c.id === controlId) : undefined;
    return (
        <aside aria-label="Properties" className="flex h-full w-[300px] shrink-0 flex-col border-l border-border-subtle bg-surface">
            {widget ? <WidgetProps key={widget.id} widget={widget} doc={doc} sites={sites} defaultLabel={defaultLabel} />
                : control && control.type === 'filter' ? <ControlProps key={control.id} control={control} doc={doc} />
                    : control && control.type === 'site' ? <SiteControlProps key={control.id} control={control} doc={doc} sites={sites} defaultLabel={defaultLabel} />
                        : control && control.type === 'metric' ? <MetricControlProps key={control.id} control={control} doc={doc} />
                            : control && control.type === 'grain' ? <GrainControlProps key={control.id} control={control} doc={doc} />
                                : <DashboardSettings doc={doc} sites={sites} />}
        </aside>
    );
}

// ── Widget ───────────────────────────────────────────────────────────────

function WidgetProps({ widget, doc, sites, defaultLabel }: { widget: WidgetDef; doc: DashboardDocV2; sites: SiteOption[]; defaultLabel: string }) {
    const [tab, setTab] = useState<'setup' | 'style'>('setup');
    const edit = useWidgetEdit(widget);
    const apply = useEditorStore((s) => s.apply);
    const select = useEditorStore((s) => s.select);
    const meta = widgetMeta(widget.type);
    return (
        <>
            <div className="border-b border-border-subtle px-4 pb-2 pt-3">
                <p className="text-caption uppercase tracking-[0.04em] text-fg-muted">{meta.label}</p>
                <Tabs variant="pills" ariaLabel="Widget settings" value={tab} onValueChange={(v) => setTab(v as 'setup' | 'style')} items={[{ value: 'setup', label: 'Setup' }, { value: 'style', label: 'Style' }]} className="mt-2" />
            </div>
            <div id="tc-setup" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                {tab === 'setup' ? (
                    <>
                        <Setup widget={widget} edit={edit} sites={sites} defaultLabel={defaultLabel} doc={doc} />
                        {!meta.static ? <div className="border-t border-border-subtle pt-4"><WidgetFilters widget={widget} doc={doc} edit={edit} /></div> : null}
                    </>
                ) : <Style widget={widget} edit={edit} />}
            </div>
            <div className="flex gap-2 border-t border-border-subtle p-3">
                <Button size="sm" variant="secondary" icon={Copy} onClick={() => { let id = ''; apply((d) => { const r = duplicateWidget(d, widget.id); id = r.id; return r.doc; }, { announce: 'Widget duplicated' }); if (id) select(id); }}>Duplicate</Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => apply((d) => removeWidget(d, widget.id), { announce: 'Widget deleted. Press Command Z to undo.' })}>Delete</Button>
            </div>
        </>
    );
}

function Setup({ widget, edit, sites, defaultLabel, doc }: { widget: WidgetDef; edit: (fn: Patch, key?: string) => void; sites: SiteOption[]; defaultLabel: string; doc: DashboardDocV2 }) {
    const metrics = widgetMetrics(widget);
    const portfolio = widget.source?.type === 'portfolio' || (widget.source?.type === 'default' && doc.defaultSource.type === 'portfolio');
    const source = meta(widget).static ? null : (
        <Field label="Source" hint={widget.type === 'portfolio-grid' ? 'This widget always shows every site.' : 'Any of your sites, or all of them.'}>
            <SourcePicker value={widget.source ?? { type: 'default' }} onChange={(s: SourceRef) => edit((w) => ({ ...w, source: s }) as WidgetDef)} sites={sites} defaultLabel={defaultLabel} portfolioOnly={widget.type === 'portfolio-grid'} />
        </Field>
    );
    switch (widget.type) {
        case 'scorecard':
            return (
                <>
                    {source}
                    <Field label="Metric"><MetricPicker value={widget.config.metric.id} noShare onChange={(id) => edit((w) => cfg(w as typeof widget, { metric: { ...widget.config.metric, id } }))} /></Field>
                    <Toggle label="Show comparison" checked={widget.config.comparison.show} onChange={(v) => edit((w) => cfg(w as typeof widget, { comparison: { ...widget.config.comparison, show: v } }))} />
                    <Toggle label="Sparkline" checked={widget.config.sparkline.show} onChange={(v) => edit((w) => cfg(w as typeof widget, { sparkline: { ...widget.config.sparkline, show: v } }))} />
                    <ScorecardTarget widget={widget} edit={edit} />
                </>
            );
        case 'kpi-strip':
            return (
                <>
                    {source}
                    <Field label="Metrics (up to 6)"><MetricList value={widget.config.metrics} max={6} noShare onChange={(v: MetricRef[]) => edit((w) => cfg(w as typeof widget, { metrics: v }))} /></Field>
                    <Toggle label="Show comparison" checked={widget.config.comparison.show} onChange={(v) => edit((w) => cfg(w as typeof widget, { comparison: { ...widget.config.comparison, show: v } }))} />
                    <Toggle label="Sparklines" checked={widget.config.sparkline.show} onChange={(v) => edit((w) => cfg(w as typeof widget, { sparkline: { ...widget.config.sparkline, show: v } }))} />
                </>
            );
        case 'timeseries': {
            const c = widget.config;
            const groups = new Set(c.series.map((s) => (['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'].includes(s.metric.id) ? 's' : 't')));
            return (
                <>
                    {source}
                    <Field label="Metrics (up to 4)">
                        <MetricList value={c.series.map((s) => s.metric)} max={c.breakdown ? 1 : 4} onChange={(v) => edit((w) => cfg(w as typeof widget, { series: v.map((m, i) => ({ metric: m, kind: c.series[i]?.kind ?? (i === 0 ? 'area' : 'line') })) }))} />
                    </Field>
                    {groups.size > 1 ? <Banner variant="info">Search and traffic metrics show as separate panels so colours keep their meaning.</Banner> : null}
                    <Field label="Chart type">
                        <Choice ariaLabel="Chart type" value={c.series[0]?.kind ?? 'line'} onChange={(k) => edit((w) => cfg(w as typeof widget, { series: c.series.map((s, i) => ({ ...s, kind: i === 0 ? k : k === 'area' ? 'line' : k })) }))} options={[{ value: 'area', label: 'Area' }, { value: 'line', label: 'Line' }, { value: 'bar', label: 'Columns' }]} />
                    </Field>
                    <Field label="Granularity"><Choice ariaLabel="Granularity" value={c.granularity} onChange={(g) => edit((w) => cfg(w as typeof widget, { granularity: g }))} options={[{ value: 'auto', label: 'Automatic' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} /></Field>
                    <Field label="Break down by" hint="One metric, top values stacked.">
                        <DimensionPicker value={c.breakdown?.dimension} metrics={metrics} allowNone allowSite={portfolio} onChange={(d) => edit((w) => cfg(w as typeof widget, { breakdown: d ? { dimension: d, top: 5, other: true } : undefined, series: d ? c.series.slice(0, 1) : c.series, stacked: d ? true : c.stacked }))} />
                    </Field>
                    <Field label="Comparison"><Choice ariaLabel="Comparison" value={c.compare} onChange={(v) => edit((w) => cfg(w as typeof widget, { compare: v }))} options={[{ value: 'inherit', label: 'Follow the dashboard' }, { value: 'off', label: 'Off' }]} /></Field>
                    <Toggle label="Mark Search Console days still being processed" checked={c.markPreliminary} onChange={(v) => edit((w) => cfg(w as typeof widget, { markPreliminary: v }))} />
                    <div className="border-t border-border-subtle pt-4"><ChartMarksEditor widget={widget} edit={edit} doc={doc} /></div>
                </>
            );
        }
        case 'bar': {
            const c = widget.config;
            return (
                <>
                    {source}
                    <Field label={c.stackBy ? 'Metric' : 'Metrics (up to 3)'}><MetricList value={c.metrics} max={c.stackBy ? 1 : 3} onChange={(v) => edit((w) => cfg(w as typeof widget, { metrics: v, sort: { by: v[0].id, dir: c.sort.dir } }))} /></Field>
                    <Field label="Dimension"><DimensionPicker value={c.dimension} metrics={metrics} allowSite={portfolio} onChange={(d) => d && edit((w) => cfg(w as typeof widget, { dimension: d }))} /></Field>
                    <Field label="Stack by"><DimensionPicker value={c.stackBy} metrics={metrics} allowNone onChange={(d) => edit((w) => cfg(w as typeof widget, { stackBy: d, variant: d ? 'chart' : c.variant, metrics: d ? c.metrics.slice(0, 1) : c.metrics }))} ariaLabel="Stack by" /></Field>
                    <Field label="Show as"><Choice ariaLabel="Show as" value={c.variant} onChange={(v) => edit((w) => cfg(w as typeof widget, { variant: v }))} options={[{ value: 'list', label: 'Bar list' }, { value: 'chart', label: 'Bar chart' }]} /></Field>
                    {c.variant === 'chart' ? <Field label="Direction"><Choice ariaLabel="Direction" value={c.orientation} onChange={(v) => edit((w) => cfg(w as typeof widget, { orientation: v }))} options={[{ value: 'horizontal', label: 'Horizontal bars' }, { value: 'vertical', label: 'Columns' }]} /></Field> : null}
                    <Field label="Rows"><NumberInput value={c.top} min={1} max={25} onChange={(n) => edit((w) => cfg(w as typeof widget, { top: n }), 'top')} /></Field>
                    <Toggle label="Show share of total" checked={c.showShare} onChange={(v) => edit((w) => cfg(w as typeof widget, { showShare: v }))} />
                    <Toggle label="Group the rest as Other" checked={c.other} onChange={(v) => edit((w) => cfg(w as typeof widget, { other: v }))} />
                </>
            );
        }
        case 'pie': {
            const c = widget.config;
            return (
                <>
                    {source}
                    <Field label="Metric"><MetricPicker value={c.metric.id} onChange={(id) => edit((w) => cfg(w as typeof widget, { metric: { id } }))} /></Field>
                    <Field label="Dimension"><DimensionPicker value={c.dimension} metrics={metrics} allowSite={portfolio} onChange={(d) => d && edit((w) => cfg(w as typeof widget, { dimension: d }))} /></Field>
                    <Field label="Slices" hint="Up to 5 plus Other."><NumberInput value={c.top} min={1} max={5} onChange={(n) => edit((w) => cfg(w as typeof widget, { top: n }), 'top')} /></Field>
                    <Toggle label="Group the rest as Other" checked={c.other} onChange={(v) => edit((w) => cfg(w as typeof widget, { other: v }))} />
                </>
            );
        }
        case 'table': return <TableSetup widget={widget} edit={edit} source={source} portfolio={portfolio} />;
        case 'geo': {
            const c = widget.config;
            return (
                <>
                    {source}
                    <Field label="Metric"><MetricPicker value={c.metric.id} onChange={(id) => edit((w) => cfg(w as typeof widget, { metric: { id } }))} /></Field>
                    <Field label="Ranked list"><Choice ariaLabel="Ranked list" value={String(c.topList) as '0' | '5' | '10'} onChange={(v) => edit((w) => cfg(w as typeof widget, { topList: Number(v) as 0 | 5 | 10 }))} options={[{ value: '0', label: 'Hide' }, { value: '5', label: 'Top 5' }, { value: '10', label: 'Top 10' }]} /></Field>
                    <Field label="Projection"><Choice ariaLabel="Projection" value={c.projection} onChange={(v) => edit((w) => cfg(w as typeof widget, { projection: v }))} options={[{ value: 'naturalEarth', label: 'Natural Earth' }, { value: 'mercator', label: 'Mercator' }]} /></Field>
                    <Toggle label="Legend" checked={c.showLegend} onChange={(v) => edit((w) => cfg(w as typeof widget, { showLegend: v }))} />
                </>
            );
        }
        case 'text': {
            const c = widget.config;
            return (
                <>
                    <Field label="Text" hint="Markdown. Use {{date_range}}, {{compare_range}}, {{site}} and {{page}}.">
                        <TextInput multiline rows={8} value={c.markdown} onChange={(v) => edit((w) => cfg(w as typeof widget, { markdown: v }), 'md')} />
                    </Field>
                    <Field label="Style"><Choice ariaLabel="Text style" value={c.role} onChange={(v) => edit((w) => cfg(w as typeof widget, { role: v }))} options={[{ value: 'heading', label: 'Heading' }, { value: 'subheading', label: 'Subheading' }, { value: 'body', label: 'Body' }, { value: 'note', label: 'Note' }, { value: 'callout', label: 'Callout' }]} /></Field>
                    <Field label="Align"><Choice ariaLabel="Align" value={c.align} onChange={(v) => edit((w) => cfg(w as typeof widget, { align: v }))} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} /></Field>
                    <Toggle label="Fill in variables" checked={c.variables} onChange={(v) => edit((w) => cfg(w as typeof widget, { variables: v }))} />
                </>
            );
        }
        case 'section': {
            const c = widget.config;
            return (
                <>
                    <Field label="Title"><TextInput value={c.title} onChange={(v) => edit((w) => cfg(w as typeof widget, { title: v.slice(0, 200) }), 'title')} /></Field>
                    <Field label="Subtitle"><TextInput value={c.subtitle ?? ''} onChange={(v) => edit((w) => cfg(w as typeof widget, { subtitle: v || undefined }), 'subtitle')} /></Field>
                    <Toggle label="Divider line" checked={c.divider} onChange={(v) => edit((w) => cfg(w as typeof widget, { divider: v }))} />
                    <Field label="Align"><Choice ariaLabel="Align" value={c.align} onChange={(v) => edit((w) => cfg(w as typeof widget, { align: v }))} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }]} /></Field>
                </>
            );
        }
        case 'image': {
            const c = widget.config;
            const bad = c.src && !/^https:\/\//i.test(c.src);
            return (
                <>
                    <Field label="Image URL" hint={bad ? 'Use an https:// address.' : 'https only. Uploads come later.'}><TextInput value={c.src} placeholder="https://…" onChange={(v) => edit((w) => cfg(w as typeof widget, { src: v.trim() }), 'src')} /></Field>
                    <Field label="Alt text" hint={c.alt ? undefined : 'Describe the image for screen readers.'}><TextInput value={c.alt} onChange={(v) => edit((w) => cfg(w as typeof widget, { alt: v.slice(0, 300) }), 'alt')} /></Field>
                    <Field label="Fit"><Choice ariaLabel="Fit" value={c.fit} onChange={(v) => edit((w) => cfg(w as typeof widget, { fit: v }))} options={[{ value: 'contain', label: 'Fit inside' }, { value: 'cover', label: 'Fill' }]} /></Field>
                    <Field label="Link (optional)"><TextInput value={c.href ?? ''} placeholder="https://…" onChange={(v) => edit((w) => cfg(w as typeof widget, { href: v.trim() || undefined }), 'href')} /></Field>
                </>
            );
        }
        case 'portfolio-grid': {
            const c = widget.config;
            return (
                <>
                    {source}
                    <Field label="Metrics (2 to 4)"><MetricList value={c.metrics} min={2} max={4} families={['gsc', 'ga4']} onChange={(v) => edit((w) => cfg(w as typeof widget, { metrics: v }))} /></Field>
                    <Field label="Sort"><Choice ariaLabel="Sort sites" value={`${c.sort.by}|${c.sort.dir}`} onChange={(v) => { const [by, dir] = v.split('|'); edit((w) => cfg(w as typeof widget, { sort: { by, dir: dir as 'asc' | 'desc' } })); }}
                        options={[{ value: 'change|asc', label: 'Biggest drop first' }, { value: 'change|desc', label: 'Biggest growth first' }, { value: `${c.metrics[0]?.id}|desc`, label: `Most ${c.metrics[0] ? metricLabelLower(c.metrics[0].id) : 'traffic'}` }, { value: 'name|asc', label: 'A–Z' }]} /></Field>
                    <Field label="Show as"><Choice ariaLabel="Show as" value={c.show} onChange={(v) => edit((w) => cfg(w as typeof widget, { show: v }))} options={[{ value: 'cards', label: 'Cards' }, { value: 'compact', label: 'Compact list' }]} /></Field>
                    <Field label="Sites shown before “Show all”"><NumberInput value={c.limit} min={1} max={200} onChange={(n) => edit((w) => cfg(w as typeof widget, { limit: n }), 'limit')} /></Field>
                    <Toggle label="Sparklines" checked={c.sparkline} onChange={(v) => edit((w) => cfg(w as typeof widget, { sparkline: v }))} />
                    <Toggle label="Drop alerts" checked={c.alerts} onChange={(v) => edit((w) => cfg(w as typeof widget, { alerts: v }))} />
                </>
            );
        }
    }
    return null;
}

function metricLabelLower(id: string): string {
    return metricLabel(id).toLowerCase();
}

function meta(w: WidgetDef) {
    return widgetMeta(w.type);
}

function TableSetup({ widget, edit, source, portfolio }: { widget: Extract<WidgetDef, { type: 'table' }>; edit: (fn: Patch, key?: string) => void; source: React.ReactNode; portfolio: boolean }) {
    const c = widget.config;
    const metricCols = c.columns.filter((col) => col.kind === 'metric');
    const metricRefs = metricCols.map((col) => ({ id: col.ref }));
    const setCols = (dims: string[], metrics: MetricRef[], keep: TableColumn[] = c.columns) => {
        const fresh = tableColumns(dims, metrics.map((m) => m.id));
        return fresh.map((col) => {
            const old = keep.find((k) => k.ref === col.ref && k.kind === col.kind);
            return old ? { ...col, visual: old.visual, showDelta: old.showDelta, label: old.label } : col;
        });
    };
    return (
        <>
            {source}
            <Field label="Rows"><DimensionPicker value={c.dimensions[0]} metrics={metricRefs.map((m) => m.id)} allowSite={portfolio} onChange={(d) => d && edit((w) => cfg(w as typeof widget, { dimensions: [d, ...c.dimensions.slice(1)], columns: setCols([d, ...c.dimensions.slice(1)], metricRefs) }))} /></Field>
            <Field label="Second dimension"><DimensionPicker value={c.dimensions[1]} metrics={metricRefs.map((m) => m.id)} allowNone ariaLabel="Second dimension" onChange={(d) => { const dims = d ? [c.dimensions[0], d] : [c.dimensions[0]]; edit((w) => cfg(w as typeof widget, { dimensions: dims, columns: setCols(dims, metricRefs) })); }} /></Field>
            <Field label="Columns (up to 10)"><MetricList value={metricRefs} max={10} onChange={(v) => edit((w) => cfg(w as typeof widget, { columns: setCols(c.dimensions, v), sort: v.some((m) => `m:${m.id}` === c.sort.by) ? c.sort : { by: `m:${v[0].id}`, dir: 'desc' } }))} /></Field>
            <Field label="Heat bars on">
                <Choice ariaLabel="Heat bars" value={metricCols.find((col) => col.visual === 'bar')?.ref ?? '__none'} onChange={(v) => edit((w) => cfg(w as typeof widget, { columns: c.columns.map((col): TableColumn => (col.kind === 'metric' ? { ...col, visual: col.ref === v ? 'bar' : 'none' } : col)) }))}
                    options={[{ value: '__none', label: 'No heat bars' }, ...metricCols.map((col) => ({ value: col.ref, label: dimLabelSafe(col.ref) }))]} />
            </Field>
            <Toggle label="Show change vs comparison" checked={metricCols.some((col) => col.showDelta)} onChange={(v) => edit((w) => cfg(w as typeof widget, { columns: c.columns.map((col) => (col.kind === 'metric' ? { ...col, showDelta: v } : col)) }))} />
            <Field label="Sort by">
                <Choice ariaLabel="Sort by" value={`${c.sortByChange ? 'chg:' : ''}${c.sort.by}|${c.sort.dir}`} onChange={(v) => { const [raw, dir] = v.split('|'); const chg = raw.startsWith('chg:'); edit((w) => cfg(w as typeof widget, { sort: { by: raw.replace(/^chg:/, ''), dir: dir as 'asc' | 'desc' }, sortByChange: chg })); }}
                    options={metricCols.flatMap((col) => [
                        { value: `${col.id}|desc`, label: `${dimLabelSafe(col.ref)}, highest first` },
                        { value: `${col.id}|asc`, label: `${dimLabelSafe(col.ref)}, lowest first` },
                        { value: `chg:${col.id}|desc`, label: `${dimLabelSafe(col.ref)}, biggest rise` },
                        { value: `chg:${col.id}|asc`, label: `${dimLabelSafe(col.ref)}, biggest drop` },
                    ])} />
            </Field>
            <Field label="Rows per page"><Choice ariaLabel="Rows per page" value={String(c.pageSize) as '10'} onChange={(v) => edit((w) => cfg(w as typeof widget, { pageSize: Number(v) as 10 }))} options={['5', '10', '25', '50', '100'].map((v) => ({ value: v as '10', label: v }))} /></Field>
            <Field label="Rows to fetch" hint="Search Console returns the top rows by clicks."><NumberInput value={c.maxRows} min={10} max={5000} onChange={(n) => edit((w) => cfg(w as typeof widget, { maxRows: n }), 'maxRows')} /></Field>
            <Toggle label="Pagination" checked={c.pagination} onChange={(v) => edit((w) => cfg(w as typeof widget, { pagination: v }))} />
            <Toggle label="Search box" checked={c.search} onChange={(v) => edit((w) => cfg(w as typeof widget, { search: v }))} />
            <Toggle label="Totals row" checked={c.totalsRow} onChange={(v) => edit((w) => cfg(w as typeof widget, { totalsRow: v }))} />
            <TrendToggle widget={widget} edit={edit} />
            <div className="border-t border-border-subtle pt-4"><RulesEditor widget={widget} edit={edit} /></div>
        </>
    );
}

/** Trend column (round 7): each row's line of the sort metric, top rows only; says why when a table cannot have one. */
function TrendToggle({ widget, edit }: { widget: Extract<WidgetDef, { type: 'table' }>; edit: (fn: Patch, key?: string) => void }) {
    const why = trendUnsupported(widget);
    const metric = trendMetric(widget);
    return (
        <Toggle
            label="Trend column"
            checked={Boolean(widget.config.trend) && !why}
            disabled={Boolean(why)}
            onChange={(v) => edit((w) => cfg(w as typeof widget, { trend: v || undefined }))}
            description={why ?? `A line of ${metric ? metricLabelLower(metric) : 'the sort metric'} per row over the date range, for the top ${TABLE_TREND_ROWS} rows. Daily up to ${TREND_DAILY_MAX_DAYS} days, then weekly.`}
        />
    );
}

/** Goal for the period on a scorecard (round 2): progress bar and colour under the number. */
function ScorecardTarget({ widget, edit }: { widget: Extract<WidgetDef, { type: 'scorecard' }>; edit: (fn: Patch, key?: string) => void }) {
    const t = widget.config.target;
    const [draft, setDraft] = useState(t ? String(t.value) : '');
    const pct = getMetric(widget.config.metric.id)?.format === 'percent';
    const commit = (raw: string) => {
        setDraft(raw);
        const n = Number(raw.replace(/[,\s%]/g, ''));
        edit((w) => cfg(w as typeof widget, { target: raw.trim() && Number.isFinite(n) && n > 0 ? { value: pct ? n / 100 : n, label: t?.label } : undefined }), 'target');
    };
    return (
        <Field label="Target for the period" hint={pct ? 'In %. Shows progress and turns green when met.' : 'Shows progress and turns green when met. For position, lower is better.'}>
            <div className="flex items-center gap-2">
                <input aria-label="Target" inputMode="decimal" value={draft} placeholder={pct ? 'e.g. 3' : 'e.g. 5000'} onChange={(e) => commit(e.target.value)} className="h-9 w-28 rounded-control border border-border bg-surface px-3 text-body tabular-nums text-fg" />
                {t ? <input aria-label="Target label" value={t.label ?? ''} placeholder="Label (Goal)" maxLength={40} onChange={(e) => edit((w) => cfg(w as typeof widget, { target: { value: t.value, label: e.target.value || undefined } }), 'target-label')} className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-body text-fg" /> : null}
            </div>
        </Field>
    );
}

function dimLabelSafe(id: string): string {
    return id.includes(':') ? metricLabel(id) : dimLabel(id);
}

function Style({ widget, edit }: { widget: WidgetDef; edit: (fn: Patch, key?: string) => void }) {
    const s = widget.style ?? {};
    const setStyle = (patch: Partial<NonNullable<WidgetDef['style']>>) => edit((w) => ({ ...w, style: { ...(w.style ?? {}), ...patch } }) as WidgetDef);
    const isContent = widget.type === 'text' || widget.type === 'section' || widget.type === 'image';
    return (
        <>
            {!isContent ? (
                <>
                    <Field label="Title"><TextInput value={widget.title ?? ''} placeholder="Automatic" onChange={(v) => edit((w) => ({ ...w, title: v.slice(0, 200) || undefined }) as WidgetDef, 'title')} /></Field>
                    <Toggle label="Show title" checked={widget.showTitle !== false} onChange={(v) => edit((w) => ({ ...w, showTitle: v }) as WidgetDef)} />
                    <Field label="Description" hint="Shown as an info tooltip next to the title."><TextInput multiline rows={2} value={widget.description ?? ''} onChange={(v) => edit((w) => ({ ...w, description: v.slice(0, 1000) || undefined }) as WidgetDef, 'desc')} /></Field>
                    <Field label="Title size"><Choice ariaLabel="Title size" value={s.titleSize ?? 'md'} onChange={(v) => setStyle({ titleSize: v })} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Default' }, { value: 'lg', label: 'Large' }]} /></Field>
                    <Field label="Padding"><Choice ariaLabel="Padding" value={s.padding ?? 'md'} onChange={(v) => setStyle({ padding: v })} options={[{ value: 'md', label: 'Default' }, { value: 'sm', label: 'Compact' }, { value: 'none', label: 'None' }]} /></Field>
                </>
            ) : null}
            {widget.type === 'text' || !isContent ? <Field label="Background"><Choice ariaLabel="Background" value={s.background ?? (widget.type === 'text' ? 'transparent' : 'surface')} onChange={(v) => setStyle({ background: v })} options={[{ value: 'surface', label: 'Card' }, { value: 'transparent', label: 'None' }]} /></Field> : null}
            <Toggle label="Hide on phones" checked={Boolean(widget.mobile?.hidden)} onChange={(v) => edit((w) => ({ ...w, mobile: { ...(w.mobile ?? {}), hidden: v } }) as WidgetDef)} />
            <p className="flex items-start gap-2 rounded-control bg-surface-sunken p-3 text-meta text-fg-muted"><Lock aria-hidden size={14} className="mt-0.5 shrink-0" />Colours follow the metric so they mean the same everywhere.</p>
        </>
    );
}

// ── Filter control ───────────────────────────────────────────────────────

function ControlProps({ control, doc }: { control: FilterControl; doc: DashboardDocV2 }) {
    const apply = useEditorStore((s) => s.apply);
    const selectControl = useEditorStore((s) => s.selectControl);
    const set = (patch: Partial<FilterControl>, key?: string) => apply((d) => ({ ...d, controls: d.controls.map((c) => (c.id === control.id ? ({ ...c, ...patch } as ControlDef) : c)) }), { coalesce: key ? `${control.id}:${key}` : undefined });
    const affected = Object.values(doc.widgets).filter((w) => !widgetMeta(w.type).static).length;
    return (
        <>
            <div className="border-b border-border-subtle px-4 py-3"><p className="text-caption uppercase tracking-[0.04em] text-fg-muted">Filter control</p></div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <Field label="Label"><TextInput value={control.label} onChange={(v) => set({ label: v.slice(0, 60) }, 'label')} /></Field>
                <Field label="Filters by"><DimensionPicker value={control.dimension} metrics={['ga4:sessions']} onChange={(d) => d && set({ dimension: d, label: dimLabel(d), default: [] })} /></Field>
                <Field label="Looks like"><Choice ariaLabel="Control type" value={control.ui} onChange={(v) => set({ ui: v })} options={[{ value: 'multiselect', label: 'Pick several' }, { value: 'select', label: 'Pick one' }, { value: 'search', label: 'Contains text' }]} /></Field>
                <Field label="Applies to"><Choice ariaLabel="Scope" value={control.scope.mode === 'pages' ? 'page' : 'all'} onChange={(v) => set({ scope: v === 'all' ? { mode: 'all' } : { mode: 'pages', pageIds: [useEditorStore.getState().pageId ?? doc.pages[0].id] } })} options={[{ value: 'all', label: 'All pages' }, { value: 'page', label: 'This page only' }]} /></Field>
                <p className="text-meta text-fg-muted">Affects up to {affected} widgets. Widgets without this dimension (for example Search Console widgets and Channel) show a “filter not applied” note.</p>
                <Toggle label="Viewers can change it" checked={control.viewerCanChange} onChange={(v) => set({ viewerCanChange: v })} />
            </div>
            <div className="border-t border-border-subtle p-3">
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => { apply((d) => ({ ...d, controls: d.controls.filter((c) => c.id !== control.id) })); selectControl(null); }}>Remove control</Button>
            </div>
        </>
    );
}

// ── Dashboard settings ───────────────────────────────────────────────────

function DashboardSettings({ doc, sites }: { doc: DashboardDocV2; sites: SiteOption[] }) {
    const apply = useEditorStore((s) => s.apply);
    const appMode = useResolvedTheme();
    const [tab, setTab] = useState<'general' | 'appearance'>(() => (typeof window !== 'undefined' && (window as { __tcDashTab?: string }).__tcDashTab === 'appearance' ? 'appearance' : 'general'));
    useEffect(() => {
        // The editor toolbar's Theme button opens this tab (see APPEARANCE_EVENT).
        const open = () => setTab('appearance');
        window.addEventListener(APPEARANCE_EVENT, open);
        return () => window.removeEventListener(APPEARANCE_EVENT, open);
    }, []);
    const dc = doc.controls.find((c) => c.type === 'date');
    const set = (fn: (d: DashboardDocV2) => DashboardDocV2, key?: string) => apply(fn, { coalesce: key ? `doc:${key}` : undefined });
    const setDate = (patch: Record<string, unknown>) => set((d) => ({ ...d, controls: d.controls.map((c) => (c.type === 'date' ? ({ ...c, ...patch } as ControlDef) : c)) }));
    return (
        <>
            <div className="border-b border-border-subtle px-4 pb-2 pt-3">
                <p className="text-caption uppercase tracking-[0.04em] text-fg-muted">Dashboard settings</p>
                <Tabs variant="pills" ariaLabel="Dashboard settings" value={tab} onValueChange={(v) => setTab(v as 'general' | 'appearance')} items={[{ value: 'general', label: 'General' }, { value: 'appearance', label: 'Appearance' }]} className="mt-2" />
            </div>
            {tab === 'appearance' ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <AppearanceSettings theme={doc.theme} mode={appMode} pages={doc.pages.filter((p) => !p.hidden).length} onChange={(t) => set((d) => ({ ...d, theme: t }), 'theme')} />
                </div>
            ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <Field label="Name"><TextInput value={doc.name} onChange={(v) => set((d) => ({ ...d, name: v.slice(0, 200) || d.name }), 'name')} /></Field>
                <Field label="Description"><TextInput multiline rows={2} value={doc.description ?? ''} onChange={(v) => set((d) => ({ ...d, description: v.slice(0, 2000) || undefined }), 'desc')} /></Field>
                <Field label="Default site" hint="Widgets set to “Default” read this site.">
                    <SourcePicker value={doc.defaultSource} allowDefault={false} sites={sites} onChange={(s) => s.type !== 'default' && set((d) => ({ ...d, defaultSource: s }))} />
                </Field>
                {dc && dc.type === 'date' ? (
                    <>
                        <Field label="Default date range">
                            <Choice ariaLabel="Default date range" value={dc.default.kind === 'preset' ? dc.default.id : '28d'} onChange={(v) => setDate({ default: { kind: 'preset', id: v } })} options={presetOptions(dc.default.kind === 'preset' ? dc.default.id : null)} />
                        </Field>
                        <Field label="Compare to">
                            <Choice ariaLabel="Default comparison" value={dc.defaultCompare.mode === 'custom' ? 'none' : dc.defaultCompare.mode} onChange={(v) => setDate({ defaultCompare: { mode: v } })} options={[{ value: 'previous_period', label: 'Previous period' }, { value: 'previous_year', label: 'Same period last year' }, { value: 'none', label: 'No comparison' }]} />
                        </Field>
                        <Toggle label="Viewers can change dates" checked={dc.viewerCanChange} onChange={(v) => setDate({ viewerCanChange: v })} />
                    </>
                ) : null}
                <Field label="Appearance for shared links"><Choice ariaLabel="Appearance" value={doc.theme.mode} onChange={(v) => set((d) => ({ ...d, theme: { ...d.theme, mode: v } }))} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Match viewer' }]} /></Field>
                <Toggle label="Show dates under the title" checked={doc.theme.header.showDates} onChange={(v) => set((d) => ({ ...d, theme: { ...d.theme, header: { ...d.theme.header, showDates: v } } }))} />
                <Field label="Width"><Choice ariaLabel="Width" value={doc.settings.widthMode} onChange={(v) => set((d) => ({ ...d, settings: { ...d.settings, widthMode: v } }))} options={[{ value: 'contained', label: 'Contained' }, { value: 'full', label: 'Full width' }]} /></Field>
                <Field label="Auto-refresh"><Choice ariaLabel="Auto-refresh" value={String(doc.settings.autoRefreshSec) as '0'} onChange={(v) => set((d) => ({ ...d, settings: { ...d.settings, autoRefreshSec: Number(v) as 0 } }))} options={[{ value: '0', label: 'Off' }, { value: '300', label: 'Every 5 minutes' }, { value: '900', label: 'Every 15 minutes' }, { value: '1800', label: 'Every 30 minutes' }, { value: '3600', label: 'Every hour' }]} /></Field>
                <div className="border-t border-border-subtle pt-4"><VariablesEditor doc={doc} set={set} /></div>
                <div className="border-t border-border-subtle pt-4"><CalcList doc={doc} /></div>
                <div className="space-y-3 border-t border-border-subtle pt-4">
                    <p className="text-caption uppercase tracking-[0.04em] text-fg-muted">TV mode</p>
                    <Field label="Change page every" hint={doc.pages.filter((p) => !p.hidden).length > 1 ? 'Open with Present, or add ?tv=1 to the dashboard or share link. Data refreshes at least every 5 minutes.' : 'Add pages to rotate them. Open with Present, or add ?tv=1 to the link.'}>
                        <Choice ariaLabel="Rotate pages" value={String(doc.settings.tv?.rotateSec ?? 30) as '30'} onChange={(v) => set((d) => ({ ...d, settings: { ...d.settings, tv: { rotateSec: Number(v) as 30, hideControls: d.settings.tv?.hideControls ?? true } } }))}
                            options={[{ value: '0', label: 'Do not rotate' }, { value: '15', label: '15 seconds' }, { value: '30', label: '30 seconds' }, { value: '60', label: '1 minute' }, { value: '120', label: '2 minutes' }]} />
                    </Field>
                    <Toggle label="Hide filters in TV mode" checked={doc.settings.tv?.hideControls ?? true} onChange={(v) => set((d) => ({ ...d, settings: { ...d.settings, tv: { rotateSec: d.settings.tv?.rotateSec ?? 30, hideControls: v } } }))} />
                </div>
            </div>
            )}
        </>
    );
}
