/** Small pure helpers for building and showing site actions (server + client). */
import type { ActionImpact, SiteAction } from './types';

/** FNV-1a 32-bit, hex: short stable ids for action subjects. */
export function hash(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

export function actionId(type: SiteAction['type'], subject: string): string {
    return `${type}:${hash(subject.toLowerCase())}`;
}

/** Scale a count over `days` to a 28-day month. */
export function per28(value: number, days: number): number {
    return days > 0 ? Math.round((value * 28) / days) : value;
}

/** Impact is priority, not good/bad: compared with the site's own monthly scale. */
export function impactFor(score: number, monthlyScale: number): ActionImpact {
    if (score >= Math.max(30, monthlyScale * 0.05)) return 'high';
    if (score >= Math.max(8, monthlyScale * 0.01)) return 'medium';
    return 'low';
}

export function pct(ratio: number): string {
    const v = Math.abs(ratio) * 100;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1)}%`;
}

export function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export const ACTION_TYPE_LABEL: Record<SiteAction['type'], string> = {
    decay: 'Decaying page',
    striking: 'Striking distance',
    low_ctr: 'Low CTR',
    cannibalization: 'Cannibalization',
    traffic_drop: 'Traffic drop',
    search_drop: 'Search drop',
    audit: 'Audit issue',
};

const IMPACT_RANK: Record<ActionImpact, number> = { high: 3, medium: 2, low: 1 };

/**
 * One order for open tasks everywhere (Overview top 3 and the Actions list):
 * by impact, then in the order given. The server already ranks by impact and
 * a type-mixed score, and audit tasks are appended after it, so a stable sort
 * keeps that mix (`Array.prototype.sort` is stable).
 */
export function rankByImpact<T extends Pick<SiteAction, 'impact'>>(list: readonly T[]): T[] {
    return [...list].sort((a, b) => IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]);
}

export interface ShortImpact {
    /** "+7,681" or "up to 1,240" */
    value: string;
    /** "clicks/mo" */
    unit: string;
}

/**
 * The monthly number of an expected impact, for the compact task row:
 * "+7,681 clicks a month at position 5" -> { value: '+7,681', unit: 'clicks/mo' }.
 * "Recover up to 1,240 sessions a month" -> { value: '≤ 1,240', unit: 'sessions/mo' }.
 * Null when the impact has no number ("Clearer ranking for this query").
 */
export function shortImpact(expectedImpact: string): ShortImpact | null {
    const m = /(\+|up to )?([\d,.]+K?) (clicks|sessions|views) a month/.exec(expectedImpact);
    if (!m) return null;
    return { value: m[1] === '+' ? `+${m[2]}` : m[1] ? `up to ${m[2]}` : m[2], unit: `${m[3]}/mo` };
}
