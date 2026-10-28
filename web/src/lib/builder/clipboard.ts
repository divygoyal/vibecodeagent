/**
 * Copy and paste of widgets and pages, inside a dashboard and across dashboards (round 2, C5).
 * The clipboard carries plain JSON text, so it also works between browser tabs and windows:
 *   { "tc": "trafficclaw/widgets", "v": 1, "items": [{ widget, layout: { x, y, w, h } }] }
 *   { "tc": "trafficclaw/page", "v": 1, "title": "...", "items": [...] }
 * Pasting gives every widget a new id and keeps the copied arrangement, placed under the
 * existing widgets. Sources are kept as they were ('default' follows the target dashboard's
 * site; an explicit site stays that site). Nothing here talks to the network.
 */
import { parseCalcId, usesMetric } from './calc';
import { CHART_TYPES } from './charts';
import { addPage, clampItem, updatePage } from './docOps';
import { newWidgetId, widgetMeta } from './registry';
import type { CalculatedMetric, DashboardDocV2, LayoutItem, PageDef, WidgetDef, WidgetType } from './types';

export const CLIP_WIDGETS = 'trafficclaw/widgets';
export const CLIP_PAGE = 'trafficclaw/page';
const MAX_ITEMS = 40;
const MAX_BYTES = 400_000;

const TYPES: WidgetType[] = ['scorecard', 'kpi-strip', 'timeseries', 'bar', 'pie', 'table', 'geo', 'text', 'image', 'section', 'portfolio-grid', ...CHART_TYPES];

export interface ClipItem { widget: WidgetDef; layout: { x: number; y: number; w: number; h: number } }
/** `calcs` (round 7): names of the calculated metrics the items use, so a paste keeps them. */
export type Clip =
    | { tc: typeof CLIP_WIDGETS; v: 1; items: ClipItem[]; calcs?: CalculatedMetric[] }
    | { tc: typeof CLIP_PAGE; v: 1; title: string; items: ClipItem[]; calcs?: CalculatedMetric[] };

function calcsOf(doc: DashboardDocV2, items: ClipItem[]): CalculatedMetric[] | undefined {
    const used = (doc.calcs ?? []).filter((c) => usesMetric(items, c.id));
    return used.length ? used : undefined;
}

function itemsOf(doc: DashboardDocV2, page: PageDef, ids?: string[]): ClipItem[] {
    const want = ids ? new Set(ids) : null;
    const lg = page.layouts.lg.filter((l) => doc.widgets[l.i] && (!want || want.has(l.i)));
    const minY = lg.reduce((m, l) => Math.min(m, l.y), Infinity);
    return lg.map((l) => ({ widget: structuredClone(doc.widgets[l.i]), layout: { x: l.x, y: l.y - (Number.isFinite(minY) ? minY : 0), w: l.w, h: l.h } }));
}

/** Clipboard text for some widgets of a page (in their arrangement). */
export function copyWidgets(doc: DashboardDocV2, pageId: string, ids: string[]): string | null {
    const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages.find((p) => p.layouts.lg.some((l) => ids.includes(l.i)));
    if (!page) return null;
    const items = itemsOf(doc, page, ids);
    if (!items.length) return null;
    return JSON.stringify({ tc: CLIP_WIDGETS, v: 1, items, calcs: calcsOf(doc, items) } satisfies Clip);
}

/** Clipboard text for a whole page. */
export function copyPage(doc: DashboardDocV2, pageId: string): string | null {
    const page = doc.pages.find((p) => p.id === pageId);
    if (!page) return null;
    const items = itemsOf(doc, page);
    return JSON.stringify({ tc: CLIP_PAGE, v: 1, title: page.title, items, calcs: calcsOf(doc, items) } satisfies Clip);
}

function okWidget(w: unknown): w is WidgetDef {
    if (!w || typeof w !== 'object') return false;
    const x = w as Record<string, unknown>;
    return typeof x.type === 'string' && TYPES.includes(x.type as WidgetType) && typeof x.config === 'object' && x.config !== null && typeof x.source === 'object' && x.source !== null;
}

