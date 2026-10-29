'use client';

/**
 * The 12-column dashboard grid (BUILDER.md 11.5, DESIGN.md 5.10): row height 32 px, margin 16.
 * View mode renders the layout for the container's breakpoint (12 / 6 / 1 columns; phones stack
 * full width in reading order). Edit mode adds drag (handle), resize from every corner and edge,
 * drop from the palette, selection and hover tools. Saved layouts store only {i,x,y,w,h};
 * min/max sizes come from the widget registry at render time.
 */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { GridLayout, verticalCompactor, type Layout, type LayoutItem as RglItem } from 'react-grid-layout';
import { transformStrategy } from 'react-grid-layout/core';
import { ClipboardCopy, Copy, GripVertical, MoreHorizontal, MoveRight, Trash2, Settings2 } from 'lucide-react';

import 'react-grid-layout/css/styles.css';

import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui';
import { registerCalcs } from '@/lib/builder/calc';
import { layoutFor } from '@/lib/builder/docOps';
import { hiddenForViewers } from '@/lib/builder/placeholders';
import { viewerRows } from '@/lib/builder/compactKpi';
import { growsOnPhone, widgetMeta, widgetTitle } from '@/lib/builder/registry';
import { densityPx, isDefaultLook, themeOptions } from '@/lib/builder/themes';
import type { CompareSpec, DashboardDocV2, LayoutItem, PageDef, WidgetDef, WidgetType } from '@/lib/builder/types';
import { TV_MAX_ROW, tvScreens, useTvScreen } from './TvMode';

export const ROW_H = 32;
export const MARGIN = 16;
export const COLS = { lg: 12, md: 6, sm: 1 } as const;
export type Bp = keyof typeof COLS;

export function pxHeight(h: number, rowH = ROW_H, gap = MARGIN): number {
    return h * (rowH + gap) - gap;
}

/** Row height and gap for a dashboard: today's 32/16 unless a theme picks another density. */
export function gridMetrics(doc: Pick<DashboardDocV2, 'theme'>): { rowH: number; gap: number } {
    if (isDefaultLook(doc.theme)) return { rowH: ROW_H, gap: MARGIN };
    const d = densityPx(themeOptions(doc.theme).density);
    return { rowH: d.row, gap: d.gap };
}

/**
 * 12 columns from 900px of canvas: a 1280px desktop with the sidebar open (about 980px of
 * content) shows the same grid as the editor's desktop view and the public link.
 */
export function bpForWidth(width: number): Bp {
    if (width >= 900) return 'lg';
    if (width >= 600) return 'md';
    return 'sm';
}

/** Type currently dragged from the palette (HTML5 drag carries no readable data during dragover). */
let paletteDragType: WidgetType | null = null;
export function setPaletteDrag(type: WidgetType | null) {
    paletteDragType = type;
}

export interface CanvasEditProps {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onCommitLayout: (bp: Bp, items: LayoutItem[]) => void;
    onDropNew: (type: WidgetType, at: { x: number; y: number; w: number; h: number }) => void;
    onDuplicate: (id: string) => void;
    /** Copy to the clipboard (paste here or in another dashboard). */
    onCopy?: (id: string) => void;
    onDelete: (id: string) => void;
    onMoveToPage: (id: string, pageId: string) => void;
    pages: PageDef[];
}

export interface DashboardCanvasProps {
    doc: DashboardDocV2;
    page: PageDef;
    bp: Bp;
    width: number;
    mode: 'view' | 'edit' | 'public';
    renderWidget: (widget: WidgetDef, heightPx: number, bp: Bp) => ReactNode;
    edit?: CanvasEditProps;
    empty?: ReactNode;
    /** TV mode: stretch or shrink the rows so the page fits this many CSS px of height. */
    fitHeight?: number;
    /**
     * The editor's zoom to fit (round 4 audit #9): the canvas is drawn `width` px wide inside a
     * CSS `scale(zoom)` box; drag, resize and drop positions are corrected for it.
     */
    zoom?: number;
    /**
     * The dashboard's comparison mode. With it, viewers get KPI cards that show no comparison and no sparkline at a
     * compact height (compactKpi.ts). The editor never compacts: it draws the author's layout.
     */
    compareMode?: CompareSpec['mode'];
}

