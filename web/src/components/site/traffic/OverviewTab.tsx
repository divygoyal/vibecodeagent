'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/cn';
import { fmtDateRange } from '@/lib/format';
import { channelColor, deviceColor, METRICS, type MetricKey } from '@/lib/metrics';
import { BarList } from '@/components/charts/BarList';
import { ChartCard } from '@/components/charts/ChartCard';
import { Donut } from '@/components/charts/Donut';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { KpiStrip } from '@/components/ui/StatCard';
import { PagesCard, SourcesCard, TechCard } from '../breakdown/Cards';
import { GeoCard } from '../breakdown/GeoCard';
import { ChartMarkers, IntervalSwitch, toAnnotations, useChartMarkers, useInterval } from '../chart/ChartExtras';
import { useTrafficFinding } from '../chart/useFindings';
import { FindingLine } from '../Finding';
import type { Ga4BreakdownResponse, Ga4Summary } from '../lib/types';
import { MetricTile } from '../MetricTile';
import { LoadError } from '../SiteStates';
import { revenuePerSession, SectionCard } from '../SummaryPanels';
import { downloadCsv, useGa4, useSiteRange } from '../useSiteData';
import { PeakHoursCard } from './PeakHours';

const STRIP: MetricKey[] = ['users', 'sessions', 'pageviews', 'conversions', 'ai'];
/** A property with GA4 revenue above 0 (a shop, subscriptions, ads) adds a Revenue tile after Key events. */
const STRIP_REVENUE: MetricKey[] = ['users', 'sessions', 'pageviews', 'conversions', 'revenue', 'ai'];

export function Flag({ children }: { children: string }) {
    return children ? <span aria-hidden className="text-[14px] leading-none">{children}</span> : null;
}

