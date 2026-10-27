'use client';

/**
 * Dashboard editor (BUILDER.md 11.2-11.5, DESIGN.md 5.10). Desktop only (1024 px and up); it
 * covers the app shell like a full-screen document editor. Left: widgets and outline. Centre:
 * canvas with a Desktop / Tablet / Phone preview width (Phone and Tablet edit their own
 * layout). Right: properties (Setup | Style) or dashboard settings. Autosave 800 ms after the
 * last change with optimistic concurrency (rev); undo/redo covers every change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
    ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, LayoutTemplate, Loader2, Monitor, MoreHorizontal, Pencil,
    Plus, Redo2, Settings2, Share2, Smartphone, Tablet, Trash2, Undo2, AlertTriangle, Filter, History, FileJson, ClipboardCopy, ClipboardPaste, MonitorPlay, Palette,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { Banner, Button, ConfirmModal, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Kbd, SegmentedControl, Tooltip } from '@/components/ui';
import { addPage, addWidget, duplicatePage, duplicateWidget, firstFreeSlot, layoutFor, moveWidgetToPage, movePage, readingOrder, removePage, removeWidget, renamePage, setLayout, updatePage, clampItem } from '@/lib/builder/docOps';
import { defaultWidget, widgetMeta, widgetTitle, newWidgetId } from '@/lib/builder/registry';
import { dimLabel } from '@/lib/builder/catalog';
import { clipLabel, copyPage, copyWidgets, parseClip, pastePage, pasteWidgets, type Clip } from '@/lib/builder/clipboard';
import { isDefaultLook, type Mode } from '@/lib/builder/themes';
import type { DashboardDocV2, DashboardRecord, FilterControl, LayoutItem, WidgetDef, WidgetType } from '@/lib/builder/types';
import { useResolvedTheme } from '@/lib/theme';
import { useEditorStore, type Viewport } from '@/stores/dashboardEditorStore';
import { DashboardCanvas, type Bp } from '../DashboardCanvas';
import { DashboardCover } from '../DashboardCover';
import { dashRootProps } from '../theme/DashTheme';
import { DateControl, FilterControlView } from '../Controls';
import { ShareDialog } from '../ShareDialog';
import { textVars } from '../DashboardView';
import { useElementWidth } from '../useElementWidth';
import { fetchJson, useInlineResult, QueryHttpError, type InlineCtx } from '../useWidgetData';
import { WidgetRenderer } from '../widgets/WidgetRenderer';
import { LeftPanel } from './LeftPanel';
import { VersionsDialog } from './VersionsDialog';
import { openAppearance, PropertiesPanel } from './PropertiesPanel';
import { notifyReadOnly } from '@/components/demo/DemoBar';
import { useDemoSession } from '@/components/demo/useDemoSession';
import type { SiteOption } from './Fields';

const VIEWPORT_W: Record<Viewport, number | null> = { desktop: null, tablet: 768, phone: 390 };
const CLIP_KEY = 'tc-dash-clipboard';

/** Last copy in this browser (fallback when the system clipboard cannot be read). */
function rememberClip(text: string) {
    try { localStorage.setItem(CLIP_KEY, text); } catch { /* storage blocked */ }
}
async function readClip(): Promise<Clip | null> {
    try {
        const text = await navigator.clipboard?.readText?.();
        const c = parseClip(text);
        if (c) return c;
    } catch { /* permission denied: fall back */ }
    try { return parseClip(localStorage.getItem(CLIP_KEY)); } catch { return null; }
}
const VIEWPORT_BP: Record<Viewport, Bp> = { desktop: 'lg', tablet: 'md', phone: 'sm' };

function isTyping(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return Boolean(el.closest('[role="dialog"],[role="listbox"],[role="menu"],[data-radix-popper-content-wrapper]'));
}

function EditorWidget({ widget, ctx, height, bp, vars }: { widget: WidgetDef; ctx: InlineCtx; height: number; bp: Bp; vars: Record<string, string> }) {
    const q = useInlineResult(widget, ctx);
    return (
        <WidgetRenderer
            widget={widget}
            result={q.data?.result ?? (q.error ? { status: 'error', code: 'UPSTREAM', message: q.error instanceof Error ? q.error.message : 'Could not load', retryable: true } : undefined)}
            loading={!q.data && !q.error}
            refetching={q.isValidating && Boolean(q.data)}
            resolved={q.data?.resolved}
            compare={ctx.controls.date.compare.mode}
            height={height}
            bp={bp}
            mode="edit"
            vars={vars}
            onRetry={() => void q.mutate()}
            onChooseSource={() => useEditorStore.getState().select(widget.id)}
        />
    );
}