function toRgl(items: LayoutItem[], doc: DashboardDocV2, bp: Bp, editing: boolean): RglItem[] {
    const cols = COLS[bp];
    return items.map((l) => {
        const meta = widgetMeta(doc.widgets[l.i]?.type ?? 'text');
        return {
            i: l.i, x: l.x, y: l.y, w: Math.min(l.w, cols), h: l.h,
            minW: Math.min(meta.minSize.w, cols), maxW: Math.min(meta.maxSize.w, cols), minH: meta.minSize.h, maxH: meta.maxSize.h,
            isDraggable: editing, isResizable: editing && !(meta.type === 'section' && bp === 'lg'),
        };
    });
}

export function DashboardCanvas({ doc, page, bp, width, mode, renderWidget, edit, empty, fitHeight, zoom = 1, compareMode }: DashboardCanvasProps) {
    const editing = mode === 'edit' && Boolean(edit);
    registerCalcs(doc.calcs);
    const metrics = gridMetrics(doc);
    // Viewers never see unchanged template prompts or empty text/image widgets: the grid closes the gap (round 4).
    const pageItems = useMemo(() => {
        const all = layoutFor(doc, page, bp);
        const shown = editing ? all : all.filter((l) => !hiddenForViewers(doc.widgets[l.i]));
        return editing || !compareMode ? shown : shown.map((l) => { const h = viewerRows(doc.widgets[l.i], l.h, compareMode); return h === l.h ? l : { ...l, h }; });
    }, [doc, page, bp, editing, compareMode]);
    const gap = metrics.gap;
    // TV: a page that cannot fit at a readable row height is shown as several screens (TvMode.tsx).
    const tv = useTvScreen();
    const tvFit = Boolean(fitHeight && tv && bp !== 'sm');
    const screens = useMemo(() => (tvFit ? tvScreens(pageItems, fitHeight!, gap) : null), [tvFit, pageItems, fitHeight, gap]);
    const setTvScreens = tv?.setScreens;
    useEffect(() => { if (setTvScreens) setTvScreens(screens?.length ?? 1); }, [setTvScreens, screens]);
    const items = useMemo(() => {
        if (!screens) return pageItems;
        const [a, b] = screens[Math.min(tv!.screen, screens.length - 1)];
        return pageItems.filter((l) => l.y >= a && l.y < b).map((l) => ({ ...l, y: l.y - a }));
    }, [screens, pageItems, tv]);
    const rows = items.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    const rowH = fitHeight && rows && bp !== 'sm'
        ? Math.max(14, Math.min(tvFit ? TV_MAX_ROW : 96, Math.floor((fitHeight + gap) / rows - gap)))
        : metrics.rowH;
    const layout = useMemo(() => toRgl(items, doc, bp, editing), [items, doc, bp, editing]);
    const scaled = zoom > 0 && Math.abs(zoom - 1) > 0.001;
    // The library's createScaledStrategy measures the drag start from the page origin, not the grid
    // (items jumped right on drag); its built-in path divides both rects by the scale, which is right.
    const positionStrategy = useMemo(() => (scaled ? { ...transformStrategy, scale: zoom } : undefined), [scaled, zoom]);
    const boxRef = useRef<HTMLDivElement>(null);

    const commit = useCallback((l: Layout) => {
        edit?.onCommitLayout(bp, l.map((x) => ({ i: x.i, x: x.x, y: x.y, w: x.w, h: x.h })));
    }, [edit, bp]);

    if (!items.length && !editing) return <>{empty}</>;

    // Before the first width is known (server render, first paint) a viewer sees the page's own layout as skeleton blocks,
    // not a blank page with the footer pill right under the toolbar.
    if (width === 0 && !editing) {
        return (
            <div
                aria-hidden
                className="grid"
                style={{ gridTemplateColumns: `repeat(${COLS[bp]}, minmax(0, 1fr))`, gridAutoRows: `${rowH}px`, gap }}
            >
                {items.map((l) => (
                    <Skeleton key={l.i} delay={0} rounded="card" className="block h-full w-full" style={{ gridColumn: `${Math.min(l.x, COLS[bp] - 1) + 1} / span ${Math.min(l.w, COLS[bp])}`, gridRow: `${l.y + 1} / span ${l.h}` }} />
                ))}
            </div>
        );
    }

    // Phones in view mode: plain stacked list (no drag library, no transforms).
    if (bp === 'sm' && !editing) {
        return (
            <div className="flex flex-col gap-4" style={gap !== MARGIN ? { gap } : undefined}>
                {items.map((l) => {
                    const w = doc.widgets[l.i];
                    if (!w) return null;
                    const h = Math.max(pxHeight(l.h, rowH, gap), w.mobile?.minHeight ?? 0);
                    const grows = growsOnPhone(w);
                    return <div key={l.i} style={grows ? { minHeight: w.type === 'text' ? h : undefined } : { height: h }} className="min-w-0">{renderWidget(w, h, bp)}</div>;
                })}
            </div>
        );
    }

    const droppingType = paletteDragType;
    const dropMeta = droppingType ? widgetMeta(droppingType) : null;

    return (
        <div
            ref={boxRef}
            className={cn('tc-canvas relative', editing && 'tc-canvas-editing min-h-[480px] rounded-card')}
            onClick={editing ? (e) => { if (e.target === e.currentTarget) edit!.onSelect(null); } : undefined}
        >
            <style>{CANVAS_CSS}</style>
            {width > 0 ? (
                <GridLayout
                    width={width}
                    layout={layout}
                    gridConfig={{ cols: COLS[bp], rowHeight: rowH, margin: [gap, gap], containerPadding: [0, 0] }}
                    dragConfig={{ enabled: editing, handle: '.tc-drag-handle', bounded: false, threshold: 3 }}
                    resizeConfig={{ enabled: editing, handles: ['s', 'e', 'w', 'n', 'se', 'sw', 'ne', 'nw'] }}
                    dropConfig={{
                        enabled: editing,
                        defaultItem: dropMeta ? { w: Math.min(dropMeta.defaultSize.w, COLS[bp]), h: dropMeta.defaultSize.h } : { w: 4, h: 6 },
                        onDragOver: (e: DragEvent) => {
                            if (!paletteDragType) return false;
                            const size = { w: Math.min(widgetMeta(paletteDragType).defaultSize.w, COLS[bp]), h: widgetMeta(paletteDragType).defaultSize.h };
                            // The library measures the pointer in screen px; under a zoom the grid's own px are 1/zoom larger.
                            const box = scaled ? boxRef.current?.getBoundingClientRect() : null;
                            return box ? { ...size, dragOffsetX: (e.clientX - box.left) * (1 / zoom - 1), dragOffsetY: (e.clientY - box.top) * (1 / zoom - 1) } : size;
                        },
                    }}
                    droppingItem={{ i: '__dropping__', x: 0, y: 0, w: dropMeta ? Math.min(dropMeta.defaultSize.w, COLS[bp]) : 4, h: dropMeta?.defaultSize.h ?? 6 }}
                    compactor={verticalCompactor}
                    positionStrategy={positionStrategy}
                    onDragStop={editing ? (l) => commit(l) : undefined}
                    onResizeStop={editing ? (l) => commit(l) : undefined}
                    onDrop={editing ? (_l, item) => {
                        const type = paletteDragType;
                        setPaletteDrag(null);
                        if (type && item) edit!.onDropNew(type, { x: item.x, y: item.y, w: item.w, h: item.h });
                    } : undefined}
                >
                    {items.map((l) => {
                        const w = doc.widgets[l.i];
                        if (!w) return <div key={l.i} />;
                        const selected = editing && edit!.selectedId === w.id;
                        return (
                            <div
                                key={l.i}
                                data-widget-id={w.id}
                                className={cn('group relative min-w-0', selected && 'tc-selected z-[2]')}
                                onClick={editing ? (e) => { e.stopPropagation(); edit!.onSelect(w.id); } : undefined}
                            >
                                {editing ? <EditTools widget={w} edit={edit!} selected={selected} /> : null}
                                <div className={cn('h-full', editing && 'pointer-events-auto')}>{renderWidget(w, pxHeight(l.h, rowH, gap), bp)}</div>
                            </div>
                        );
                    })}
                </GridLayout>
            ) : null}
            {editing && !items.length ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">{empty}</div>
            ) : null}
        </div>
    );
}