function cap(s: string) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Traffic > Overview (DESIGN 5.6, round 2: tabbed cards, map, peak hours, findings, filters). */
export function TrafficOverviewTab() {
    const { compareOn, compareText, dr, days } = useSiteRange();
    const { interval } = useInterval(days);
    const q = useGa4<Ga4Summary>('summary', { extra: interval === 'day' ? undefined : { interval } });
    const [metric, setMetric] = useState<MetricKey>('users');
    const d = q.data;
    const series = useMemo(() => d?.series ?? [], [d]);
    const dates = useMemo(() => series.map((p) => p.date), [series]);
    const loading = q.state === 'loading';
    const prev = compareOn ? d?.previous ?? null : undefined;
    const t = d?.totals;
    const empty = q.state === 'ready' && t && t.sessions === 0;
    const hasRevenue = (t?.revenue ?? 0) > 0 || (d?.previous?.revenue ?? 0) > 0;
    const strip = hasRevenue ? STRIP_REVENUE : STRIP;
    const currency = d?.currency;
    const chartMetric: MetricKey = metric === 'revenue' && !hasRevenue ? 'users' : metric;
    const finding = useTrafficFinding(chartMetric, d, { daily: interval === 'day' });
    const marks = useChartMarkers(dates, dr.resolved.start, dr.resolved.end);

    return (
        <div className="flex flex-col gap-4">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : null}
            <KpiStrip
                ariaLabel="Traffic metrics"
                selected={chartMetric}
                onSelect={setMetric}
                comparisonLabel={compareText || 'previous period'}
                items={strip.map((k) => ({
                    metric: k,
                    value: t ? (t as unknown as Record<string, number>)[k] : null,
                    previous: prev === undefined ? undefined : prev ? (prev as unknown as Record<string, number>)[k] : null,
                    loading,
                    ...(k === 'revenue' ? { currency } : {}),
                }))}
            >
                <ChartCard
                    bare
                    title={`${METRICS[chartMetric].label} per ${interval}`}
                    subtitle={compareOn ? `Dashed: ${dr.compareLabel.replace(/^vs /, '')} · today is partial` : 'Today is partial'}
                    actions={<IntervalSwitch days={days} />}
                    state={q.state === 'error' ? 'error' : empty ? 'empty' : q.state}
                    error={{ message: q.error?.message, onRetry: q.mutate }}
                    empty={{ title: 'No visits in this period', description: 'Try a longer range, or check the GA4 tag is installed.' }}
                    height="large"
                    onDownloadCsv={d ? () => downloadCsv(`traffic-${interval}.csv`, ['date', 'users', 'sessions', 'pageviews', 'key_events', ...(hasRevenue ? [`revenue_${currency ?? 'USD'}`] : []), 'ai'], series.map((p) => [p.date, p.users, p.sessions, p.pageviews, p.conversions, ...(hasRevenue ? [p.revenue] : []), p.ai])) : undefined}
                >
                    <FindingLine finding={finding} />
                    <TimeSeriesChart
                        data={series as unknown as Record<string, number | string | null>[]}
                        series={[{ metric: chartMetric, key: chartMetric, compareKey: compareOn ? `prev_${chartMetric}` : undefined, currency }]}
                        compareDateKey="prevDate"
                        partialFrom={series.length > 1 ? series.length - 1 : undefined}
                        annotations={toAnnotations(marks.markers)}
                        height={300}
                        ariaLabel={`${METRICS[chartMetric].label} per ${interval}, ${fmtDateRange(dr.resolved.start, dr.resolved.end)}`}
                    />
                    <ChartMarkers markers={marks.markers} start={dr.resolved.start} end={dr.resolved.end} notesKey={marks.notesKey} scope={marks.scope} onChanged={marks.mutateNotes} notesFailed={marks.notesFailed} />
                </ChartCard>
            </KpiStrip>
            <div className={cn('grid grid-cols-2 gap-3', hasRevenue ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-4')}>
                <MetricTile metric="sessions" label="Engagement rate" format="percent" value={t?.engagementRate} previous={prev === undefined ? undefined : prev?.engagementRate ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Avg. session duration" format="duration" value={t?.avgDuration} previous={prev === undefined ? undefined : prev?.avgDuration ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="users" label="New users" value={t?.newUsers} previous={prev === undefined ? undefined : prev?.newUsers ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="pageviews" label="Views per session" format="position" better="up" value={t && t.sessions ? Math.round((t.pageviews / t.sessions) * 100) / 100 : null}
                    previous={prev === undefined ? undefined : prev && prev.sessions ? Math.round((prev.pageviews / prev.sessions) * 100) / 100 : null} loading={loading} comparisonLabel={compareText} />
                {hasRevenue ? (
                    <>
                        <MetricTile metric="revenue" label="Transactions" format="count" value={t?.transactions} previous={prev === undefined ? undefined : prev?.transactions ?? null} loading={loading} comparisonLabel={compareText} />
                        <MetricTile metric="revenue" label="Revenue per session" value={revenuePerSession(t)} previous={prev === undefined ? undefined : revenuePerSession(prev)} loading={loading} comparisonLabel={compareText} currency={currency} cents />
                    </>
                ) : null}
            </div>
            {/* One height per row: the side lists grow and keep "View all" at the bottom. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SourcesCard />
                <PagesCard action="filter" />
            </div>
            <GeoCard />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <TechCard />
                <PeakHoursCard className="lg:col-span-2" />
            </div>
        </div>
    );
}

function DonutSkeleton() {
    return <div className="flex flex-col items-center gap-4"><Skeleton className="size-32 rounded-full" /><Skeleton className="h-4 w-3/4" /></div>;
}

export function ChannelsDonut() {
    const q = useGa4<Ga4BreakdownResponse>('channels');
    const items = (q.data?.rows ?? []).map((r) => ({ key: r.key, label: r.dims.sessionDefaultChannelGroup, value: r.cur.sessions ?? 0, color: channelColor(r.dims.sessionDefaultChannelGroup) }));
    return (
        <SectionCard title="Channels" description="Sessions">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : q.state === 'loading' ? <DonutSkeleton /> : items.length ? (
                <Donut items={items} centerLabel="Sessions" size={136} legend="bottom" />
            ) : <EmptyState variant="inline" title="No sessions in this period" />}
        </SectionCard>
    );
}

export function DevicesDonut() {
    const q = useGa4<Ga4BreakdownResponse>('devices');
    // The centre shows the site's users (the header number); the slices can add up to more (several devices).
    const summary = useGa4<Ga4Summary>('summary');
    const items = (q.data?.rows ?? []).map((r) => ({ key: r.key, label: cap(r.dims.deviceCategory), value: r.cur.activeUsers ?? 0, color: deviceColor(r.dims.deviceCategory) }));
    return (
        <SectionCard title="Devices" description="Users">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : q.state === 'loading' ? <DonutSkeleton /> : items.length ? (
                <Donut items={items} centerLabel="Users" centerValue={summary.data?.totals.users} size={136} legend="bottom" />
            ) : <EmptyState variant="inline" title="No users in this period" />}
        </SectionCard>
    );
}

export function SimpleList({ report, dim, title, metric = 'users' }: { report: 'browsers' | 'os' | 'languages'; dim: string; title: string; metric?: 'users' | 'sessions' }) {
    const q = useGa4<Ga4BreakdownResponse>(report);
    const items = useMemo(() => (q.data?.rows ?? []).map((r) => ({ key: r.key, label: r.dims[dim], text: r.dims[dim], value: (metric === 'users' ? r.cur.activeUsers : r.cur.sessions) ?? 0 })), [q.data, dim, metric]);
    return (
        <SectionCard title={title} description={metric === 'users' ? 'Users' : 'Sessions'}>
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : (
                <BarList items={items} metric={metric} limit={7} showShare loading={q.state === 'loading'} labelHeader={title} viewAllTitle={title} empty={<EmptyState variant="inline" title="No data in this period" />} />
            )}
        </SectionCard>
    );
}
