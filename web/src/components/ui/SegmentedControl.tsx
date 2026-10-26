'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
    value: T;
    label: ReactNode;
    icon?: LucideIcon;
    /** Required when the option shows only an icon. */
    ariaLabel?: string;
    disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
    options: SegmentedOption<T>[];
    /** null = no selection (e.g. a non-quick date preset is active). */
    value: T | null;
    onChange: (value: T) => void;
    /** brand (default, like the reference "3m") or neutral (inside cards). */
    variant?: 'brand' | 'neutral';
    size?: 'sm' | 'md';
    ariaLabel: string;
    className?: string;
}

/**
 * Pill segmented control (DESIGN 3.8). role="radiogroup"; arrow keys move and
 * select, Home/End jump. The selected background slides between items.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, variant = 'brand', size = 'md', ariaLabel, className }: SegmentedControlProps<T>) {
    const id = useId();
    const reduce = useReducedMotion();
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    const selectedIndex = options.findIndex((o) => o.value === value);
    const focusIndex = selectedIndex >= 0 ? selectedIndex : enabled[0] ?? 0;

    const move = (e: KeyboardEvent, i: number) => {
        const pos = enabled.indexOf(i);
        let next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(pos + 1) % enabled.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(pos - 1 + enabled.length) % enabled.length];
        else if (e.key === 'Home') next = enabled[0];
        else if (e.key === 'End') next = enabled[enabled.length - 1];
        if (next === undefined || next < 0) return;
        e.preventDefault();
        onChange(options[next].value);
        refs.current[next]?.focus();
    };

    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className={cn('tc-control inline-flex shrink-0 items-center rounded-full bg-subtle p-[3px]', size === 'md' ? 'h-9' : 'h-8', className)}
        >
            {options.map((o, i) => {
                const active = o.value === value;
                const Icon = o.icon;
                return (
                    <button
                        key={o.value}
                        ref={(el) => { refs.current[i] = el; }}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={o.ariaLabel}
                        disabled={o.disabled}
                        tabIndex={i === focusIndex ? 0 : -1}
                        onClick={() => onChange(o.value)}
                        onKeyDown={(e) => move(e, i)}
                        className={cn(
                            'relative flex h-full min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-body-sm font-medium',
                            'transition-colors duration-120 ease-standard disabled:opacity-50',
                            active ? (variant === 'brand' ? 'text-brand-fg' : 'text-fg') : 'text-fg-muted hover:text-fg',
                        )}
                    >
                        {active ? (
                            <motion.span
                                layoutId={`seg-${id}`}
                                transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                className={cn('absolute inset-0 rounded-full shadow-xs', variant === 'brand' ? 'bg-brand' : 'bg-surface')}
                            />
                        ) : null}
                        {Icon ? <Icon aria-hidden size={size === 'md' ? 16 : 14} strokeWidth={1.75} className="relative" /> : null}
                        {o.label !== null && o.label !== undefined && o.label !== '' ? <span className="relative">{o.label}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}
