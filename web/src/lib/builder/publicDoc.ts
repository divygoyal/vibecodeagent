/**
 * Public view helpers (BUILDER.md 6.5 and 8.1): the redacted document a share link receives
 * (no property ids, no site URLs, no owner) and the viewer state a public request may set.
 * Viewers can only move the controls the owner allowed; metrics, dimensions and sources can
 * never come from the query string.
 */
import { usesMetric } from './calc';
import { viewerMayCompare } from './compare';
import { compareFromParam, rangeFromParam } from './dates';
import { drillFromParams, type DrillResolver } from './drill';
import { clickableDims, interactionFromParam } from './interaction';
import { isSearchType } from './searchType';
import { cleanVariable } from './variables';
import type {
    CompareSpec,
    ControlDef,
    ControlState,
    DashboardDocV2,
    DateControl,
    DateRangeSpec,
    GrainControl,
    PublicDashboardDoc,
    PublicSourceRef,
    SiteControl,
    SourceRef,
} from './types';

export function dateControlOf(doc: Pick<DashboardDocV2, 'controls'>): DateControl {
    const c = doc.controls.find((x): x is DateControl => x.type === 'date');
    return c ?? { id: 'date', type: 'date', default: { kind: 'preset', id: '28d' }, defaultCompare: { mode: 'previous_period' }, viewerCanChange: true, viewerCanCompare: true };
}

export function defaultControlState(doc: Pick<DashboardDocV2, 'controls'>): ControlState {
    const d = dateControlOf(doc);
    const filters: Record<string, string[]> = {};
    for (const c of doc.controls) if (c.type === 'filter' && c.default?.length) filters[c.id] = c.default;
    return { date: { range: d.default, compare: d.defaultCompare }, filters };
}

export function redactSource(src: SourceRef, labelOf: (s: SourceRef) => string): PublicSourceRef | { type: 'default' } {
    if (src.type === 'default') return { type: 'default' };
    return { type: src.type === 'portfolio' ? 'portfolio' : 'site', label: labelOf(src) };
}

export interface PublicDocOptions {
    /**
     * Round 7: opaque options of a site control the owner lets share viewers switch (server/access.ts
     * publicSiteChoices). Missing or empty = the control is left out of the public doc.
     */
    siteChoices?: (control: SiteControl) => Array<{ key: string; label: string; siteId: string }>;
}

/** A site control as a public viewer gets it: opaque keys and labels only, or nothing. */
function publicSiteControl(c: SiteControl, opts: PublicDocOptions): SiteControl | null {
    if (!c.viewerCanChange || !opts.siteChoices) return null;
    const list = opts.siteChoices(c);
    if (!list.length) return null;
    const def = c.default ? list.find((o) => o.siteId === c.default)?.key ?? '' : '';
    const choices = list.map((o) => ({ key: o.key, label: o.label }));
    return { id: c.id, type: 'site', label: c.label, scope: c.scope, viewerCanChange: true, options: choices.map((o) => o.key), default: def, choices };
}

/** The doc a public viewer receives: every SourceRef becomes a label. */
export function publicDoc(doc: DashboardDocV2, labelOf: (s: SourceRef) => string, opts: PublicDocOptions = {}): PublicDashboardDoc {
    const widgets: PublicDashboardDoc['widgets'] = {};
    for (const [id, w] of Object.entries(doc.widgets)) {
        widgets[id] = { ...w, source: redactSource(w.source ?? { type: 'default' }, labelOf) } as PublicDashboardDoc['widgets'][string];
    }
    const pages = doc.pages.filter((p) => !p.hidden);
    const visible = new Set(pages.flatMap((p) => p.layouts.lg.map((l) => l.i)));
    for (const id of Object.keys(widgets)) if (!visible.has(id)) delete widgets[id];
    const theme = { ...doc.theme };
    delete theme.legacy;
    const calcs = (doc.calcs ?? []).filter((c) => usesMetric(widgets, c.id));
    return {
        schemaVersion: 2,
        name: doc.name,
        description: doc.description,
        defaultSource: redactSource(doc.defaultSource, labelOf) as PublicSourceRef,
        controls: doc.controls.flatMap((c): ControlDef[] => {
            if (c.type === 'site') {
                const pc = publicSiteControl(c, opts);
                return pc ? [pc] : [];
            }
            if (c.type !== 'filter') return [c];
            const { source: _drop, ...rest } = c;
            void _drop;
            return [rest];
        }),
        pages,
        widgets,
        theme,
        settings: { widthMode: doc.settings.widthMode, autoRefreshSec: doc.settings.autoRefreshSec, ...(doc.settings.tv ? { tv: doc.settings.tv } : {}), ...(doc.settings.shareNotes ? { shareNotes: true } : {}) },
        meta: {},
        // Round 7 (B3): names of the calculated metrics the visible widgets use (ids hold no site data).
        ...(calcs.length ? { calcs } : {}),
    };
}

