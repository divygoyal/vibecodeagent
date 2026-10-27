'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Favicon, MetricDelta, SegmentedControl, Select } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { Star } from 'lucide-react';
import { SiteCard } from '@/components/portfolio/SiteCard';
import { TotalsStrip, totalsMetrics, type TotalsMetric } from '@/components/portfolio/TotalsStrip';
import { cn } from '@/lib/cn';
import { fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';
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
            {/* One row that scrolls sideways (fade at the edge), never wrapping into a stray chip. */}
            <div role="radiogroup" aria-label="Show" className="-mx-3 flex gap-2 overflow-x-auto px-3 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
                {filterOptions(counts).map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={filter === o.value}
                        onClick={() => setFilter(o.value)}
                        className={cn(
                            'tap-area inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-body-sm font-medium whitespace-nowrap',
                            filter === o.value ? 'border-transparent bg-subtle text-fg' : 'border-border-subtle text-fg-secondary',
                        )}
                    >
                        {o.label}
                    </button>
                ))}
            </div>

            {shown.length ? (
                <>
                {/* Phones: one compact row per site with the same two numbers each, so every row reads alike. */}
                <ul className="flex flex-col gap-2 md:hidden">
                    {shown.slice(0, 3).map((s) => (
                        <li key={s.key}><PhoneSiteRow site={s} dates={data.dates} href={demoHref(`/dashboard/s/${encodeURIComponent(s.slug)}`)} /></li>
                    ))}
                </ul>
                {/* The app's own cards from 768 px; the "GA4 linked" icon is hidden here (it crowds "Details"). */}
                <div className="grid grid-cols-2 gap-4 max-md:hidden lg:grid-cols-3 [&_span:has(>svg[aria-label='GA4_linked'])]:hidden">
                    {shown.slice(0, SHOWN).map((s, i) => (
                        <div key={s.key} className={cn('flex min-w-0 [&>article]:flex-1', i >= 2 && 'max-lg:hidden')}>
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
                </>
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
    // Six tiles fill the 2-column grid evenly: the desktop strip's five plus CTR.
    const tiles: Array<{ metric: MetricKey; cur: number | null | undefined; prev: number | null | undefined }> = [
        { metric: 'clicks', cur: s?.cur.clicks, prev: s?.prev?.clicks },
        { metric: 'impressions', cur: s?.cur.impressions, prev: s?.prev?.impressions },
        { metric: 'ctr', cur: s?.cur.ctr, prev: s?.prev?.ctr },
        { metric: 'position', cur: s?.cur.position, prev: s?.prev?.position },
        { metric: 'users', cur: t?.cur.users, prev: t?.prev?.users },
        { metric: 'sessions', cur: t?.cur.sessions, prev: t?.prev?.sessions },
    ];
    return tiles.filter((x) => x.cur !== undefined && x.cur !== null);
}

function Count({ n }: { n: number }) {
    return <span className="ml-1 text-fg-muted tabular-nums">{n}</span>;
}

/** A phone row: the site, two numbers (search clicks and users, or what the site has) and its trend. */
function PhoneSiteRow({ site, dates, href }: { site: PortfolioSite; dates: PortfolioResponse['dates']; href: string }) {
    const sr = site.search;
    const tr = site.traffic;
    const stats: Array<{ metric: MetricKey; cur: number; prev: number | null | undefined }> = [];
    if (sr) stats.push({ metric: 'clicks', cur: sr.cur.clicks, prev: sr.prev?.clicks });
    if (tr) stats.push({ metric: 'users', cur: tr.cur.users, prev: tr.prev?.users });
    if (stats.length < 2 && sr) stats.push({ metric: 'impressions', cur: sr.cur.impressions, prev: sr.prev?.impressions });
    if (stats.length < 2 && tr) stats.push({ metric: 'sessions', cur: tr.cur.sessions, prev: tr.prev?.sessions });
    const spark = sr
        ? { s: [{ metric: 'clicks' as const, values: site.series.clicks ?? [] }], d: dates.search }
        : { s: [{ metric: 'users' as const, values: site.series.users ?? [] }], d: dates.traffic };
    return (
        <Link href={href} className="block rounded-card border border-border-subtle bg-surface p-3 shadow-xs">
            <span className="flex items-center gap-2">
                <Favicon host={site.host || site.label} size={16} />
                <span className="min-w-0 flex-1 truncate text-body font-semibold text-fg">{site.label}</span>
                {site.starred ? <Star aria-label="Starred" size={14} strokeWidth={1.75} className="shrink-0 fill-star text-star" /> : null}
            </span>
            <span className="mt-2 grid grid-cols-2 gap-x-3">
                {stats.slice(0, 2).map((st) => (
                    <span key={st.metric} className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
                        <span className="text-body font-semibold text-fg tabular-nums">{fmtMetric(st.metric, st.cur, { compact: true })}</span>
                        <span className="text-meta text-fg-muted">{METRICS[st.metric].short}</span>
                        {st.prev !== null && st.prev !== undefined ? <MetricDelta metric={st.metric} current={st.cur} previous={st.prev} /> : null}
                    </span>
                ))}
            </span>
            <span className="mt-2 block">
                <Sparkline series={spark.s} dates={spark.d} height={36} interactive={false} />
            </span>
        </Link>
    );
}
