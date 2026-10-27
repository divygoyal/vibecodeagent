'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { SearchInput, SegmentedControl, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { DemoSiteCard, type CardView } from './DemoSiteCard';
import { PortfolioTotals } from './PortfolioTotals';
import { DEMO_RANGES, type DemoPortfolio, type DemoPortfolioSite, type DemoRange } from './types';

type SortKey = 'clicks' | 'users' | 'growth' | 'drop' | 'az';

const SORTS: Array<{ value: SortKey; label: string }> = [
    { value: 'clicks', label: 'Most clicks' },
    { value: 'users', label: 'Most users' },
    { value: 'growth', label: 'Biggest growth' },
    { value: 'drop', label: 'Biggest drop' },
    { value: 'az', label: 'A–Z' },
];

function change(site: DemoPortfolioSite): number {
    const [cur, prev] = site.search
        ? [site.search.cur.clicks, site.search.prev?.clicks ?? 0]
        : site.traffic
            ? [site.traffic.cur.users, site.traffic.prev?.users ?? 0]
            : [0, 0];
    return prev > 0 ? (cur - prev) / prev : cur > 0 ? Infinity : 0;
}

function sortSites(sites: DemoPortfolioSite[], sort: SortKey): DemoPortfolioSite[] {
    const by: Record<SortKey, (a: DemoPortfolioSite, b: DemoPortfolioSite) => number> = {
        clicks: (a, b) => (b.search?.cur.clicks ?? -1) - (a.search?.cur.clicks ?? -1),
        users: (a, b) => (b.traffic?.cur.users ?? -1) - (a.traffic?.cur.users ?? -1),
        growth: (a, b) => change(b) - change(a),
        drop: (a, b) => change(a) - change(b),
        az: (a, b) => a.label.localeCompare(b.label),
    };
    return [...sites].sort((a, b) => Number(b.starred) - Number(a.starred) || by[sort](a, b));
}

/** The read-only demo portfolio: header controls, totals strip, alerts, card grid. */
export function DemoPortfolioView({ portfolios }: { portfolios: Record<DemoRange, DemoPortfolio> }) {
    const [range, setRange] = useState<DemoRange>('28d');
    const [view, setView] = useState<CardView>('search');
    const [sort, setSort] = useState<SortKey>('clicks');
    const [query, setQuery] = useState('');
    const portfolio = portfolios[range];

    const sites = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q ? portfolio.sites.filter((s) => s.label.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) : portfolio.sites;
        return sortSites(list, sort);
    }, [portfolio, query, sort]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-heading text-fg">Portfolio</h1>
                    <p className="mt-1 text-body-sm text-fg-muted">
                        {portfolio.totals.sites.synced} of {portfolio.totals.sites.total} sites synced · sample data, refreshed daily
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <SearchInput value={query} onValueChange={setQuery} placeholder="Search sites" className="w-full sm:w-56" aria-label="Search sites" />
                    <Select
                        value={sort}
                        onValueChange={(v) => setSort(v as SortKey)}
                        options={SORTS}
                        ariaLabel="Sort sites"
                        label="Sort:"
                        className="min-w-[180px]"
                    />
                    <SegmentedControl
                        ariaLabel="Date range"
                        value={range}
                        onChange={setRange}
                        options={DEMO_RANGES.map((r) => ({ value: r.value, label: r.label, ariaLabel: `Last ${r.long.replace('previous ', '')}` }))}
                    />
                </div>
            </div>

            <PortfolioTotals portfolio={portfolio} />

            {portfolio.alerts.length ? (
                <div className="rounded-card border border-warn/25 bg-warn-soft p-4">
                    <p className="flex items-center gap-2 text-body font-medium text-fg">
                        <AlertTriangle aria-hidden size={16} strokeWidth={1.75} className="text-warn" />
                        {portfolio.alerts.length === 1 ? '1 alert' : `${portfolio.alerts.length} alerts`}
                    </p>
                    <ul className="mt-2 space-y-1 text-body-sm text-fg-secondary">
                        {portfolio.alerts.slice(0, 5).map((a) => (
                            <li key={a.id}>
                                <Link href={`/demo/${a.slug}`} className="font-medium text-fg underline-offset-4 hover:underline">{a.host}</Link>: {a.message}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
                <h2 className="text-title text-fg">{sites.length === 1 ? '1 site' : `${sites.length} sites`}</h2>
                <SegmentedControl
                    ariaLabel="Card metrics"
                    variant="neutral"
                    size="sm"
                    value={view}
                    onChange={setView}
                    options={[{ value: 'search', label: 'Search Console' }, { value: 'traffic', label: 'Analytics' }]}
                />
            </div>

            {sites.length ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sites.map((site) => (
                        <DemoSiteCard key={site.key} site={site} portfolio={portfolio} view={view} />
                    ))}
                </div>
            ) : (
                <p className={cn('rounded-card border border-dashed border-border p-8 text-center text-body text-fg-muted')}>
                    No sample site matches “{query}”.
                </p>
            )}
        </div>
    );
}
