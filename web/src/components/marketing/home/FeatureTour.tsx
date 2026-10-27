'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, LayoutGrid, ListChecks, PanelsTopLeft, PanelTop, Sparkles, Trophy, WandSparkles, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export type TourKey = 'portfolio' | 'site' | 'fixes' | 'traffic' | 'dashboards' | 'leaderboard' | 'ask';

/** One stop of the tour. Plain data (strings only), built on the server. */
export interface TourStop {
    key: TourKey;
    tab: string;
    title: string;
    bullets: string[];
    /** Deep link into the live demo (or a public page). */
    href: string;
    cta: string;
    alt: string;
}

const ICONS: Record<TourKey, LucideIcon> = {
    portfolio: LayoutGrid,
    site: PanelTop,
    fixes: ListChecks,
    traffic: Sparkles,
    dashboards: PanelsTopLeft,
    leaderboard: Trophy,
    ask: WandSparkles,
};

/**
 * Pixel sizes of the crops written by scripts/dev/marketing-shots.mjs (desktop: the app's content column at 2x;
 * mobile: the phone layout at 2x). The crop heights are fixed in that script, so these stay right when the
 * pictures are regenerated; update them if the script's crops change.
 */
const SIZES: Record<TourKey, { desktop: [number, number]; mobile: [number, number] }> = {
    portfolio: { desktop: [1800, 1240], mobile: [720, 494] },
    site: { desktop: [1800, 1240], mobile: [720, 1432] },
    fixes: { desktop: [1800, 1240], mobile: [720, 1432] },
    traffic: { desktop: [1800, 1240], mobile: [720, 1432] },
    dashboards: { desktop: [1800, 1240], mobile: [720, 1432] },
    leaderboard: { desktop: [1800, 844], mobile: [720, 1403] },
    ask: { desktop: [1800, 1134], mobile: [720, 1432] },
};

function src(key: TourKey, form: 'desktop' | 'mobile', theme: 'light' | 'dark') {
    return `/marketing/${key}-${form}-${theme}.webp`;
}

/**
 * Product tour: one tab per feature. Each shows the part of the real app that matters, cropped from a
 * screenshot taken through the live demo, at full size (desktop crops are ~1030 css px wide and shown at most
 * that wide, so the app's text reads at its own size); phones get the phone layout. Light or dark follows the
 * page; only the visible variant of the active tab is fetched (lazy + display:none).
 */
export function FeatureTour({ stops }: { stops: TourStop[] }) {
    const [active, setActive] = useState(0);
    const id = useId();
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const stop = stops[active];

    // Deep links such as /#tour-dashboards (footer, other pages) open that tab.
    useEffect(() => {
        const open = (hash: string) => {
            const m = /#tour-([a-z]+)$/.exec(hash);
            const i = m ? stops.findIndex((s) => s.key === m[1]) : -1;
            if (i >= 0) setActive(i);
        };
        const fromHash = () => open(window.location.hash);
        // Next's <Link> changes the hash with pushState, which fires no hashchange: watch those clicks too.
        const onClick = (e: MouseEvent) => {
            const a = (e.target as Element | null)?.closest?.('a[href*="#tour-"]');
            if (a) open(a.getAttribute('href') ?? '');
        };
        fromHash();
        window.addEventListener('hashchange', fromHash);
        document.addEventListener('click', onClick);
        return () => {
            window.removeEventListener('hashchange', fromHash);
            document.removeEventListener('click', onClick);
        };
    }, [stops]);

    const onKey = (e: KeyboardEvent, i: number) => {
        let next = -1;
        if (e.key === 'ArrowRight') next = (i + 1) % stops.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + stops.length) % stops.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = stops.length - 1;
        if (next < 0) return;
        e.preventDefault();
        setActive(next);
        refs.current[next]?.focus();
    };

    const [dw, dh] = SIZES[stop.key].desktop;
    const [mw, mh] = SIZES[stop.key].mobile;

    return (
        <div className="relative">
            {stops.map((s) => <span key={s.key} id={`tour-${s.key}`} aria-hidden className="absolute -top-24" />)}
            <div role="tablist" aria-label="Product tour" className="flex flex-wrap justify-center gap-2">
                {stops.map((s, i) => {
                    const Icon = ICONS[s.key];
                    const on = i === active;
                    return (
                        <button
                            key={s.key}
                            ref={(el) => { refs.current[i] = el; }}
                            type="button"
                            role="tab"
                            id={`${id}-tab-${s.key}`}
                            aria-selected={on}
                            aria-controls={`${id}-panel`}
                            tabIndex={on ? 0 : -1}
                            onClick={() => setActive(i)}
                            onKeyDown={(e) => onKey(e, i)}
                            className={cn(
                                'tap-area inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-body-sm font-medium whitespace-nowrap transition-colors duration-120 md:h-10 md:gap-2 md:px-4',
                                on
                                    ? 'border-brand bg-brand text-brand-fg shadow-xs'
                                    : 'border-border-subtle bg-surface text-fg-secondary hover:border-border hover:text-fg',
                            )}
                        >
                            <Icon aria-hidden size={16} strokeWidth={1.75} />
                            {s.tab}
                        </button>
                    );
                })}
            </div>

            <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${stop.key}`} className="mx-auto mt-8 max-w-[1064px] md:mt-10">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
                    <div className="min-w-0">
                        <h3 className="text-balance text-heading text-fg md:text-heading-lg">{stop.title}</h3>
                        <ul className="mt-3 flex flex-col gap-x-5 gap-y-1.5 sm:flex-row sm:flex-wrap">
                            {stop.bullets.map((b) => (
                                <li key={b} className="flex items-center gap-2 text-body text-fg-secondary">
                                    <Check aria-hidden size={16} strokeWidth={2.5} className="shrink-0 text-brand-text" />
                                    {b}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <Link
                        href={stop.href}
                        className="tap-area inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full border border-border bg-surface px-4 text-body-sm font-medium text-fg shadow-xs transition-colors duration-120 hover:bg-subtle md:self-auto"
                    >
                        {stop.cta}
                        <ArrowRight aria-hidden size={16} strokeWidth={1.75} />
                    </Link>
                </div>

                <figure className="mt-6" key={stop.key}>
                    <div className="hidden overflow-hidden rounded-panel border border-border-subtle bg-canvas shadow-[0_24px_64px_-28px_rgb(0_0_0/0.3)] md:block">
                        <Image src={src(stop.key, 'desktop', 'light')} alt={stop.alt} width={dw} height={dh} sizes="(min-width: 1112px) 1064px, 96vw" className="block h-auto w-full dark:hidden" />
                        <Image src={src(stop.key, 'desktop', 'dark')} alt={stop.alt} width={dw} height={dh} sizes="(min-width: 1112px) 1064px, 96vw" className="hidden h-auto w-full dark:block" />
                    </div>
                    <div className="mx-auto max-w-[400px] overflow-hidden rounded-card border border-border-subtle bg-canvas shadow-card md:hidden">
                        <Image src={src(stop.key, 'mobile', 'light')} alt={stop.alt} width={mw} height={mh} sizes="(max-width: 432px) 92vw, 400px" className="block h-auto w-full dark:hidden" />
                        <Image src={src(stop.key, 'mobile', 'dark')} alt={stop.alt} width={mw} height={mh} sizes="(max-width: 432px) 92vw, 400px" className="hidden h-auto w-full dark:block" />
                    </div>
                    <figcaption className="mt-3 text-center text-meta text-fg-muted">Real app · sample data</figcaption>
                </figure>
            </div>
        </div>
    );
}
