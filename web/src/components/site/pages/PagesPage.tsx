'use client';

import { useMemo, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtCurrency, fmtDuration, fmtFull, fmtPercent, fmtPosition } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { BarList } from '@/components/charts/BarList';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { TrendBars } from '@/components/charts/TrendBars';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { SearchInput, useDebouncedValue } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, type TableColumn } from '@/components/ui/Table';
import { mergePages, type MergedPage } from '../lib/pages';
import { isDecaying, pageRef } from '../lib/rules';
import type { DecayRow, Ga4BreakdownResponse, Ga4PageTrends, GscDetailResponse, GscRowsResponse } from '../lib/types';
import { SiteHeader } from '../SiteHeader';
import { sourceParts } from '../SourceIcon';
import { AskButton, LoadError } from '../SiteStates';
import { PagePath } from '../PagePath';
import { pageLabel } from '../lib/pagePath';
import { endsToday, partialTailFrom } from '@/lib/dateRange';
import { downloadCsv, useGa4, useGsc, useSite, useSiteRange } from '../useSiteData';
import { useStringParam } from '../useTabParam';

type Segment = 'all' | 'gaining' | 'declining' | 'decaying' | 'nosearch';
const SEGMENTS: { value: Segment; label: string; needs?: 'ga4' | 'gsc' | 'both' | 'compare' }[] = [
    { value: 'all', label: 'All' },
    { value: 'gaining', label: 'Gaining', needs: 'compare' },
    { value: 'declining', label: 'Declining', needs: 'compare' },
    { value: 'decaying', label: 'Decaying', needs: 'gsc' },
    { value: 'nosearch', label: 'No search clicks', needs: 'both' },
];

interface Row extends MergedPage {
    decay: [number, number, number] | null;
}

/** Change of the page's main metric (views with GA4, else clicks). */
function change(r: Row, ga: boolean): { cur: number; prev: number | null | undefined } {
    return ga ? { cur: r.views ?? 0, prev: r.prevViews } : { cur: r.clicks ?? 0, prev: r.prevClicks };
}