const MAX_FILTER_VALUES = 20;

/** Viewer state from a public query string, limited to what the share allows. */
export function publicControlsFromQuery(
    q: URLSearchParams,
    doc: Pick<DashboardDocV2, 'controls' | 'pages'> & { widgets?: DashboardDocV2['widgets'] },
    share: { viewerControls: { date: boolean; compare: boolean; filters: boolean } },
    /** Round 7: maps the opaque site keys of the URL (s.<controlId>) to the owner's site ids (server/access.ts). */
    mapSitePicks?: (picks: Record<string, string>) => Record<string, string>,
    /**
     * Round 8: what a drill part of the URL (d.<widgetId>) means. Public requests pass the signed-key check
     * (server/access.ts drillResolver); without it a public request carries no drill state at all.
     */
    resolveDrill?: DrillResolver,
): ControlState {
    const base = defaultControlState(doc);
    const dc = dateControlOf(doc);
    let range: DateRangeSpec = base.date.range;
    let compare: CompareSpec = base.date.compare;
    if (share.viewerControls.date && dc.viewerCanChange) {
        const r = rangeFromParam(q.get('range'), q.get('from'), q.get('to'));
        if (r && r.kind !== 'rolling') range = r;
    }
    if (viewerMayCompare(share.viewerControls, dc)) {
        const c = compareFromParam(q.get('compare'));
        if (c) compare = c;
    }
    const filters: Record<string, string[]> = { ...base.filters };
    if (share.viewerControls.filters) {
        for (const c of doc.controls) {
            if (c.type !== 'filter' || !c.viewerCanChange) continue;
            const raw = q.get(`f.${c.id}`);
            if (raw === null) continue;
            const values = raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0 && v.length <= 200).slice(0, MAX_FILTER_VALUES);
            if (values.length) filters[c.id] = values;
            else delete filters[c.id];
        }
        for (const c of doc.controls) {
            if (c.type !== 'variable' || !c.viewerCanChange) continue;
            const raw = q.get(`f.${c.id}`);
            if (raw === null) continue;
            const v = cleanVariable(c, raw);
            if (v !== c.default) filters[c.id] = [v];
        }
    }
    const interaction = share.viewerControls.filters && doc.widgets ? interactionFromParam(q.get('x'), clickableDims(doc as Pick<DashboardDocV2, 'widgets'>)) : [];
    const pageParam = q.get('page');
    const pageId = pageParam && doc.pages.some((p) => p.id === pageParam && !p.hidden) ? pageParam : undefined;
    const switches = viewerSwitchesFromQuery(q, doc, mapSitePicks);
    // Drill down is a viewer filter like click-to-filter: only when the share lets viewers filter.
    const drill = share.viewerControls.filters && resolveDrill ? drillFromParams(q, doc.widgets, resolveDrill) : undefined;
    return { date: { range, compare }, filters, pageId, ...(interaction.length ? { interaction } : {}), ...switches, ...(drill ? { drill } : {}) };
}

/**
 * Round 7 viewer switchers from a query string: m.<id> must be one of the metric control's options,
 * g.<id> one of the Day / Week / Month control's options, t.<id> (round 8) one of the search type control's
 * options; s.<id> only passes through `mapSitePicks`
 * (owner views: the server checks site ids; public links: opaque keys mapped server side).
 */
export function viewerSwitchesFromQuery(
    q: URLSearchParams,
    doc: Pick<DashboardDocV2, 'controls'>,
    mapSitePicks?: (picks: Record<string, string>) => Record<string, string>,
): Pick<ControlState, 'site' | 'metric' | 'grain' | 'searchType'> {
    const out: Pick<ControlState, 'site' | 'metric' | 'grain' | 'searchType'> = {};
    const sitePicks: Record<string, string> = {};
    for (const c of doc.controls) {
        if (c.type === 'metric') {
            const v = q.get(`m.${c.id}`);
            if (v && v !== c.default && c.options.includes(v)) (out.metric ??= {})[c.id] = v;
        } else if (c.type === 'grain') {
            const v = q.get(`g.${c.id}`) as GrainControl['default'] | null;
            if (v && v !== c.default && c.options.includes(v)) (out.grain ??= {})[c.id] = v;
        } else if (c.type === 'searchType') {
            const v = q.get(`t.${c.id}`);
            if (isSearchType(v) && v !== c.default && c.options.includes(v)) (out.searchType ??= {})[c.id] = v;
        } else if (c.type === 'site') {
            const v = q.get(`s.${c.id}`);
            if (v && v.length <= 253) sitePicks[c.id] = v;
        }
    }
    if (mapSitePicks && Object.keys(sitePicks).length) {
        const site = mapSitePicks(sitePicks);
        if (Object.keys(site).length) out.site = site;
    }
    return out;
}
