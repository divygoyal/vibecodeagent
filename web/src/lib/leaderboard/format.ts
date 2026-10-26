import type { CountMetric, EngagementMetric } from './types';

/** 1234 -> "1.2K", 87000 -> "87K", 2_300_000 -> "2.3M". */
export function compact(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${trim(n / 1_000_000, abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `${trim(n / 1_000, abs >= 10_000 ? 0 : 1)}K`;
    return String(Math.round(n));
}

function trim(n: number, digits: number): string {
    return n.toFixed(digits).replace(/\.0$/, '');
}

/** What a shared count looks like in text: the number, or the band. */
export function metricText(m: CountMetric | null | undefined): string | null {
    if (!m) return null;
    return m.mode === 'exact' ? compact(m.value) : m.label;
}

/** Exact figure for tooltips and tables (only for exact metrics). */
export function metricExact(m: CountMetric | null | undefined): string | null {
    if (!m || m.mode !== 'exact') return null;
    return m.value.toLocaleString('en-US');
}

export function deltaText(pct: number | null | undefined): string | null {
    if (pct === null || pct === undefined) return null;
    const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Math.round(pct * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export function engagementText(e: EngagementMetric | null | undefined): string | null {
    if (!e) return null;
    return e.mode === 'exact' ? `${e.rate}%` : e.label;
}

export function durationText(seconds: number | null | undefined): string | null {
    if (seconds === null || seconds === undefined) return null;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

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

export function shortDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
