/**
 * Pure operations on a DashboardDocV2 (editor store, routes, tests). Every function returns a
 * new doc and never mutates its input, so undo history can keep references.
 */
import { drillProblem } from './drill';
import { newPageId, newWidgetId, widgetMeta } from './registry';
import { widgetSearchTypeProblem } from './searchType';
import type { DashboardDocV2, GridLayouts, LayoutItem, PageDef, SourceRef, WidgetDef } from './types';

const COLS = { lg: 12, md: 6, sm: 1 } as const;

/** All sources back to the dashboard default (templates and copies); portfolio widgets stay portfolio. */
export function resetSources(doc: DashboardDocV2, defaultSource: DashboardDocV2['defaultSource']): DashboardDocV2 {
    const widgets: Record<string, WidgetDef> = {};
    for (const [id, w] of Object.entries(doc.widgets)) {
        widgets[id] = { ...w, source: w.type === 'portfolio-grid' ? { type: 'portfolio', include: 'all' } : { type: 'default' } } as WidgetDef;
    }
    // Site switchers (round 7) list the old owner's site ids: a copy starts on "all my sites", owner-only.
    const controls = doc.controls.map((c) => (c.type === 'filter' && c.source ? { ...c, source: undefined }
        : c.type === 'site' ? { id: c.id, type: 'site' as const, label: c.label, options: 'all' as const, default: '', scope: c.scope, viewerCanChange: false } : c));
    // Saved views (round 9) hold the old owner's site ids and drilled values: a copy starts without them.
    const { views: _views, defaultViewId: _default, ...rest } = doc;
    void _views;
    void _default;
    return { ...rest, defaultSource, widgets, controls, meta: { createdFrom: doc.meta.createdFrom } };
}

export function pageOf(doc: DashboardDocV2, widgetId: string): PageDef | undefined {
    return doc.pages.find((p) => p.layouts.lg.some((l) => l.i === widgetId));
}

/** First free slot of size w x h in a 12-column layout, scanning rows from `fromY`. */
export function firstFreeSlot(layout: LayoutItem[], w: number, h: number, fromY = 0, cols = 12): { x: number; y: number } {
    const occupied = (x: number, y: number) => layout.some((l) => x < l.x + l.w && x + w > l.x && y < l.y + l.h && y + h > l.y);
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    for (let y = fromY; y <= maxY; y++) {
        for (let x = 0; x + w <= cols; x++) if (!occupied(x, y)) return { x, y };
    }
    return { x: 0, y: maxY };
}

/** Clamp a layout item to the registry constraints of its widget. */
export function clampItem(item: LayoutItem, w: WidgetDef | undefined, cols = 12): LayoutItem {
    const meta = widgetMeta(w?.type ?? 'text');
    const width = Math.max(Math.min(meta.minSize.w, cols), Math.min(item.w, meta.maxSize.w, cols));
    const height = Math.max(meta.minSize.h, Math.min(item.h, meta.maxSize.h));
    return { i: item.i, x: Math.max(0, Math.min(item.x, cols - width)), y: Math.max(0, item.y), w: width, h: height };
}

