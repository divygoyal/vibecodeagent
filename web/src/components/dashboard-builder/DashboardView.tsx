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
import { compareFromParam, compareToParam, rangeFromParam, rangeToParam } from '@/lib/builder/dates';
import { dateControlOf, defaultControlState } from '@/lib/builder/publicDoc';
import { isDefaultLook, type Mode } from '@/lib/builder/themes';
import { clickDimension, clickableDims, interactionFromParam, toggleInteraction } from '@/lib/builder/interaction';
import { variableControls, variableValues } from '@/lib/builder/variables';
import type { ControlState, DashboardDocV2, DashboardQueryResponse, FilterControl, ResolvedDates, WidgetDef } from '@/lib/builder/types';
import { DashboardCanvas, bpForWidth, type Bp } from './DashboardCanvas';
import { ControlsBar, DateControl, PageTabs, type OptionsSource } from './Controls';
import { DashboardCover } from './DashboardCover';
import { InteractionChips, interactionToParam, VariableInput } from './Interactions';
import { dashRootProps } from './theme/DashTheme';
import { WidgetRenderer } from './widgets/WidgetRenderer';

/** Viewer state <-> URL. Only keys the viewer may change are read. */
export function useUrlControls(doc: Pick<DashboardDocV2, 'controls' | 'pages'> & { widgets?: DashboardDocV2['widgets'] }, allow: { date: boolean; compare: boolean; filters: boolean }) {
    const sp = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const state = useMemo<ControlState>(() => {
        const base = defaultControlState(doc);
        const dc = dateControlOf(doc);
        const range = allow.date && dc.viewerCanChange ? rangeFromParam(sp.get('range'), sp.get('from'), sp.get('to')) : null;
        const compare = allow.compare && dc.viewerCanCompare ? compareFromParam(sp.get('compare')) : null;
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
        return {
            date: { range: range ?? base.date.range, compare: compare ?? base.date.compare },
            filters,
            pageId: page && visible.some((p) => p.id === page) ? page : visible[0]?.id,
            ...(interaction.length ? { interaction } : {}),
        };
    }, [sp, doc, allow.date, allow.compare, allow.filters]);

    const set = useCallback((patch: Record<string, string | null>) => {
        const next = new URLSearchParams(sp.toString());
        for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
        }
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, [sp, router, pathname]);

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
}

export function DashboardView({
    doc, mode, siteLabel, state, onPage, onDate, onFilter, allow, data, loading, refetching, onRetry, options, header, footer, exportRef, onChooseSource, shell, appMode, tv, fitHeight, onVariable, onInteraction,
}: DashboardViewProps) {
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const bp: Bp = bpForWidth(width || 1200);
    const pages = doc.pages.filter((p) => !p.hidden);
    const page = pages.find((p) => p.id === state.pageId) ?? pages[0];
    const dc = dateControlOf(doc);
    const filters = doc.controls.filter((c): c is FilterControl => c.type === 'filter');
    const variables = variableControls(doc.controls);
    const resolved = data?.resolved;
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
        const dim = onInteraction ? clickDimension(widget) : null;
        return (
        <WidgetRenderer
            onFilterClick={dim ? (value: string) => onInteraction!(toggleInteraction(interaction ?? [], dim, value)) : undefined}
            selectedValue={dim ? (interaction ?? []).find((c) => c.dimension === dim)?.value as string | undefined : undefined}
            widget={widget}
            result={data?.results[widget.id]}
            loading={loading && !data?.results[widget.id]}
            refetching={refetching}
            resolved={data?.resolved}
            compare={state.date.compare.mode}
            height={heightPx}
            bp={b}
            mode={mode}
            vars={vars}
            onRetry={onRetry}
            onChooseSource={onChooseSource}
        />
        );
    };

    return (
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
                    <DateControl
                        range={state.date.range}
                        compare={state.date.compare}
                        onChange={onDate}
                        canChange={allow.date && dc.viewerCanChange}
                        canCompare={allow.compare && dc.viewerCanCompare}
                        resolved={data?.resolved}
                        size={bp === 'sm' ? 'sm' : 'md'}
                    />
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
                        fitHeight={tv && fitHeight ? fitHeight - (showControls ? 52 : 0) : undefined}
                        empty={<EmptyState icon={undefined} title="This page is empty" description={mode === 'view' ? 'Open the editor to add widgets.' : undefined} />}
                    />
                ) : null}
            </div>
            {credits && !tv ? <p className="text-center text-meta text-fg-muted" data-dash-credits="">{credits}</p> : null}
            {footer}
        </div>
    );
}
