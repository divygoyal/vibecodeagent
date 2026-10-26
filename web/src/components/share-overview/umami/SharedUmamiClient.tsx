'use client';

import useSWR from 'swr';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    type TooltipContentProps,
} from 'recharts';

import { cn } from '@/lib/cn';
import { fmtAxis, fmtCompact, fmtDuration, fmtFull } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import type { ShareUmamiDashboardData, ShareUmamiRealtimeData } from '@/lib/shareUmamiData';
import { Banner } from '@/components/ui/Banner';
import { Card, CardHeader } from '@/components/ui/Card';
import { DeltaArrow } from '@/components/ui/MetricDelta';
import { Pill } from '@/components/ui/Pill';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { Favicon } from '@/components/ui/Favicon';
import { BarList } from '@/components/charts/BarList';
import { ChartCard, ChartSkeleton } from '@/components/charts/ChartCard';
import { ChartTooltipCard } from '@/components/charts/ChartTooltip';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { SHARE_CONTAINER, SharePage, ShareFooter, ShareHeader, shareSiteLabel } from '@/components/share/ShareChrome';

const RANGE_OPTIONS = ['7d', '30d', '90d'] as const;
type RangeOption = (typeof RANGE_OPTIONS)[number];
const RANGE_LABELS: Record<RangeOption, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days' };

async function fetcher<T>(url: string): Promise<T> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load shared analytics');
    }
    return response.json() as Promise<T>;
}

/** Relative change from the API ("12" = +12% vs the previous period), coloured by polarity. */
function ChangeChip({ change, better = 'up' }: { change: number | null; better?: 'up' | 'down' }) {
    if (change === null || Number.isNaN(change)) {
        return <span className="text-meta text-fg-muted">No comparison</span>;
    }
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const good = direction === 'flat' ? null : (direction === 'up') === (better === 'up');
    const tone = good === null ? 'bg-subtle text-fg-muted' : good ? 'bg-up-soft text-up' : 'bg-down-soft text-down';
    return (
        <span className={cn('inline-flex h-5 items-center gap-0.5 rounded-badge px-1.5 text-meta font-medium tabular-nums', tone)}>
            {direction === 'flat' ? null : <DeltaArrow direction={direction} />}
            {Math.abs(change)}%
            <span className="sr-only">{direction === 'flat' ? 'no change' : direction === 'up' ? 'up' : 'down'} versus the previous period</span>
        </span>
    );
}

function KpiTile({
    label,
    metric,
    value,
    change,
    better,
}: {
    label: string;
    /** Colour family of the dot (DESIGN 2.3: derived metrics borrow their family colour). */
    metric: MetricKey;
    value: string;
    change: number | null;
    better?: 'up' | 'down';
}) {
    return (
        <Card padding="sm" className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: METRICS[metric].color }} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">{label}</span>
            </div>
            <span className="text-stat text-fg">{value}</span>
            <div className="flex items-center gap-1.5">
                <ChangeChip change={change} better={better} />
                {change !== null && !Number.isNaN(change) ? <span className="text-meta text-fg-muted">vs previous period</span> : null}
            </div>
        </Card>
    );
}

function KpiSkeleton() {
    return (
        <Card padding="sm" className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-32" />
        </Card>
    );
}

function LegendDot({ metric, label }: { metric: MetricKey; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-meta text-fg-muted">
            <span aria-hidden className="size-2 rounded-full" style={{ background: METRICS[metric].color }} />
            {label}
        </span>
    );
}

function BreakdownCard({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
    return (
        <Card>
            <CardHeader title={title} actions={<span className="text-meta text-fg-muted tabular-nums">{fmtFull(items.length)} rows</span>} />
            <BarList
                metric="neutral"
                items={items.map((item) => ({ key: item.label, label: item.label, text: item.label, value: item.value }))}
                labelHeader={title}
                viewAllTitle={title}
                empty={<p className="py-6 text-center text-body text-fg-muted">No data for this range</p>}
            />
        </Card>
    );
}

function RealtimeTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
    if (!active || !payload?.length) return null;
    return (
        <ChartTooltipCard
            title={label}
            rows={[{ key: 'views', label: 'Views', color: METRICS.pageviews.color, value: fmtFull(Number(payload[0]?.value ?? 0)) }]}
        />
    );
}

function RealtimeStat({ label, value }: { label: string; value: number | undefined }) {
    return (
        <div className="rounded-control bg-surface-sunken p-3">
            <p className="text-meta text-fg-muted">{label}</p>
            <p className="mt-1 text-stat-sm text-fg tabular-nums">{fmtCompact(value ?? 0)}</p>
        </div>
    );
}