function EditTools({ widget, edit, selected }: { widget: WidgetDef; edit: CanvasEditProps; selected: boolean }) {
    const others = edit.pages.filter((p) => !p.layouts.lg.some((l) => l.i === widget.id));
    return (
        <div className={cn('absolute -top-3 left-2 right-2 z-[3] flex items-center justify-between opacity-0 transition-opacity duration-120 group-hover:opacity-100 focus-within:opacity-100', selected && 'opacity-100')}>
            <span className="tc-drag-handle flex cursor-grab items-center gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-caption text-fg-secondary shadow-xs active:cursor-grabbing" title="Drag to move">
                <GripVertical aria-hidden size={12} />
                <span className="max-w-[160px] truncate">{widgetTitle(widget)}</span>
            </span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Actions for ${widgetTitle(widget)}`} onClick={(e) => e.stopPropagation()} className="rounded-md border border-border bg-surface-raised p-0.5 text-fg-secondary shadow-xs hover:text-fg">
                        <MoreHorizontal aria-hidden size={14} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem icon={Settings2} onSelect={() => edit.onSelect(widget.id)}>Configure</DropdownMenuItem>
                    <DropdownMenuItem icon={Copy} shortcut="⌘D" onSelect={() => edit.onDuplicate(widget.id)}>Duplicate</DropdownMenuItem>
                    {edit.onCopy ? <DropdownMenuItem icon={ClipboardCopy} shortcut="⌘C" onSelect={() => edit.onCopy!(widget.id)}>Copy</DropdownMenuItem> : null}
                    {others.length ? (
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger icon={MoveRight}>Move to page</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                {others.map((p) => <DropdownMenuItem key={p.id} onSelect={() => edit.onMoveToPage(widget.id, p.id)}>{p.title}</DropdownMenuItem>)}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={Trash2} destructive shortcut="Del" onSelect={() => edit.onDelete(widget.id)}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

const CANVAS_CSS = `
.tc-canvas .react-grid-item { transition: transform 180ms cubic-bezier(0.2,0,0,1), width 180ms, height 180ms; }
.tc-canvas .react-grid-item.react-draggable-dragging, .tc-canvas .react-grid-item.resizing { transition: none; z-index: 5; }
.tc-canvas .react-grid-item.react-grid-placeholder {
  background: var(--tc-brand-soft); opacity: 1; border-radius: 16px;
  border: 2px dashed color-mix(in oklab, var(--tc-brand) 40%, transparent); transition-duration: 100ms;
}
.tc-canvas-editing {
  background-image: radial-gradient(var(--tc-border) 1px, transparent 1px);
  background-size: 16px 16px; background-position: -8px -8px;
}
.tc-canvas .tc-selected > div:last-of-type { outline: 2px solid var(--tc-brand); outline-offset: 2px; border-radius: 16px; }
.tc-canvas .react-resizable-handle { background-image: none; width: 10px; height: 10px; opacity: 0; }
.tc-canvas .react-grid-item:hover > .react-resizable-handle, .tc-canvas .tc-selected > .react-resizable-handle { opacity: 1; }
.tc-canvas .react-resizable-handle::after {
  content: ''; position: absolute; width: 8px; height: 8px; border: 1.5px solid var(--tc-brand);
  background: var(--tc-surface); border-radius: 2px; right: 1px; bottom: 1px; left: auto; top: auto; transform: none;
}
.tc-canvas .react-resizable-handle-n, .tc-canvas .react-resizable-handle-s { left: 50%; margin-left: -5px; cursor: ns-resize; transform: none; }
.tc-canvas .react-resizable-handle-e, .tc-canvas .react-resizable-handle-w { top: 50%; margin-top: -5px; cursor: ew-resize; transform: none; }
.tc-canvas .react-resizable-handle-n { top: -5px; } .tc-canvas .react-resizable-handle-s { bottom: -5px; }
.tc-canvas .react-resizable-handle-e { right: -5px; } .tc-canvas .react-resizable-handle-w { left: -5px; }
.tc-canvas .react-resizable-handle-se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.tc-canvas .react-resizable-handle-sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.tc-canvas .react-resizable-handle-ne { right: -5px; top: -5px; cursor: nesw-resize; }
.tc-canvas .react-resizable-handle-nw { left: -5px; top: -5px; cursor: nwse-resize; }
`;
