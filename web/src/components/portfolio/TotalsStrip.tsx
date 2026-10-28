'use client';

import { useMemo } from 'react';

import { ChevronDown, ChevronUp, Info } from 'lucide-react';

import { Button, KpiStrip, Tooltip, type KpiItem } from '@/components/ui';
import { TimeSeriesChart } from '@/components/charts';
import { cn } from '@/lib/cn';
import { fmtDateRange } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { addDays } from '@/lib/portfolio/ranges';
import type { PortfolioResponse } from '@/lib/portfolio/types';
import { usersTotalTile } from '@/lib/portfolio/view';

export type TotalsMetric = 'clicks' | 'impressions' | 'position' | 'users' | 'sessions';

export function totalsMetrics(data: PortfolioResponse): TotalsMetric[] {
    const out: TotalsMetric[] = [];
    if (data.totals.search) out.push('clicks', 'impressions', 'position');
    if (data.totals.traffic) out.push('users', 'sessions');
    return out;
}

export interface TotalsStripProps {
    data: PortfolioResponse;
    metric: TotalsMetric;
    onMetricChange: (m: TotalsMetric) => void;
    comparisonLabel: string;
    /** Refetching: keep the frame at 60% opacity (DESIGN 2.7). */
    dimmed?: boolean;
    compact?: boolean;
    /** The combined chart under the tiles; collapsed by default so the site cards stay above the fold. */
    trendOpen: boolean;
    onTrendOpenChange: (open: boolean) => void;
}

/**
 * Grand totals across every visible site: one slim row of KPI tiles (with the
 * delta vs the previous period) and, behind "Show trend", one combined chart.
 * Picking a tile while the chart is hidden opens it on that metric.
 */
export function TotalsStrip({ data, metric, onMetricChange, comparisonLabel, dimmed, compact, trendOpen, onTrendOpenChange }: TotalsStripProps) {
    const metrics = totalsMetrics(data);
    const total = data.totals.sites.total;
    const s = data.totals.search;
    const t = data.totals.traffic;
    const items: KpiItem[] = metrics.map((m) => {
        if (m === 'clicks') return { metric: m, value: s?.cur.clicks, previous: s?.prev?.clicks ?? null };
        if (m === 'impressions') return { metric: m, value: s?.cur.impressions, previous: s?.prev?.impressions ?? null };
        if (m === 'position') return { metric: m, value: s?.cur.position, previous: s?.prev?.position ?? null };
        if (m === 'users') {
            // Each site's users are exact; across sites they add up (a visitor of two sites counts twice).
            // Until every site has its exact count the tile shows the summed daily users with "≈", never a skeleton.
            const tile = usersTotalTile(t, { usersPending: data.usersPending, siteCount: total });
            return { metric: m, value: t?.cur.users, previous: t?.prev?.users ?? null, label: tile.label, hint: tile.hint, approx: tile.approx };
        }
        return { metric: m, value: t?.cur.sessions, previous: t?.prev?.sessions ?? null };
    });
    const isSearch = metric === 'clicks' || metric === 'impressions' || metric === 'position';
    const dates = isSearch ? data.dates.search : data.dates.traffic;
    const window = isSearch ? data.windows.search : data.windows.traffic;
    const cur = data.combined[metric];
    const prev = data.combinedPrev[metric];
    const shift = window ? Math.round((Date.parse(window.curStart) - Date.parse(window.prevStart)) / 86_400_000) : 0;

    const rows = useMemo(() => dates.map((date, i) => ({
        date,
        value: cur[i] ?? null,
        prev: prev ? prev[i] ?? null : null,
        prevDate: shift ? addDays(date, -shift) : null,
    })), [dates, cur, prev, shift]);

    const { up, down, new: fresh } = data.totals.sites;
    const summary = [`${up} up`, `${down} down`, fresh ? `${fresh} new` : null].filter(Boolean).join(' · ');
    const unit = data.bucketDays === 7 ? 'per week' : 'per day';

    if (metrics.length === 0) return null;
    return (
        <KpiStrip
            items={items}
            selected={metric}
            onSelect={(m: MetricKey) => {
                onMetricChange(m as TotalsMetric);
                if (!trendOpen) onTrendOpenChange(true);
            }}
            comparisonLabel={comparisonLabel}
            ariaLabel="Totals across all sites"
            density="slim"
            className={cn('transition-opacity duration-180', dimmed && 'opacity-60')}
            trailing={(
                <Button
                    variant="ghost"
                    size="sm"
                    trailingIcon={trendOpen ? ChevronUp : ChevronDown}
                    aria-expanded={trendOpen}
                    aria-controls="portfolio-trend"
                    onClick={() => onTrendOpenChange(!trendOpen)}
                >
                    {/* Phones keep the room for the tiles. */}
                    <span className="sm:hidden">Trend</span>
                    <span className="max-sm:hidden">{trendOpen ? 'Hide trend' : 'Show trend'}</span>
                </Button>
            )}
        >
            {trendOpen ? (
                <div id="portfolio-trend">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="flex flex-wrap items-center gap-x-1 text-body-sm text-fg-secondary">
                            <span className="font-medium text-fg">{METRICS[metric].label}</span> {metric === 'position' ? 'across all sites, weighted by impressions' : `${unit}, all ${total} sites`}
                            {window ? <span className="text-fg-muted"> · {fmtDateRange(window.curStart, window.curEnd)}</span> : null}
                            {metric === 'users' && total > 1 ? (
                                <Tooltip content="Users are exact per site and added up across sites, so a visitor of two sites counts twice.">
                                    <button type="button" aria-label="About the users total" className="ml-0.5 inline-flex rounded text-fg-muted hover:text-fg">
                                        <Info aria-hidden size={14} strokeWidth={1.75} />
                                    </button>
                                </Tooltip>
                            ) : null}
                        </p>
                        <p className="text-meta text-fg-muted tabular-nums">Sites: {summary}</p>
                    </div>
                    <TimeSeriesChart
                        data={rows}
                        series={[{ metric, key: 'value', compareKey: prev ? 'prev' : undefined }]}
                        compareDateKey={prev ? 'prevDate' : undefined}
                        height={compact ? 180 : 240}
                        ariaLabel={`${METRICS[metric].label} ${unit} across all sites`}
                    />
                </div>
            ) : null}
        </KpiStrip>
    );
}
