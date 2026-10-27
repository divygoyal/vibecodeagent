'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { cn } from '@/lib/cn';
import { fmtCompact, fmtFull, fmtPosition } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { TrendBars } from '@/components/charts/TrendBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { Skeleton } from '@/components/ui/Skeleton';
import { siteHref } from '@/components/shell/nav';
import { useFilterClick } from '../filters/SiteFilters';
import { displayPage, pageRef } from '../lib/rules';
import { PagePath } from '../PagePath';
import type { Ga4PageTrends, GscRowsResponse } from '../lib/types';
import { LoadError } from '../SiteStates';
import { useActiveFilters, useGa4, useGsc, useSite, useSiteRange } from '../useSiteData';

interface Row {
    key: string;
    path: string;
    gaPath: string | null;
    title: string | null;
    views: number | null;
    prevViews: number | null | undefined;
    trend: number[] | null;
    clicks: number | null;
    prevClicks: number | null | undefined;
    position: number | null;
}

/**
 * Top pages as rows: the path on one line (title on hover), trend bars across the range, views
 * with a ±% chip, and (when Search Console is linked) clicks and position.
 * `action` "open" links to the Pages drawer; "filter" filters Traffic by the page.
 */
export function PageRows({ limit = 8, action = 'open', withSearch = true }: { limit?: number; action?: 'open' | 'filter'; withSearch?: boolean }) {
    const site = useSite();
    const { compareOn } = useSiteRange();
    const click = useFilterClick();
    const pathFilter = useActiveFilters().path;
    const ga = useGa4<Ga4PageTrends>(site.hasGa4 ? 'pageTrends' : null, { extra: { limit: String(limit) } });
    const sc = useGsc<GscRowsResponse>(site.hasGsc && withSearch ? 'pages' : null);
    const searchCols = site.hasGsc && withSearch;

    const rows: Row[] = useMemo(() => {
        const gsc = new Map((sc.data?.rows ?? []).map((r) => [pageRef(r.key).key, r]));
        if (site.hasGa4) {
            return (ga.data?.rows ?? []).map((r) => {
                const ref = pageRef(r.path, r.host || site.siteHost);
                const g = gsc.get(ref.key);
                return {
                    key: ref.key,
                    path: displayPage(ref, site.siteHost),
                    gaPath: r.path,
                    title: r.title,
                    views: r.views,
                    prevViews: r.prevViews,
                    trend: r.trend,
                    clicks: searchCols ? g?.clicks ?? 0 : null,
                    prevClicks: g?.prev === undefined ? undefined : g.prev?.clicks ?? null,
                    position: g && g.impressions > 0 ? g.position : null,
                };
            });
        }
        return (sc.data?.rows ?? []).slice(0, limit).map((r) => {
            const ref = pageRef(r.key);
            return {
                key: ref.key, path: displayPage(ref, site.siteHost), gaPath: null, title: null, views: null, prevViews: undefined, trend: null,
                clicks: r.clicks, prevClicks: r.prev === undefined ? undefined : r.prev?.clicks ?? null, position: r.impressions > 0 ? r.position : null,
            };
        });
    }, [ga.data, sc.data, site.hasGa4, site.siteHost, searchCols, limit]);

    const q = site.hasGa4 ? ga : sc;
    if (q.state === 'error') return <LoadError error={q.error} onRetry={q.mutate} />;
    const loading = q.state === 'loading';
    const bars = ga.data?.bars ?? 0;
    // One scale for every row: a big page has tall bars, a small one short bars, and dips show where they really are.
    const trendMax = Math.max(0, ...rows.flatMap((r) => r.trend ?? []));
    const cols = cn(
        'grid items-center gap-x-3',
        site.hasGa4
            ? searchCols ? 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_6.5rem_4rem_3rem]' : 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_6.5rem]'
            : 'grid-cols-[minmax(0,1fr)_6.5rem_3rem]',
    );

    if (loading) {
        return (
            <div className="flex flex-col gap-2" aria-busy>
                {Array.from({ length: limit }, (_, i) => <Skeleton key={i} className="h-9" />)}
            </div>
        );
    }
    if (!rows.length) return <EmptyState variant="inline" title="No page data in this period" />;

    return (
        <div className="-mx-2">
            <div className={cn(cols, 'px-2 pb-1.5 text-meta text-fg-muted')} aria-hidden>
                <span>Page</span>
                {site.hasGa4 ? <span className="max-sm:hidden">Trend</span> : null}
                <span className={cn('text-right', site.hasGa4 && 'max-sm:hidden')}>{site.hasGa4 ? 'Views' : 'Clicks'}</span>
                {site.hasGa4 && searchCols ? <span className="text-right max-sm:hidden">Clicks</span> : null}
                {searchCols ? <span className="text-right max-sm:hidden">Pos</span> : null}
            </div>
            <ul className="flex flex-col">
                {rows.map((r) => {
                    const main = site.hasGa4 ? r.views : r.clicks;
                    const prev = site.hasGa4 ? r.prevViews : r.prevClicks;
                    const inner = (
                        <>
                            <PagePath path={r.path} title={r.title} className="text-body-sm font-medium text-fg" />
                            {site.hasGa4 ? (
                                <span className="flex flex-col items-end gap-0.5 sm:items-start">
                                    {r.trend && bars ? (
                                        <TrendBars values={r.trend} max={trendMax} color={METRICS.pageviews.color} partialLast className="max-sm:hidden" />
                                    ) : <span className="max-sm:hidden" />}
                                    {/* Phones: the value column is hidden; show value + chip here. */}
                                    <span className="flex items-center gap-1.5 sm:hidden">
                                        <span className="text-body-sm text-fg tabular-nums">{fmtCompact(main)}</span>
                                        {compareOn && prev !== undefined ? <MetricDelta metric="pageviews" current={main} previous={prev} variant="chip" /> : null}
                                    </span>
                                </span>
                            ) : null}
                            <span className={cn('flex items-center justify-end gap-1.5', site.hasGa4 && 'max-sm:hidden')}>
                                <span className="text-body-sm text-fg tabular-nums">{fmtCompact(main)}</span>
                                {compareOn && prev !== undefined ? <MetricDelta metric={site.hasGa4 ? 'pageviews' : 'clicks'} current={main} previous={prev} variant="chip" /> : null}
                            </span>
                            {site.hasGa4 && searchCols ? <span className="text-right text-body-sm text-fg-secondary tabular-nums max-sm:hidden">{r.clicks ? fmtFull(r.clicks) : '–'}</span> : null}
                            {searchCols ? <span className={cn('text-right text-body-sm text-fg-secondary tabular-nums', site.hasGa4 && 'max-sm:hidden')}>{r.position ? fmtPosition(r.position) : '–'}</span> : null}
                        </>
                    );
                    const rowCls = cn(cols, 'min-h-10 rounded-md px-2 py-1 text-left hover:bg-subtle/50');
                    return (
                        <li key={r.key} className="border-t border-border-subtle first:border-t-0">
                            {action === 'filter' && r.gaPath ? (
                                pathFilter ? <div className={cols + ' min-h-10 px-2 py-1'}>{inner}</div> : (
                                    <button type="button" className={cn(rowCls, 'w-full')} onClick={() => click('path', r.gaPath!)}>{inner}</button>
                                )
                            ) : (
                                <Link href={`${siteHref(site.host, 'pages')}?page=${encodeURIComponent(r.key)}`} className={rowCls}>{inner}</Link>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
