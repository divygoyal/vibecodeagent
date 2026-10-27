'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDateRange, fmtFull } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { ChartCard } from '@/components/charts/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Card, CardHeader } from '@/components/ui/Card';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { Table } from '@/components/ui/Table';
import { ChartMarkers, IntervalSwitch, toAnnotations, useChartMarkers, useInterval } from './chart/ChartExtras';
import { useSearchFinding, useTrafficFinding } from './chart/useFindings';
import { FindingLine } from './Finding';
import { bucketGscSeries } from './lib/intervals';
import { MetricTile } from './MetricTile';
import { LoadError, SourceMissing } from './SiteStates';
import type { Ga4Summary, GscSummary } from './lib/types';
import { downloadCsv, useGa4, useGsc, useSite, useSiteRange } from './useSiteData';

const TRAFFIC_TILES: MetricKey[] = ['users', 'sessions', 'pageviews', 'conversions'];
const SEARCH_TILES: MetricKey[] = ['clicks', 'impressions', 'ctr', 'position'];

function SectionTitle({ title, source, href, linkLabel }: { title: string; source: string; href?: string; linkLabel?: string }) {
    return (
        <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-title-sm text-fg">{title}</h2>
                <p className="text-meta text-fg-muted">{source}</p>
            </div>
            {href ? (
                <Link href={href} className="tap-area inline-flex shrink-0 items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                    {linkLabel ?? 'Open'} <ArrowRight aria-hidden size={14} />
                </Link>
            ) : null}
        </div>
    );
}

function totalsOf(metric: MetricKey, t: Record<string, number> | null | undefined): number | null {
    if (!t) return null;
    return t[metric] ?? null;
}

/** GA4 tiles (2x2) + one traffic chart. Search and traffic metrics never share a chart (DESIGN 2.3). */
export function TrafficSummary({ href, className }: { href?: string; className?: string }) {
    const { hasGa4, ga4 } = useSite();
    const { compareOn, compareText, dr, days } = useSiteRange();
    const { interval } = useInterval(days);
    const q = useGa4<Ga4Summary>('summary', { extra: interval === 'day' ? undefined : { interval } });
    const [metric, setMetric] = useState<MetricKey>('users');
    const d = q.data;
    const dates = useMemo(() => d?.series.map((p) => p.date) ?? [], [d]);
    const spark = (k: MetricKey) => d?.series.map((p) => (p as unknown as Record<string, number>)[k] ?? 0);
    const series = d?.series ?? [];
    const empty = q.state === 'ready' && d && d.totals.sessions === 0 && d.totals.users === 0;
    const finding = useTrafficFinding(metric, d, { daily: interval === 'day' });
    const marks = useChartMarkers(dates, dr.resolved.start, dr.resolved.end);

    return (
        <section aria-label="Traffic" className={cn('flex min-w-0 flex-col gap-3', className)}>
            <SectionTitle title="Traffic" source={`Google Analytics 4${ga4 ? ` · ${ga4.replace('properties/', 'property ')}` : ''}`} href={hasGa4 ? href : undefined} linkLabel="Open Traffic" />
            {!hasGa4 ? <SourceMissing source="ga4" /> : (
                <>
                    {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : null}
                    <div className="grid grid-cols-2 gap-3">
                        {TRAFFIC_TILES.map((k) => (
                            <MetricTile
                                key={k}
                                metric={k}
                                value={totalsOf(k, d?.totals as unknown as Record<string, number>)}
                                previous={compareOn ? totalsOf(k, d?.previous as unknown as Record<string, number> | null) : undefined}
                                spark={spark(k)}
                                sparkDates={dates}
                                loading={q.state === 'loading'}
                                selected={metric === k}
                                onSelect={() => setMetric(k)}
                                comparisonLabel={compareText}
                            />
                        ))}
                    </div>
                    <ChartCard
                        title={`${METRICS[metric].label} per ${interval}`}
                        subtitle={compareOn ? `Dashed: ${dr.compareLabel.replace(/^vs /, '')}` : undefined}
                        actions={<IntervalSwitch days={days} />}
                        state={q.state === 'error' ? 'error' : empty ? 'empty' : q.state}
                        error={{ message: q.error?.message, onRetry: q.mutate }}
                        empty={{ title: 'No visits in this period', description: 'Try a longer date range, or check the GA4 tag is installed.' }}
                        height={240}
                        onDownloadCsv={d ? () => downloadCsv(`traffic-${dates[0] ?? ''}.csv`, ['date', 'users', 'sessions', 'pageviews', 'conversions', 'ai_sessions'], series.map((p) => [p.date, p.users, p.sessions, p.pageviews, p.conversions, p.ai])) : undefined}
                        tableView={d ? (
                            <Table
                                rows={series}
                                rowKey={(r) => r.date}
                                card={false}
                                pagination={{ pageSize: 50 }}
                                columns={[
                                    { key: 'date', header: 'Date', cell: (r) => r.date },
                                    ...TRAFFIC_TILES.map((k) => ({ key: k, header: METRICS[k].label, align: 'right' as const, cell: (r: (typeof series)[number]) => fmtFull((r as unknown as Record<string, number>)[k]) })),
                                ]}
                            />
                        ) : undefined}
                        footer={d ? <AiFooter value={d.totals.ai} previous={compareOn ? d.previous?.ai ?? null : undefined} /> : undefined}
                    >
                        <FindingLine finding={finding} />
                        <TimeSeriesChart
                            data={series as unknown as Record<string, number | string | null>[]}
                            series={[{ metric, key: metric, compareKey: compareOn ? `prev_${metric}` : undefined }]}
                            compareDateKey="prevDate"
                            partialFrom={series.length > 1 ? series.length - 1 : undefined}
                            annotations={toAnnotations(marks.markers)}
                            height={240}
                            ariaLabel={`${METRICS[metric].label} per ${interval}, ${fmtDateRange(dr.resolved.start, dr.resolved.end)}`}
                        />
                        <ChartMarkers markers={marks.markers} start={dr.resolved.start} end={dr.resolved.end} notesKey={marks.notesKey} scope={marks.scope} onChanged={marks.mutateNotes} notesFailed={marks.notesFailed} />
                    </ChartCard>
                </>
            )}
        </section>
    );
}

