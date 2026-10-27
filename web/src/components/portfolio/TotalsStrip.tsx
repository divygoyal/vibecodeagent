'use client';

import { useMemo } from 'react';

import { Info } from 'lucide-react';

import { KpiStrip, Tooltip, type KpiItem } from '@/components/ui';
import { TimeSeriesChart } from '@/components/charts';
import { cn } from '@/lib/cn';
import { fmtDateRange } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { addDays } from '@/lib/portfolio/ranges';
import type { PortfolioResponse } from '@/lib/portfolio/types';

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
}

/**
 * Grand totals across every visible site (one KPI tile per metric, with the
 * delta vs the previous period) controlling one combined chart below.
 */
export function TotalsStrip({ data, metric, onMetricChange, comparisonLabel, dimmed, compact }: TotalsStripProps) {
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
            return {
                metric: m, value: t?.cur.users, previous: t?.prev?.users ?? null,
                label: 'Users',
                hint: total > 1 ? 'Summed across sites: a visitor of two sites counts twice' : undefined,
                loading: Boolean(data.usersPending && t && !t.cur.usersExact),
            };
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
            onSelect={(m: MetricKey) => onMetricChange(m as TotalsMetric)}
            comparisonLabel={comparisonLabel}
            ariaLabel="Totals across all sites"
            className={cn('transition-opacity duration-180', dimmed && 'opacity-60')}
        >
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex flex-wrap items-center gap-x-1 text-body-sm text-fg-secondary">
                    <span className="font-medium text-fg">{METRICS[metric].label}</span> {metric === 'position' ? 'across all sites, weighted by impressions' : `${unit}, all ${total} sites`}
                    {window ? <span className="text-fg-muted"> · {fmtDateRange(window.curStart, window.curEnd)}</span> : null}
                    {metric === 'users' && total > 1 ? (
                        <Tooltip content="Users are exact per site and added up across sites, so a visitor of two sites counts twice.">
                            <button type="button" aria-label="About the users total" className="ml-0.5 inline-flex rounded text-fg-faint hover:text-fg-muted">
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
        </KpiStrip>
    );
}
