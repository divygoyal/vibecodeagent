'use client';

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { HomeLive } from '../homeLive';

export type LiveKind = keyof HomeLive;

// One chunk per row, fetched only when that row comes near the screen: the charts (recharts), the fix list and the
// dashboard widgets never weigh on the first load.
/* eslint-disable @typescript-eslint/no-explicit-any -- each loader's component takes its own row's data */
const LOADERS: Record<LiveKind, () => Promise<ComponentType<{ data: any }>>> = {
    site: () => import('./SiteLive').then((m) => m.SiteLive),
    traffic: () => import('./TrafficLive').then((m) => m.TrafficLive),
    fixes: () => import('./FixesLive').then((m) => m.FixesLive),
    dashboards: () => import('./DashboardLive').then((m) => m.DashboardLive),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Start loading this far before the row scrolls into view, so it is live by the time it is read. */
const AHEAD = '900px 0px';

/**
 * A product-tour row's live version (round 6): shows `children` (the static picture of that screen, sized so nothing
 * moves) until the row comes near the screen, then swaps in the real app components on the sample data. If the chunk
 * fails to load (offline, old browser), the picture simply stays.
 */
export function LiveRow<K extends LiveKind>({ kind, data, reserve, children }: { kind: K; data: NonNullable<HomeLive[K]>; reserve?: string; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [Live, setLive] = useState<ComponentType<{ data: NonNullable<HomeLive[K]> }> | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let cancelled = false;
        let started = false;
        const load = () => {
            if (started) return;
            started = true;
            LOADERS[kind]().then((C) => { if (!cancelled) setLive(() => C); }, () => { /* keep the picture */ });
        };
        if (typeof IntersectionObserver === 'undefined') {
            load();
            return () => { cancelled = true; };
        }
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                io.disconnect();
                load();
            }
        }, { rootMargin: AHEAD });
        io.observe(el);
        return () => {
            cancelled = true;
            io.disconnect();
        };
    }, [kind]);

    // The static picture must show before the swap (round 7, audit item 13: full-page captures, previews and fast
    // scrolls saw ~750 px blank cards, because every picture was lazy and far below the fold). Only the variant that is
    // rendered (this width and theme) is promoted to eager: the first row at once, the others after the page's load
    // event, so they never compete with the hero.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const promote = () => {
            for (const img of el.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
                if (img.getClientRects().length) img.loading = 'eager';
            }
        };
        if (kind === 'site') {
            promote();
            return;
        }
        let timer: number | undefined;
        const later = () => { timer = window.setTimeout(promote, 300); };
        if (document.readyState === 'complete') later();
        else window.addEventListener('load', later, { once: true });
        return () => {
            window.removeEventListener('load', later);
            if (timer) window.clearTimeout(timer);
        };
    }, [kind]);

    return (
        // Until the swap, the picture sits centred in a box as tall as the live row (`reserve`, per breakpoint), so the
        // swap moves nothing below it, also when the row is on screen at load (a #tour-… link).
        <div ref={ref} data-live-row={Live ? kind : undefined} className={cn('min-w-0', !Live && reserve && cn('flex flex-col justify-center', reserve))}>
            {Live ? <Live data={data} /> : children}
        </div>
    );
}
