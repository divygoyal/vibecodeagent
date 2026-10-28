/** Small pure helpers for building and showing site actions (server + client). */
import { expectedCtr } from './rules';
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
    deindexed: 'Dropped from Google',
    traffic_drop: 'Traffic drop',
    search_drop: 'Search drop',
    audit: 'Audit issue',
};

const IMPACT_RANK: Record<ActionImpact, number> = { high: 3, medium: 2, low: 1 };

/** What a task is listed by inside its tier: the number it shows, or (no number) its score. */
function rankValue(a: Pick<SiteAction, 'gain' | 'score'>): number {
    return a.gain ?? a.score;
}

/**
 * One order for open tasks everywhere (Overview top 3, the Actions list, the home fix list, the demo Ask answer): by
 * impact tier, then by the monthly number the task shows, biggest first (round 7, audit item 8: "+392" sat above
 * "+958" because a hidden per-type damping ranked it). Tasks without a number ("Fixes a problem that can stop pages
 * ranking") go by their score, so the shown numbers always read in order. Ties keep the given order (stable sort).
 */
export function rankByImpact<T extends Pick<SiteAction, 'impact' | 'gain' | 'score'>>(list: readonly T[]): T[] {
    return [...list].sort((a, b) => IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact] || rankValue(b) - rankValue(a));
}

/** Clicks a month the first `n` open click tasks show, added up (the Actions header and the demo Ask answer). */
export function topClickGain(open: readonly Pick<SiteAction, 'expectedImpact' | 'gain'>[], n = 5): number {
    return topClickTasks(open, n).reduce((s, a) => s + (a.gain ?? 0), 0);
}

/** The first `n` tasks (in the given, ranked order) whose number is in clicks. */
export function topClickTasks<T extends Pick<SiteAction, 'expectedImpact' | 'gain'>>(open: readonly T[], n = 5): T[] {
    return open.filter((a) => a.gain !== null && / clicks a month/.test(a.expectedImpact)).slice(0, n);
}

/** How clearly several pages split a query (structure only, no priority). 'weak' is not worth a task. */
export type CannibalizationOverlap = 'strong' | 'some' | 'weak';

/**
 * Extra clicks a month (28 days) if one page held the query one place above the best of the competing pages, at the
 * usual CTR for that position, minus the clicks the query gets now. The Actions task and the Cannibalization card
 * both show this number.
 */
export function cannibalizationGain(c: { totalImpressions: number; totalClicks: number; bestPosition: number }, days: number): number {
    const now = c.totalClicks / Math.max(1, c.totalImpressions);
    return per28(Math.round(c.totalImpressions * Math.max(0, expectedCtr(Math.max(1, c.bestPosition - 1)) - now)), days);
}

/**
 * The one severity rule for cannibalization (round 7, audit item 8): the Cannibalization tab's badge and the Actions
 * tier are the same priority, `impactFor` of the gain against the site's monthly clicks. A weak overlap is low.
 */
export function cannibalizationImpact(overlap: CannibalizationOverlap, gain: number, monthlyScale: number): ActionImpact {
    return overlap === 'weak' ? 'low' : impactFor(gain, monthlyScale);
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
