'use client';

import Link from 'next/link';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

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
    /** id prefix of the panels, for aria-controls on in-page tabs. */
    panelIdPrefix?: string;
}

/**
 * Tabs (DESIGN 3.11). Routing tabs are links; in-page tabs are a tablist with
 * arrow keys. Overflow scrolls horizontally, never wraps.
 */
export function Tabs<T extends string = string>({ items, value, onValueChange, variant = 'underline', ariaLabel, className, panelIdPrefix }: TabsProps<T>) {
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
    return (
        <div
            role={isRouting ? undefined : 'tablist'}
            aria-label={ariaLabel}
            className={cn(
                'flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                underline ? 'gap-5 border-b border-border-subtle' : 'gap-1',
                className,
            )}
        >
            {items.map((t, i) => {
                const active = t.value === value;
                const Icon = t.icon;
                const cls = cn(
                    'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors duration-120 ease-standard',
                    underline
                        ? cn('h-10 text-body font-medium', active ? 'text-fg' : 'text-fg-muted hover:text-fg')
                        : cn('h-7 rounded-md px-2.5 text-body-sm font-medium pointer-coarse:h-8', active ? 'bg-subtle text-fg' : 'text-fg-muted hover:text-fg'),
                    t.disabled && 'pointer-events-none opacity-50',
                );
                const inner = (
                    <>
                        {Icon ? <Icon aria-hidden size={16} strokeWidth={1.75} /> : null}
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
    );
}