/** Pages (DESIGN 5.7): GA4 and Search Console joined by normalised path, segments, page drawer. */
export function PagesPage() {
    const site = useSite();
    const { compareOn, dr } = useSiteRange();
    const partialLast = endsToday(dr.resolved.end);
    const ga = useGa4<Ga4BreakdownResponse>(site.hasGa4 ? 'pages' : null);
    const sc = useGsc<GscRowsResponse>(site.hasGsc ? 'pages' : null);
    const decay = useGsc<{ rows: DecayRow[] }>(site.hasGsc ? 'decay' : null);
    // Titles for the top pages and trend bars for the top 25 (one extra GA4 call pair, cached).
    const trends = useGa4<Ga4PageTrends>(site.hasGa4 ? 'pageTrends' : null, { extra: { limit: '30' } });
    const { titleBy, trendBy, trendMax } = useMemo(() => {
        const t = new Map<string, string>();
        const tr = new Map<string, number[]>();
        for (const x of trends.data?.titles ?? []) t.set(pageRef(x.path, x.host || site.siteHost).key, x.title);
        for (const x of trends.data?.rows ?? []) {
            const k = pageRef(x.path, x.host || site.siteHost).key;
            if (x.title) t.set(k, x.title);
            if (x.trend) tr.set(k, x.trend);
        }
        return { titleBy: t, trendBy: tr, trendMax: Math.max(0, ...[...tr.values()].flat()) };
    }, [trends.data, site.siteHost]);
    const [segRaw, setSeg] = useStringParam('segment');
    const segment = (SEGMENTS.some((s) => s.value === segRaw) ? segRaw : 'all') as Segment;
    const [pageKey, setPageKey] = useStringParam('page', 'push');
    const [search, setSearch] = useState('');
    const q = useDebouncedValue(search, 120).trim().toLowerCase();

    const rows: Row[] = useMemo(() => {
        const merged = mergePages(ga.data?.rows, sc.data?.rows, site.siteHost);
        const decayMap = new Map((decay.data?.rows ?? []).map((d) => [pageRef(d.page).key, d.clicks]));
        return merged.map((m) => ({ ...m, decay: decayMap.get(m.key) ?? null }));
    }, [ga.data, sc.data, decay.data, site.siteHost]);

    const segFilter = (r: Row, s: Segment) => {
        const c = change(r, site.hasGa4);
        if (s === 'gaining') return c.prev !== undefined && c.prev !== null && c.cur - c.prev >= 5 && c.cur >= c.prev * 1.2;
        if (s === 'declining') return c.prev !== undefined && c.prev !== null && c.prev - c.cur >= 5 && c.cur <= c.prev * 0.8;
        if (s === 'decaying') return r.decay !== null && isDecaying(r.decay);
        if (s === 'nosearch') return (r.views ?? 0) > 0 && !(r.clicks ?? 0);
        return true;
    };
    const counts = useMemo(() => Object.fromEntries(SEGMENTS.map((s) => [s.value, rows.filter((r) => segFilter(r, s.value)).length])) as Record<Segment, number>,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rows, site.hasGa4]);
    const shown = useMemo(() => rows.filter((r) => segFilter(r, segment) && (!q || r.label.toLowerCase().includes(q) || (r.title ?? titleBy.get(r.key) ?? '').toLowerCase().includes(q))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rows, segment, q, site.hasGa4, titleBy]);
    const loading = (site.hasGa4 && ga.state === 'loading') || (site.hasGsc && sc.state === 'loading');
    const err = ga.state === 'error' ? ga : sc.state === 'error' ? sc : null;
    const selected = pageKey ? rows.find((r) => r.key === pageKey) ?? null : null;
    // The page's title: from the pages report (every GA4 page), else the top-pages report (GSC-only rows match by path).
    const titleOf = (r: Row) => r.title ?? titleBy.get(r.key) ?? null;
    // Revenue shows only for properties that report some (purchases land on the page where they happened).
    const money = rows.some((r) => (r.revenue ?? 0) > 0);
    const currency = ga.data?.currency;

    const columns: TableColumn<Row>[] = [
        {
            key: 'page', header: 'Page', width: '38%', sortable: true, firstSortDir: 'asc', sortValue: (r) => r.label,
            cell: (r) => <PagePath path={r.label} title={titleOf(r)} className="w-full font-medium text-fg md:w-auto" />,
            // Rows with trend bars read better without a heat bar; keep it for GSC-only sites.
            heat: site.hasGa4 ? undefined : { metric: 'clicks', value: (r) => r.clicks, style: 'underline' },
        },
        ...(site.hasGa4 ? [{
            key: 'trend', header: 'Trend', className: 'max-md:hidden', headerClassName: 'max-md:hidden',
            cell: (r: Row) => {
                const t = trendBy.get(r.key);
                return t ? <TrendBars values={t} max={trendMax} color={METRICS.pageviews.color} partialLast={partialLast} ariaLabel={`Views trend for ${r.label}`} /> : <span className="text-meta text-fg-faint" title="Trend bars show for the top 30 pages by views">–</span>;
            },
        }] : []),
        ...(site.hasGa4 ? [
            { key: 'views', header: 'Views', align: 'right' as const, sortable: true, sortValue: (r: Row) => r.views ?? -1, cell: (r: Row) => fmtFull(r.views) },
            { key: 'users', header: 'Users', align: 'right' as const, sortable: true, sortValue: (r: Row) => r.users ?? -1, cell: (r: Row) => fmtFull(r.users) },
            { key: 'eng', header: 'Eng. time', align: 'right' as const, sortable: true, sortValue: (r: Row) => r.engagement ?? -1, cell: (r: Row) => (r.engagement === null ? '–' : fmtDuration(r.engagement)), className: 'max-md:hidden', headerClassName: 'max-md:hidden' },
        ] : []),
        ...(money ? [
            { key: 'revenue', header: 'Revenue', align: 'right' as const, sortable: true, sortValue: (r: Row) => r.revenue ?? -1, cell: (r: Row) => (r.revenue ? fmtCurrency(r.revenue, currency) : '–'), className: 'max-md:hidden', headerClassName: 'max-md:hidden' },
        ] : []),
        ...(site.hasGsc ? [
            { key: 'clicks', header: 'Clicks', align: 'right' as const, sortable: true, sortValue: (r: Row) => r.clicks ?? -1, cell: (r: Row) => fmtFull(r.clicks) },
            { key: 'impr', header: 'Impr.', align: 'right' as const, sortable: true, sortValue: (r: Row) => r.impressions ?? -1, cell: (r: Row) => fmtFull(r.impressions), className: 'max-md:hidden', headerClassName: 'max-md:hidden' },
            { key: 'pos', header: 'Pos', align: 'right' as const, sortable: true, firstSortDir: 'asc' as const, sortValue: (r: Row) => (r.impressions ? r.position : 9999), cell: (r: Row) => (r.impressions ? fmtPosition(r.position) : '–') },
        ] : []),
        ...(compareOn ? [{
            key: 'delta', header: site.hasGa4 ? 'Δ views' : 'Δ clicks', mobileLabel: site.hasGa4 ? 'Views change' : 'Clicks change', align: 'right' as const, sortable: true,
            sortValue: (r: Row) => { const c = change(r, site.hasGa4); return c.prev === undefined || c.prev === null ? null : c.cur - c.prev; },
            cell: (r: Row) => { const c = change(r, site.hasGa4); return c.prev === undefined ? '' : <MetricDelta metric={site.hasGa4 ? 'pageviews' : 'clicks'} current={c.cur} previous={c.prev} variant="chip" />; },
        }] : []),
        ...(segment === 'decaying' ? [{
            key: 'decay', header: 'Clicks / 28 days', align: 'right' as const, cell: (r: Row) => (r.decay ? <span className="whitespace-nowrap">{r.decay.map(fmtFull).join(' → ')}</span> : '–'),
        }] : []),
    ];

    const exportCsv = () => downloadCsv('pages.csv',
        ['Page', 'Title', 'URL', 'Views', 'Users', 'Avg engagement (s)', 'Key events', ...(money ? [`Revenue (${currency ?? 'USD'})`] : []), 'Clicks', 'Impressions', 'CTR', 'Position'],
        shown.map((r) => [r.label, titleOf(r) ?? '', r.url ?? '', r.views ?? '', r.users ?? '', r.engagement === null ? '' : Math.round(r.engagement), r.conversions ?? '', ...(money ? [r.revenue ?? ''] : []), r.clicks ?? '', r.impressions ?? '', r.ctr === null ? '' : r.ctr.toFixed(4), r.position === null ? '' : r.position.toFixed(2)]));

    return (
        <div className="flex flex-col">
            <SiteHeader
                section="Pages"
                search={!site.hasGa4}
                both
                source={site.hasGa4 && site.hasGsc ? 'Every URL with Analytics and Search data side by side' : site.hasGa4 ? 'Analytics pages (link Search Console to add clicks and rankings)' : 'Search Console pages (link GA4 to add views and engagement)'}
            />
            {err ? <LoadError error={err.error} onRetry={err.mutate} className="mb-4" /> : null}
            <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Page segments">
                {SEGMENTS.filter((s) => !(s.needs === 'both' && !(site.hasGa4 && site.hasGsc)) && !(s.needs === 'gsc' && !site.hasGsc)).map((s) => {
                    const disabled = s.needs === 'compare' && !compareOn;
                    const active = segment === s.value;
                    return (
                        <button key={s.value} type="button" aria-pressed={active} disabled={disabled}
                            title={disabled ? 'Turn on a comparison period' : s.value === 'decaying' ? 'Search clicks fell in each of the last three 28-day periods, 30%+ in total'
                                : s.value === 'gaining' ? `${site.hasGa4 ? 'Views' : 'Clicks'} up 20% or more (and by 5 or more) vs the comparison period`
                                    : s.value === 'declining' ? `${site.hasGa4 ? 'Views' : 'Clicks'} down 20% or more (and by 5 or more) vs the comparison period` : undefined}
                            onClick={() => void setSeg(s.value === 'all' ? null : s.value)}
                            className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-body-sm pointer-coarse:h-8 transition-colors duration-120 disabled:opacity-50',
                                active ? 'border-transparent bg-brand-soft text-brand-soft-fg' : 'border-border-subtle bg-surface text-fg-secondary hover:bg-subtle')}>
                            {s.label}
                            <span className="text-meta tabular-nums opacity-80">{loading ? '…' : fmtFull(counts[s.value])}</span>
                        </button>
                    );
                })}
            </div>
            <Table<Row>
                // Title over path in every row: room above and below the two lines (round 4 polish).
                density="comfortable"
                caption="Pages"
                rows={shown}
                rowKey={(r) => r.key}
                columns={columns}
                loading={loading}
                defaultSort={{ key: site.hasGa4 ? 'views' : 'clicks', dir: 'desc' }}
                pagination={{ pageSize: 25 }}
                onRowClick={(r) => void setPageKey(r.key)}
                empty={<EmptyState variant="inline" title={q ? 'No pages match your search' : segment !== 'all' ? 'No pages in this segment' : 'No page data in this period'} />}
                toolbar={(
                    <>
                        <SearchInput size="sm" slashShortcut={false} value={search} onValueChange={setSearch} placeholder="Search pages" className="w-full sm:w-64" />
                        <span className="ml-auto text-meta text-fg-muted tabular-nums">{fmtFull(shown.length)} pages</span>
                        <Button size="sm" variant="ghost" icon={Download} onClick={exportCsv} disabled={!shown.length}>Export</Button>
                    </>
                )}
            />
            {(ga.data?.truncated || sc.data?.truncated) ? <p className="mt-2 text-meta text-fg-muted">Showing the top pages Google returned for this range.</p> : null}
            <PageDrawer row={selected} pageKey={pageKey} knownTitle={selected ? titleOf(selected) : pageKey ? titleBy.get(pageKey) ?? null : null} currency={currency} loading={loading} onClose={() => void setPageKey(null)} />
        </div>
    );
}