export function Editor({ initial }: { initial: DashboardRecord }) {
    const router = useRouter();
    const s = useEditorStore();
    const { doc, pageId, selectedId, preview, viewport, controls, status } = s;
    const [shareOpen, setShareOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [versionsOpen, setVersionsOpen] = useState(false);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [nameEdit, setNameEdit] = useState(false);
    const [resolvedDates, setResolvedDates] = useState<import('@/lib/builder/types').ResolvedDates | undefined>();
    const searchRef = useRef<HTMLInputElement>(null);
    const [canvasRef, availWidth] = useElementWidth<HTMLDivElement>();
    const appMode = useResolvedTheme();
    const [themePreview, setThemePreview] = useState<Mode | null>(null);
    const { data: sitesData } = useSWR<{ connected: boolean; sites: SiteOption[] }>('/api/dashboards/sites', (u: string) => fetchJson(u), { revalidateOnFocus: false });
    const sites = useMemo(() => sitesData?.sites ?? [], [sitesData]);

    useEffect(() => {
        useEditorStore.getState().load(initial);
    }, [initial]);

    // ── autosave (800 ms after the last change) ──
    const save = useCallback(async (force?: boolean) => {
        const st = useEditorStore.getState();
        if (!st.doc || !st.id) return;
        const docToSave = st.doc;
        let rev = st.rev;
        if (force) {
            const cur = await fetchJson<{ dashboard: DashboardRecord }>(`/api/dashboards/${st.id}`);
            rev = cur.dashboard.rev;
        }
        st.setStatus('saving');
        try {
            const r = await fetchJson<{ dashboard: DashboardRecord }>(`/api/dashboards/${st.id}`, { method: 'PUT', headers: { 'If-Match': String(rev) }, body: JSON.stringify({ doc: docToSave }) });
            useEditorStore.getState().markSaved(r.dashboard.rev, docToSave);
        } catch (e) {
            if (e instanceof QueryHttpError && e.status === 412) useEditorStore.getState().setStatus('conflict');
            else {
                useEditorStore.getState().setStatus('error');
                toast.error(e instanceof Error ? e.message : 'Could not save');
            }
        }
    }, []);
    // Public live demo: edits stay in this tab (nothing is saved, no "leave page?" prompt); say so once.
    const { demo } = useDemoSession();
    const demoNoticeShown = useRef(false);
    useEffect(() => {
        if (status !== 'dirty') return;
        if (demo) {
            if (!demoNoticeShown.current) notifyReadOnly();
            demoNoticeShown.current = true;
            return;
        }
        const t = setTimeout(() => void save(), 800);
        return () => clearTimeout(t);
    }, [doc, status, save, demo]);
    const demoRef = useRef(demo);
    demoRef.current = demo;
    useEffect(() => {
        const warn = (e: BeforeUnloadEvent) => {
            const st = useEditorStore.getState().status;
            if (!demoRef.current && (st === 'dirty' || st === 'saving')) e.preventDefault();
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, []);

    const page = doc?.pages.find((p) => p.id === pageId) ?? doc?.pages[0];
    const bp = VIEWPORT_BP[viewport];
    const canvasWidth = VIEWPORT_W[viewport] ? Math.min(VIEWPORT_W[viewport]!, Math.max(0, availWidth - 48)) : Math.max(0, availWidth - 48);

    const defaultSite = doc?.defaultSource.type === 'site' ? sites.find((x) => x.siteId === (doc.defaultSource as { siteId: string }).siteId) : undefined;
    const familyGa4 = doc?.defaultSource.type === 'portfolio' || Boolean(defaultSite?.ga4 ?? (doc?.defaultSource.type === 'site' && doc.defaultSource.ga4));
    const familyGsc = doc?.defaultSource.type === 'portfolio' || Boolean(defaultSite?.gsc ?? (doc?.defaultSource.type === 'site' && doc.defaultSource.gsc));
    const families = useMemo(() => ({ ga4: familyGa4, gsc: familyGsc }), [familyGa4, familyGsc]);
    const defaultLabel = doc?.defaultSource.type === 'site' ? (defaultSite?.label ?? doc.defaultSource.siteId) : 'All sites';

    const ctx: InlineCtx | null = doc && controls ? { defaultSource: doc.defaultSource, controlDefs: doc.controls, controls: { ...controls, pageId: page?.id }, pageId: page?.id, timezone: doc.settings.timezone } : null;
    const vars = useMemo(() => textVars(defaultLabel, resolvedDates, page?.title ?? ''), [defaultLabel, resolvedDates, page?.title]);

    // Resolved dates for {{date_range}} in text widgets and the toolbar: one tiny query.
    useEffect(() => {
        if (!ctx) return;
        let live = true;
        fetchJson<{ resolved: import('@/lib/builder/types').ResolvedDates }>('/api/dashboards/query', { method: 'POST', body: JSON.stringify({ widgets: [], defaultSource: ctx.defaultSource, controls: ctx.controls }) })
            .then((r) => live && setResolvedDates(r.resolved)).catch(() => undefined);
        return () => { live = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(ctx?.controls.date), JSON.stringify(ctx?.defaultSource)]);

    const addOfType = useCallback((type: WidgetType, at?: { x: number; y: number; w: number; h: number }) => {
        const st = useEditorStore.getState();
        if (!st.doc || !st.pageId) return;
        const w = defaultWidget(type, { families: families.ga4 || families.gsc ? families : { ga4: true, gsc: true } }, newWidgetId());
        // Drop position only: the size is always the widget's default (the drop preview can
        // report a squeezed width, which added scorecards one column wide).
        const pos = at && VIEWPORT_BP[st.viewport] === 'lg' ? { x: at.x, y: at.y } : undefined;
        st.apply((d) => addWidget(d, st.pageId!, w, pos), { announce: `Added ${widgetMeta(type).label}` });
        st.select(w.id);
        toast(`Added ${widgetTitle(w)}`, { action: { label: 'Undo', onClick: () => useEditorStore.getState().undo() } });
        setTimeout(() => document.querySelector(`[data-widget-id="${w.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
    }, [families]);

    // ── copy and paste (widgets and pages, also across dashboards and tabs) ──
    const doPaste = useCallback((clip: Clip) => {
        const st = useEditorStore.getState();
        if (!st.doc || !st.pageId) return;
        if (clip.tc === 'trafficclaw/page') {
            let res: { pageId: string; ids: string[] } = { pageId: '', ids: [] };
            st.apply((d) => { const r = pastePage(d, clip); res = r; return r.doc; }, { announce: `Pasted ${clipLabel(clip)}` });
            if (res.pageId) st.setPage(res.pageId);
            else toast.error('A dashboard can have at most 20 pages.');
        } else {
            let ids: string[] = [];
            st.apply((d) => { const r = pasteWidgets(d, st.pageId!, clip); ids = r.ids; return r.doc; }, { announce: `Pasted ${clipLabel(clip)}` });
            if (ids[0]) {
                st.select(ids[0]);
                setTimeout(() => document.querySelector(`[data-widget-id="${ids[0]}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
            }
        }
        toast(`Pasted ${clipLabel(clip)}`, { action: { label: 'Undo', onClick: () => useEditorStore.getState().undo() } });
    }, []);
    const copyText = useCallback((text: string | null, what: string) => {
        if (!text) return;
        rememberClip(text);
        void navigator.clipboard?.writeText(text).catch(() => undefined);
        toast(`${what} copied`, { description: 'Paste with ⌘V here or in another dashboard.' });
    }, []);
    useEffect(() => {
        const onCopy = (e: ClipboardEvent) => {
            if (isTyping(e.target) || window.getSelection()?.toString()) return;
            const st = useEditorStore.getState();
            if (!st.doc || !st.selectedId || !st.pageId) return;
            const text = copyWidgets(st.doc, st.pageId, [st.selectedId]);
            if (!text) return;
            e.clipboardData?.setData('text/plain', text);
            e.preventDefault();
            rememberClip(text);
            toast(`${widgetTitle(st.doc.widgets[st.selectedId])} copied`, { description: 'Paste with ⌘V here or in another dashboard.' });
        };
        const onPaste = (e: ClipboardEvent) => {
            if (isTyping(e.target)) return;
            const clip = parseClip(e.clipboardData?.getData('text/plain'));
            if (!clip) return;
            e.preventDefault();
            doPaste(clip);
        };
        window.addEventListener('copy', onCopy);
        window.addEventListener('paste', onPaste);
        return () => { window.removeEventListener('copy', onCopy); window.removeEventListener('paste', onPaste); };
    }, [doPaste]);

    const commitLayout = useCallback((b: Bp, items: LayoutItem[]) => {
        const st = useEditorStore.getState();
        if (!st.doc || !st.pageId) return;
        const pg = st.doc.pages.find((p) => p.id === st.pageId);
        if (!pg) return;
        const current = layoutFor(st.doc, pg, b);
        const same = items.length === current.length && items.every((it) => current.some((c) => c.i === it.i && c.x === it.x && c.y === it.y && c.w === it.w && c.h === it.h));
        if (same) return;
        const clean = items.filter((it) => st.doc!.widgets[it.i]);
        st.apply((d) => setLayout(d, st.pageId!, b, clean), { announce: 'Layout changed' });
    }, []);

    // ── keyboard ──
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const st = useEditorStore.getState();
            if (!st.doc) return;
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
            if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo(); return; }
            if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
            if (isTyping(e.target)) return;
            const sel = st.selectedId ? st.doc.widgets[st.selectedId] : undefined;
            const pg = st.doc.pages.find((p) => p.id === st.pageId);
            if (mod && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); let nid = ''; st.apply((d) => { const r = duplicateWidget(d, sel.id); nid = r.id; return r.doc; }, { announce: 'Widget duplicated' }); if (nid) st.select(nid); return; }
            if (mod) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); st.apply((d) => removeWidget(d, sel.id), { announce: `${widgetTitle(sel)} deleted. Press Command Z to undo.` }); toast('Widget deleted', { action: { label: 'Undo', onClick: () => useEditorStore.getState().undo() } }); return; }
            if (e.key === 'Escape') { st.select(null); st.selectControl(null); return; }
            if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
            if (e.key.toLowerCase() === 'e') { e.preventDefault(); st.setPreview(!st.preview); return; }
            if ((e.key === '[' || e.key === ']') && pg) {
                const i = st.doc.pages.findIndex((p) => p.id === pg.id);
                const next = st.doc.pages[i + (e.key === ']' ? 1 : -1)];
                if (next) st.setPage(next.id);
                return;
            }
            if (e.key === 'Enter' && sel) { e.preventDefault(); (document.querySelector('#tc-setup input, #tc-setup button, #tc-setup textarea') as HTMLElement | null)?.focus(); return; }
            if (e.key === 'Tab' && pg && sel) {
                e.preventDefault();
                const order = readingOrder(pg.layouts.lg).map((l) => l.i);
                const i = order.indexOf(sel.id);
                const next = order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length];
                st.select(next);
                document.querySelector(`[data-widget-id="${next}"]`)?.scrollIntoView({ block: 'nearest' });
                st.setAnnounce(`${widgetTitle(st.doc.widgets[next])} selected`);
                return;
            }
            if (e.key.startsWith('Arrow') && sel && pg) {
                e.preventDefault();
                const b = VIEWPORT_BP[st.viewport];
                const cols = b === 'lg' ? 12 : b === 'md' ? 6 : 1;
                const items = layoutFor(st.doc, pg, b);
                const it = items.find((l) => l.i === sel.id);
                if (!it) return;
                const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                const moved = e.shiftKey ? { ...it, w: it.w + dx, h: it.h + dy } : { ...it, x: it.x + dx, y: Math.max(0, it.y + dy) };
                const next = clampItem(moved, sel, cols);
                st.apply((d) => setLayout(d, pg.id, b, items.map((l) => (l.i === sel.id ? next : l))), {
                    coalesce: `kbd:${sel.id}:${e.shiftKey ? 'size' : 'move'}`,
                    announce: e.shiftKey ? `${widgetTitle(sel)} resized to ${next.w} by ${next.h}` : `${widgetTitle(sel)} moved to row ${next.y + 1}, column ${next.x + 1}`,
                });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [save]);

    if (!doc || !page || !controls || !ctx) return <div className="fixed inset-0 z-[45] flex items-center justify-center bg-canvas"><Loader2 className="animate-spin text-fg-muted" aria-label="Loading editor" /></div>;

    const filters = doc.controls.filter((c): c is FilterControl => c.type === 'filter');
    const customPhone = Boolean(page.layouts.sm?.length);
    const customTablet = Boolean(page.layouts.md?.length);
    const dc = doc.controls.find((c) => c.type === 'date');

    const statusText = demo && status !== 'saved' ? 'Demo: not saved' : status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Unsaved' : status === 'error' ? 'Not saved' : status === 'conflict' ? 'Changed elsewhere' : 'Saved';
    // Round 2: the canvas shows the dashboard's theme live (light or dark preview).
    const themed = !isDefaultLook(doc.theme);
    const canvasMode: Mode = themePreview ?? appMode;
    const look = themed ? dashRootProps(doc.theme, canvasMode) : null;
    const showCover = Boolean(doc.theme.cover?.enabled) && page.id === doc.pages.find((p) => !p.hidden)?.id;

    return (
        <div className="tc-root fixed inset-0 z-[45] flex flex-col bg-canvas text-fg" data-editor>
            {/* Toolbar */}
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-3">
                <h1 className="sr-only">Edit dashboard: {doc.name}</h1>
                <Tooltip content="Back to the dashboard"><Button asChild variant="ghost" iconOnly icon={ArrowLeft} aria-label="Back"><Link href={`/dashboard/dashboards/${s.id}`} /></Button></Tooltip>
                {nameEdit ? (
                    <input autoFocus aria-label="Dashboard name" defaultValue={doc.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== doc.name) s.apply((d) => ({ ...d, name: v.slice(0, 200) })); setNameEdit(false); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setNameEdit(false); }} className="h-8 w-64 rounded-md border border-border bg-surface px-2 text-title-sm text-fg" />
                ) : (
                    <button type="button" onClick={() => setNameEdit(true)} className="group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-subtle" title="Rename">
                        <span className="max-w-[260px] truncate text-title-sm text-fg">{doc.name}</span>
                        <Pencil aria-hidden size={13} className="text-fg-faint group-hover:text-fg-muted" />
                    </button>
                )}
                <span className="hidden truncate rounded-badge bg-subtle px-2 py-0.5 text-meta text-fg-secondary xl:inline">{defaultLabel}</span>
                <div className="ml-2"><DateControl range={controls.date.range} compare={controls.date.compare} onChange={(range, compare) => s.setControls({ ...controls, date: { range, compare } })} resolved={resolvedDates} size="sm" /></div>
                <div className="ml-auto flex items-center gap-1">
                    <Tooltip content={<span>Undo <Kbd>⌘Z</Kbd></span>}><Button variant="ghost" iconOnly icon={Undo2} aria-label="Undo" disabled={!s.past.length} onClick={s.undo} /></Tooltip>
                    <Tooltip content={<span>Redo <Kbd>⌘⇧Z</Kbd></span>}><Button variant="ghost" iconOnly icon={Redo2} aria-label="Redo" disabled={!s.future.length} onClick={s.redo} /></Tooltip>
                    <span className={cn('mx-2 inline-flex items-center gap-1 text-meta', status === 'error' || status === 'conflict' ? 'text-down' : 'text-fg-muted')} aria-live="polite">
                        {status === 'saving' ? <Loader2 aria-hidden size={14} className="animate-spin" /> : status === 'saved' ? <Check aria-hidden size={14} /> : status === 'error' || status === 'conflict' ? <AlertTriangle aria-hidden size={14} /> : null}
                        {statusText}
                    </span>
                    <Tooltip content="Theme, branding and cover"><Button variant="ghost" icon={Palette} className="xl:hidden" iconOnly aria-label="Theme" onClick={() => { s.setPreview(false); s.select(null); s.selectControl(null); openAppearance(); }} /></Tooltip>
                    <Button variant="ghost" icon={Palette} className="hidden xl:inline-flex" onClick={() => { s.setPreview(false); s.select(null); s.selectControl(null); openAppearance(); }}>Theme</Button>
                    <Button variant={preview ? 'primary' : 'secondary'} icon={preview ? EyeOff : Eye} onClick={() => s.setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</Button>
                    <Button variant="primary" icon={Share2} onClick={() => setShareOpen(true)}>Share</Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" iconOnly icon={MoreHorizontal} aria-label="More" /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem icon={Copy} onSelect={async () => { await save(); const r = await fetchJson<{ dashboard: DashboardRecord }>(`/api/dashboards/${s.id}/duplicate`, { method: 'POST', body: '{}' }); router.push(`/dashboard/dashboards/${r.dashboard.id}/edit`); }}>Duplicate</DropdownMenuItem>
                            <DropdownMenuItem icon={LayoutTemplate} onSelect={async () => { await save(); await fetchJson(`/api/dashboards/${s.id}/duplicate?asTemplate=1`, { method: 'POST', body: '{}' }); toast.success('Saved to My templates'); }}>Save as my template</DropdownMenuItem>
                            <DropdownMenuItem icon={Settings2} onSelect={() => { s.select(null); s.selectControl(null); }}>Dashboard settings</DropdownMenuItem>
                            <DropdownMenuItem icon={ClipboardPaste} shortcut="⌘V" onSelect={async () => { const c = await readClip(); if (c) doPaste(c); else toast('Nothing to paste', { description: 'Copy a widget (⌘C) or a page first, in any dashboard.' }); }}>Paste widgets</DropdownMenuItem>
                            <DropdownMenuItem icon={MonitorPlay} onSelect={async () => { await save(); window.open(`/dashboard/dashboards/${s.id}?tv=1`, '_blank', 'noopener'); }}>Present (TV mode)</DropdownMenuItem>
                            <DropdownMenuItem icon={History} onSelect={() => setVersionsOpen(true)}>Version history</DropdownMenuItem>
                            <DropdownMenuItem icon={FileJson} onSelect={() => {
                                const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
                                const a = document.createElement('a');
                                a.href = URL.createObjectURL(blob);
                                a.download = `${doc.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.dashboard.json`;
                                a.click();
                            }}>Export JSON</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem icon={Trash2} destructive onSelect={() => setConfirmDelete(true)}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {status === 'conflict' ? (
                <Banner variant="warn" className="m-3 mb-0" title="This dashboard changed in another tab." actions={<><Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Reload</Button><Button size="sm" variant="primary" onClick={() => void save(true)}>Overwrite</Button></>} />
            ) : null}

            <div className="flex min-h-0 flex-1">
                {!preview ? <LeftPanel ref={searchRef} doc={doc} onAdd={(t) => addOfType(t)} /> : null}

                <main className="flex min-w-0 flex-1 flex-col">
                    {/* Pages + controls */}
                    <div className="shrink-0 border-b border-border-subtle bg-surface px-4">
                        <div className="flex items-center gap-1 overflow-x-auto">
                            {doc.pages.map((p, i) => {
                                const on = p.id === page.id;
                                return renaming === p.id ? (
                                    <input key={p.id} autoFocus aria-label="Page name" defaultValue={p.title} onBlur={(e) => { s.apply((d) => renamePage(d, p.id, e.target.value)); setRenaming(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }} className="my-1.5 h-7 w-36 rounded-md border border-border bg-surface px-2 text-body-sm" />
                                ) : (
                                    <div key={p.id} className="group relative flex shrink-0 items-center">
                                        <button type="button" role="tab" aria-selected={on} onClick={() => s.setPage(p.id)} onDoubleClick={() => setRenaming(p.id)} className={cn('h-10 px-3 text-body-sm font-medium', on ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
                                            {p.title}{p.hidden ? <span className="ml-1 text-caption text-fg-faint">(hidden)</span> : null}
                                        </button>
                                        {on ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" /> : null}
                                        {on ? (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><button type="button" aria-label={`Page ${p.title} actions`} className="-ml-2 rounded p-0.5 text-fg-faint hover:bg-subtle hover:text-fg"><MoreHorizontal aria-hidden size={14} /></button></DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <DropdownMenuItem icon={Pencil} onSelect={() => setRenaming(p.id)}>Rename</DropdownMenuItem>
                                                    <DropdownMenuItem icon={Copy} onSelect={() => { let nid = ''; s.apply((d) => { const r = duplicatePage(d, p.id); nid = r.id; return r.doc; }); if (nid) s.setPage(nid); }}>Duplicate</DropdownMenuItem>
                                                    <DropdownMenuItem icon={ClipboardCopy} onSelect={() => copyText(copyPage(doc, p.id), `Page “${p.title}”`)}>Copy page</DropdownMenuItem>
                                                    <DropdownMenuItem icon={ChevronLeft} disabled={i === 0} onSelect={() => s.apply((d) => movePage(d, p.id, -1))}>Move left</DropdownMenuItem>
                                                    <DropdownMenuItem icon={ChevronRight} disabled={i === doc.pages.length - 1} onSelect={() => s.apply((d) => movePage(d, p.id, 1))}>Move right</DropdownMenuItem>
                                                    <DropdownMenuItem icon={p.hidden ? Eye : EyeOff} onSelect={() => s.apply((d) => updatePage(d, p.id, (x) => ({ ...x, hidden: !x.hidden })))}>{p.hidden ? 'Show to viewers' : 'Hide from viewers'}</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem icon={Trash2} destructive disabled={doc.pages.length <= 1} onSelect={() => { s.apply((d) => removePage(d, p.id), { announce: 'Page deleted. Press Command Z to undo.' }); toast('Page deleted', { action: { label: 'Undo', onClick: () => useEditorStore.getState().undo() } }); }}>Delete page</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ) : null}
                                    </div>
                                );
                            })}
                            {!preview ? <Button size="sm" variant="ghost" icon={Plus} aria-label="Add page" onClick={() => { let nid = ''; s.apply((d) => { const r = addPage(d); nid = r.id; return r.doc; }); if (nid) s.setPage(nid); }}>Page</Button> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pb-2.5">
                            {filters.map((f) => (
                                <div key={f.id} className={cn('flex items-center rounded-control', s.selectedControlId === f.id && 'outline-2 outline-offset-2 outline-brand')}>
                                    <FilterControlView control={f} value={controls.filters[f.id] ?? []} onChange={(v) => s.setControls({ ...controls, filters: { ...controls.filters, [f.id]: v } })}
                                        options={{ load: (c, q) => fetchJson<{ options: Array<{ value: string; label: string }> }>(`/api/dashboards/options?dimension=${encodeURIComponent(c.dimension)}&q=${encodeURIComponent(q)}${doc.defaultSource.type === 'site' ? `&siteId=${encodeURIComponent(doc.defaultSource.siteId)}` : ''}`).then((r) => r.options) }} />
                                    {!preview ? <button type="button" aria-label={`Edit ${f.label} control`} onClick={() => s.selectControl(f.id)} className="ml-0.5 rounded p-1 text-fg-faint hover:bg-subtle hover:text-fg"><Settings2 aria-hidden size={14} /></button> : null}
                                </div>
                            ))}
                            {!preview ? (
                                <Button size="sm" variant="ghost" icon={Filter} onClick={() => {
                                    const used = new Set(filters.map((f) => f.dimension));
                                    const dim = ['country', 'device', 'channel', 'page'].find((d) => !used.has(d)) ?? 'country';
                                    const id = `f_${dim}_${Math.random().toString(36).slice(2, 6)}`;
                                    s.apply((d) => ({ ...d, controls: [...d.controls, { id, type: 'filter', label: dimLabel(dim), dimension: dim, ui: dim === 'page' ? 'search' : 'multiselect', scope: { mode: 'all' }, viewerCanChange: true }] }));
                                    s.selectControl(id);
                                }}>Add filter</Button>
                            ) : null}
                            {dc && dc.type === 'date' && !dc.viewerCanChange ? <span className="text-meta text-fg-muted">Dates are locked for viewers</span> : null}
                        </div>
                    </div>

                    {/* Viewport switcher */}
                    <div className="flex shrink-0 items-center justify-center gap-3 py-2">
                        <SegmentedControl<Viewport> ariaLabel="Preview width" variant="neutral" size="sm" value={viewport} onChange={s.setViewport}
                            options={[{ value: 'desktop', label: 'Desktop', icon: Monitor }, { value: 'tablet', label: 'Tablet', icon: Tablet }, { value: 'phone', label: 'Phone', icon: Smartphone }]} />
                        {viewport === 'phone' && customPhone ? <span className="flex items-center gap-2 text-meta text-fg-muted">Custom phone layout <button type="button" className="font-medium text-brand-text hover:underline" onClick={() => s.apply((d) => updatePage(d, page.id, (p) => ({ ...p, layouts: { ...p.layouts, sm: undefined } })))}>Reset to automatic</button></span> : null}
                        {viewport === 'tablet' && customTablet ? <span className="flex items-center gap-2 text-meta text-fg-muted">Custom tablet layout <button type="button" className="font-medium text-brand-text hover:underline" onClick={() => s.apply((d) => updatePage(d, page.id, (p) => ({ ...p, layouts: { ...p.layouts, md: undefined } })))}>Reset to automatic</button></span> : null}
                        {themed ? <SegmentedControl<Mode> ariaLabel="Theme preview" variant="neutral" size="sm" value={canvasMode} onChange={(m) => setThemePreview(m)} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /> : null}
                    </div>

                    {/* Canvas */}
                    <div ref={canvasRef} {...look?.attrs} style={look?.style} className={cn('min-h-0 flex-1 overflow-auto px-6 pb-16', look && 'pt-4', look?.className)} onClick={(e) => { if (e.target === e.currentTarget) { s.select(null); s.selectControl(null); } }}>
                        <div className="mx-auto" style={{ width: canvasWidth || undefined }}>
                            {showCover ? (
                                <div className="pointer-events-none mb-4" aria-label="Cover preview">
                                    <DashboardCover theme={doc.theme} name={doc.name} vars={vars} pages={doc.pages.filter((p) => !p.hidden)} currentPageId={page.id} dark={(look?.mode ?? canvasMode) === 'dark'} />
                                </div>
                            ) : null}
                            <DashboardCanvas
                                doc={doc}
                                page={page}
                                bp={bp}
                                width={canvasWidth}
                                mode={preview ? 'view' : 'edit'}
                                renderWidget={(w, h, b) => <EditorWidget widget={w} ctx={ctx} height={h} bp={b} vars={vars} />}
                                edit={preview ? undefined : {
                                    selectedId,
                                    onSelect: (id) => s.select(id),
                                    onCommitLayout: commitLayout,
                                    onDropNew: (type, at) => addOfType(type, at),
                                    onDuplicate: (id) => { let nid = ''; s.apply((d) => { const r = duplicateWidget(d, id); nid = r.id; return r.doc; }); if (nid) s.select(nid); },
                                    onCopy: (id) => copyText(copyWidgets(doc, page.id, [id]), widgetTitle(doc.widgets[id])),
                                    onDelete: (id) => s.apply((d) => removeWidget(d, id), { announce: 'Widget deleted' }),
                                    onMoveToPage: (id, to) => s.apply((d) => moveWidgetToPage(d, id, to), { announce: 'Widget moved to another page' }),
                                    pages: doc.pages,
                                }}
                                empty={
                                    <div className="pointer-events-auto rounded-card border border-dashed border-border bg-surface/80 px-6 py-8 text-center">
                                        <p className="text-title-sm text-fg">Add your first widget</p>
                                        <p className="mt-1 text-body-sm text-fg-muted">Drag one from the left, or click it. Press <Kbd>E</Kbd> to preview.</p>
                                        <div className="mt-3 flex justify-center gap-2">
                                            <Button size="sm" variant="secondary" onClick={() => addOfType('kpi-strip')}>KPI strip</Button>
                                            <Button size="sm" variant="secondary" onClick={() => addOfType('timeseries')}>Time series</Button>
                                            <Button size="sm" variant="secondary" onClick={() => addOfType('table')}>Table</Button>
                                        </div>
                                    </div>
                                }
                            />
                            {!preview && page.layouts.lg.length ? (
                                <button type="button" onClick={() => addOfType('scorecard', { ...firstFreeSlot(page.layouts.lg, 3, 4), w: 3, h: 4 })} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-card border border-dashed border-border text-body-sm text-fg-muted hover:border-border-strong hover:text-fg">
                                    <Plus aria-hidden size={16} /> Add widget
                                </button>
                            ) : null}
                        </div>
                    </div>
                </main>

                {!preview ? <PropertiesPanel doc={doc} sites={sites} defaultLabel={defaultLabel} /> : null}
            </div>

            <p className="sr-only" aria-live="polite">{s.announce}</p>

            {s.id && s.share ? (
                <ShareDialog open={shareOpen} onOpenChange={setShareOpen} dashboardId={s.id} doc={doc} share={s.share} views={s.views} onShareChange={s.setShare}
                    onDocChange={(next: DashboardDocV2) => s.apply(() => next)} />
            ) : null}
            {s.id ? <VersionsDialog open={versionsOpen} onOpenChange={setVersionsOpen} dashboardId={s.id} /> : null}
            <ConfirmModal open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this dashboard?" description="Its public link stops working. This cannot be undone." confirmLabel="Delete"
                onConfirm={async () => { await fetchJson(`/api/dashboards/${s.id}`, { method: 'DELETE' }); router.push('/dashboard/dashboards'); }} />
        </div>
    );
}

