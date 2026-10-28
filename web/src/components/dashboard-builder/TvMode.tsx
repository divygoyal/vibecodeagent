'use client';

/**
 * Full-screen TV mode (round 2, C4): `?tv=1` on the owner view or a share link, or "Present"
 * in the dashboard menu. No app chrome; a slim top bar with the name, page, dates and a clock;
 * pages rotate every settings.tv.rotateSec; data refreshes on its own (at least every 5 min);
 * the grid rows stretch or shrink so one page fills the screen height, and big screens (wider than
 * 1440 px) zoom in so text stays readable from a distance; the screen stays awake; the cursor
 * hides after 3 s.
 * Keys: ← → change page, Space pauses rotation, F full screen, Esc exits.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDateRange } from '@/lib/format';
import type { DashboardDocV2, PageDef, ResolvedDates } from '@/lib/builder/types';

export const TV_MIN_REFRESH_SEC = 300;

/** Refresh interval for TV mode: the dashboard's own, never off and never under 5 minutes. */
export function tvRefreshMs(doc: Pick<DashboardDocV2, 'settings'>): number {
    return Math.max(TV_MIN_REFRESH_SEC, doc.settings.autoRefreshSec || TV_MIN_REFRESH_SEC) * 1000;
}

/** Rotation in seconds (0 = off). Multi-page dashboards rotate every 30 s unless set. */
export function tvRotateSec(doc: Pick<DashboardDocV2, 'settings' | 'pages'>): number {
    const pages = doc.pages.filter((p) => !p.hidden).length;
    if (pages < 2) return 0;
    const s = doc.settings.tv?.rotateSec;
    return typeof s === 'number' ? s : 30;
}

/**
 * TV screens (round 4): a page too tall for one screen at a readable row height is shown as
 * several screens in turn (charts keep real height and axes instead of being squeezed to a
 * sliver). TvFrame owns the current screen; DashboardCanvas works out how many there are.
 */
export interface TvScreenCtx { screen: number; setScreens: (n: number) => void }
const TvScreenContext = createContext<TvScreenCtx | null>(null);
export function useTvScreen(): TvScreenCtx | null {
    return useContext(TvScreenContext);
}

/** Smallest TV row height (px): a 6-row chart keeps a plot of about 160 px with its y axis. */
export const TV_MIN_ROW = 26;
/** Largest TV row height (px), so a short screen does not blow a KPI strip up to half the screen. */
export const TV_MAX_ROW = 60;

/**
 * Split a page's rows into TV screens. Rows break only where no widget spans the line; screens
 * hold whole bands, each fits `fitHeight` at TV_MIN_ROW, and are balanced in height.
 * Returns [startRow, endRow) pairs.
 */
export function tvScreens(items: Array<{ y: number; h: number }>, fitHeight: number, gap: number): Array<[number, number]> {
    const rows = items.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    if (!rows) return [[0, 0]];
    const maxRows = Math.max(1, Math.floor((fitHeight + gap) / (TV_MIN_ROW + gap)));
    if (rows <= maxRows) return [[0, rows]];
    const cuts = [0];
    for (let y = 1; y < rows; y++) if (!items.some((l) => l.y < y && l.y + l.h > y)) cuts.push(y);
    cuts.push(rows);
    const bands: Array<[number, number]> = [];
    for (let i = 0; i < cuts.length - 1; i++) bands.push([cuts[i], cuts[i + 1]]);
    const target = rows / Math.ceil(rows / maxRows);
    const out: Array<[number, number]> = [];
    let start = bands[0][0];
    let end = start;
    for (const [a, b] of bands) {
        const size = end - start;
        const next = b - start;
        if (size > 0 && (next > maxRows || Math.abs(next - target) > Math.abs(size - target))) {
            out.push([start, end]);
            start = a;
        }
        end = b;
    }
    out.push([start, end]);
    return out;
}

function useClock(): string {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 15_000);
        return () => clearInterval(t);
    }, []);
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Keep the screen on while TV mode is open (where the browser allows it). */
function useWakeLock() {
    useEffect(() => {
        type Lock = { release: () => Promise<void> };
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } };
        if (!nav.wakeLock) return;
        let lock: Lock | null = null;
        let live = true;
        const get = () => { if (document.visibilityState === 'visible') nav.wakeLock!.request('screen').then((l) => { if (live) lock = l; else void l.release(); }).catch(() => undefined); };
        get();
        document.addEventListener('visibilitychange', get);
        return () => { live = false; document.removeEventListener('visibilitychange', get); void lock?.release().catch(() => undefined); };
    }, []);
}

