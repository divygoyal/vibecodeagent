'use client';

import { createContext, useContext, useMemo } from 'react';
import useSWR, { type SWRConfiguration } from 'swr';

import type { ChartState } from '@/components/charts/ChartCard';
import { useDateRange } from '@/components/shell/DateRangeControl';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { filtersToParams, hasFilters, type SiteFilters } from './lib/filters';
import { bareHost } from './lib/rules';

export class FetchError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const b = body as { error?: string; code?: string };
        throw new FetchError(b.error || `Request failed (${res.status})`, res.status, b.code);
    }
    return body as T;
}

const SWR_OPTS: SWRConfiguration = {
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 60_000,
    errorRetryCount: 1,
};

/** The current site with the facts every site page needs. */
export function useSite() {
    const cs = useCurrentSite();
    const site = cs.site;
    return useMemo(() => {
        const host = site?.host ?? '';
        const gsc = site?.gscSiteUrl ?? null;
        const ga4 = site?.ga4PropertyId ?? null;
        /** Bare hostname for display and page joins, null for GA4-only sites. */
        const siteHost = gsc ? bareHost(gsc) : null;
        /** Home page URL for audits. */
        const homeUrl = gsc ? (gsc.startsWith('sc-domain:') ? `https://${bareHost(gsc)}/` : gsc) : null;
        return { site, host, label: site?.label ?? host, gsc, ga4, siteHost, homeUrl, hasGa4: Boolean(ga4), hasGsc: Boolean(gsc) };
    }, [site]);
}

/** Resolved date windows as query strings for /api/site/*. */
export function useSiteRange() {
    const dr = useDateRange();
    return useMemo(() => {
        const q = (r: { start: string; end: string; prevStart: string | null; prevEnd: string | null }) => {
            const p = new URLSearchParams({ start: r.start, end: r.end });
            if (r.prevStart && r.prevEnd) {
                p.set('cmpStart', r.prevStart);
                p.set('cmpEnd', r.prevEnd);
            }
            return p.toString();
        };
        const compareOn = dr.value.compare !== 'none';
        return {
            dr,
            ga4Query: q(dr.resolved),
            gscQuery: q(dr.resolvedSearch),
            compareOn,
            /** "previous 3 months" for StatCard comparison lines. */
            compareText: dr.compareLabel.replace(/^vs\s+/, ''),
            days: dr.resolved.days,
            searchDays: dr.resolvedSearch.days,
        };
    }, [dr]);
}

export interface SiteQuery<T> {
    data: T | undefined;
    error: FetchError | undefined;
    isLoading: boolean;
    isValidating: boolean;
    mutate: () => void;
    /** For ChartCard: loading on first load, refetching with old data, error, ready. */
    state: ChartState;
}

function toState(data: unknown, error: unknown, isLoading: boolean, isValidating: boolean): ChartState {
    if (error && !data) return 'error';
    if (!data) return 'loading';
    if (isLoading || isValidating) return 'refetching';
    return 'ready';
}

function useSiteSWR<T>(key: string | null, opts?: SWRConfiguration): SiteQuery<T> {
    const { data, error, isLoading, isValidating, mutate } = useSWR<T, FetchError>(key, fetchJson, { ...SWR_OPTS, ...opts });
    return {
        data,
        error,
        isLoading,
        isValidating,
        mutate: () => void mutate(),
        state: key ? toState(data, error, isLoading, isValidating) : 'empty',
    };
}

/**
 * Click-to-filter state of the page (Traffic provides it; other pages have none).
 * GA4 reports that support filters pick it up automatically in useGa4.
 */
export const SiteFiltersContext = createContext<SiteFilters>({});

export function useActiveFilters(): SiteFilters {
    return useContext(SiteFiltersContext);
}

/** GA4 reports that accept `f=` filters (see /api/site/ga4). */
const FILTERABLE = new Set([
    'summary', 'heatmap', 'pageTrends', 'channels', 'sources', 'referrers', 'pages', 'landing', 'countries', 'cities',
    'languages', 'devices', 'browsers', 'os', 'events', 'newReturning',
]);

/** GA4 report for the current site and range: useGa4<Ga4Summary>('summary'). */
export function useGa4<T>(report: string | null, opts: {
    extra?: Record<string, string>;
    noRange?: boolean;
    /** Use the Search Console days (ends 2 days ago) so the series lines up with GSC data. */
    searchRange?: boolean;
    /** Ignore the page's click-to-filter state. */
    unfiltered?: boolean;
    swr?: SWRConfiguration;
} = {}): SiteQuery<T> {
    const { ga4 } = useSite();
    const { ga4Query, gscQuery } = useSiteRange();
    const filters = useActiveFilters();
    const p = new URLSearchParams(opts.extra ?? {});
    if (report && FILTERABLE.has(report) && !opts.unfiltered && hasFilters(filters)) {
        for (const f of filtersToParams(filters)) p.append('f', f);
    }
    const extra = p.toString();
    const range = opts.searchRange ? gscQuery : ga4Query;
    const key = ga4 && report
        ? `/api/site/ga4?property=${encodeURIComponent(ga4)}&report=${report}${opts.noRange ? '' : `&${range}`}${extra ? `&${extra}` : ''}`
        : null;
    return useSiteSWR<T>(key, opts.swr);
}

/** Search Console report for the current site and range. */
export function useGsc<T>(report: string | null, opts: { extra?: Record<string, string>; noRange?: boolean; swr?: SWRConfiguration } = {}): SiteQuery<T> {
    const { gsc } = useSite();
    const { gscQuery } = useSiteRange();
    const extra = opts.extra ? new URLSearchParams(opts.extra).toString() : '';
    const key = gsc && report
        ? `/api/site/gsc?site=${encodeURIComponent(gsc)}&report=${report}${opts.noRange ? '' : `&${gscQuery}`}${extra ? `&${extra}` : ''}`
        : null;
    return useSiteSWR<T>(key, opts.swr);
}

/** Any other JSON endpoint with the same SWR settings. */
export function useJson<T>(key: string | null, opts?: SWRConfiguration): SiteQuery<T> {
    return useSiteSWR<T>(key, opts);
}

/** Download rows as CSV (client-side). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
    const esc = (v: string | number | null | undefined) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
