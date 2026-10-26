'use client';

import { useMemo, useState } from 'react';

import { fmtDateRange, fmtFull } from '@/lib/format';
import { channelColor, deviceColor, METRICS, type MetricKey } from '@/lib/metrics';
import { BarList } from '@/components/charts/BarList';
import { ChartCard } from '@/components/charts/ChartCard';
import { Donut } from '@/components/charts/Donut';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { KpiStrip } from '@/components/ui/StatCard';
import { flagForName } from '../lib/geo';
import { isAiSource, pageRef, displayPage } from '../lib/rules';
import type { Ga4BreakdownResponse, Ga4Summary } from '../lib/types';
import { MetricTile } from '../MetricTile';
import { LoadError } from '../SiteStates';
import { SectionCard } from '../SummaryPanels';
import { downloadCsv, useGa4, useSite, useSiteRange } from '../useSiteData';

const STRIP: MetricKey[] = ['users', 'sessions', 'pageviews', 'conversions', 'ai'];

export function Flag({ children }: { children: string }) {
    return children ? <span aria-hidden className="text-[14px] leading-none">{children}</span> : null;
}

function cap(s: string) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Traffic > Overview (DESIGN 5.6). */
export function TrafficOverviewTab() {
    const { compareOn, compareText, dr } = useSiteRange();
    const q = useGa4<Ga4Summary>('summary');
    const [metric, setMetric] = useState<MetricKey>('users');
    const d = q.data;
    const series = d?.series ?? [];
    const loading = q.state === 'loading';
    const prev = compareOn ? d?.previous ?? null : undefined;
    const t = d?.totals;
    const empty = q.state === 'ready' && t && t.sessions === 0;

    return (
        <div className="flex flex-col gap-4">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : null}
            <KpiStrip
                ariaLabel="Traffic metrics"
                selected={metric}
                onSelect={setMetric}
                comparisonLabel={compareText || 'previous period'}
                items={STRIP.map((k) => ({
                    metric: k,
                    value: t ? (t as unknown as Record<string, number>)[k] : null,
                    previous: prev === undefined ? undefined : prev ? (prev as unknown as Record<string, number>)[k] : null,
                    loading,
                }))}
            >
                <ChartCard
                    className="!border-0 !p-0 !shadow-none"
                    title={`${METRICS[metric].label} per day`}
                    subtitle={compareOn ? `Dashed: ${dr.compareLabel.replace(/^vs /, '')} · today is partial` : 'Today is partial'}
                    state={q.state === 'error' ? 'error' : empty ? 'empty' : q.state}
                    error={{ message: q.error?.message, onRetry: q.mutate }}
                    empty={{ title: 'No visits in this period', description: 'Try a longer range, or check the GA4 tag is installed.' }}
                    height="large"
                    onDownloadCsv={d ? () => downloadCsv('traffic-daily.csv', ['date', ...STRIP], series.map((p) => [p.date, p.users, p.sessions, p.pageviews, p.conversions, p.ai])) : undefined}
                >
                    <TimeSeriesChart
                        data={series as unknown as Record<string, number | string | null>[]}
                        series={[{ metric, key: metric, compareKey: compareOn ? `prev_${metric}` : undefined }]}
                        compareDateKey="prevDate"
                        partialFrom={series.length > 1 ? series.length - 1 : undefined}
                        height={300}
                        ariaLabel={`${METRICS[metric].label} per day, ${fmtDateRange(dr.resolved.start, dr.resolved.end)}`}
                    />
                </ChartCard>
            </KpiStrip>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricTile metric="sessions" label="Engagement rate" format="percent" value={t?.engagementRate} previous={prev === undefined ? undefined : prev?.engagementRate ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Avg. session duration" format="duration" value={t?.avgDuration} previous={prev === undefined ? undefined : prev?.avgDuration ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="users" label="New users" value={t?.newUsers} previous={prev === undefined ? undefined : prev?.newUsers ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="pageviews" label="Views per session" format="position" better="up" value={t && t.sessions ? Math.round((t.pageviews / t.sessions) * 100) / 100 : null}
                    previous={prev === undefined ? undefined : prev && prev.sessions ? Math.round((prev.pageviews / prev.sessions) * 100) / 100 : null} loading={loading} comparisonLabel={compareText} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ChannelsDonut />
                <ReferrersList />
                <AiList />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <LandingList />
                <CountriesList />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <DevicesDonut />
                <SimpleList report="browsers" dim="browser" title="Browsers" />
                <SimpleList report="os" dim="operatingSystem" title="Operating systems" />
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
    const items = (q.data?.rows ?? []).map((r) => ({ key: r.key, label: cap(r.dims.deviceCategory), value: r.cur.activeUsers ?? 0, color: deviceColor(r.dims.deviceCategory) }));
    return (
        <SectionCard title="Devices" description="Users">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : q.state === 'loading' ? <DonutSkeleton /> : items.length ? (
                <Donut items={items} centerLabel="Users" size={136} legend="bottom" />
            ) : <EmptyState variant="inline" title="No users in this period" />}
        </SectionCard>
    );
}

