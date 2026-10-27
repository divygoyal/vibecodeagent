'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, LayoutGrid, ListChecks, MessagesSquare, PanelsTopLeft, PanelTop, Sparkles, Trophy, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export type TourKey = 'portfolio' | 'site' | 'fixes' | 'traffic' | 'dashboards' | 'leaderboard' | 'mcp';

/** One stop of the tour. Plain data (strings only), built on the server. */
export interface TourStop {
    key: TourKey;
    tab: string;
    title: string;
    bullets: string[];
    /** Deep link into the live demo (or a public page). */
    href: string;
    cta: string;
    /** Address shown in the browser frame. */
    url: string;
    alt: string;
}

const ICONS: Record<TourKey, LucideIcon> = {
    portfolio: LayoutGrid,
    site: PanelTop,
    fixes: ListChecks,
    traffic: Sparkles,
    dashboards: PanelsTopLeft,
    leaderboard: Trophy,
    mcp: MessagesSquare,
};

/** Screenshot files from scripts/dev/marketing-shots.mjs: desktop 1600x1000, mobile 780x1520. */
function src(key: TourKey, form: 'desktop' | 'mobile', theme: 'light' | 'dark') {
    return `/marketing/${key}-${form}-${theme}.webp`;
}

/**
 * Product tour: one tab per feature, each with a real screenshot of the app (desktop picture from md up,
 * the phone layout below; light or dark with the page), a short headline, three bullets and a link that
 * opens the same screen in the live demo. Only the active tab's pictures are in the DOM, and of the four
 * variants only the one on screen is fetched (lazy + display:none).
 */
export function FeatureTour({ stops }: { stops: TourStop[] }) {
    const [active, setActive] = useState(0);
    const id = useId();
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const stop = stops[active];

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
        refs.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    return (
        <div>
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
                <div role="tablist" aria-label="Product tour" className="flex w-max gap-2 md:mx-auto md:flex-wrap md:justify-center">
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
                                    'tap-area inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-body-sm font-medium whitespace-nowrap transition-colors duration-120',
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
            </div>

            <div
                role="tabpanel"
                id={`${id}-panel`}
                aria-labelledby={`${id}-tab-${stop.key}`}
                className="mt-8 grid grid-cols-1 items-center gap-8 md:mt-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12"
            >
                <div className="order-2 lg:order-1">
                    <h3 className="text-balance text-heading text-fg md:text-heading-lg">{stop.title}</h3>
                    <ul className="mt-5 space-y-3">
                        {stop.bullets.map((b) => (
                            <li key={b} className="flex items-start gap-3 text-body-lg text-fg-secondary">
                                <span className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
                                    <Check aria-hidden size={12} strokeWidth={2.5} />
                                </span>
                                <span>{b}</span>
                            </li>
                        ))}
                    </ul>
                    <Link
                        href={stop.href}
                        className="tap-area mt-7 inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-5 text-body font-medium text-fg shadow-xs transition-colors duration-120 hover:bg-subtle"
                    >
                        {stop.cta}
                        <ArrowRight aria-hidden size={16} strokeWidth={1.75} />
                    </Link>
                </div>

                <figure className="order-1 min-w-0 lg:order-2" key={stop.key}>
                    {/* Tablet and desktop: the desktop app in a browser frame. */}
                    <div className="hidden overflow-hidden rounded-panel border border-border-subtle bg-surface shadow-card md:block">
                        <div className="flex h-9 items-center gap-3 border-b border-border-subtle px-4">
                            <div aria-hidden className="flex gap-1.5">
                                <span className="size-2.5 rounded-full bg-border" />
                                <span className="size-2.5 rounded-full bg-border" />
                                <span className="size-2.5 rounded-full bg-border" />
                            </div>
                            <div className="mx-auto flex h-6 min-w-0 max-w-[360px] flex-1 items-center justify-center rounded-full bg-subtle px-3 font-mono text-caption text-fg-muted">
                                <span className="truncate">{stop.url}</span>
                            </div>
                            <div aria-hidden className="w-[42px]" />
                        </div>
                        <div className="relative aspect-[16/10] bg-canvas">
                            <Image src={src(stop.key, 'desktop', 'light')} alt={stop.alt} fill sizes="(min-width: 1200px) 760px, (min-width: 1024px) 64vw, 92vw" className="object-cover object-top dark:hidden" />
                            <Image src={src(stop.key, 'desktop', 'dark')} alt={stop.alt} fill sizes="(min-width: 1200px) 760px, (min-width: 1024px) 64vw, 92vw" className="hidden object-cover object-top dark:block" />
                        </div>
                    </div>
                    {/* Phones: the app's phone layout, top of the screen. */}
                    <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[28px] border-[6px] border-[#0d1110] bg-canvas shadow-card ring-1 ring-border md:hidden">
                        <div className="relative aspect-[390/640]">
                            <Image src={src(stop.key, 'mobile', 'light')} alt={stop.alt} fill sizes="308px" className="object-cover object-top dark:hidden" />
                            <Image src={src(stop.key, 'mobile', 'dark')} alt={stop.alt} fill sizes="308px" className="hidden object-cover object-top dark:block" />
                        </div>
                    </div>
                    <figcaption className="mt-3 text-center font-mono text-caption text-fg-muted md:text-left">
                        Fig. {active + 2} · {stop.tab}, real app · sample data
                    </figcaption>
                </figure>
            </div>
        </div>
    );
}