/** Parse clipboard text; null for anything that is not a TrafficClaw clip. */
export function parseClip(text: string | null | undefined): Clip | null {
    if (!text || text.length > MAX_BYTES || !text.includes('trafficclaw/')) return null;
    try {
        const c = JSON.parse(text) as Record<string, unknown>;
        if ((c.tc !== CLIP_WIDGETS && c.tc !== CLIP_PAGE) || c.v !== 1 || !Array.isArray(c.items)) return null;
        const items: ClipItem[] = [];
        for (const it of c.items.slice(0, MAX_ITEMS) as Array<Record<string, unknown>>) {
            const l = it?.layout as Record<string, unknown> | undefined;
            if (!okWidget(it?.widget) || !l) continue;
            const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d);
            items.push({ widget: it.widget as WidgetDef, layout: { x: num(l.x, 0), y: Math.max(0, num(l.y, 0)), w: num(l.w, 4), h: num(l.h, 6) } });
        }
        if (!items.length) return null;
        const calcs = Array.isArray(c.calcs)
            ? (c.calcs as Array<Record<string, unknown>>).filter((x) => typeof x?.id === 'string' && parseCalcId(x.id) && typeof x.label === 'string' && x.label.trim())
                .slice(0, 30).map((x) => ({ id: x.id as string, label: (x.label as string).trim().slice(0, 60) }))
            : [];
        const extra = calcs.length ? { calcs } : {};
        if (c.tc === CLIP_PAGE) return { tc: CLIP_PAGE, v: 1, title: typeof c.title === 'string' && c.title.trim() ? c.title.slice(0, 70) : 'Pasted page', items, ...extra };
        return { tc: CLIP_WIDGETS, v: 1, items, ...extra };
    } catch {
        return null;
    }
}

function place(page: PageDef, items: ClipItem[], doc: DashboardDocV2): { lg: LayoutItem[]; widgets: Record<string, WidgetDef>; ids: string[] } {
    const bottom = page.layouts.lg.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    const widgets: Record<string, WidgetDef> = {};
    const lg: LayoutItem[] = [];
    const ids: string[] = [];
    for (const it of items) {
        const id = newWidgetId();
        const widget = { ...structuredClone(it.widget), id } as WidgetDef;
        // Controls of another dashboard do not exist here: keep only the generic switches.
        if (widget.ignoreControls) widget.ignoreControls = widget.ignoreControls.filter((c) => c === 'filters' || c === 'compare' || doc.controls.some((x) => x.id === c));
        widgets[id] = widget;
        lg.push(clampItem({ i: id, x: it.layout.x, y: bottom + it.layout.y, w: it.layout.w, h: it.layout.h }, widget));
        ids.push(id);
    }
    return { lg, widgets, ids };
}

/** Paste widgets under the page's existing widgets. */
export function pasteWidgets(doc: DashboardDocV2, pageId: string, clip: Clip): { doc: DashboardDocV2; ids: string[] } {
    const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0];
    const imageCount = Object.values(doc.widgets).filter((w) => w.type === 'image').length;
    let items = clip.items;
    if (imageCount + items.filter((i) => i.widget.type === 'image').length > 20) items = items.filter((i) => i.widget.type !== 'image');
    const { lg, widgets, ids } = place(page, items, doc);
    // Calculated metrics travel with the widgets that use them (names the target lacks are added).
    const have = new Set((doc.calcs ?? []).map((c) => c.id));
    const newCalcs = (clip.calcs ?? []).filter((c) => !have.has(c.id) && usesMetric(items, c.id));
    const calcs = newCalcs.length ? { calcs: [...(doc.calcs ?? []), ...newCalcs].slice(0, 30) } : {};
    const next = updatePage({ ...doc, ...calcs, widgets: { ...doc.widgets, ...widgets } }, page.id, (p) => ({
        ...p,
        // Tablet and phone layouts are derived again from the desktop one.
        layouts: { lg: [...p.layouts.lg, ...lg], md: undefined, sm: undefined },
    }));
    return { doc: next, ids };
}

/** Paste a copied page as a new page at the end. */
export function pastePage(doc: DashboardDocV2, clip: Clip): { doc: DashboardDocV2; pageId: string; ids: string[] } {
    if (doc.pages.length >= 20) return { doc, pageId: '', ids: [] };
    const title = clip.tc === CLIP_PAGE ? clip.title : 'Pasted widgets';
    const added = addPage(doc, title);
    const r = pasteWidgets(added.doc, added.id, clip);
    return { doc: r.doc, pageId: added.id, ids: r.ids };
}

/** Describe a clip for the paste button ("2 widgets", "page Rankings"). */
export function clipLabel(clip: Clip): string {
    if (clip.tc === CLIP_PAGE) return `page “${clip.title}”`;
    return clip.items.length === 1 ? widgetMeta(clip.items[0].widget.type).label : `${clip.items.length} widgets`;
}