/** Reading order: top to bottom, then left to right. */
export function readingOrder(layout: LayoutItem[]): LayoutItem[] {
    return [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Layout for a breakpoint. lg is authoritative; md (6 cols) and sm (1 col) are derived in
 * reading order unless the user edited them (explicit layouts.md / layouts.sm).
 */
export function layoutFor(doc: DashboardDocV2, page: PageDef, bp: 'lg' | 'md' | 'sm'): LayoutItem[] {
    const lg = page.layouts.lg.filter((l) => doc.widgets[l.i]);
    if (bp === 'lg') return lg;
    const explicit = page.layouts[bp];
    if (explicit && explicit.length) {
        const ids = new Set(explicit.map((l) => l.i));
        const missing = lg.filter((l) => !ids.has(l.i));
        if (!missing.length) return explicit.filter((l) => doc.widgets[l.i] && !(bp === 'sm' && doc.widgets[l.i].mobile?.hidden));
    }
    const out: LayoutItem[] = [];
    if (bp === 'sm') {
        let y = 0;
        for (const l of readingOrder(lg)) {
            const w = doc.widgets[l.i];
            if (w.mobile?.hidden) continue;
            const h = Math.max(widgetMeta(w.type).phoneH, w.type === 'text' || w.type === 'section' ? Math.min(l.h, 6) : 0);
            out.push({ i: l.i, x: 0, y, w: 1, h });
            y += h;
        }
        return out;
    }
    // md: halve widths, pack in reading order.
    for (const l of readingOrder(lg)) {
        const w = Math.max(1, Math.min(COLS.md, Math.round(l.w / 2) || 1));
        const fullRow = l.w >= 9;
        const width = fullRow ? COLS.md : Math.max(Math.min(3, COLS.md), w);
        const slot = firstFreeSlot(out, width, l.h, 0, COLS.md);
        out.push({ i: l.i, x: slot.x, y: slot.y, w: width, h: l.h });
    }
    return out;
}

export function updatePage(doc: DashboardDocV2, pageId: string, fn: (p: PageDef) => PageDef): DashboardDocV2 {
    return { ...doc, pages: doc.pages.map((p) => (p.id === pageId ? fn(p) : p)) };
}

export function setLayout(doc: DashboardDocV2, pageId: string, bp: keyof GridLayouts, items: LayoutItem[]): DashboardDocV2 {
    return updatePage(doc, pageId, (p) => ({ ...p, layouts: { ...p.layouts, [bp]: items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) } }));
}

export function addWidget(doc: DashboardDocV2, pageId: string, widget: WidgetDef, at?: { x: number; y: number; w?: number; h?: number }): DashboardDocV2 {
    const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0];
    const meta = widgetMeta(widget.type);
    const w = at?.w ?? meta.defaultSize.w;
    const h = at?.h ?? meta.defaultSize.h;
    const pos = at ? { x: at.x, y: at.y } : firstFreeSlot(page.layouts.lg, w, h);
    const item = clampItem({ i: widget.id, x: pos.x, y: pos.y, w, h }, widget);
    const bottom = (l: LayoutItem[]) => l.reduce((m, x) => Math.max(m, x.y + x.h), 0);
    return {
        ...updatePage(doc, page.id, (p) => ({
            ...p,
            layouts: {
                lg: [...p.layouts.lg, item],
                md: p.layouts.md ? [...p.layouts.md, { ...item, w: Math.min(item.w, 6), x: 0, y: bottom(p.layouts.md) }] : undefined,
                sm: p.layouts.sm ? [...p.layouts.sm, { ...item, x: 0, w: 1, y: bottom(p.layouts.sm), h: widgetMeta(widget.type).phoneH }] : undefined,
            },
        })),
        widgets: { ...doc.widgets, [widget.id]: widget },
    };
}

export function removeWidget(doc: DashboardDocV2, widgetId: string): DashboardDocV2 {
    const widgets = { ...doc.widgets };
    delete widgets[widgetId];
    const strip = (l?: LayoutItem[]) => l?.filter((x) => x.i !== widgetId);
    return {
        ...doc,
        widgets,
        pages: doc.pages.map((p) => ({ ...p, layouts: { lg: strip(p.layouts.lg)!, md: strip(p.layouts.md), sm: strip(p.layouts.sm) } })),
        controls: doc.controls.map((c) => (c.type === 'filter' && c.scope.mode === 'widgets' ? { ...c, scope: { mode: 'widgets' as const, widgetIds: c.scope.widgetIds.filter((x) => x !== widgetId) } } : c)),
    };
}

/**
 * Drops the settings an edit made impossible (round 8): a drill list its metrics or dimension no longer fit, a
 * search type once the widget reads Analytics, or needs queries or position under Discover.
 */
export function repairWidget(w: WidgetDef): WidgetDef {
    let out = w;
    if (out.interactions?.drill && drillProblem(out)) {
        const { drill: _drop, ...rest } = out.interactions;
        void _drop;
        out = { ...out, interactions: Object.keys(rest).length ? rest : undefined } as WidgetDef;
    }
    if (out.searchType && widgetSearchTypeProblem(out)) out = { ...out, searchType: undefined } as WidgetDef;
    return out;
}

export function updateWidget(doc: DashboardDocV2, widgetIn: WidgetDef): DashboardDocV2 {
    if (!doc.widgets[widgetIn.id]) return doc;
    const widget = repairWidget(widgetIn);
    let next: DashboardDocV2 = { ...doc, widgets: { ...doc.widgets, [widget.id]: widget } };
    // Keep the layout inside the (possibly new) size constraints.
    const page = pageOf(next, widget.id);
    if (page) {
        next = updatePage(next, page.id, (p) => ({ ...p, layouts: { ...p.layouts, lg: p.layouts.lg.map((l) => (l.i === widget.id ? clampItem(l, widget) : l)) } }));
    }
    return next;
}

