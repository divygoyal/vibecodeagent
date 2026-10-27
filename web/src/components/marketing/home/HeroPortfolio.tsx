'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { SegmentedControl, Select } from '@/components/ui';
import { SiteCard } from '@/components/portfolio/SiteCard';
import { TotalsStrip, totalsMetrics, type TotalsMetric } from '@/components/portfolio/TotalsStrip';
import { cn } from '@/lib/cn';
import { RANGE_LABEL } from '@/lib/portfolio/ranges';
import type { PortfolioRange, PortfolioResponse, PortfolioSite } from '@/lib/portfolio/types';
import { filterSites, SORT_OPTIONS, sortSites, type FilterKey, type SortKey } from '@/lib/portfolio/view';
import { demoHref } from './demoLinks';

const RANGES: PortfolioRange[] = ['7d', '28d', '3m', '12m'];
const SHOWN = 6;

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
    const [starred, setStarred] = useState<Record<string, boolean>>({});

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
                        {total} sites · {RANGE_LABEL[range]} vs previous · <span className="font-medium text-fg-secondary">sample data</span>
                    </p>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                    <Select
                        value={sort}
                        onValueChange={(v) => setSort(v as SortKey)}
                        options={SORT_OPTIONS}
                        ariaLabel="Sort sites"
                        align="end"
                        className="min-w-0 flex-1 sm:w-[164px] sm:flex-none"
                    />
                    <SegmentedControl
                        options={RANGES.map((r) => ({ value: r, label: r, ariaLabel: RANGE_LABEL[r] }))}
                        value={range}
                        onChange={setRange}
                        ariaLabel="Date range"
                    />
                </div>
            </div>

            <TotalsStrip
                data={data}
                metric={activeMetric}
                onMetricChange={setMetric}
                comparisonLabel={comparisonLabel}
                trendOpen={trendOpen}
                onTrendOpenChange={setTrendOpen}
            />

            <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
                <SegmentedControl<FilterKey>
                    variant="neutral"
                    size="sm"
                    ariaLabel="Show"
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: <>All <Count n={counts.all} /></> },
                        { value: 'gsc', label: <>Search Console <Count n={counts.gsc} /></> },
                        { value: 'ga4', label: <>Analytics <Count n={counts.ga4} /></> },
                        { value: 'starred', label: <>Starred <Count n={counts.starred} /></> },
                    ]}
                />
            </div>

            {shown.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
                    {shown.slice(0, SHOWN).map((s, i) => (
                        <div key={s.key} className={cn('flex min-w-0 [&>article]:flex-1', i >= 3 && 'max-md:hidden', i >= 4 && 'md:max-xl:hidden')}>
                            <SiteCard
                                site={s}
                                windows={data.windows}
                                dates={data.dates}
                                view={view}
                                syncing={false}
                                href={demoHref(`/dashboard/s/${encodeURIComponent(s.slug)}`)}
                                onToggleStar={(site) => setStarred((m) => ({ ...m, [site.key]: !site.starred }))}
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
                <p className="text-meta text-fg-muted">Click a card to open that site in the live demo.</p>
                <Link href={demoHref('/dashboard')} className="tap-area inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-text hover:text-fg">
                    See all {total} sites in the live demo
                    <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                </Link>
            </div>
        </div>
    );
}

function Count({ n }: { n: number }) {
    return <span className="ml-1 text-fg-muted tabular-nums">{n}</span>;
}
