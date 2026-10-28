'use client';

/**
 * Settings of the round 7 viewer switchers in the editor's properties panel: the site switcher (which of
 * the owner's sites viewers may pick, where it starts, whether share-link viewers may switch), the metric
 * switcher (default metric and the list viewers pick from) and the Day / Week / Month control.
 * Viewer picks are never saved; these settings are.
 */
import { Trash2 } from 'lucide-react';

import { Button, Checkbox } from '@/components/ui';
import { metricLabel } from '@/lib/builder/catalog';
import { followsMetricControl } from '@/lib/builder/compile';
import { widgetMeta } from '@/lib/builder/registry';
import type { ControlDef, ControlScope, DashboardDocV2, GrainControl, MetricControl, MetricRef, SiteControl } from '@/lib/builder/types';
import { useEditorStore } from '@/stores/dashboardEditorStore';
import { Choice, Field, MetricList, MetricPicker, TextInput, Toggle, type SiteOption } from './Fields';

type SwitchControl = SiteControl | MetricControl | GrainControl;

function useControlEdit<C extends SwitchControl>(control: C) {
    const apply = useEditorStore((s) => s.apply);
    const selectControl = useEditorStore((s) => s.selectControl);
    const set = (patch: Partial<C>, key?: string) =>
        apply((d) => ({ ...d, controls: d.controls.map((c) => (c.id === control.id ? ({ ...c, ...patch } as ControlDef) : c)) }), { coalesce: key ? `${control.id}:${key}` : undefined });
    const remove = () => {
        apply((d) => ({ ...d, controls: d.controls.filter((c) => c.id !== control.id) }));
        // Drop the editor's current pick for it too.
        const st = useEditorStore.getState();
        if (st.controls) {
            const { site, metric, grain } = st.controls;
            const drop = <T,>(r?: Record<string, T>) => (r && control.id in r ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== control.id)) : r);
            st.setControls({ ...st.controls, site: drop(site), metric: drop(metric), grain: drop(grain) });
        }
        selectControl(null);
    };
    return { set, remove };
}

function ScopeField({ scope, doc, onChange }: { scope: ControlScope; doc: DashboardDocV2; onChange: (s: ControlScope) => void }) {
    return (
        <Field label="Applies to">
            <Choice ariaLabel="Scope" value={scope.mode === 'pages' ? 'page' : 'all'}
                onChange={(v) => onChange(v === 'all' ? { mode: 'all' } : { mode: 'pages', pageIds: [useEditorStore.getState().pageId ?? doc.pages[0].id] })}
                options={[{ value: 'all', label: 'All pages' }, { value: 'page', label: 'This page only' }]} />
        </Field>
    );
}

function Shell({ title, children, onRemove }: { title: string; children: React.ReactNode; onRemove: () => void }) {
    return (
        <>
            <div className="border-b border-border-subtle px-4 py-3"><p className="text-caption uppercase tracking-[0.04em] text-fg-muted">{title}</p></div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
            <div className="border-t border-border-subtle p-3">
                <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove}>Remove control</Button>
            </div>
        </>
    );
}

/** Widgets in a control's scope on its pages (data widgets only). */
function scopedWidgets(doc: DashboardDocV2, control: SwitchControl) {
    const scope = control.scope;
    const pages = scope.mode === 'pages' ? doc.pages.filter((p) => scope.pageIds.includes(p.id)) : doc.pages;
    return pages.flatMap((p) => p.layouts.lg.map((l) => ({ w: doc.widgets[l.i], pageId: p.id })))
        .filter((x) => x.w && !widgetMeta(x.w.type).static && !(x.w.ignoreControls ?? []).includes(control.id) && (scope.mode !== 'widgets' || scope.widgetIds.includes(x.w.id)));
}

// ── Site switcher ────────────────────────────────────────────────────────

