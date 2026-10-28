'use client';

import Link from 'next/link';
import { useSyncExternalStore, type ReactNode } from 'react';
import { ArrowRight, Diamond, StickyNote } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDay } from '@/lib/format';
import { Tooltip } from '@/components/ui/Tooltip';
import type { LiveMarker } from '../homeLive';

/**
 * The frame of a live row: the app's page colour behind real components (like the static crop it replaces), and a
 * footer that says what this is (sample data) and what to try, with a link into the live demo.
 */
export function LiveFrame({ children, hint, href, linkLabel, className }: { children: ReactNode; hint: ReactNode; href: string; linkLabel: string; className?: string }) {
    return (
        <figure className={cn('min-w-0 overflow-hidden rounded-card border border-border-subtle bg-canvas md:rounded-panel md:shadow-[0_20px_48px_-28px_rgb(0_0_0/0.28)] md:dark:shadow-none', className)}>
            <div className="p-3 md:p-4">{children}</div>
            <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border-subtle bg-surface px-3 py-2 md:px-4">
                <p className="text-meta text-fg-secondary">
                    <span className="mr-1.5 rounded-full bg-subtle px-2 py-0.5 font-medium text-fg">Sample data</span>
                    {hint}
                </p>
                <Link href={href} className="tap-area inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-text hover:text-fg">
                    {linkLabel}
                    <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                </Link>
            </figcaption>
        </figure>
    );
}

/** True on touch screens (coarse pointer): the hints say "tap" instead of "click" and "hover". */
export function useCoarsePointer(): boolean {
    return useSyncExternalStore(
        (cb) => {
            const mql = window.matchMedia('(pointer: coarse)');
            mql.addEventListener('change', cb);
            return () => mql.removeEventListener('change', cb);
        },
        () => window.matchMedia('(pointer: coarse)').matches,
        () => false,
    );
}

/** TimeSeriesChart annotations: one per row date (labels joined), as the site pages draw them. */
export function toAnnotations(markers: LiveMarker[]): { date: string; label: string }[] {
    const by = new Map<string, string[]>();
    for (const m of markers) by.set(m.at, [...(by.get(m.at) ?? []), m.label]);
    return [...by].map(([date, labels]) => ({ date, label: labels.join(' · ') }));
}

/**
 * The key under a chart (Google updates and notes), read-only: the app's marker chips without "Add note". `oneLine`
 * keeps them on one line that scrolls sideways (with an edge fade), so the key never adds rows under a short chart.
 */
export function MarkerChips({ markers, className, oneLine, bare }: { markers: LiveMarker[]; className?: string; oneLine?: boolean; bare?: boolean }) {
    if (!markers.length) return null;
    return (
        <div className={cn(
            'flex items-center gap-x-1.5 gap-y-1.5',
            !bare && 'mt-3 border-t border-border-subtle pt-3',
            oneLine ? 'overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [&>*]:shrink-0' : 'flex-wrap',
            className,
        )}>
            <span className="mr-0.5 text-meta text-fg-muted">Markers</span>
            {markers.map((m) => (
                <Tooltip key={m.key} content={<span className="block max-w-xs">{m.detail}</span>}>
                    <button
                        type="button"
                        className="inline-flex h-6 max-w-[18rem] min-w-0 items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-2 text-meta text-fg-secondary hover:bg-subtle pointer-coarse:h-8"
                    >
                        {m.kind === 'google'
                            ? <Diamond aria-hidden size={10} strokeWidth={2} className="shrink-0 fill-warn text-warn" />
                            : <StickyNote aria-hidden size={12} strokeWidth={1.75} className="shrink-0 text-brand-text" />}
                        <span className="tabular-nums text-fg-muted">{fmtDay(m.date)}</span>
                        <span className="truncate">{m.label}</span>
                    </button>
                </Tooltip>
            ))}
        </div>
    );
}
