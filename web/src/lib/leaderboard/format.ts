/**
 * Leaderboard text helpers. Numbers come from the app's one formatter (lib/format);
 * this file only decides what a shared metric looks like in text (exact number or band).
 */
import { computeDelta, fmtCompact, fmtDay, fmtDuration, fmtFull, fmtPercent } from '@/lib/format';
import type { CountMetric, EngagementMetric } from './types';

export const compact = fmtCompact;

/** What a shared count looks like in text: the number, or the band. */
export function metricText(m: CountMetric | null | undefined): string | null {
    if (!m) return null;
    return m.mode === 'exact' ? fmtCompact(m.value) : m.label;
}

/** Exact figure for tooltips (only for exact metrics). */
export function metricExact(m: CountMetric | null | undefined): string | null {
    if (!m || m.mode !== 'exact') return null;
    return fmtFull(m.value);
}

/** "▲ 18.4%" for plain-text contexts (SVG badge, OG image). */
export function deltaText(pct: number | null | undefined): string | null {
    if (pct === null || pct === undefined) return null;
    const d = computeDelta(100 + pct, 100);
    return d.state === 'none' ? null : d.label;
}

export function engagementText(e: EngagementMetric | null | undefined): string | null {
    if (!e) return null;
    return e.mode === 'exact' ? fmtPercent(e.rate / 100, { tile: true }) : e.label;
}

export const durationText = fmtDuration;
export const shortDate = (iso: string | null | undefined): string | null => (iso ? fmtDay(iso) : null);

export function timeAgo(iso: string | null | undefined, now = Date.now()): string | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const mins = Math.max(Math.round((now - t) / 60_000), 0);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return `${days} d ago`;
}
