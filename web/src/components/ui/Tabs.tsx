'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface TabItem<T extends string = string> {
    value: T;
    label: ReactNode;
    /** Shown after the label in muted text. */
    count?: ReactNode;
    icon?: LucideIcon;
    /** Routing tab: renders a link with aria-current="page" when active. */
    href?: string;
    disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
    items: TabItem<T>[];
    value: T;
    /** In-page tabs (no href). */
    onValueChange?: (value: T) => void;
    /** underline: page level, under the PageHeader. pills: inside cards. */
    variant?: 'underline' | 'pills';
    ariaLabel: string;
    className?: string;
    /** Underline tabs: show item icons from md up (phones stay text-only so more tabs fit). */
    showIcons?: boolean;
    /** id prefix of the panels, for aria-controls on in-page tabs. */
    panelIdPrefix?: string;
}

/** Whether a horizontal scroller has more content to its right / left (for the edge fades and the chevron). */
function useMoreToTheRight() {
    const ref = useRef<HTMLDivElement>(null);
    const [more, setMore] = useState(false);
    const [before, setBefore] = useState(false);
    const check = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
        setBefore(el.scrollLeft > 2);
    }, []);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        check();
        const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
        ro?.observe(el);
        el.addEventListener('scroll', check, { passive: true });
        return () => {
            ro?.disconnect();
            el.removeEventListener('scroll', check);
        };
    }, [check]);
    return [ref, more, before] as const;
}

/**
 * Tabs (DESIGN 3.11). Routing tabs are links; in-page tabs are a tablist with
 * arrow keys. Overflow scrolls horizontally, never wraps; a fade on the right
 * edge shows there is more (so a cut label reads as intentional). Page-level
 * (underline) tabs are text only, like Linear and Vercel (critique 2.8): an
 * item's icon shows in pills only.
 */
export function Tabs<T extends string = string>({ items, value, onValueChange, variant = 'underline', ariaLabel, className, panelIdPrefix, showIcons }: TabsProps<T>) {
    const id = useId();
    const reduce = useReducedMotion();
    const refs = useRef<(HTMLElement | null)[]>([]);
    const isRouting = items.some((i) => i.href);

    const onKey = (e: KeyboardEvent, i: number) => {
        if (isRouting) return;
        const enabled = items.map((t, k) => (t.disabled ? -1 : k)).filter((k) => k >= 0);
        const pos = enabled.indexOf(i);
        let next = -1;
        if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length];
        else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length];
        else if (e.key === 'Home') next = enabled[0];
        else if (e.key === 'End') next = enabled[enabled.length - 1];
        if (next === undefined || next < 0) return;
        e.preventDefault();
        onValueChange?.(items[next].value);
        refs.current[next]?.focus();
    };

    const underline = variant === 'underline';
    const [scrollRef, more, before] = useMoreToTheRight();
    const activeIndex = items.findIndex((t) => t.value === value);
    // A tab past the right edge (Events & goals on a phone) scrolls into view, so the row never opens on a cut label.
    useEffect(() => {
        const box = scrollRef.current;
        const tab = refs.current[activeIndex];
        if (!box || !tab) return;
        const left = tab.offsetLeft - box.offsetLeft;
        if (left < box.scrollLeft || left + tab.offsetWidth > box.scrollLeft + box.clientWidth) {
            box.scrollLeft = Math.max(0, left - 24);
        }
    }, [activeIndex, scrollRef]);
    // Fades on the edges that hide tabs (wider than the old 40px, so a cut label reads as "more"), plus a chevron.
    // The right fade ends fully clear under the chevron (its last 20px), so no letter shows through it.
    const fade = more && before
        ? '[mask-image:linear-gradient(to_right,transparent,#000_32px,#000_calc(100%-80px),transparent_calc(100%-20px))]'
        : more ? '[mask-image:linear-gradient(to_right,#000_calc(100%-80px),transparent_calc(100%-20px))]'
            : before ? '[mask-image:linear-gradient(to_right,transparent,#000_32px)]' : null;
    return (
        <div className={cn('relative min-w-0', className)}>
        <div
            ref={scrollRef}
            role={isRouting ? undefined : 'tablist'}
            aria-label={ariaLabel}
            className={cn(
                'flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                // pills: room inside the scroll box for the 44px touch hit area (overflow clips it otherwise)
                underline ? 'gap-5 border-b border-border-subtle' : 'gap-1 pointer-coarse:-my-1.5 pointer-coarse:py-1.5',
                fade,
            )}
        >
            {items.map((t, i) => {
                const active = t.value === value;
                const Icon = t.icon;
                const cls = cn(
                    'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors duration-120 ease-standard',
                    // Touch: 44px hit area (narrow labels like "Top" are 23px wide), no layout change.
                    'pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2.5',
                    underline ? 'pointer-coarse:after:inset-y-0' : 'pointer-coarse:after:-inset-y-1.5',
                    underline
                        ? cn('h-10 text-body font-medium', active ? 'text-fg' : 'text-fg-muted hover:text-fg')
                        : cn('h-7 rounded-md px-2.5 text-body-sm font-medium pointer-coarse:h-8', active ? 'bg-subtle text-fg' : 'text-fg-muted hover:text-fg'),
                    t.disabled && 'pointer-events-none opacity-50',
                );
                const inner = (
                    <>
                        {Icon && (!underline || showIcons) ? <Icon aria-hidden size={16} strokeWidth={1.75} className={underline ? 'max-md:hidden' : undefined} /> : null}
                        <span>{t.label}</span>
                        {t.count !== undefined && t.count !== null ? <span className="text-meta text-fg-muted tabular-nums">{t.count}</span> : null}
                        {underline && active ? (
                            <motion.span
                                layoutId={`tab-${id}`}
                                transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-fg"
                            />
                        ) : null}
                    </>
                );
                if (t.href) {
                    return (
                        <Link key={t.value} href={t.href} aria-current={active ? 'page' : undefined} className={cls} ref={(el) => { refs.current[i] = el; }}>
                            {inner}
                        </Link>
                    );
                }
                return (
                    <button
                        key={t.value}
                        ref={(el) => { refs.current[i] = el; }}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-controls={panelIdPrefix ? `${panelIdPrefix}-${t.value}` : undefined}
                        tabIndex={active ? 0 : -1}
                        disabled={t.disabled}
                        onClick={() => onValueChange?.(t.value)}
                        onKeyDown={(e) => onKey(e, i)}
                        className={cls}
                    >
                        {inner}
                    </button>
                );
            })}
        </div>
            {more ? (
                <span aria-hidden className={cn('pointer-events-none absolute right-0 flex items-center text-fg-muted', underline ? 'top-0 h-10' : 'inset-y-0')}>
                    <ChevronRight size={16} strokeWidth={2} />
                </span>
            ) : null}
        </div>
    );
}