/** Page drawer: KPIs, views chart, queries for this page, sources, Ask. */
function PageDrawer({ row, pageKey, knownTitle, currency, loading, onClose }: { row: Row | null; pageKey: string | null; knownTitle: string | null; currency?: string; loading: boolean; onClose: () => void }) {
    const site = useSite();
    const { compareOn, dr } = useSiteRange();
    const open = Boolean(pageKey);
    const gaPage = useGa4<{ series: Record<string, number | string | null>[]; totals: { pageviews: number; users: number; engagement: number; conversions: number }; previous: { pageviews: number; users: number } | null; sources: { name: string; views: number }[]; title?: string | null }>(
        open && row?.gaPath ? 'page' : null,
        { extra: row?.gaPath ? { path: row.gaPath, ...(row.gaHost ? { host: row.gaHost } : {}) } : undefined },
    );
    const scPage = useGsc<GscDetailResponse>(open && row?.url ? 'detail' : null, { extra: row?.url ? { page: row.url } : undefined });
    const title = row?.label ?? pageKey ?? '';
    // The page's <title> from GA4: the top pages already have it, the drawer's own report has it for the rest.
    const pageTitle = knownTitle ?? gaPage.data?.title ?? null;
    const prompt = row
        ? `How can I improve ${title} on ${site.siteHost ?? site.label}?${row.views !== null ? ` It had ${fmtFull(row.views)} views and ${fmtDuration(row.engagement ?? 0)} average engagement.` : ''}${row.clicks !== null ? ` In Google it got ${fmtFull(row.clicks)} clicks from ${fmtFull(row.impressions)} impressions at position ${fmtPosition(row.position)}.` : ''}`
        : '';
    return (
        <Drawer
            open={open}
            onOpenChange={(o) => { if (!o) onClose(); }}
            title={<span className="[overflow-wrap:anywhere]">{pageLabel(title)}</span>}
            subtitle={pageTitle ? <span className="[overflow-wrap:anywhere]">{pageTitle}</span> : 'Page'}
            width="wide"
            footer={row ? (
                <div className="flex flex-wrap items-center gap-2">
                    <AskButton prompt={prompt} site={{ ga4: site.ga4, gsc: site.gsc }} label="Ask AI to improve this page" from="site:pages" />
                    {row.url || site.siteHost ? (
                        <a href={row.url ?? `https://${pageRef(row.key).host || site.siteHost}${row.path}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-body-sm text-fg-secondary hover:text-fg">Open page <ExternalLink aria-hidden size={14} /></a>
                    ) : null}
                </div>
            ) : undefined}
        >
            {!row && loading ? <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-48" /></div> : !row ? (
                <EmptyState variant="inline" title="This page has no data in the selected range" description="Pick a longer range or another page." />
            ) : (
                <div className="flex flex-col gap-6">
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {row.views !== null ? <Kpi label="Views" color={METRICS.pageviews.color} value={fmtFull(row.views)} delta={compareOn && row.prevViews !== undefined ? <MetricDelta metric="pageviews" current={row.views} previous={row.prevViews} /> : null} /> : null}
                        {row.users !== null ? <Kpi label="Users" color={METRICS.users.color} value={fmtFull(row.users)} /> : null}
                        {row.engagement !== null ? <Kpi label="Avg. engagement" color={METRICS.sessions.color} value={fmtDuration(row.engagement)} /> : null}
                        {row.clicks !== null ? <Kpi label="Clicks" color={METRICS.clicks.color} value={fmtFull(row.clicks)} delta={compareOn && row.prevClicks !== undefined ? <MetricDelta metric="clicks" current={row.clicks} previous={row.prevClicks} /> : null} /> : null}
                        {row.impressions !== null ? <Kpi label="Impressions" color={METRICS.impressions.color} value={fmtFull(row.impressions)} /> : null}
                        {row.position !== null && row.impressions ? <Kpi label="Avg. position" color={METRICS.position.color} value={fmtPosition(row.position)} /> : null}
                        {row.ctr !== null && row.impressions ? <Kpi label="CTR" color={METRICS.ctr.color} value={fmtPercent(row.ctr)} /> : null}
                        {row.conversions !== null ? <Kpi label="Key events" color={METRICS.conversions.color} value={fmtFull(row.conversions)} /> : null}
                        {row.revenue ? <Kpi label="Revenue" color={METRICS.revenue.color} value={fmtCurrency(row.revenue, currency)} /> : null}
                    </dl>
                    {row.decay && isDecaying(row.decay) ? (
                        <Banner variant="warn" title="This page is decaying">Search clicks fell three 28-day periods in a row: {row.decay.map(fmtFull).join(' → ')}.</Banner>
                    ) : null}
                    {row.gaPath ? (
                        <div>
                            <p className="mb-2 text-body-sm font-medium text-fg">Views per day</p>
                            {gaPage.state === 'error' ? <LoadError error={gaPage.error} onRetry={gaPage.mutate} /> : !gaPage.data ? <Skeleton className="h-48" /> : (
                                <TimeSeriesChart data={gaPage.data.series} series={[{ metric: 'pageviews', key: 'pageviews', compareKey: compareOn ? 'prev_pageviews' : undefined }]} compareDateKey="prevDate"
                                    partialFrom={partialTailFrom(gaPage.data.series.length, dr.resolved.end)} height={200} ariaLabel={`Views per day for ${title}`} />
                            )}
                        </div>
                    ) : null}
                    {row.url ? (
                        <div>
                            <p className="mb-2 text-body-sm font-medium text-fg">Search queries for this page</p>
                            {scPage.state === 'error' ? <LoadError error={scPage.error} onRetry={scPage.mutate} /> : (
                                <BarList items={(scPage.data?.related ?? []).map((r) => ({ key: r.key, label: r.key, text: r.key, value: r.clicks }))} metric="clicks" limit={8} loading={!scPage.data}
                                    labelHeader="Query" viewAllTitle="Queries for this page" empty={<EmptyState variant="inline" title="No search clicks yet" />} />
                            )}
                        </div>
                    ) : null}
                    {row.gaPath ? (
                        <div>
                            <p className="mb-2 text-body-sm font-medium text-fg">Where viewers came from</p>
                            {gaPage.state === 'error' ? null : (
                                <BarList items={(gaPage.data?.sources ?? []).map((s) => ({ key: s.name, ...sourceParts(s.name), value: s.views }))} metric="pageviews" limit={6} loading={!gaPage.data} labelHeader="Source"
                                    empty={<EmptyState variant="inline" title="No views in this period" />} />
                            )}
                        </div>
                    ) : null}
                </div>
            )}
        </Drawer>
    );
}

function Kpi({ label, value, color, delta }: { label: string; value: string; color: string; delta?: React.ReactNode }) {
    return (
        <div className="rounded-card border border-border-subtle p-3">
            <dt className="flex items-center gap-1.5 text-meta text-fg-muted"><span aria-hidden className="size-2 rounded-full" style={{ background: color }} />{label}</dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-2"><span className="text-stat-sm text-fg">{value}</span>{delta}</dd>
        </div>
    );
}
