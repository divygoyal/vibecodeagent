'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDateRange } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { useIsMobile } from '@/lib/useIsMobile';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { FindingLine } from '@/components/site/Finding';
import { MetricTile } from '@/components/site/MetricTile';
import type { LiveSiteRow } from '../homeLive';
import { LiveFrame, MarkerChips, toAnnotations, useCoarsePointer } from './parts';

type Side = 'traffic' | 'search';
type Row = Record<string, number | string | null>;

const TILES: Record<Side, MetricKey[]> = {
    traffic: ['users', 'sessions', 'pageviews', 'conversions'],
    search: ['clicks', 'impressions', 'ctr', 'position'],
};

/** One line over a tile group: the source (as on the site page's section headings) and its "Open" link. */
function GroupLine({ title, source, href }: { title: string; source: string; href: string }) {
    return (
        <div className="mb-1.5 flex min-w-0 items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-meta text-fg-muted">
                <span className="mr-1.5 text-body-sm font-semibold text-fg">{title}</span>
                {source}
            </p>
            <Link href={href} className="tap-area inline-flex shrink-0 items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                Open {title} <ArrowRight aria-hidden size={14} />
            </Link>
        </div>
    );
}

/**
 * The site page's overview on sample data (round 6): the app's MetricTile toggles for Traffic and Search, and ONE
 * chart under them for the selected tile (finding line, previous period dashed, y axis, markers listed once, tooltips).
 * Phones show one group at a time (Traffic / Search switch) over a ~200 px chart whose readout sits above the plot.
 */
export function SiteLive({ data }: { data: LiveSiteRow }) {
    const { meta, traffic, search } = data;
    const phone = useIsMobile();
    const touch = useCoarsePointer();
    const [sel, setSel] = useState<{ side: Side; metric: MetricKey }>({ side: 'traffic', metric: 'users' });
    const src = {
        traffic: {
            totals: traffic.totals as unknown as Record<string, number>,
            previous: traffic.previous as unknown as Record<string, number> | null,
            series: traffic.series as unknown as Row[],
            findings: data.trafficFindings,
            markers: data.markers.traffic,
            range: { start: meta.window.start, end: meta.window.end },
        },
        search: {
            totals: search.totals as unknown as Record<string, number>,
            previous: search.previous as unknown as Record<string, number> | null,
            series: search.series as unknown as Row[],
            findings: data.searchFindings,
            markers: data.markers.search,
            range: { start: meta.window.searchStart, end: search.lastDate ?? meta.window.searchEnd },
        },
    };
    const cur = src[sel.side];
    const dates = useMemo(() => ({
        traffic: src.traffic.series.map((r) => String(r.date)),
        search: src.search.series.map((r) => String(r.date)),
    }), [src.traffic.series, src.search.series]);
    const annotations = useMemo(() => toAnnotations(cur.markers), [cur.markers]);
    const prevRange = cur.series.length ? { start: String(cur.series[0].prevDate ?? ''), end: String(cur.series[cur.series.length - 1].prevDate ?? '') } : null;
    const title = `${METRICS[sel.metric].label} per day`;
    const lastDate = search.lastDate;

    const group = (side: Side) => (
        <div className={cn('min-w-0', side !== sel.side && 'max-md:hidden')}>
            <div className="max-md:hidden">
                {side === 'traffic'
                    ? <GroupLine title="Traffic" source={`Google Analytics 4 · ${meta.ga4.replace('properties/', 'property ')}`} href={meta.links.traffic} />
                    : <GroupLine title="Search" source={`Search Console · ${meta.gsc.startsWith('sc-domain:') ? 'Domain property' : 'URL-prefix property'}${lastDate ? ` · data through ${fmtDateRange(lastDate, lastDate)}` : ''}`} href={meta.links.search} />}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {TILES[side].map((k) => (
                    <MetricTile
                        key={k}
                        metric={k}
                        value={src[side].totals[k] ?? null}
                        previous={src[side].previous ? src[side].previous![k] ?? null : null}
                        spark={src[side].series.map((r) => (k === 'position' && !Number(r.impressions) ? null : Number(r[k] ?? 0)))}
                        sparkDates={dates[side]}
                        selected={sel.metric === k}
                        onSelect={() => setSel({ side, metric: k })}
                        comparisonLabel={meta.compareText}
                    />
                ))}
            </div>
        </div>
    );

    return (
        <LiveFrame
            hint={touch ? 'Tap a tile, then the chart.' : 'Click any tile to chart it, hover the chart for each day.'}
            href={meta.links.site}
            linkLabel="Open this site in the live demo"
        >
            <SegmentedControl
                ariaLabel="Show"
                size="sm"
                variant="neutral"
                className="mb-3 md:hidden"
                value={sel.side}
                onChange={(side) => setSel({ side, metric: TILES[side][0] })}
                options={[{ value: 'traffic', label: 'Traffic' }, { value: 'search', label: 'Search' }]}
            />
            <div className="flex flex-col gap-3">
                {group('traffic')}
                {group('search')}
            </div>
            <Card as="section" aria-label={title} padding="sm" className="mt-3 flex min-w-0 flex-col">
                {/* Title and finding share a line on wide screens; the dates sit with the markers under the chart. */}
                <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h4 data-live-chart-title="" className="shrink-0 text-title-sm text-fg">{title}</h4>
                    <div className="min-w-0 max-md:hidden [&>p]:mb-0">
                        <FindingLine finding={cur.findings[sel.metric] ?? null} />
                    </div>
                </div>
                <TimeSeriesChart
                    data={cur.series}
                    series={[{ metric: sel.metric, key: sel.metric, compareKey: `prev_${sel.metric}` }]}
                    compareDateKey="prevDate"
                    annotations={annotations}
                    height={204}
                    tooltipAbove={phone || touch}
                    ariaLabel={`${title}, ${fmtDateRange(cur.range.start, cur.range.end)}`}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border-subtle pt-2">
                    <MarkerChips markers={cur.markers} oneLine bare className="w-full min-w-0 md:w-auto md:flex-1" />
                    <p className="text-meta text-fg-muted tabular-nums">
                        {fmtDateRange(cur.range.start, cur.range.end)}
                        {sel.metric === 'position' ? ' · lower is better' : prevRange?.start ? ` · dashed: ${fmtDateRange(prevRange.start, prevRange.end)}` : ''}
                    </p>
                </div>
            </Card>
        </LiveFrame>
    );
}
