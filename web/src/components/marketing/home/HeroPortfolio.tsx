'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { MetricDelta, SegmentedControl, Select } from '@/components/ui';
import { SiteCard } from '@/components/portfolio/SiteCard';
import { TotalsStrip, totalsMetrics, type TotalsMetric } from '@/components/portfolio/TotalsStrip';
import { cn } from '@/lib/cn';
import { fmtMetric, METRICS } from '@/lib/metrics';
import { RANGE_LABEL } from '@/lib/portfolio/ranges';
import type { PortfolioRange, PortfolioResponse, PortfolioSite } from '@/lib/portfolio/types';
import { filterSites, SORT_OPTIONS, sortSites, type FilterKey, type SortKey } from '@/lib/portfolio/view';
import { useIsMobile } from '@/lib/useIsMobile';
import { demoHref } from './demoLinks';

const RANGES: PortfolioRange[] = ['7d', '28d', '3m', '12m'];
/** One row of cards on desktop (3), two on tablets and phones; the rest are one click away in the demo. */
const SHOWN = 3;

/**
 * The hero's product frame: the app's own portfolio pieces (TotalsStrip, SiteCard, the sort and filter
 * helpers) on the demo generator's data, built on the server for every range. Everything a visitor can do
 * here stays in the browser: range, sort, filter, metric tiles, trend chart, sparkline hover, and a local
 * star. Each card opens that site in the live demo; nothing writes anywhere.
 */
