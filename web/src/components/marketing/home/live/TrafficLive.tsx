'use client';

import { useMemo, useState } from 'react';

import { fmtDateRange } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { useIsMobile } from '@/lib/useIsMobile';
import { ChartCard } from '@/components/charts/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { KpiStrip } from '@/components/ui/StatCard';
import { FindingLine } from '@/components/site/Finding';
import type { LiveTrafficRow } from '../homeLive';
import { LiveFrame, MarkerChips, toAnnotations, useCoarsePointer } from './parts';

const STRIP: MetricKey[] = ['users', 'sessions', 'pageviews', 'conversions', 'ai'];

/**
 * Phones: the app's KPI strip scrolls sideways, which left the selected AI traffic tile off screen. Here its tabs wrap
 * into a 3-column grid (hairline gaps instead of the strip's side borders), so all five, and the selected one, show.
 */
const PHONE_GRID = [
    'max-md:[&_[role=tablist]]:grid max-md:[&_[role=tablist]]:grid-cols-3 max-md:[&_[role=tablist]]:gap-px max-md:[&_[role=tablist]]:bg-border-subtle',
    'max-md:[&_[role=tab]]:min-w-0 max-md:[&_[role=tab]]:border-r-0 max-md:[&_[role=tab]]:px-3 max-md:[&_[role=tab]]:py-2.5',
    'max-md:[&_[role=tab][aria-selected=false]]:bg-surface',
    // Five tiles in three columns: the last one spans two, so no empty cell.
    'max-md:[&_[role=tab]:last-child]:col-span-2',
].join(' ');

/**
 * Traffic > Overview on sample data (round 6): the app's KPI strip (tiles are tabs) over the chart, opened on AI
 * traffic like the picture it replaces. Switching a tab redraws the chart with its own finding line; the readout shows
 * each day against the same day of the previous period; the markers are the demo's notes and Google updates.
 */
export function TrafficLive({ data }: { data: LiveTrafficRow }) {
    const [metric, setMetric] = useState<MetricKey>('ai');
    const phone = useIsMobile();
    const touch = useCoarsePointer();
    const { meta, traffic } = data;
    const series = traffic.series as unknown as Record<string, number | string | null>[];
    const t = traffic.totals as unknown as Record<string, number>;
    const prev = traffic.previous as unknown as Record<string, number> | null;
    const annotations = useMemo(() => toAnnotations(data.markers), [data.markers]);
    const title = `${METRICS[metric].label} per day`;
    const first = series[0];
    const last = series[series.length - 1];
    const range = fmtDateRange(meta.window.start, meta.window.end);
    const prevRange = first?.prevDate && last?.prevDate ? fmtDateRange(String(first.prevDate), String(last.prevDate)) : null;
    return (
        <LiveFrame
            hint={touch ? 'Tap a tile to switch, tap the chart for each day.' : 'Switch the tiles, hover the chart for each day.'}
            href={meta.links.traffic}
            linkLabel="Open Traffic in the live demo"
        >
            <KpiStrip
                ariaLabel="Traffic metrics"
                selected={metric}
                onSelect={setMetric}
                comparisonLabel={meta.compareText}
                className={PHONE_GRID}
                items={STRIP.map((k) => ({ metric: k, value: t[k] ?? null, previous: prev ? prev[k] ?? null : null }))}
            >
                <ChartCard
                    bare
                    title={<span data-live-chart-title="">{title}</span>}
                    subtitle={`${range}${prevRange ? ` · dashed: ${prevRange}` : ''}`}
                    height={phone ? 204 : 300}
                >
                    <FindingLine finding={data.findings[metric] ?? null} />
                    <TimeSeriesChart
                        data={series}
                        series={[{ metric, key: metric, compareKey: `prev_${metric}` }]}
                        compareDateKey="prevDate"
                        annotations={annotations}
                        height={phone ? 204 : 300}
                        tooltipAbove={phone || touch}
                        ariaLabel={`${title}, ${range}`}
                    />
                    <MarkerChips markers={data.markers} oneLine={phone} />
                </ChartCard>
            </KpiStrip>
        </LiveFrame>
    );
}
