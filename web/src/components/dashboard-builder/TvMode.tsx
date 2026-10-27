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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
    const rotate = tvRotateSec(doc);
    const [paused, setPaused] = useState(false);
    const [idle, setIdle] = useState(false);
    const [full, setFull] = useState(false);
    const [box, setBox] = useState({ zoom: 1, height: 0 });
    const clock = useClock();
    const bodyRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    useWakeLock();

    const go = useCallback((d: 1 | -1) => {
        if (pages.length < 2) return;
        onPage(pages[(idx + d + pages.length) % pages.length].id);
    }, [pages, idx, onPage]);

    // Page rotation.
    useEffect(() => {
        if (!rotate || paused || pages.length < 2) return;
        const t = setTimeout(() => go(1), rotate * 1000);
        return () => clearTimeout(t);
    }, [rotate, paused, pages.length, go, idx]);

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
            <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border-subtle px-5">
                <div className="min-w-0">
                    <p className="truncate text-title text-fg">{doc.name}</p>
                </div>
                {pages.length > 1 ? (
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-body text-fg-secondary">{pages[idx]?.title}</span>
                        <span className="flex items-center gap-1" aria-hidden>
                            {pages.map((p, i) => <span key={p.id} className={cn('h-1.5 rounded-full transition-all duration-300', i === idx ? 'w-5 bg-brand' : 'w-1.5 bg-border-strong')} />)}
                        </span>
                    </div>
                ) : null}
                <div className="ml-auto flex items-center gap-4 text-body-sm text-fg-muted">
                    {resolved ? <span className="hidden sm:inline">{fmtDateRange(resolved.range.start, resolved.range.end)}</span> : null}
                    {updatedAt ? <span className="hidden md:inline">Updated {new Date(updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span> : null}
                    <span className="tabular-nums text-title-sm text-fg">{clock}</span>
                </div>
                <div className={cn('flex items-center gap-1 transition-opacity duration-300', idle ? 'pointer-events-none opacity-0' : 'opacity-100')}>
                    {pages.length > 1 ? (
                        <>
                            <TvButton label="Previous page" onClick={() => go(-1)}><ChevronLeft size={16} /></TvButton>
                            <TvButton label={paused ? 'Resume rotation' : 'Pause rotation'} onClick={() => setPaused((p) => !p)}>{paused ? <Play size={16} /> : <Pause size={16} />}</TvButton>
                            <TvButton label="Next page" onClick={() => go(1)}><ChevronRight size={16} /></TvButton>
                        </>
                    ) : null}
                    <TvButton label={full ? 'Exit full screen' : 'Full screen'} onClick={toggleFull}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</TvButton>
                    <TvButton label="Exit TV mode" onClick={onExit}><X size={16} /></TvButton>
                </div>
            </header>
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden px-5 pt-4">
                <div ref={innerRef} style={box.zoom !== 1 ? { zoom: box.zoom } : undefined}>{box.height ? children(box.height) : null}</div>
            </div>
            {rotate && pages.length > 1 && !paused ? (
                <div aria-hidden className="h-0.5 shrink-0 bg-border-subtle">
                    <div key={`${pageId}-${rotate}`} className="h-full bg-brand/70" style={{ animation: `tc-tv-progress ${rotate}s linear forwards` }} />
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
