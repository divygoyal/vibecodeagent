/**
 * Public view helpers (BUILDER.md 6.5 and 8.1): the redacted document a share link receives
 * (no property ids, no site URLs, no owner) and the viewer state a public request may set.
 * Viewers can only move the controls the owner allowed; metrics, dimensions and sources can
 * never come from the query string.
 */
import { compareFromParam, rangeFromParam } from './dates';
import type {
    CompareSpec,
    ControlState,
    DashboardDocV2,
    DateControl,
    DateRangeSpec,
    PublicDashboardDoc,
    PublicSourceRef,
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

/** The doc a public viewer receives: every SourceRef becomes a label. */
export function publicDoc(doc: DashboardDocV2, labelOf: (s: SourceRef) => string): PublicDashboardDoc {
    const widgets: PublicDashboardDoc['widgets'] = {};
    for (const [id, w] of Object.entries(doc.widgets)) {
        widgets[id] = { ...w, source: redactSource(w.source ?? { type: 'default' }, labelOf) } as PublicDashboardDoc['widgets'][string];
    }
    const pages = doc.pages.filter((p) => !p.hidden);
    const visible = new Set(pages.flatMap((p) => p.layouts.lg.map((l) => l.i)));
    for (const id of Object.keys(widgets)) if (!visible.has(id)) delete widgets[id];
    const theme = { ...doc.theme };
    delete theme.legacy;
    return {
        schemaVersion: 2,
        name: doc.name,
        description: doc.description,
        defaultSource: redactSource(doc.defaultSource, labelOf) as PublicSourceRef,
        controls: doc.controls.map((c) => {
            if (c.type !== 'filter') return c;
            const { source: _drop, ...rest } = c;
            void _drop;
            return rest;
        }),
        pages,
        widgets,
        theme,
        settings: { widthMode: doc.settings.widthMode, autoRefreshSec: doc.settings.autoRefreshSec, ...(doc.settings.tv ? { tv: doc.settings.tv } : {}) },
        meta: {},
    };
}

const MAX_FILTER_VALUES = 20;

/** Viewer state from a public query string, limited to what the share allows. */
export function publicControlsFromQuery(
    q: URLSearchParams,
    doc: Pick<DashboardDocV2, 'controls' | 'pages'>,
    share: { viewerControls: { date: boolean; compare: boolean; filters: boolean } },
): ControlState {
    const base = defaultControlState(doc);
    const dc = dateControlOf(doc);
    let range: DateRangeSpec = base.date.range;
    let compare: CompareSpec = base.date.compare;
    if (share.viewerControls.date && dc.viewerCanChange) {
        const r = rangeFromParam(q.get('range'), q.get('from'), q.get('to'));
        if (r && r.kind !== 'rolling') range = r;
    }
    if (share.viewerControls.compare && dc.viewerCanCompare) {
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
    }
    const pageParam = q.get('page');
    const pageId = pageParam && doc.pages.some((p) => p.id === pageParam && !p.hidden) ? pageParam : undefined;
    return { date: { range, compare }, filters, pageId };
}