function ReferrersList() {
    const q = useGa4<Ga4BreakdownResponse>('referrers');
    const items = (q.data?.rows ?? []).map((r) => ({ key: r.key, label: r.dims.sessionSource, text: r.dims.sessionSource, value: r.cur.sessions ?? 0 }));
    return (
        <SectionCard title="Sources" description="Sessions by source">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : (
                <BarList items={items} metric="sessions" limit={7} loading={q.state === 'loading'} labelHeader="Source" viewAllTitle="Sources" empty={<EmptyState variant="inline" title="No sessions in this period" />} />
            )}
        </SectionCard>
    );
}

function AiList() {
    const q = useGa4<Ga4BreakdownResponse>('referrers');
    const items = (q.data?.rows ?? []).filter((r) => isAiSource(r.dims.sessionSource)).map((r) => ({ key: r.key, label: r.dims.sessionSource, text: r.dims.sessionSource, value: r.cur.sessions ?? 0 }));
    const total = items.reduce((a, b) => a + b.value, 0);
    return (
        <SectionCard title="AI assistants" description={q.data ? `${fmtFull(total)} sessions from ChatGPT, Perplexity, Claude, Gemini and others` : 'Sessions referred by AI assistants'}>
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : (
                <BarList items={items} metric="ai" limit={7} loading={q.state === 'loading'} labelHeader="Assistant" viewAllTitle="AI assistants"
                    empty={<EmptyState variant="inline" title="No AI referrals yet" description="Visits from ChatGPT, Perplexity and similar show up here." />} />
            )}
        </SectionCard>
    );
}

function LandingList() {
    const { siteHost } = useSite();
    const q = useGa4<Ga4BreakdownResponse>('landing');
    const items = (q.data?.rows ?? []).filter((r) => r.dims.landingPage && r.dims.landingPage !== '(not set)').map((r) => {
        const ref = pageRef(r.dims.landingPage, siteHost);
        const label = displayPage(ref, siteHost);
        return { key: r.key, label, text: label, value: r.cur.sessions ?? 0 };
    });
    return (
        <SectionCard title="Landing pages" description="Sessions that started on each page">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : (
                <BarList items={items} metric="sessions" limit={8} loading={q.state === 'loading'} labelHeader="Page" viewAllTitle="Landing pages" empty={<EmptyState variant="inline" title="No sessions in this period" />} />
            )}
        </SectionCard>
    );
}

function CountriesList() {
    const q = useGa4<Ga4BreakdownResponse>('countries');
    const items = (q.data?.rows ?? []).map((r) => ({ key: r.key, label: r.dims.country, text: r.dims.country, value: r.cur.activeUsers ?? 0, icon: <Flag>{flagForName(r.dims.country)}</Flag> }));
    return (
        <SectionCard title="Countries" description="Users">
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : (
                <BarList items={items} metric="users" limit={8} showShare loading={q.state === 'loading'} labelHeader="Country" viewAllTitle="Countries" empty={<EmptyState variant="inline" title="No users in this period" />} />
            )}
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
