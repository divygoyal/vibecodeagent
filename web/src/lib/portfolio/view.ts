/**
 * Client-side filtering and sorting of portfolio sites. Pure.
 */
import { pctChange } from './build';
import type { PortfolioSite } from './types';

export type SortKey = 'clicks' | 'impressions' | 'users' | 'growth' | 'drop' | 'position' | 'name';
export type FilterKey = 'all' | 'gsc' | 'ga4' | 'starred';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'clicks', label: 'Most clicks' },
    { value: 'impressions', label: 'Most impressions' },
    { value: 'users', label: 'Most users' },
    { value: 'growth', label: 'Biggest growth' },
    { value: 'drop', label: 'Biggest drop' },
    { value: 'position', label: 'Best position' },
    { value: 'name', label: 'Name A–Z' },
];

export function parseSort(v: string | null | undefined): SortKey {
    return SORT_OPTIONS.some((o) => o.value === v) ? (v as SortKey) : 'clicks';
}

export function parseFilter(v: string | null | undefined): FilterKey {
    return v === 'gsc' || v === 'ga4' || v === 'starred' ? v : 'all';
}

/** Percent change of the site's headline metric (clicks, or users for GA4-only sites). */
export function headlineChange(s: PortfolioSite): number | null {
    if (s.search) return pctChange(s.search.cur.clicks, s.search.prev?.clicks);
    if (s.traffic) return pctChange(s.traffic.cur.users, s.traffic.prev?.users);
    return null;
}

export function matchesQuery(s: PortfolioSite, q: string): boolean {
    if (!q) return true;
    const needle = q.trim().toLowerCase();
    return [s.label, s.host, s.name, s.variant, s.gsc?.siteUrl, s.ga4?.displayName, s.ga4?.propertyId]
        .some((v) => typeof v === 'string' && v.toLowerCase().includes(needle));
}

export function filterSites(sites: PortfolioSite[], opts: { filter: FilterKey; query: string; showHidden?: boolean }): PortfolioSite[] {
    return sites.filter((s) => {
        if (s.hidden && !opts.showHidden) return false;
        if (opts.filter === 'gsc' && !s.gsc) return false;
        if (opts.filter === 'ga4' && !s.ga4) return false;
        if (opts.filter === 'starred' && !s.starred) return false;
        return matchesQuery(s, opts.query);
    });
}

type Num = number | null | undefined;

/** Descending numeric compare with missing values last. */
function desc(a: Num, b: Num): number {
    const an = a === null || a === undefined || Number.isNaN(a);
    const bn = b === null || b === undefined || Number.isNaN(b);
    if (an && bn) return 0;
    if (an) return 1;
    if (bn) return -1;
    return (b as number) - (a as number);
}

/** Sort a copy; starred sites always come first. */
export function sortSites(sites: PortfolioSite[], sort: SortKey): PortfolioSite[] {
    const by: Record<SortKey, (a: PortfolioSite, b: PortfolioSite) => number> = {
        clicks: (a, b) => desc(a.search?.cur.clicks, b.search?.cur.clicks) || desc(a.traffic?.cur.users, b.traffic?.cur.users),
        impressions: (a, b) => desc(a.search?.cur.impressions, b.search?.cur.impressions),
        users: (a, b) => desc(a.traffic?.cur.users, b.traffic?.cur.users),
        growth: (a, b) => desc(headlineChange(a), headlineChange(b)),
        drop: (a, b) => {
            const x = headlineChange(a);
            const y = headlineChange(b);
            return desc(x === null ? null : -x, y === null ? null : -y);
        },
        position: (a, b) => desc(
            a.search?.cur.position != null ? -a.search.cur.position : null,
            b.search?.cur.position != null ? -b.search.cur.position : null,
        ),
        name: () => 0,
    };
    const byName = (a: PortfolioSite, b: PortfolioSite) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base', numeric: true });
    return [...sites].sort((a, b) => (Number(b.starred) - Number(a.starred)) || by[sort](a, b) || byName(a, b));
}
