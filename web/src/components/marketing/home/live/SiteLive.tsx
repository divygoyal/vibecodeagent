'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDateRange } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { ChartCard } from '@/components/charts/ChartCard';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { FindingLine } from '@/components/site/Finding';
import { MetricTile } from '@/components/site/MetricTile';
import type { Finding } from '@/components/site/lib/findings';
import type { LiveMarker, LiveSiteRow } from '../homeLive';
import { LiveFrame, MarkerChips, toAnnotations } from './parts';

const TRAFFIC_TILES: MetricKey[] = ['users', 'sessions', 'pageviews', 'conversions'];
const SEARCH_TILES: MetricKey[] = ['clicks', 'impressions', 'ctr', 'position'];

type Row = Record<string, number | string | null>;

/** The section heading of the site page (SummaryPanels SectionTitle): title, source line, "Open" link. */
function SectionTitle({ title, source, href, linkLabel }: { title: string; source: string; href: string; linkLabel: string }) {
    return (
        <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
                <h4 className="text-title text-fg">{title}</h4>
                <p className="truncate text-meta text-fg-muted">{source}</p>
            </div>
            <Link href={href} className="tap-area inline-flex shrink-0 items-center gap-1 text-body-sm font-medium text-brand-text hover:underline">
                {linkLabel} <ArrowRight aria-hidden size={14} />
            </Link>
        </div>
    );
}

interface PanelProps {
    label: 'Traffic' | 'Search';
    source: string;
    href: string;
    tiles: MetricKey[];
    totals: Record<string, number>;
    previous: Record<string, number> | null;
    series: Row[];
    findings: Partial<Record<MetricKey, Finding | null>>;
    markers: LiveMarker[];
    compareText: string;
    compareLabel: string;
    range: { start: string; end: string };
    partial?: boolean;
    footer?: string;
}

/** One side of the site overview: four KPI tiles (toggles) over one chart, as on the site page. */
function Panel(p: PanelProps) {
    const [metric, setMetric] = useState<MetricKey>(p.tiles[0]);
    const dates = useMemo(() => p.series.map((r) => String(r.date)), [p.series]);
    const spark = (k: MetricKey) => p.series.map((r) => {
        const v = Number(r[k] ?? 0);
        return k === 'position' && !Number(r.impressions) ? null : v;
    });
    const annotations = useMemo(() => toAnnotations(p.markers), [p.markers]);
    const title = `${METRICS[metric].label} per day`;
    return (
        <section aria-label={p.label} className="flex min-w-0 flex-col gap-3">
            <SectionTitle title={p.label} source={p.source} href={p.href} linkLabel={`Open ${p.label}`} />
            <div className="grid grid-cols-2 gap-3">
                {p.tiles.map((k) => (
                    <MetricTile
                        key={k}
                        metric={k}
                        value={p.totals[k] ?? null}
                        previous={p.previous ? p.previous[k] ?? null : null}
                        spark={spark(k)}
                        sparkDates={dates}
                        selected={metric === k}
                        onSelect={() => setMetric(k)}
                        comparisonLabel={p.compareText}
                    />
                ))}
            </div>
            <ChartCard
                title={<span data-live-chart-title="">{title}</span>}
                subtitle={metric === 'position' ? 'Lower is better' : p.compareLabel}
                height={200}
                footer={p.footer}
            >
                <FindingLine finding={p.findings[metric] ?? null} />
                <TimeSeriesChart
                    data={p.series}
                    series={[{ metric, key: metric, compareKey: `prev_${metric}` }]}
                    compareDateKey="prevDate"
                    partialFrom={p.partial && p.series.length > 1 ? p.series.length - 1 : undefined}
                    annotations={annotations}
                    height={200}
                    ariaLabel={`${title}, ${fmtDateRange(p.range.start, p.range.end)}`}
                />
                {/* Phones: the dashed marker lines stay on the chart; their key would add three rows of chips. */}
                <MarkerChips markers={p.markers} className="max-md:hidden" />
            </ChartCard>
        </section>
    );
}

/**
 * The site page's overview on sample data (round 6): Traffic and Search side by side, each with the app's MetricTile
 * toggles and its chart (finding line, previous period dashed, markers, hover tooltips). Phones switch between the
 * two sides instead of stacking eight tiles and two charts.
 */
export function SiteLive({ data }: { data: LiveSiteRow }) {
    const [side, setSide] = useState<'traffic' | 'search'>('traffic');
    const { meta, traffic, search } = data;
    const lastDate = search.lastDate;
    const common = { compareText: meta.compareText, compareLabel: meta.compareLabel };
    return (
        <LiveFrame hint="Click a tile to chart it, hover the chart for each day." href={meta.links.site} linkLabel="Open this site in the live demo">
            <SegmentedControl
                ariaLabel="Show"
                size="sm"
                variant="neutral"
                className="mb-4 md:hidden"
                value={side}
                onChange={setSide}
                options={[{ value: 'traffic', label: 'Traffic' }, { value: 'search', label: 'Search' }]}
            />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className={cn('min-w-0', side !== 'traffic' && 'max-md:hidden')}>
                    <Panel
                        label="Traffic"
                        source={`Google Analytics 4 · ${meta.ga4.replace('properties/', 'property ')}`}
                        href={meta.links.traffic}
                        tiles={TRAFFIC_TILES}
                        totals={traffic.totals as unknown as Record<string, number>}
                        previous={traffic.previous as unknown as Record<string, number> | null}
                        series={traffic.series as unknown as Row[]}
                        findings={data.trafficFindings}
                        markers={data.markers.traffic}
                        range={{ start: meta.window.start, end: meta.window.end }}
                        partial
                        footer="Today is partial."
                        {...common}
                    />
                </div>
                <div className={cn('min-w-0', side !== 'search' && 'max-md:hidden')}>
                    <Panel
                        label="Search"
                        source={`Google Search Console · ${meta.gsc.startsWith('sc-domain:') ? 'Domain property' : 'URL-prefix property'}${lastDate ? ` · data through ${fmtDateRange(lastDate, lastDate)}` : ''}`}
                        href={meta.links.search}
                        tiles={SEARCH_TILES}
                        totals={search.totals as unknown as Record<string, number>}
                        previous={search.previous as unknown as Record<string, number> | null}
                        series={search.series as unknown as Row[]}
                        findings={data.searchFindings}
                        markers={data.markers.search}
                        range={{ start: meta.window.searchStart, end: lastDate ?? meta.window.searchEnd }}
                        footer="Search Console data is about 2 days behind."
                        {...common}
                    />
                </div>
            </div>
        </LiveFrame>
    );
}