export function SiteControlProps({ control, doc, sites, defaultLabel }: { control: SiteControl; doc: DashboardDocV2; sites: SiteOption[]; defaultLabel: string }) {
    const { set, remove } = useControlEdit(control);
    const only = control.options !== 'all';
    const picked = new Set(only ? (control.options as string[]) : []);
    const allowed = only ? sites.filter((s) => picked.has(s.siteId)) : sites;
    const following = scopedWidgets(doc, control).filter((x) => !x.w.source || x.w.source.type === 'default').length;
    const toggleSite = (id: string, on: boolean) => {
        const next = on ? [...picked, id] : [...picked].filter((x) => x !== id);
        set({ options: sites.filter((s) => next.includes(s.siteId)).map((s) => s.siteId), ...(control.default && !next.includes(control.default) ? { default: '' } : {}) });
    };
    return (
        <Shell title="Site switcher" onRemove={remove}>
            <Field label="Label"><TextInput value={control.label} onChange={(v) => set({ label: v.slice(0, 60) }, 'label')} /></Field>
            <Field label="Sites viewers can pick" hint={only ? `${allowed.length} of ${sites.length} sites` : `All ${sites.length} of your sites, including sites you connect later.`}>
                <Choice ariaLabel="Sites viewers can pick" value={only ? 'only' : 'all'}
                    onChange={(v) => set(v === 'all' ? { options: 'all' } : { options: sites.map((s) => s.siteId) })}
                    options={[{ value: 'all', label: 'All my sites' }, { value: 'only', label: 'Only the sites I tick' }]} />
            </Field>
            {only ? (
                <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-control border border-border-subtle p-1.5" role="group" aria-label="Allowed sites">
                    {sites.map((s) => (
                        <div key={s.siteId} className="rounded-md px-1.5 py-1 hover:bg-subtle">
                            <Checkbox checked={picked.has(s.siteId)} onCheckedChange={(c) => toggleSite(s.siteId, c)} label={s.label} />
                        </div>
                    ))}
                    {!sites.length ? <p className="px-2 py-2 text-body-sm text-fg-muted">Connect Google to list your sites.</p> : null}
                </div>
            ) : null}
            <Field label="Starts on">
                <Choice ariaLabel="Starts on" value={control.default || '__default'} onChange={(v) => set({ default: v === '__default' ? '' : v })}
                    options={[{ value: '__default', label: `Dashboard default (${defaultLabel})` }, ...allowed.map((s) => ({ value: s.siteId, label: s.label }))]} />
            </Field>
            <ScopeField scope={control.scope} doc={doc} onChange={(scope) => set({ scope })} />
            <p className="text-meta text-fg-muted">{following} widget{following === 1 ? '' : 's'} read the dashboard’s default site and follow this switcher. Widgets set to a fixed site or to All sites stay as they are.</p>
            <Toggle label="Share-link viewers can switch" checked={Boolean(control.viewerCanChange)} onChange={(v) => set({ viewerCanChange: v })}
                description={control.viewerCanChange ? 'Anyone with the link or embed sees the names of the sites you allow, never their ids. Their picks are not saved.' : 'Only you can switch. Share links show the starting site.'} />
        </Shell>
    );
}

// ── Metric switcher ──────────────────────────────────────────────────────

export function MetricControlProps({ control, doc }: { control: MetricControl; doc: DashboardDocV2 }) {
    const { set, remove } = useControlEdit(control);
    const pageId = useEditorStore((s) => s.pageId) ?? undefined;
    const options = control.options.includes(control.default) ? control.options : [control.default, ...control.options];
    const following = scopedWidgets(doc, control).filter((x) => followsMetricControl(control, x.w, { controlDefs: doc.controls, pageId: x.pageId ?? pageId })).length;
    const families = new Set(options.map((id) => (id.startsWith('gsc:') ? 'gsc' : 'ga4')));
    return (
        <Shell title="Metric switcher" onRemove={remove}>
            <Field label="Label"><TextInput value={control.label} onChange={(v) => set({ label: v.slice(0, 60) }, 'label')} /></Field>
            <Field label="Widgets showing" hint="Widgets in scope that show this metric follow the switcher; their other metrics stay.">
                <MetricPicker value={control.default} ariaLabel="Default metric" onChange={(id) => set({ default: id, options: [id, ...options.filter((o) => o !== id && o !== control.default)] })} />
            </Field>
            <Field label="Viewers can pick" hint={`${options.length} metrics, up to 8.`}>
                <MetricList value={options.map((id): MetricRef => ({ id }))} min={2} max={8}
                    onChange={(refs) => {
                        const ids = [...new Set(refs.map((r) => r.id))];
                        set({ options: ids, ...(ids.includes(control.default) ? {} : { default: ids[0] }) });
                    }} />
            </Field>
            <ScopeField scope={control.scope} doc={doc} onChange={(scope) => set({ scope })} />
            <p className="text-meta text-fg-muted">{following} widget{following === 1 ? '' : 's'} show {metricLabel(control.default).toLowerCase()} and follow this switcher.{families.size > 1 ? ' Search Console and Analytics metrics are mixed: a widget broken down by an Analytics-only dimension shows a note for Search Console picks.' : ''}</p>
        </Shell>
    );
}