export function duplicateWidget(doc: DashboardDocV2, widgetId: string): { doc: DashboardDocV2; id: string } {
    const w = doc.widgets[widgetId];
    const page = pageOf(doc, widgetId);
    if (!w || !page) return { doc, id: widgetId };
    const item = page.layouts.lg.find((l) => l.i === widgetId)!;
    const copy = { ...structuredClone(w), id: newWidgetId() } as WidgetDef;
    const slot = firstFreeSlot(page.layouts.lg, item.w, item.h, item.y);
    return { doc: addWidget(doc, page.id, copy, { x: slot.x, y: slot.y, w: item.w, h: item.h }), id: copy.id };
}

export function moveWidgetToPage(doc: DashboardDocV2, widgetId: string, toPageId: string): DashboardDocV2 {
    const from = pageOf(doc, widgetId);
    const w = doc.widgets[widgetId];
    if (!from || !w || from.id === toPageId) return doc;
    const item = from.layouts.lg.find((l) => l.i === widgetId)!;
    const removed = removeWidget(doc, widgetId);
    return addWidget(removed, toPageId, w, { ...firstFreeSlot(doc.pages.find((p) => p.id === toPageId)?.layouts.lg ?? [], item.w, item.h), w: item.w, h: item.h });
}

export function addPage(doc: DashboardDocV2, title?: string): { doc: DashboardDocV2; id: string } {
    const id = newPageId();
    return { doc: { ...doc, pages: [...doc.pages, { id, title: title ?? `Page ${doc.pages.length + 1}`, layouts: { lg: [] } }] }, id };
}

export function duplicatePage(doc: DashboardDocV2, pageId: string): { doc: DashboardDocV2; id: string } {
    const page = doc.pages.find((p) => p.id === pageId);
    if (!page) return { doc, id: pageId };
    const idMap = new Map<string, string>();
    const widgets = { ...doc.widgets };
    for (const l of page.layouts.lg) {
        const nid = newWidgetId();
        idMap.set(l.i, nid);
        widgets[nid] = { ...structuredClone(doc.widgets[l.i]), id: nid } as WidgetDef;
    }
    const remap = (items?: LayoutItem[]) => items?.filter((l) => idMap.has(l.i)).map((l) => ({ ...l, i: idMap.get(l.i)! }));
    const id = newPageId();
    const copy: PageDef = { id, title: `${page.title} (copy)`.slice(0, 80), layouts: { lg: remap(page.layouts.lg)!, md: remap(page.layouts.md), sm: remap(page.layouts.sm) } };
    const idx = doc.pages.findIndex((p) => p.id === pageId);
    const pages = [...doc.pages.slice(0, idx + 1), copy, ...doc.pages.slice(idx + 1)];
    return { doc: { ...doc, pages, widgets }, id };
}

export function removePage(doc: DashboardDocV2, pageId: string): DashboardDocV2 {
    if (doc.pages.length <= 1) return doc;
    const page = doc.pages.find((p) => p.id === pageId);
    if (!page) return doc;
    let next: DashboardDocV2 = { ...doc, pages: doc.pages.filter((p) => p.id !== pageId) };
    for (const l of page.layouts.lg) {
        const widgets = { ...next.widgets };
        delete widgets[l.i];
        next = { ...next, widgets };
    }
    return next;
}

export function movePage(doc: DashboardDocV2, pageId: string, dir: -1 | 1): DashboardDocV2 {
    const i = doc.pages.findIndex((p) => p.id === pageId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= doc.pages.length) return doc;
    const pages = [...doc.pages];
    [pages[i], pages[j]] = [pages[j], pages[i]];
    return { ...doc, pages };
}

export function renamePage(doc: DashboardDocV2, pageId: string, title: string): DashboardDocV2 {
    return updatePage(doc, pageId, (p) => ({ ...p, title: title.trim().slice(0, 80) || p.title }));
}

export function setDefaultSource(doc: DashboardDocV2, src: Exclude<SourceRef, { type: 'default' }>): DashboardDocV2 {
    return { ...doc, defaultSource: src };
}
