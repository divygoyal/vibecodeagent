'use client';

/**
 * Read-only dashboard (owner view route and public share/embed). Fully responsive: the grid
 * follows the container width (12 / 6 / 1 columns), filters collapse into a drawer on phones,
 * state lives in the URL (?page=&range=&compare=&f.<id>=) so every view is linkable.
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { useElementWidth } from './useElementWidth';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui';
import { fmtDateRange } from '@/lib/format';
import { registerCalcs } from '@/lib/builder/calc';
import { compareFromParam, compareToParam, rangeFromParam, rangeToParam } from '@/lib/builder/dates';
import { dateControlOf, defaultControlState, viewerSwitchesFromQuery } from '@/lib/builder/publicDoc';
import { viewerMayCompare } from '@/lib/builder/compare';
import { effectiveParams, isStateKey, NO_DEFAULT_KEY, viewLink } from '@/lib/builder/savedViews';
import { applyViewerControls, selectedSite } from '@/lib/builder/compile';
import { drillDown, drillFromParams, drillInfo, drillKeyLabel, drillTo, drillToParam, keepDrillKey, resolveDrillValue } from '@/lib/builder/drill';
import { dimLabel } from '@/lib/builder/catalog';
import { isDefaultLook, type Mode } from '@/lib/builder/themes';
import { clickDimension, clickableDims, interactionFromParam, toggleInteraction } from '@/lib/builder/interaction';
import { variableControls, variableValues } from '@/lib/builder/variables';
import type { ControlState, DashboardDocV2, DashboardQueryResponse, FilterControl, ResolvedDates, SiteControl, WidgetDef } from '@/lib/builder/types';
import { DashboardCanvas, bpForWidth, type Bp } from './DashboardCanvas';
import { ControlsBar, DateControl, PageTabs, switchSummary, ViewerSwitches, type OptionsSource, type ViewerSwitchHandlers } from './Controls';
import { DashboardCover } from './DashboardCover';
import { ViewsMenu, type ViewsHandlers } from './ViewsMenu';
import { ChartNotesProvider, type ChartNotesSource } from './charts/chartNotes';
import type { DrillView } from './widgets/DrillCrumbs';
import { dimText } from './widgets/Charts';
import { InteractionChips, interactionToParam, VariableInput } from './Interactions';
import { dashRootProps } from './theme/DashTheme';
import { WidgetRenderer } from './widgets/WidgetRenderer';

/** Viewer state <-> URL. Only keys the viewer may change are read. */
export function useUrlControls(doc: Pick<DashboardDocV2, 'controls' | 'pages'> & { widgets?: DashboardDocV2['widgets'] }, allow: { date: boolean; compare: boolean; filters: boolean }, opts: { publicKeys?: boolean; defaultQuery?: string } = {}) {
    const publicKeys = Boolean(opts.publicKeys);
    const rawSp = useSearchParams();
    // Round 9: the default view's state stands in when the URL carries none (and moves into the URL on the first change).
    const defaultQuery = opts.defaultQuery;
    const sp = useMemo(() => effectiveParams(new URLSearchParams(rawSp.toString()), defaultQuery), [rawSp, defaultQuery]);
    const router = useRouter();
    const pathname = usePathname();
    const state = useMemo<ControlState>(() => {
        const base = defaultControlState(doc);
        const dc = dateControlOf(doc);
        const range = allow.date && dc.viewerCanChange ? rangeFromParam(sp.get('range'), sp.get('from'), sp.get('to')) : null;
        const compare = viewerMayCompare({ date: allow.date, compare: allow.compare }, dc) ? compareFromParam(sp.get('compare')) : null;
        const filters = { ...base.filters };
        if (allow.filters) {
            for (const c of doc.controls) {
                // Variables (round 2) keep their raw text: a pattern may contain commas.
                if (c.type === 'variable' && c.viewerCanChange) {
                    const raw = sp.get(`f.${c.id}`);
                    if (raw) filters[c.id] = [raw.slice(0, 300)];
                    continue;
                }
                if (c.type !== 'filter') continue;
                const raw = sp.get(`f.${c.id}`);
                if (raw !== null) {
                    const v = raw.split(',').map((x) => x.trim()).filter(Boolean);
                    if (v.length) filters[c.id] = v;
                    else delete filters[c.id];
                }
            }
        }
        const page = sp.get('page');
        const visible = doc.pages.filter((p) => !p.hidden);
        // Click to filter (round 2): only dimensions of widgets that allow it.
        const interaction = allow.filters && doc.widgets && sp.get('x') ? interactionFromParam(sp.get('x'), clickableDims({ widgets: doc.widgets })) : [];
        // Round 7 switchers: m.<id> / g.<id> must be an option; s.<id> passes as is (the server checks it).
        const switches = viewerSwitchesFromQuery(sp, doc, (picks) => picks);
        // Drill down (round 8): a viewer filter like x=, so it follows the same permission. Owner views read the
        // values; public pages keep the signed keys the server issued (the server verifies them).
        const drill = allow.filters ? drillFromParams(sp, doc.widgets, publicKeys ? keepDrillKey : resolveDrillValue) : undefined;
        return {
            date: { range: range ?? base.date.range, compare: compare ?? base.date.compare },
            filters,
            pageId: page && visible.some((p) => p.id === page) ? page : visible[0]?.id,
            ...(interaction.length ? { interaction } : {}),
            ...switches,
            ...(drill ? { drill } : {}),
        };
    }, [sp, doc, allow.date, allow.compare, allow.filters, publicKeys]);

    const set = useCallback((patch: Record<string, string | null>) => {
        const next = new URLSearchParams(sp.toString());
        for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
        }
        // A viewer who cleared the default view's state keeps it cleared.
        if (defaultQuery) {
            const real = [...next.keys()].some((k) => k !== 'page' && k !== NO_DEFAULT_KEY && isStateKey(k));
            if (real) next.delete(NO_DEFAULT_KEY);
            else next.set(NO_DEFAULT_KEY, '0');
        }
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, [sp, router, pathname, defaultQuery]);
    /** Opens a saved view: its state replaces the state keys of the URL (tv, embed and theme stay). */
    const applyView = useCallback((query: string) => {
        const next = new URLSearchParams(rawSp.toString());
        for (const k of [...next.keys()]) if (isStateKey(k) && k !== 'page') next.delete(k);
        for (const [k, v] of new URLSearchParams(query)) next.set(k, v);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, [rawSp, router, pathname]);
    /** Back to what the dashboard opens with: no state keys (the default view, when there is one, applies again). */
    const resetView = useCallback(() => {
        const next = new URLSearchParams(rawSp.toString());
        for (const k of [...next.keys()]) if (isStateKey(k) && k !== 'page') next.delete(k);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, [rawSp, router, pathname]);

    return {
        state,
        setPage: (id: string) => set({ page: id }),
        setDate: (range: ControlState['date']['range'], compare: ControlState['date']['compare']) => set({ range: rangeToParam(range), compare: compareToParam(compare), from: null, to: null }),
        setFilter: (id: string, values: string[]) => set({ [`f.${id}`]: values.length ? values.join(',') : null }),
        /** TV mode (round 2): ?tv=1. */
        setTv: (on: boolean) => set({ tv: on ? '1' : null }),
        /** Dashboard variable (round 2); null = back to the default. */
        setVariable: (id: string, value: string | null) => set({ [`f.${id}`]: value }),
        /** Click-to-filter selections (round 2). */
        setInteraction: (clauses: import('@/lib/builder/types').FilterClause[]) => set({ x: interactionToParam(clauses) }),
        /** Viewer switchers (round 7); null = back to the control's default. Never saved to the dashboard. */
        setSite: (id: string, value: string | null) => set({ [`s.${id}`]: value }),
        setMetric: (id: string, value: string | null) => set({ [`m.${id}`]: value }),
        setGrain: (id: string, value: string | null) => set({ [`g.${id}`]: value }),
        setSearchType: (id: string, value: string | null) => set({ [`t.${id}`]: value }),
        /** Drill down (round 8): the values clicked so far on one widget (empty = back to its own dimension). */
        setDrill: (widgetId: string, path: string[]) => set({ [`d.${widgetId}`]: drillToParam(path) }),
        applyView,
        resetView,
        /** The link to the viewer's current view (state keys only). */
        viewLink: () => viewLink(window.location.origin, pathname, sp),
        query: sp,
    };
}

export function textVars(siteLabel: string, resolved: ResolvedDates | undefined, pageTitle: string): Record<string, string> {
    return {
        site: siteLabel,
        page: pageTitle,
        date_range: resolved ? fmtDateRange(resolved.range.start, resolved.range.end) : '',
        compare_range: resolved?.compare ? `compared with ${fmtDateRange(resolved.compare.start, resolved.compare.end)}` : 'no comparison',
    };
}

/** Label of the site a site control currently shows (undefined = the dashboard's default site). */
export function pickedSiteLabel(c: SiteControl, state: ControlState, options: Array<{ value: string; label: string }>): string | undefined {
    // Public docs: the pick is an opaque key and the control's options are those keys.
    const v = c.choices ? (state.site?.[c.id] && c.options.includes(state.site[c.id]) ? state.site[c.id] : c.default) : selectedSite(c, state);
    return v ? options.find((o) => o.value === v)?.label : undefined;
}

/** Site options of a site control on a public doc (opaque keys). */
export function publicSiteOptions(c: SiteControl): Array<{ value: string; label: string }> {
    return (c.choices ?? []).map((o) => ({ value: o.key, label: o.label }));
}

/** "acme.com · Impressions · Weekly": the switcher picks, for the PDF header and the TV bar. */
export function viewerSelection(doc: Pick<DashboardDocV2, 'controls'>, state: ControlState, siteOptions: ((c: SiteControl) => Array<{ value: string; label: string }>) | undefined, defaultSiteLabel: string): string {
    return switchSummary(doc.controls, state, (c) => (siteOptions ? pickedSiteLabel(c, state, siteOptions(c)) ?? defaultSiteLabel : undefined));
}

export interface DashboardViewProps {
    doc: DashboardDocV2;
    mode: 'view' | 'public';
    siteLabel: string;
    state: ControlState;
    onPage: (id: string) => void;
    onDate: (range: ControlState['date']['range'], compare: ControlState['date']['compare']) => void;
    onFilter: (id: string, values: string[]) => void;
    allow: { date: boolean; compare: boolean; filters: boolean };
    data?: DashboardQueryResponse;
    loading: boolean;
    refetching: boolean;
    onRetry: () => void;
    options: OptionsSource;
    /** Title row (logo, title, actions). */
    header?: ReactNode;
    footer?: ReactNode;
    /** Content root for PDF export. */
    exportRef?: React.Ref<HTMLDivElement>;
    onChooseSource?: () => void;
    /**
     * Round 2 themes. 'panel': this view is the themed root (owner view inside the app: the
     * dashboard sits on its theme's canvas). 'inherit': a parent already carries the theme (share
     * link, embed, TV mode). Default look: no attributes at all, today's DOM.
     */
    shell?: 'panel' | 'inherit';
    /** Mode the themed panel renders in (the app's light or dark). */
    appMode?: Mode;
    /** TV mode: no header, cover or page tabs; filters hide unless settings.tv says otherwise. */
    tv?: boolean;
    /** TV mode: the height one page must fit (rows stretch or shrink). */
    fitHeight?: number;
    /** Round 2: change a dashboard variable (null = default). */
    onVariable?: (id: string, value: string | null) => void;
    /** Round 2: click-to-filter selections changed. */
    onInteraction?: (clauses: import('@/lib/builder/types').FilterClause[]) => void;
    /** Round 8: drill down or up on one widget (its new path; empty = its own dimension). */
    onDrill?: (widgetId: string, path: string[]) => void;
    /** Round 7: site, metric and Day / Week / Month switchers (view only, kept in the URL). */
    switches?: ViewerSwitchHandlers;
    /** Round 7: where time series read chart notes (default: no markers). */
    notes?: ChartNotesSource;
    /** Round 9: the Views menu (owner: save, apply, default; share viewers: copy a link to their view). */
    views?: ViewsHandlers;
}

export function DashboardView({
    doc, mode, siteLabel: defaultSiteLabel, state, onPage, onDate, onFilter, allow, data, loading, refetching, onRetry, options, header, footer, exportRef, onChooseSource, shell, appMode, tv, fitHeight, onVariable, onInteraction, onDrill, switches, notes, views,
}: DashboardViewProps) {
    // Names of the dashboard's calculated metrics, before any widget or the cover renders (round 7).
    registerCalcs(doc.calcs);
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const bp: Bp = bpForWidth(width || 1200);
    const pages = doc.pages.filter((p) => !p.hidden);
    const page = pages.find((p) => p.id === state.pageId) ?? pages[0];
    const dc = dateControlOf(doc);
    const filters = doc.controls.filter((c): c is FilterControl => c.type === 'filter');
    const variables = variableControls(doc.controls);
    const resolved = data?.resolved;
    // {{site}} follows the site switcher.
    const siteCtl = doc.controls.find((c): c is SiteControl => c.type === 'site');
    const siteLabel = (siteCtl && switches?.siteOptions ? pickedSiteLabel(siteCtl, state, switches.siteOptions(siteCtl)) : undefined) ?? defaultSiteLabel;
    const hasSwitches = Boolean(switches) && doc.controls.some((c) => c.type === 'site' || c.type === 'metric' || c.type === 'grain' || c.type === 'searchType');
    const pageTitle = page?.title ?? '';
    const baseVars = textVars(siteLabel, resolved, pageTitle);
    const vars = variables.length ? { ...baseVars, ...Object.fromEntries(Object.entries(variableValues(variables, state)).map(([k, v]) => [`var:${k}`, v])) } : baseVars;
    const editableVars = variables.filter((v) => onVariable && (mode === 'view' || (v.viewerCanChange && allow.filters)));
    const contained = doc.settings.widthMode !== 'full' && !tv;
    const root = shell === 'panel' ? dashRootProps(doc.theme, appMode ?? 'light') : null;
    const themed = !isDefaultLook(doc.theme);
    const showControls = !tv || doc.settings.tv?.hideControls === false;
    const cover = !tv && doc.theme.cover?.enabled && page && page.id === pages[0]?.id;
    const kpiWidget = cover && doc.theme.cover?.showKpis ? page?.layouts.lg.map((l) => doc.widgets[l.i]).find((w) => w?.type === 'kpi-strip') : undefined;
    const brand = doc.theme.brand;
    const credits = brand ? [
        brand.preparedBy && brand.preparedFor ? `Prepared by ${brand.preparedBy} for ${brand.preparedFor}` : brand.preparedBy ? `Prepared by ${brand.preparedBy}` : brand.preparedFor ? `Prepared for ${brand.preparedFor}` : '',
        brand.footer ?? '',
    ].filter(Boolean).join(' · ') : '';

    const interaction = state.interaction;
    // Not memoised: vars and the data change every render anyway (as before round 2).
    const render = (widget: WidgetDef, heightPx: number, b: Bp) => {
        const hasDrill = Boolean(widget.interactions?.drill);
        const viewed = hasSwitches || hasDrill ? applyViewerControls(widget, { controlDefs: doc.controls, controls: state, pageId: page?.id }, { site: false }) : widget;
        // Round 8: drill down. A click drills one level; on the last level it filters the page when click to filter is on.
        const info = hasDrill ? drillInfo(viewed, state.drill) : null;
        const canDown = Boolean(onDrill && info && info.depth < info.chain.length - 1);
        const dim = onInteraction && !canDown ? clickDimension(viewed) : null;
        let result = data?.results[widget.id];
        let awaiting = false;
        let drill: DrillView | undefined;
        if (info && onDrill) {
            // The page's data was fetched for another level: show the skeleton until this level's rows arrive.
            const ok = result?.status === 'ok' ? result : result?.status === 'error' ? result.stale : undefined;
            if (ok && !ok.parts.rows?.columns.some((c) => c.id === `d:${info.chain[info.depth]}`)) { result = undefined; awaiting = true; }
            // Public views hold signed keys (the server issued them with the data); owner views hold the values.
            const keys = ok?.parts.rows?.drillKeys;
            const shown = (v: string) => (mode === 'public' ? drillKeyLabel(v) : v);
            drill = {
                levels: info.chain.map((d) => dimLabel(d)),
                depth: info.depth,
                values: info.path.map((v, i) => dimText(info.chain[i], shown(v))),
                canDown,
                onUp: () => onDrill(widget.id, drillTo(info.path, info.depth - 1)),
                onTo: (d) => onDrill(widget.id, drillTo(info.path, d)),
            };
            if (canDown) {
                const down = (value: string) => {
                    const entry = mode === 'public' ? keys?.[value] : value;
                    if (entry) onDrill(widget.id, drillDown(info.path, info.depth, entry));
                };
                return renderWidget(viewed, result, awaiting, heightPx, b, { drill, onFilterClick: down });
            }
        }
        return renderWidget(viewed, result, awaiting, heightPx, b, {
            drill,
            onFilterClick: dim ? (value: string) => onInteraction!(toggleInteraction(interaction ?? [], dim, value)) : undefined,
            selectedValue: dim ? (interaction ?? []).find((c) => c.dimension === dim)?.value as string | undefined : undefined,
        });
    };
    const renderWidget = (widget: WidgetDef, result: DashboardQueryResponse['results'][string] | undefined, awaiting: boolean, heightPx: number, b: Bp, extra: { drill?: DrillView; onFilterClick?: (value: string) => void; selectedValue?: string }) => (
        <WidgetRenderer
            onFilterClick={extra.onFilterClick}
            selectedValue={extra.selectedValue}
            drill={extra.drill}
            widget={widget}
            result={result}
            loading={awaiting || (loading && !result)}
            refetching={refetching}
            resolved={data?.resolved}
            compare={state.date.compare.mode}
            compareSpec={state.date.compare}
            height={heightPx}
            bp={b}
            mode={mode}
            vars={vars}
            onRetry={onRetry}
            onChooseSource={onChooseSource}
        />
    );

    return (
        <ChartNotesProvider value={notes?.kind === 'owner' ? { ...notes, view: { controlDefs: doc.controls, controls: state, pageId: page?.id } } : notes ?? { kind: 'none' }}>
        <div ref={exportRef} {...root?.attrs} {...(root ? { 'data-dash-panel': '' } : {})} style={root?.style} className={cn('flex flex-col gap-4', contained && 'mx-auto w-full max-w-[1440px]', root?.className)}>
            {tv ? null : themed ? <div data-dash-header="">{header}</div> : header}
            {cover ? (
                <DashboardCover theme={doc.theme} name={doc.name} vars={vars} pages={pages} currentPageId={page?.id} onPage={pages.length > 1 ? onPage : undefined}
                    dark={(root?.mode ?? appMode) === 'dark'} kpis={kpiWidget ? render(kpiWidget, 120, bp) : undefined} />
            ) : null}
            {showControls ? <div className="flex flex-wrap items-center justify-between gap-3" data-pdf-ignore="true">
                <ControlsBar
                    filters={filters}
                    state={state}
                    onFilters={onFilter}
                    options={options}
                    canFilter={allow.filters}
                    compact={bp === 'sm'}
                >
                    {switches ? <ViewerSwitches controls={doc.controls} state={state} handlers={switches} defaultSiteLabel={defaultSiteLabel} kinds={['site']} /> : null}
                    <DateControl
                        range={state.date.range}
                        compare={state.date.compare}
                        onChange={onDate}
                        canChange={allow.date && dc.viewerCanChange}
                        canCompare={viewerMayCompare(allow, dc)}
                        resolved={data?.resolved}
                        size={bp === 'sm' ? 'sm' : 'md'}
                    />
                    {views ? <ViewsMenu handlers={views} size={bp === 'sm' ? 'sm' : 'md'} /> : null}
                    {switches ? <ViewerSwitches controls={doc.controls} state={state} handlers={switches} defaultSiteLabel={defaultSiteLabel} size={bp === 'sm' ? 'sm' : 'md'} kinds={['metric', 'grain', 'searchType']} /> : null}
                    {editableVars.map((v) => <VariableInput key={v.id} control={v} value={variableValues([v], state)[v.id]} onChange={(val) => onVariable!(v.id, val)} />)}
                </ControlsBar>
                {data?.resolved && doc.theme.header.showDates ? (
                    <p className="text-meta text-fg-muted">
                        {fmtDateRange(data.resolved.range.start, data.resolved.range.end)}
                        {data.resolved.search ? ` (Search Console ${fmtDateRange(data.resolved.search.start, data.resolved.search.end)})` : ''}
                        {data.resolved.compare ? ` · vs ${fmtDateRange(data.resolved.compare.start, data.resolved.compare.end)}` : ''}
                    </p>
                ) : null}
            </div> : null}
            {interaction?.length && onInteraction ? <InteractionChips clauses={interaction} onRemove={(i) => onInteraction(interaction.filter((_, j) => j !== i))} onClear={() => onInteraction([])} /> : null}
            {pages.length > 1 && !tv ? <PageTabs pages={pages} value={page?.id ?? ''} onChange={onPage} /> : null}
            <div ref={ref} className="min-w-0">
                {page ? (
                    <DashboardCanvas
                        doc={doc}
                        page={page}
                        bp={bp}
                        width={width}
                        mode={mode}
                        renderWidget={render}
                        compareMode={state.date.compare.mode}
                        fitHeight={tv && fitHeight ? fitHeight - (showControls ? 52 : 0) : undefined}
                        empty={<EmptyState icon={undefined} title="This page is empty" description={mode === 'view' ? 'Open the editor to add widgets.' : undefined} />}
                    />
                ) : null}
            </div>
            {credits && !tv ? <p className="text-center text-meta text-fg-muted" data-dash-credits="">{credits}</p> : null}
            {footer}
        </div>
        </ChartNotesProvider>
    );
}