// ── Day / Week / Month ───────────────────────────────────────────────────

const GRAINS: Array<{ value: GrainControl['default']; label: string }> = [
    { value: 'auto', label: 'Auto (each chart’s own)' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
];

export function GrainControlProps({ control, doc }: { control: GrainControl; doc: DashboardDocV2 }) {
    const { set, remove } = useControlEdit(control);
    const following = scopedWidgets(doc, control).filter((x) => x.w.type === 'timeseries').length;
    const toggle = (g: GrainControl['default'], on: boolean) => {
        const next = GRAINS.map((x) => x.value).filter((v) => (v === g ? on : control.options.includes(v)));
        if (next.length < 2) return;
        set({ options: next, ...(next.includes(control.default) ? {} : { default: next[0] }) });
    };
    return (
        <Shell title="Day / Week / Month" onRemove={remove}>
            <Field label="Label"><TextInput value={control.label} onChange={(v) => set({ label: v.slice(0, 60) }, 'label')} /></Field>
            <Field label="Choices" hint="At least two.">
                <div className="space-y-1" role="group" aria-label="Choices">
                    {GRAINS.map((g) => <Checkbox key={g.value} checked={control.options.includes(g.value)} onCheckedChange={(c) => toggle(g.value, c)} label={g.label} />)}
                </div>
            </Field>
            <Field label="Starts on">
                <Choice ariaLabel="Starts on" value={control.default} onChange={(v) => set({ default: v })} options={GRAINS.filter((g) => control.options.includes(g.value))} />
            </Field>
            <ScopeField scope={control.scope} doc={doc} onChange={(scope) => set({ scope })} />
            <p className="text-meta text-fg-muted">{following} time series follow this control. Scorecard sparklines stay daily.</p>
        </Shell>
    );
}

// ── New controls ─────────────────────────────────────────────────────────

const rid = () => Math.random().toString(36).slice(2, 6);

export function newSiteControl(): SiteControl {
    return { id: `s_site_${rid()}`, type: 'site', label: 'Site', options: 'all', default: '', scope: { mode: 'all' }, viewerCanChange: false };
}

/** A metric switcher bound to the most common metric on the dashboard, with a sensible partner list. */
export function newMetricControl(doc: DashboardDocV2): MetricControl {
    const counts = new Map<string, number>();
    for (const w of Object.values(doc.widgets)) {
        if (w.type === 'timeseries') for (const s of w.config.series) counts.set(s.metric.id, (counts.get(s.metric.id) ?? 0) + 1);
        if (w.type === 'scorecard') counts.set(w.config.metric.id, (counts.get(w.config.metric.id) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'gsc:clicks';
    const partners = top.startsWith('gsc:') ? ['gsc:clicks', 'gsc:impressions', 'gsc:ctr', 'gsc:position'] : ['ga4:sessions', 'ga4:totalUsers', 'ga4:screenPageViews', 'ga4:keyEvents'];
    return { id: `m_metric_${rid()}`, type: 'metric', label: 'Metric', options: [top, ...partners.filter((p) => p !== top)], default: top, scope: { mode: 'all' } };
}

export function newGrainControl(): GrainControl {
    return { id: `g_grain_${rid()}`, type: 'grain', label: 'Group by', options: ['auto', 'day', 'week', 'month'], default: 'auto', scope: { mode: 'all' } };
}