function SharedUmamiPage({
    token,
    siteUrl,
    views,
    embedMode = false,
}: {
    token: string;
    siteUrl: string;
    views: number;
    embedMode?: boolean;
}) {
    const [range, setRange] = useQueryState(
        'range',
        parseAsStringEnum([...RANGE_OPTIONS]).withDefault('30d').withOptions({ history: 'push' }),
    );

    const dashboardUrl = `/api/share/${token}/umami/dashboard?range=${range}`;
    const realtimeUrl = `/api/share/${token}/umami/realtime`;

    const { data, error, isLoading } = useSWR<ShareUmamiDashboardData>(dashboardUrl, fetcher, {
        revalidateOnFocus: false,
    });

    const { data: liveData } = useSWR<ShareUmamiRealtimeData>(realtimeUrl, fetcher, {
        refreshInterval: 20_000,
        revalidateOnFocus: false,
        fallbackData: data?.realtime,
    });

    const realtime = liveData || data?.realtime;
    const host = shareSiteLabel(siteUrl);
    const rangeControl = (
        <SegmentedControl
            options={RANGE_OPTIONS.map((option) => ({ value: option, label: RANGE_LABELS[option] }))}
            value={range}
            onChange={(v) => setRange(v)}
            size="sm"
            ariaLabel="Date range"
        />
    );

    return (
        <SharePage>
            {embedMode ? null : <ShareHeader siteUrl={siteUrl} views={views} label="Shared analytics" />}
            <main className={cn(SHARE_CONTAINER, 'flex flex-col gap-4 md:gap-6', embedMode ? 'py-3 md:py-4' : 'py-4 md:py-6')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {embedMode && host ? (
                            <span className="flex min-w-0 items-center gap-2">
                                <Favicon host={host} size={20} />
                                <span className="truncate text-title-sm text-fg">{host}</span>
                            </span>
                        ) : null}
                        {data?.source.label ? <Pill tone="neutral">{data.source.label}</Pill> : null}
                        {data?.source.message ? <p className="text-meta text-fg-muted">{data.source.message}</p> : null}
                    </div>
                    {rangeControl}
                </div>

                {error ? <Banner variant="danger">{error.message}</Banner> : null}

                {isLoading && !data ? (
                    <>
                        <section aria-busy className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                            {Array.from({ length: 5 }, (_, i) => <KpiSkeleton key={i} />)}
                        </section>
                        <Card>
                            <Skeleton className="mb-4 h-5 w-32" />
                            <ChartSkeleton height={280} />
                        </Card>
                    </>
                ) : null}

                {data ? (
                    <>
                        <section aria-label="Totals" className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                            <KpiTile label="Pageviews" metric="pageviews" value={fmtCompact(data.summary.pageviews.value)} change={data.summary.pageviews.change} />
                            <KpiTile label="Visitors" metric="users" value={fmtCompact(data.summary.visitors.value)} change={data.summary.visitors.change} />
                            <KpiTile label="Visits" metric="sessions" value={fmtCompact(data.summary.visits.value)} change={data.summary.visits.change} />
                            <KpiTile label="Bounce rate" metric="sessions" value={`${data.summary.bounceRate.value}%`} change={data.summary.bounceRate.change} better="down" />
                            <KpiTile label="Visit duration" metric="sessions" value={fmtDuration(data.summary.visitDuration.value)} change={data.summary.visitDuration.change} />
                        </section>

                        <section className="grid gap-4 md:gap-6 grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
                            <ChartCard
                                title="Traffic"
                                subtitle={`Pageviews and visits per day, last ${RANGE_LABELS[range]}`}
                                state={data.series.length ? 'ready' : 'empty'}
                                actions={
                                    <span className="flex items-center gap-3 max-sm:hidden">
                                        <LegendDot metric="pageviews" label="Pageviews" />
                                        <LegendDot metric="sessions" label="Visits" />
                                    </span>
                                }
                            >
                                <TimeSeriesChart
                                    mode="overlay"
                                    data={data.series}
                                    series={[
                                        { metric: 'pageviews', key: 'pageviews', label: 'Pageviews' },
                                        { metric: 'sessions', key: 'visits', label: 'Visits' },
                                    ]}
                                    ariaLabel={`Pageviews and visits per day, last ${RANGE_LABELS[range]}`}
                                />
                            </ChartCard>

                            <Card>
                                <CardHeader
                                    title="Realtime"
                                    description="Refreshes every 20 seconds"
                                    actions={realtime ? <Pill tone="up" dot>{fmtFull(realtime.activeVisitors)} live</Pill> : undefined}
                                />
                                <div className="grid grid-cols-3 gap-2">
                                    <RealtimeStat label="Active" value={realtime?.activeVisitors} />
                                    <RealtimeStat label="Views" value={realtime?.totalViews} />
                                    <RealtimeStat label="Visitors" value={realtime?.totalVisitors} />
                                </div>
                                <div className="mt-4 h-[180px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={realtime?.series || []} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                                            <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                                            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }} minTickGap={16} />
                                            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} tickFormatter={(v: number) => fmtAxis(v)} tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }} />
                                            <Tooltip cursor={{ fill: 'var(--color-subtle)' }} content={<RealtimeTooltip />} />
                                            <Bar dataKey="views" radius={[3, 3, 0, 0]} fill={METRICS.pageviews.color} isAnimationActive={false} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>
                        </section>

                        <section className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4">
                            <BreakdownCard title="Top pages" items={data.breakdowns.pages} />
                            <BreakdownCard title="Referrers" items={data.breakdowns.referrers} />
                            <BreakdownCard title="Devices" items={data.breakdowns.devices} />
                            <BreakdownCard title="Countries" items={data.breakdowns.countries} />
                        </section>

                        {realtime ? (
                            <section className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-3">
                                <BreakdownCard title="Live pages" items={realtime.pages} />
                                <BreakdownCard title="Live referrers" items={realtime.referrers} />
                                <BreakdownCard title="Live countries" items={realtime.countries} />
                            </section>
                        ) : null}

                        {!embedMode && data.source.cutoverAt ? (
                            <p className="text-meta text-fg-muted">
                                Data source changed on {new Date(data.source.cutoverAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
                            </p>
                        ) : null}
                    </>
                ) : null}
            </main>
            {embedMode ? null : <ShareFooter />}
        </SharePage>
    );
}

export default function SharedUmamiClient(props: {
    token: string;
    siteUrl: string;
    views: number;
    embedMode?: boolean;
}) {
    return (
        <NuqsAdapter>
            <SharedUmamiPage {...props} />
        </NuqsAdapter>
    );
}