function AiFooter({ value, previous }: { value: number; previous?: number | null }) {
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: METRICS.ai.color }} />
            AI traffic: <span className="font-medium text-fg tabular-nums">{fmtFull(value)}</span> sessions from AI assistants
            {previous !== undefined ? <MetricDelta metric="ai" current={value} previous={previous} /> : null}
            <span className="text-fg-faint">· today is partial</span>
        </span>
    );
}

/** GSC tiles (2x2) + one search chart. */
export function SearchSummary({ href, className }: { href?: string; className?: string }) {
    const { hasGsc, gsc } = useSite();
    const { compareOn, compareText, dr, searchDays } = useSiteRange();
    const { interval } = useInterval(searchDays);
    const q = useGsc<GscSummary>('summary');
    const [metric, setMetric] = useState<MetricKey>('clicks');
    const d = q.data;
    const series = useMemo(() => d?.series ?? [], [d]);
    const dates = useMemo(() => series.map((p) => p.date), [series]);
    const chartSeries = useMemo(() => bucketGscSeries(series, interval), [series, interval]);
    const chartDates = useMemo(() => chartSeries.map((p) => p.date), [chartSeries]);
    const finding = useSearchFinding(metric, d, { daily: interval === 'day' });
    const marks = useChartMarkers(chartDates, dr.resolvedSearch.start, d?.lastDate ?? dr.resolvedSearch.end);
    const spark = (k: MetricKey) => series.map((p) => {
        const v = (p as unknown as Record<string, number>)[k] ?? 0;
        return k === 'position' && !p.impressions ? null : v;
    });
    const empty = q.state === 'ready' && d && d.totals.impressions === 0;
    const label = gsc?.startsWith('sc-domain:') ? 'Domain property' : 'URL-prefix property';

    return (
        <section aria-label="Search" className={cn('flex min-w-0 flex-col gap-3', className)}>
            <SectionTitle title="Search" source={hasGsc ? `Google Search Console · ${label}${d?.lastDate ? ` · data through ${fmtDateRange(d.lastDate, d.lastDate)}` : ''}` : 'Google Search Console · not connected'} href={hasGsc ? href : undefined} linkLabel="Open Search" />
            {!hasGsc ? <SourceMissing source="gsc" /> : (
                <>
                    {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : null}
                    <div className="grid grid-cols-2 gap-3">
                        {SEARCH_TILES.map((k) => (
                            <MetricTile
                                key={k}
                                metric={k}
                                value={totalsOf(k, d?.totals as unknown as Record<string, number>)}
                                previous={compareOn ? totalsOf(k, d?.previous as unknown as Record<string, number> | null) : undefined}
                                spark={spark(k)}
                                sparkDates={dates}
                                loading={q.state === 'loading'}
                                selected={metric === k}
                                onSelect={() => setMetric(k)}
                                comparisonLabel={compareText}
                            />
                        ))}
                    </div>
                    <ChartCard
                        title={`${METRICS[metric].label} per ${interval}`}
                        subtitle={metric === 'position' ? 'Lower is better' : compareOn ? `Dashed: ${dr.compareLabel.replace(/^vs /, '')}` : undefined}
                        actions={<IntervalSwitch days={searchDays} />}
                        state={q.state === 'error' ? 'error' : empty ? 'empty' : q.state}
                        error={{ message: q.error?.message, onRetry: q.mutate }}
                        empty={{ title: 'No search impressions in this period', description: 'New sites can take a few weeks to appear in Google.' }}
                        height={240}
                        onDownloadCsv={d ? () => downloadCsv(`search-${dates[0] ?? ''}.csv`, ['date', 'clicks', 'impressions', 'ctr', 'position'], series.map((p) => [p.date, p.clicks, p.impressions, p.ctr.toFixed(4), p.position.toFixed(2)])) : undefined}
                        footer="Search Console data is about 2 days behind."
                    >
                        <FindingLine finding={finding} />
                        <TimeSeriesChart
                            data={chartSeries as unknown as Record<string, number | string | null>[]}
                            series={[{ metric, key: metric, compareKey: compareOn ? `prev_${metric}` : undefined }]}
                            compareDateKey="prevDate"
                            annotations={toAnnotations(marks.markers)}
                            height={240}
                            ariaLabel={`${METRICS[metric].label} per ${interval}, ${fmtDateRange(dr.resolvedSearch.start, dr.resolvedSearch.end)}`}
                        />
                        <ChartMarkers markers={marks.markers} start={dr.resolvedSearch.start} end={d?.lastDate ?? dr.resolvedSearch.end} notesKey={marks.notesKey} scope={marks.scope} onChanged={marks.mutateNotes} notesFailed={marks.notesFailed} />
                    </ChartCard>
                </>
            )}
        </section>
    );
}

export function SectionCard({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <Card as="section" className={cn('flex min-w-0 flex-col', className)}>
            <CardHeader title={title} description={description} actions={actions} />
            {children}
        </Card>
    );
}
