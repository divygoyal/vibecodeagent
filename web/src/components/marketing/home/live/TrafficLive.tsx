'use client';

import { useMemo, useState } from 'react';

import { fmtDateRange } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { ChartCard } from '@/components/charts/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { KpiStrip } from '@/components/ui/StatCard';
import { FindingLine } from '@/components/site/Finding';
import type { LiveTrafficRow } from '../homeLive';
import { LiveFrame, MarkerChips, toAnnotations } from './parts';

const STRIP: MetricKey[] = ['users', 'sessions', 'pageviews', 'conversions', 'ai'];

/**
 * Traffic > Overview on sample data (round 6): the app's KPI strip (tiles are tabs) over the chart, opened on AI
 * traffic like the picture it replaces. Switching a tab redraws the chart with its own finding line; hover shows each
 * day against the same day of the previous period; the markers are the demo's notes and Google updates.
 */
export function TrafficLive({ data }: { data: LiveTrafficRow }) {
    const [metric, setMetric] = useState<MetricKey>('ai');
    const { meta, traffic } = data;
    const series = traffic.series as unknown as Record<string, number | string | null>[];
    const t = traffic.totals as unknown as Record<string, number>;
    const prev = traffic.previous as unknown as Record<string, number> | null;
    const annotations = useMemo(() => toAnnotations(data.markers), [data.markers]);
    const title = `${METRICS[metric].label} per day`;
    return (
        <LiveFrame hint="Switch the tabs, hover the chart for each day." href={meta.links.traffic} linkLabel="Open Traffic in the live demo">
            <KpiStrip
                ariaLabel="Traffic metrics"
                selected={metric}
                onSelect={setMetric}
                comparisonLabel={meta.compareText}
                items={STRIP.map((k) => ({ metric: k, value: t[k] ?? null, previous: prev ? prev[k] ?? null : null }))}
            >
                <ChartCard
                    bare
                    title={<span data-live-chart-title="">{title}</span>}
                    subtitle={`${meta.compareLabel} · today is partial`}
                    height={300}
                >
                    <FindingLine finding={data.findings[metric] ?? null} />
                    <TimeSeriesChart
                        data={series}
                        series={[{ metric, key: metric, compareKey: `prev_${metric}` }]}
                        compareDateKey="prevDate"
                        partialFrom={series.length > 1 ? series.length - 1 : undefined}
                        annotations={annotations}
                        height={300}
                        ariaLabel={`${title}, ${fmtDateRange(meta.window.start, meta.window.end)}`}
                    />
                    <MarkerChips markers={data.markers} />
                </ChartCard>
            </KpiStrip>
        </LiveFrame>
    );
}
