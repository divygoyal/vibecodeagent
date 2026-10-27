/**
 * Leaderboard text helpers. Numbers come from the app's one formatter (lib/format);
 * this file only decides what a shared metric looks like in text (exact number or band).
 */
import { computeDelta, fmtCompact, fmtDay, fmtDayYear, fmtDuration, fmtFull, fmtPercent } from '@/lib/format';
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

/**
 * How fresh the numbers are, as text for the board and profile (round 2, critique #9).
 *  - fresh   (under 36 h): "Updated 3 h ago". The only level where "checked daily" is true.
 *  - recent  (under 8 days): "Updated Oct 25" (absolute: "5 d ago" reads like a promise).
 *  - stale   (older): "Last updated Aug 23". Callers drop the "daily" claim.
 *  - unknown (no stamp): empty text.
 * Dates are UTC days, like every other date in the app.
 */
export type FreshnessLevel = 'fresh' | 'recent' | 'stale' | 'unknown';
export interface Freshness {
    level: FreshnessLevel;
    text: string;
}

export const FRESH_MS = 36 * 3_600_000;
export const STALE_MS = 8 * 24 * 3_600_000;

export function freshness(iso: string | null | undefined, now = Date.now()): Freshness {
    if (!iso) return { level: 'unknown', text: '' };
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return { level: 'unknown', text: '' };
    const age = Math.max(now - t, 0);
    if (age < FRESH_MS) {
        const mins = Math.floor(age / 60_000);
        if (mins < 2) return { level: 'fresh', text: 'Updated just now' };
        if (mins < 60) return { level: 'fresh', text: `Updated ${mins} min ago` };
        const hours = Math.floor(mins / 60);
        return { level: 'fresh', text: `Updated ${hours} h ago` };
    }
    const dayIso = new Date(t).toISOString().slice(0, 10);
    const day = dayIso.slice(0, 4) === new Date(now).toISOString().slice(0, 4) ? fmtDay(dayIso) : fmtDayYear(dayIso);
    if (age < STALE_MS) return { level: 'recent', text: `Updated ${day}` };
    return { level: 'stale', text: `Last updated ${day}` };
}
