import { METRICS, type MetricKey } from '@/lib/metrics';

/**
 * Heat-bar tint by data source, not by metric (round 2 critique #12): every
 * Search Console list uses the clicks blue, every Analytics list the users
 * indigo, so a page shows at most two calm tints instead of five pastels.
 */
export function heatbarClass(metric: MetricKey | 'neutral'): string {
    if (metric === 'neutral') return 'heatbar-neutral';
    return METRICS[metric].source === 'gsc' ? 'heatbar-clicks' : 'heatbar-users';
}

/**
 * Share of a total for a column: whole percents from 1% up, `<1%` below, so
 * the column never mixes `44%` with `9.5%` (critique 2.2).
 */
export function fmtShare(ratio: number | null | undefined): string {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '–';
    if (ratio <= 0) return '0%';
    const pct = ratio * 100;
    if (pct < 1) return '<1%';
    return `${Math.round(pct)}%`;
}
