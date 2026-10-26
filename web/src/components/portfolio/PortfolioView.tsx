'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, LayoutGrid, List, Loader2, RefreshCw } from 'lucide-react';

import {
    Banner, Button, EmptyState, SearchInput, SegmentedControl, Select, Tooltip, useDebouncedValue,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { fmtFull } from '@/lib/format';
import { RANGE_LABEL } from '@/lib/portfolio/ranges';
import type { PortfolioRange, PortfolioResponse, PortfolioSite, SitePatch } from '@/lib/portfolio/types';
import { filterSites, SORT_OPTIONS, sortSites, type FilterKey, type SortKey } from '@/lib/portfolio/view';
import { useIsMobile } from '@/lib/useIsMobile';
import { PageHeader } from '@/components/shell/PageHeader';
import { AlertsPanel } from './AlertsPanel';
import { PairingDialog } from './PairingDialog';
import { ConnectGoogle, NoSitesFound } from './PortfolioOnboarding';
import { SiteCard, SiteCardSkeleton, type CardView } from './SiteCard';
import type { SiteMenuActions } from './SiteMenu';
import { SitesTable } from './SitesTable';
import { timeAgo } from './timeAgo';
import { totalsMetrics, TotalsStrip, type TotalsMetric } from './TotalsStrip';

export type PortfolioLayout = 'grid' | 'table';

export interface PortfolioViewProps {
    data: PortfolioResponse | undefined;
    /** First load: no data yet. */
    loading: boolean;
    /** A new range is loading; the old frame stays at 60% opacity. */
    refetching?: boolean;
    error?: string | null;
    range: PortfolioRange;
    onRangeChange: (range: PortfolioRange) => void;
    filter: FilterKey;
    onFilterChange: (filter: FilterKey) => void;
    sort: SortKey;
    onSortChange: (sort: SortKey) => void;
    /** Public demo: no star, menu, sync or links. */
    readOnly?: boolean;
    /** Italic note in the header ("Illustrative portfolio"). */
    note?: string;
    hrefFor?: (site: { slug: string }) => string;
    onOpenSite?: (site: PortfolioSite) => void;
    onToggleStar?: (site: PortfolioSite) => void;
    onToggleHidden?: (site: PortfolioSite) => void;
    onSavePairing?: (site: PortfolioSite, patch: SitePatch) => Promise<void>;
    onSyncNow?: () => void;
    syncBusy?: boolean;
    onConnectGoogle?: () => void;
    onRetry?: () => void;
    exportHref?: string;
    /** Root classes. Inside AppShell none are needed; standalone pages add tc-root and padding. */
    className?: string;
}

const RANGE_OPTIONS = (['7d', '28d', '3m', '12m'] as const).map((r) => ({ value: r, label: r }));
const PAGE = 24;
const LAYOUT_KEY = 'tc-portfolio-layout';

const defaultHref = (s: { slug: string }) => `/dashboard/s/${encodeURIComponent(s.slug)}`;

function readLayout(): PortfolioLayout | null {
    try {
        const v = window.localStorage.getItem(LAYOUT_KEY);
        return v === 'grid' || v === 'table' ? v : null;
    } catch {
        return null;
    }
}

function saveLayout(v: PortfolioLayout) {
    try {
        window.localStorage.setItem(LAYOUT_KEY, v);
    } catch {
        /* private mode */
    }
}

function Subtitle({ data, range }: { data: PortfolioResponse | undefined; range: PortfolioRange }) {
    // [content, shown on phones]
    const parts: [React.ReactNode, boolean][] = [];
    if (data && data.sites.length) {
        const { total, synced } = data.totals.sites;
        if (data.syncing && synced < total) {
            parts.push([
                <span key="sync" className="inline-flex items-center gap-1.5">
                    <Loader2 aria-hidden size={12} className="animate-spin" />
                    Syncing · {fmtFull(synced)} of {fmtFull(total)} sites ready
                </span>,
                true,
            ]);
        } else {
            parts.push([`${fmtFull(synced)} of ${fmtFull(total)} sites synced`, true]);
        }
        if (data.lastSyncedAt && !data.demo) parts.push([`updated ${timeAgo(data.lastSyncedAt)}`, false]);
    } else if (data?.syncing) {
        parts.push([<span key="find" className="inline-flex items-center gap-1.5"><Loader2 aria-hidden size={12} className="animate-spin" />Finding your sites</span>, true]);
    }
    parts.push([`${RANGE_LABEL[range]} vs previous`, true]);
    return (
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
            {parts.map(([p, phone], i) => (
                <span key={i} className={cn('inline-flex items-center gap-1.5', !phone && 'max-md:hidden')}>
                    {i > 0 ? <span aria-hidden className="text-fg-faint">·</span> : null}
                    {p}
                </span>
            ))}
        </span>
    );
}

/**
 * The Portfolio screen (DESIGN 5.1): header with search, sort and range,
 * totals strip with the combined chart, alerts, then the site cards (or the
 * table). Pure view: data and actions come from props, so the signed-in page
 * and the public demo share it.
 */
export function PortfolioView(props: PortfolioViewProps) {
    const {
        data, loading, refetching, error, range, onRangeChange, filter, onFilterChange, sort, onSortChange,
        readOnly, note, hrefFor = defaultHref, onOpenSite, onToggleStar, onToggleHidden, onSavePairing,
        onSyncNow, syncBusy, onConnectGoogle, onRetry, exportHref, className,
    } = props;
    const isMobile = useIsMobile();
    const [query, setQuery] = useState('');
    const q = useDebouncedValue(query, 120);
    const [showHidden, setShowHidden] = useState(false);
    // Saved layout choice; null = default (table for 25+ sites, DESIGN 5.1).
    const [layout, setLayout] = useState<PortfolioLayout | null>(() => (typeof window === 'undefined' ? null : readLayout()));
    // "Show more" count and the chosen chart metric reset when their context changes.
    const limitKey = `${q}|${filter}|${sort}|${range}`;
    const [limitState, setLimitState] = useState({ key: limitKey, n: PAGE });
    const limit = limitState.key === limitKey ? limitState.n : PAGE;
    const [pairingSite, setPairingSite] = useState<PortfolioSite | null>(null);

    const sites = useMemo(() => data?.sites ?? [], [data]);
    const visibleCount = sites.filter((s) => !s.hidden).length;
    const hiddenCount = sites.length - visibleCount;

    const activeLayout: PortfolioLayout = layout ?? (!isMobile && visibleCount >= 25 ? 'table' : 'grid');

    const view: CardView = filter === 'ga4' ? 'traffic' : 'search';
    const [metricState, setMetricState] = useState<{ view: CardView; metric: TotalsMetric } | null>(null);
    const metric = metricState?.view === view ? metricState.metric : null;
    const setMetric = (m: TotalsMetric) => setMetricState({ view, metric: m });
    const shown = useMemo(() => sortSites(filterSites(sites, { filter, query: q, showHidden }), sort), [sites, filter, q, showHidden, sort]);
    const counts = useMemo(() => ({
        all: visibleCount,
        gsc: sites.filter((s) => !s.hidden && s.gsc).length,
        ga4: sites.filter((s) => !s.hidden && s.ga4).length,
        starred: sites.filter((s) => !s.hidden && s.starred).length,
    }), [sites, visibleCount]);

    const available = data ? totalsMetrics(data) : [];
    const defaultMetric: TotalsMetric = view === 'traffic' && available.includes('users') ? 'users' : available[0] ?? 'clicks';
    const activeMetric = metric && available.includes(metric) ? metric : defaultMetric;

    const menu: SiteMenuActions | undefined = readOnly ? undefined : {
        onToggleHidden: (s) => onToggleHidden?.(s),
        onEditPairing: (s) => setPairingSite(s),
    };

    const state = data?.state;
    const firstLoad = loading && !data;
    const comparisonLabel = `previous ${RANGE_LABEL[range].replace('last ', '')}`;
    const showControls = !firstLoad && state !== 'no_google' && state !== 'no_sites';

    // ── banner (one at a time: danger > info > neutral) ──
    let banner: React.ReactNode = null;
    if (error && data) {
        banner = <Banner variant="danger" title="Couldn't refresh your portfolio" actions={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : null}>{error}</Banner>;
    } else if (data?.googleError && data.sites.length > 0 && !readOnly) {
        banner = (
            <Banner
                variant="danger"
                title="Google access expired"
                actions={onConnectGoogle ? <Button size="sm" variant="secondary" onClick={onConnectGoogle}>Reconnect Google</Button> : null}
            >
                Numbers below are from the last sync. Reconnect Google to keep them up to date.
            </Banner>
        );
    } else if (data?.syncing && data.sites.some((s) => !s.search && !s.traffic)) {
        const waiting = data.sites.filter((s) => !s.search && !s.traffic && !s.hidden).length;
        banner = (
            <Banner variant="info" title={`Syncing ${fmtFull(waiting)} ${waiting === 1 ? 'site' : 'sites'}`}>
                We fetch 16 months of history once. Numbers fill in as data arrives; you can leave this page.
            </Banner>
        );
    } else if (data?.demo && !readOnly) {
        banner = <Banner variant="neutral">You&apos;re looking at demo data.</Banner>;
    }

    return (
        <div className={className}>
            <PageHeader
                title="Portfolio"
                subtitle={firstLoad ? <span className="inline-block h-4 w-64 skeleton align-middle" aria-hidden /> : <Subtitle data={data} range={range} />}
                note={note}
                actions={showControls ? (
                    <>
                        <SearchInput
                            value={query}
                            onValueChange={setQuery}
                            placeholder="Search sites"
                            aria-label="Search sites"
                            className="hidden shrink-0 md:block md:w-36 lg:w-44"
                        />
                        <Select
                            value={sort}
                            onValueChange={(v) => onSortChange(v as SortKey)}
                            options={SORT_OPTIONS}
                            ariaLabel="Sort sites"
                            align="end"
                            className="w-[148px] min-w-0 shrink-0 md:w-[164px]"
                        />
                        <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={onRangeChange} ariaLabel="Date range" />
                    </>
                ) : undefined}
            />

            {banner ? <div className="mb-6">{banner}</div> : null}

            {error && !data ? (
                <EmptyState
                    variant="page"
                    icon={AlertTriangle}
                    title="Couldn't load your portfolio"
                    description={error}
                    actions={onRetry ? <Button variant="primary" onClick={onRetry}>Try again</Button> : null}
                />
            ) : firstLoad ? (
                <LoadingSkeleton compact={isMobile} />
            ) : state === 'no_google' ? (
                <ConnectGoogle onConnect={() => onConnectGoogle?.()} reconnect={Boolean(data?.googleError && data.googleError.status === 401 && data.googleError.message !== 'Google is not connected')} />
            ) : state === 'no_sites' ? (
                <NoSitesFound onCheckAgain={() => onSyncNow?.()} checking={syncBusy || data?.syncing} />
            ) : state === 'first_sync' || !data ? (
                <LoadingSkeleton compact={isMobile} withStrip={false} count={6} />
            ) : (
                <div className="flex flex-col gap-6">
                    <TotalsStrip
                        data={data}
                        metric={activeMetric}
                        onMetricChange={setMetric}
                        comparisonLabel={comparisonLabel}
                        dimmed={refetching}
                        compact={isMobile}
                    />

                    {readOnly ? null : (
                        <AlertsPanel alerts={data.alerts} hrefFor={(slug) => hrefFor({ slug })} onOpen={(a) => {
                            const s = data.sites.find((x) => x.key === a.siteKey);
                            if (s) onOpenSite?.(s);
                        }} />
                    )}

                    <section aria-label="Sites" className="flex flex-col gap-4">
                        {/* Phones: the header row has no room for search, so it sits above the list. */}
                        <SearchInput
                            value={query}
                            onValueChange={setQuery}
                            placeholder="Search sites"
                            aria-label="Search sites"
                            slashShortcut={false}
                            className="md:hidden"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="-mx-4 flex min-w-0 max-w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:max-w-full md:px-0">
                                <SegmentedControl<FilterKey>
                                    variant="neutral"
                                    size="sm"
                                    ariaLabel="Show"
                                    value={filter}
                                    onChange={onFilterChange}
                                    options={[
                                        { value: 'all', label: <>All <Count n={counts.all} /></> },
                                        { value: 'gsc', label: <>Search Console <Count n={counts.gsc} /></> },
                                        { value: 'ga4', label: <>Analytics <Count n={counts.ga4} /></> },
                                        { value: 'starred', label: <>Starred <Count n={counts.starred} /></> },
                                    ]}
                                />
                            </div>
                            <span className="flex-1" />
                            {readOnly || !onSyncNow ? null : (
                                <Tooltip content={data.syncing ? 'Syncing…' : 'Sync now'}>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        iconOnly
                                        icon={RefreshCw}
                                        aria-label="Sync now"
                                        loading={syncBusy || data.syncing}
                                        onClick={onSyncNow}
                                    />
                                </Tooltip>
                            )}
                            {(
                                <SegmentedControl<PortfolioLayout>
                                    variant="neutral"
                                    size="sm"
                                    ariaLabel="Layout"
                                    value={activeLayout}
                                    onChange={(v) => { setLayout(v); saveLayout(v); }}
                                    options={[
                                        { value: 'grid', label: '', icon: LayoutGrid, ariaLabel: 'Cards' },
                                        { value: 'table', label: '', icon: List, ariaLabel: 'Table' },
                                    ]}
                                />
                            )}
                        </div>

                        {activeLayout === 'table' ? (
                            <SitesTable
                                sites={shown}
                                dates={data.dates}
                                view={view}
                                syncing={data.syncing}
                                onOpen={readOnly ? undefined : (s) => { onOpenSite?.(s); }}
                                exportHref={exportHref}
                                dimmed={refetching}
                                empty={<NoMatch query={q} onClear={() => setQuery('')} filter={filter} onAll={() => onFilterChange('all')} />}
                            />
                        ) : shown.length === 0 ? (
                            <NoMatch query={q} onClear={() => setQuery('')} filter={filter} onAll={() => onFilterChange('all')} />
                        ) : (
                            <>
                                <div className={cn('grid grid-cols-1 gap-4 transition-opacity duration-180 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4', refetching && 'opacity-60')}>
                                    {shown.slice(0, limit).map((s) => (
                                        <SiteCard
                                            key={s.key}
                                            site={s}
                                            windows={data.windows}
                                            dates={data.dates}
                                            view={view}
                                            syncing={data.syncing}
                                            href={hrefFor(s)}
                                            onOpen={onOpenSite}
                                            onToggleStar={onToggleStar}
                                            menu={menu}
                                            compact={isMobile}
                                            readOnly={readOnly}
                                        />
                                    ))}
                                </div>
                                {shown.length > limit ? (
                                    <div className="flex justify-center">
                                        <Button variant="secondary" onClick={() => setLimitState({ key: limitKey, n: limit + PAGE })}>
                                            Show {Math.min(PAGE, shown.length - limit)} more
                                            <span className="text-fg-muted tabular-nums">· {fmtFull(shown.length - limit)} left</span>
                                        </Button>
                                    </div>
                                ) : null}
                            </>
                        )}

                        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-meta text-fg-muted">
                            {hiddenCount > 0 && !readOnly ? (
                                <Button variant="link" size="sm" onClick={() => setShowHidden((v) => !v)}>
                                    {showHidden ? 'Hide hidden sites' : `Show ${hiddenCount} hidden ${hiddenCount === 1 ? 'site' : 'sites'}`}
                                </Button>
                            ) : null}
                            {exportHref && activeLayout === 'grid' ? (
                                <Button asChild variant="link" size="sm"><a href={exportHref} download>Export CSV</a></Button>
                            ) : null}
                        </div>
                    </section>
                </div>
            )}

            {onSavePairing ? (
                <PairingDialog
                    site={pairingSite}
                    sites={sites}
                    open={pairingSite !== null}
                    onOpenChange={(o) => { if (!o) setPairingSite(null); }}
                    onSave={onSavePairing}
                />
            ) : null}
        </div>
    );
}

function Count({ n }: { n: number }) {
    return <span className="ml-1 text-fg-muted tabular-nums">{fmtFull(n)}</span>;
}

function NoMatch({ query, onClear, filter, onAll }: { query: string; onClear: () => void; filter: FilterKey; onAll: () => void }) {
    if (query) {
        return <EmptyState variant="inline" title={`No sites match “${query}”`} actions={<Button size="sm" onClick={onClear}>Clear search</Button>} />;
    }
    if (filter === 'starred') {
        return <EmptyState variant="inline" title="No starred sites yet" description="Star a site to keep it at the top of every sort." actions={<Button size="sm" onClick={onAll}>Show all sites</Button>} />;
    }
    return <EmptyState variant="inline" title="No sites here" actions={<Button size="sm" onClick={onAll}>Show all sites</Button>} />;
}

function LoadingSkeleton({ compact, withStrip = true, count = 6 }: { compact?: boolean; withStrip?: boolean; count?: number }) {
    return (
        <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading portfolio">
            {withStrip ? <div className="h-[340px] rounded-card border border-border-subtle bg-surface p-4"><span className="block h-full w-full skeleton" /></div> : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
                {Array.from({ length: count }, (_, i) => <SiteCardSkeleton key={i} compact={compact} delay={0} />)}
            </div>
        </div>
    );
}
