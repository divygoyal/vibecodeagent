'use client';

import { useSyncExternalStore } from 'react';

/** Stable, timezone-free text for the server and the first client render. */
function stableDate(ts: string): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function relative(ts: string, now: number): string {
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) return ts;
    const mins = Math.floor((now - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

/*
 * Shared clock for every relative time on the page. useSyncExternalStore gives
 * null for the server render and the hydration render, then the real time
 * (rounded down to the minute, refreshed while something is mounted), so no
 * Date.now() ever shows up in the first render.
 */
const clockListeners = new Set<() => void>();
let clockMinute = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;

function readMinute(): number {
    return Math.floor(Date.now() / 60000) * 60000;
}

function subscribeClock(listener: () => void): () => void {
    clockListeners.add(listener);
    if (!clockTimer) {
        clockTimer = setInterval(() => {
            const next = readMinute();
            if (next === clockMinute) return;
            clockMinute = next;
            clockListeners.forEach((l) => l());
        }, 15000);
    }
    return () => {
        clockListeners.delete(listener);
        if (clockListeners.size === 0 && clockTimer) {
            clearInterval(clockTimer);
            clockTimer = undefined;
            clockMinute = 0;
        }
    };
}

function getClock(): number {
    if (!clockMinute) clockMinute = readMinute();
    return clockMinute;
}

function useNow(): number | null {
    return useSyncExternalStore<number | null>(subscribeClock, getClock, () => null);
}

export interface TimeAgoProps {
    value?: string | null;
    /** Shown when there is no value. */
    fallback?: string;
    className?: string;
}

/**
 * "5m ago". Renders the absolute UTC time until mounted (no Date.now() or
 * locale formatting during render, so no hydration warning), then switches to
 * the relative text. The title always has the exact time.
 */
export function TimeAgo({ value, fallback = '–', className }: TimeAgoProps) {
    const now = useNow();
    if (!value) return <span className={className}>{fallback}</span>;
    return (
        <time dateTime={value} title={stableDate(value)} className={className}>
            {now === null ? stableDate(value) : relative(value, now)}
        </time>
    );
}

/** Week-aware variant used in the support inbox: relative for a week, then a date. */
export function TimeAgoOrDate({ value, className }: { value?: string | null; className?: string }) {
    const now = useNow();
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    if (now === null) return <time dateTime={value} className={className}>{stableDate(value)}</time>;
    const days = Math.round((now - d.getTime()) / 86_400_000);
    return (
        <time dateTime={value} title={stableDate(value)} className={className}>
            {days < 7 ? relative(value, now) : d.toLocaleDateString()}
        </time>
    );
}

/** Local date and time ("10/26/2026, 3:04:05 PM"), stable UTC text until mounted. */
export function LocalTime({ value, fallback = '–', className }: TimeAgoProps) {
    const now = useNow();
    if (!value) return <span className={className}>{fallback}</span>;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return <span className={className}>{value}</span>;
    return (
        <time dateTime={value} className={className}>
            {now === null ? stableDate(value) : d.toLocaleString()}
        </time>
    );
}