export function HeroPortfolio({ byRange }: { byRange: Record<PortfolioRange, PortfolioResponse> }) {
    const [range, setRange] = useState<PortfolioRange>('28d');
    const [sort, setSort] = useState<SortKey>('clicks');
    const [filter, setFilter] = useState<FilterKey>('all');
    const [metric, setMetric] = useState<TotalsMetric | null>(null);
    const [trendOpen, setTrendOpen] = useState(false);
    // Same stars as the app's demo, minus duplicate variants of a host (the old http:// property), which
    // would otherwise sit among the first cards with its near-empty chart.
    const [starred, setStarred] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(byRange['28d'].sites.filter((s) => s.variant).map((s) => [s.key, false])),
    );

    // Phones get the app's compact card (chevron instead of "Details", shorter chart), as in the app. The cards
    // sit below the first screen on phones, so the switch after hydration moves nothing in view.
    const compact = useIsMobile();
    const data = byRange[range];
    const sites = useMemo(
        () => data.sites.map((s): PortfolioSite => (s.key in starred ? { ...s, starred: starred[s.key] } : s)),
        [data, starred],
    );
    const shown = useMemo(() => sortSites(filterSites(sites, { filter, query: '' }), sort), [sites, filter, sort]);
    const counts = useMemo(() => ({
        all: sites.length,
        gsc: sites.filter((s) => s.gsc).length,
        ga4: sites.filter((s) => s.ga4).length,
        starred: sites.filter((s) => s.starred).length,
    }), [sites]);

    const view = filter === 'ga4' ? 'traffic' : 'search';
    const available = totalsMetrics(data);
    const activeMetric: TotalsMetric = metric && available.includes(metric) ? metric : view === 'traffic' && available.includes('users') ? 'users' : available[0] ?? 'clicks';
    const comparisonLabel = `previous ${RANGE_LABEL[range].replace('last ', '')}`;
    const total = data.totals.sites.total;

    return (
        <div className="flex flex-col gap-4 p-3 sm:p-4 md:gap-5 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-title text-fg md:text-heading">Portfolio</p>
                    <p className="text-meta text-fg-muted">
                        {total} sites · {RANGE_LABEL[range]} vs previous
                    </p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                    <Select
                        value={sort}
                        onValueChange={(v) => setSort(v as SortKey)}
                        options={SORT_OPTIONS}
                        ariaLabel="Sort sites"
                        align="end"
                        className="w-full min-w-0 sm:w-[164px]"
                    />
                    <SegmentedControl
                        options={RANGES.map((r) => ({ value: r, label: r, ariaLabel: RANGE_LABEL[r] }))}
                        value={range}
                        onChange={setRange}
                        ariaLabel="Date range"
                    />
                </div>
            </div>

            {/* Phones: the totals as a 2-column grid (the app's strip scrolls sideways, which reads as cut off here). */}
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle md:hidden">
                {phoneTotals(data).map((t) => (
                    <div key={t.metric} className="bg-surface px-3 py-2.5">
                        <dt className="flex items-center gap-1.5 text-meta text-fg-secondary">
                            <span aria-hidden className="size-2 rounded-full" style={{ background: METRICS[t.metric].color }} />
                            {METRICS[t.metric].label}
                        </dt>
                        <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                            <span className="text-stat-sm text-fg tabular-nums">{fmtMetric(t.metric, t.cur ?? null, { compact: true, tile: true })}</span>
                            {t.prev !== null && t.prev !== undefined ? <MetricDelta metric={t.metric} current={t.cur} previous={t.prev} /> : null}
                        </dd>
                    </div>
                ))}
            </dl>

            <div className="max-md:hidden">
            <TotalsStrip
                data={data}
                metric={activeMetric}
                onMetricChange={setMetric}
                comparisonLabel={comparisonLabel}
                compact={compact}
                trendOpen={trendOpen}
                onTrendOpenChange={setTrendOpen}
            />
            </div>

            {/* Desktop: the app's segmented control; phones: the same choices as wrapping chips. */}
            <div className="max-md:hidden">
                <SegmentedControl<FilterKey> variant="neutral" size="sm" ariaLabel="Show" value={filter} onChange={setFilter} options={filterOptions(counts)} />
            </div>
            <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2 md:hidden">
                {filterOptions(counts).map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={filter === o.value}
                        onClick={() => setFilter(o.value)}
                        className={cn(
                            'tap-area inline-flex h-8 items-center rounded-full border px-3 text-body-sm font-medium',
                            filter === o.value ? 'border-transparent bg-subtle text-fg' : 'border-border-subtle text-fg-secondary',
                        )}
                    >
                        {o.label}
                    </button>
                ))}
            </div>

            {shown.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
                    {shown.slice(0, SHOWN).map((s, i) => (
                        <div key={s.key} className={cn('flex min-w-0 [&>article]:flex-1', i >= 2 && 'max-xl:hidden')}>
                            <SiteCard
                                site={s}
                                windows={data.windows}
                                dates={data.dates}
                                view={view}
                                syncing={false}
                                href={demoHref(`/dashboard/s/${encodeURIComponent(s.slug)}`)}
                                onToggleStar={(site) => setStarred((m) => ({ ...m, [site.key]: !site.starred }))}
                                compact={compact}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <p className="rounded-card border border-dashed border-border p-8 text-center text-body text-fg-muted">
                    Star a site to pin it here.
                </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle pt-3 md:pt-4">
                <p className="text-meta text-fg-muted">
                    <span className="mr-1.5 rounded-full bg-subtle px-2 py-0.5 font-medium text-fg-secondary">Sample data</span>
                    Click a card to open it in the live demo.
                </p>
                <Link href={demoHref('/dashboard')} className="tap-area inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-text hover:text-fg">
                    See all {total} sites in the live demo
                    <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                </Link>
            </div>
        </div>
    );
}

function filterOptions(counts: { all: number; gsc: number; ga4: number; starred: number }) {
    return [
        { value: 'all' as const, label: <>All <Count n={counts.all} /></> },
        { value: 'gsc' as const, label: <>Search Console <Count n={counts.gsc} /></> },
        { value: 'ga4' as const, label: <>Analytics <Count n={counts.ga4} /></> },
        { value: 'starred' as const, label: <>Starred <Count n={counts.starred} /></> },
    ];
}

function phoneTotals(data: PortfolioResponse) {
    const s = data.totals.search;
    const t = data.totals.traffic;
    return [
        { metric: 'clicks' as const, cur: s?.cur.clicks, prev: s?.prev?.clicks },
        { metric: 'impressions' as const, cur: s?.cur.impressions, prev: s?.prev?.impressions },
        { metric: 'users' as const, cur: t?.cur.users, prev: t?.prev?.users },
        { metric: 'sessions' as const, cur: t?.cur.sessions, prev: t?.prev?.sessions },
    ].filter((x) => x.cur !== undefined);
}

function Count({ n }: { n: number }) {
    return <span className="ml-1 text-fg-muted tabular-nums">{n}</span>;
}