export function TvFrame({ doc, pageId, onPage, onExit, resolved, updatedAt, themeAttrs, themeStyle, themeClass, children }: {
    doc: DashboardDocV2;
    pageId?: string;
    onPage: (id: string) => void;
    onExit: () => void;
    resolved?: ResolvedDates;
    updatedAt?: string;
    themeAttrs?: Record<string, string>;
    themeStyle?: React.CSSProperties;
    themeClass?: string;
    /** Render the dashboard for the height (in CSS px, after zoom) one page must fit. */
    children: (fitHeight: number) => ReactNode;
}) {
    const pages: PageDef[] = doc.pages.filter((p) => !p.hidden);
    const idx = Math.max(0, pages.findIndex((p) => p.id === pageId));
    const [screen, setScreen] = useState(0);
    const [screens, setScreens] = useState(1);
    // Rotation also steps through the screens of a tall page (round 4).
    const rotate = pages.length > 1 ? tvRotateSec(doc) : screens > 1 ? (doc.settings.tv?.rotateSec ?? 30) : 0;
    const slots = pages.length * Math.max(1, screens);
    const [paused, setPaused] = useState(false);
    const [idle, setIdle] = useState(false);
    const [full, setFull] = useState(false);
    const [box, setBox] = useState({ zoom: 1, height: 0 });
    const clock = useClock();
    const bodyRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    useWakeLock();

    const go = useCallback((d: 1 | -1) => {
        const next = screen + d;
        if (next >= 0 && next < screens) { setScreen(next); return; }
        if (pages.length < 2) { setScreen(d > 0 ? 0 : Math.max(0, screens - 1)); return; }
        setScreen(0);
        onPage(pages[(idx + d + pages.length) % pages.length].id);
    }, [pages, idx, onPage, screen, screens]);
    // A new page starts at its first screen (state reset during render, not in an effect).
    const [screenPage, setScreenPage] = useState(pageId);
    if (screenPage !== pageId) { setScreenPage(pageId); setScreen(0); }
    const ctx = useMemo<TvScreenCtx>(() => ({ screen: Math.min(screen, Math.max(0, screens - 1)), setScreens: (n) => setScreens((cur) => (cur === n ? cur : n)) }), [screen, screens]);

    // Page (and screen) rotation.
    useEffect(() => {
        if (!rotate || paused || slots < 2) return;
        const t = setTimeout(() => go(1), rotate * 1000);
        return () => clearTimeout(t);
    }, [rotate, paused, slots, go, idx, screen]);

    // Idle cursor and controls.
    useEffect(() => {
        let t: ReturnType<typeof setTimeout>;
        const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 3000); };
        wake();
        window.addEventListener('mousemove', wake);
        window.addEventListener('pointerdown', wake);
        return () => { clearTimeout(t); window.removeEventListener('mousemove', wake); window.removeEventListener('pointerdown', wake); };
    }, []);

    // Full screen state; leaving full screen that TV mode entered does not exit TV mode itself.
    useEffect(() => {
        const f = () => setFull(Boolean(document.fullscreenElement));
        f();
        document.addEventListener('fullscreenchange', f);
        return () => document.removeEventListener('fullscreenchange', f);
    }, []);
    const toggleFull = useCallback(() => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }, []);

    // Keys.
    useEffect(() => {
        const k = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'Escape') { if (!document.fullscreenElement) onExit(); return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
            else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
            else if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFull(); }
        };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [go, onExit, toggleFull]);

    // Big screens zoom in (text readable across a room); the grid then fits the remaining height.
    useEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        const fit = () => {
            const w = body.clientWidth;
            const zoom = w > 1500 ? Math.min(1.75, Math.round((w / 1440) * 100) / 100) : 1;
            const height = Math.max(240, Math.floor((body.clientHeight - 20) / zoom));
            setBox((cur) => (cur.zoom === zoom && Math.abs(cur.height - height) < 4 ? cur : { zoom, height }));
        };
        const ro = new ResizeObserver(fit);
        ro.observe(body);
        fit();
        return () => ro.disconnect();
    }, []);

    return (
        <div data-tv-root="" data-tv-idle={idle ? '1' : '0'} {...themeAttrs} style={themeStyle}
            className={cn('fixed inset-0 z-[70] flex flex-col bg-canvas text-fg', themeClass)} role="dialog" aria-modal="true" aria-label={`${doc.name}, TV mode`}>
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-5 max-sm:px-3 sm:gap-4">
                {/* Narrow screens shorten the name (it truncates and its text is smaller), so the clock never wraps. */}
                <p className="min-w-0 shrink truncate text-title text-fg max-sm:text-body-sm max-sm:font-medium" title={doc.name}>{doc.name}</p>
                {pages.length > 1 || screens > 1 ? (
                    <div className="flex min-w-0 shrink items-center gap-2">
                        {pages.length > 1 ? <span className="truncate text-body text-fg-secondary max-sm:hidden">{pages[idx]?.title}</span> : null}
                        <span className="flex shrink-0 items-center gap-1" aria-hidden>
                            {pages.length > 1
                                ? pages.map((p, i) => <span key={p.id} className={cn('h-1.5 rounded-full transition-all duration-300', i === idx ? 'w-5 bg-brand' : 'w-1.5 bg-border-strong')} />)
                                : null}
                        </span>
                        {screens > 1 ? <span className="shrink-0 text-meta tabular-nums text-fg-muted" aria-label={`Screen ${ctx.screen + 1} of ${screens}`}>{ctx.screen + 1}/{screens}</span> : null}
                    </div>
                ) : null}
                <div className={cn('ml-auto flex shrink-0 items-center gap-1 transition-opacity duration-300', idle ? 'pointer-events-none opacity-0' : 'opacity-100')}>
                    {slots > 1 ? (
                        <>
                            <TvButton label="Previous" onClick={() => go(-1)}><ChevronLeft size={16} /></TvButton>
                            <TvButton label={paused ? 'Resume rotation' : 'Pause rotation'} onClick={() => setPaused((p) => !p)}>{paused ? <Play size={16} /> : <Pause size={16} />}</TvButton>
                            <TvButton label="Next" onClick={() => go(1)}><ChevronRight size={16} /></TvButton>
                        </>
                    ) : null}
                    <TvButton label={full ? 'Exit full screen' : 'Full screen'} onClick={toggleFull}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</TvButton>
                    <TvButton label="Exit TV mode" onClick={onExit}><X size={16} /></TvButton>
                </div>
                {/* Dates, update time and the clock sit at the right edge. */}
                <div className="flex shrink-0 items-center gap-4 whitespace-nowrap text-body-sm text-fg-muted">
                    {resolved ? <span className="hidden lg:inline">{fmtDateRange(resolved.range.start, resolved.range.end)}</span> : null}
                    {updatedAt ? <span className="hidden xl:inline">Updated {new Date(updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span> : null}
                    <span className="tabular-nums text-title-sm text-fg">{clock}</span>
                </div>
            </header>
            {/* Phones stack widgets instead of fitting a grid: they scroll. */}
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden px-5 pt-4 max-sm:overflow-y-auto max-sm:px-3 max-sm:pb-4">
                <TvScreenContext.Provider value={ctx}>
                    <div ref={innerRef} style={box.zoom !== 1 ? { zoom: box.zoom } : undefined}>{box.height ? children(box.height) : null}</div>
                </TvScreenContext.Provider>
            </div>
            {rotate && slots > 1 && !paused ? (
                <div aria-hidden className="h-0.5 shrink-0 bg-border-subtle">
                    <div key={`${pageId}-${ctx.screen}-${rotate}`} className="h-full bg-brand/70" style={{ animation: `tc-tv-progress ${rotate}s linear forwards` }} />
                </div>
            ) : null}
            <style>{'@keyframes tc-tv-progress { from { width: 0 } to { width: 100% } }'}</style>
        </div>
    );
}

function TvButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" aria-label={label} title={label} onClick={onClick} className="tap-area flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg">
            {children}
        </button>
    );
}
