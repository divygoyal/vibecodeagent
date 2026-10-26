'use client';

import { useEffect, useState, type CSSProperties } from 'react';

import { cn } from '@/lib/cn';

export interface SkeletonProps {
    className?: string;
    style?: CSSProperties;
    /** Show only after this many ms to avoid a flash on fast loads (default 150). 0 = immediately. */
    delay?: number;
    rounded?: 'sm' | 'md' | 'full' | 'card';
}

const ROUNDED = { sm: 'rounded-[4px]', md: 'rounded-md', full: 'rounded-full', card: 'rounded-card' };

/**
 * Shimmer block. Size it like the final content (DESIGN 3.15). The space is
 * reserved during the delay, only the shimmer waits.
 */
export function Skeleton({ className, style, delay = 150, rounded = 'md' }: SkeletonProps) {
    const [visible, setVisible] = useState(delay === 0);
    useEffect(() => {
        if (delay === 0) return;
        const t = window.setTimeout(() => setVisible(true), delay);
        return () => window.clearTimeout(t);
    }, [delay]);
    return (
        <span
            aria-hidden
            className={cn('block', visible ? 'skeleton' : 'opacity-0', ROUNDED[rounded], className)}
            style={style}
        />
    );
}

/** Lines of text-shaped skeleton bars; the last line is shorter. */
export function SkeletonText({ lines = 2, className, delay }: { lines?: number; className?: string; delay?: number }) {
    return (
        <span className={cn('flex flex-col gap-2', className)} aria-hidden>
            {Array.from({ length: lines }, (_, i) => (
                <Skeleton key={i} delay={delay} className={cn('h-3', i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')} />
            ))}
        </span>
    );
}
