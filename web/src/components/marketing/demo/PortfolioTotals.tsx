'use client';

import { useMemo, useState } from 'react';

import { KpiStrip } from '@/components/ui';
import { TimeSeriesChart } from '@/components/charts';
import { fmtDateRange } from '@/lib/format';
import { fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';
import { DEMO_RANGES, type DemoPortfolio } from './types';

type TotalsMetric = 'clicks' | 'impressions' | 'position' | 'users' | 'sessions';

/**
 * Totals strip for the portfolio (PRODUCT 1): clicks, impressions, average
 * position, users and sessions with deltas; the selected tile drives one
 * combined chart with the previous period dashed.
 */
export function PortfolioTotals({ portfolio, chartHeight = 240 }: { portfolio: DemoPortfolio; chartHeight?: number }) {
    const [selected, setSelected] = useState<TotalsMetric>('clicks');
    const { totals, combined, combinedPrev, dates, windows } = portfolio;
    const long = DEMO_RANGES.find((r) => r.value === portfolio.range)?.long ?? 'previous period';

    const items = [
        { metric: 'clicks' as const, value: totals.search?.cur.clicks, previous: totals.search?.prev?.clicks },
        { metric: 'impressions' as const, value: totals.search?.cur.impressions, previous: totals.search?.prev?.impressions },
        { metric: 'position' as const, value: totals.search?.cur.position, previous: totals.search?.prev?.position },
        { metric: 'users' as const, value: totals.traffic?.cur.users, previous: totals.traffic?.prev?.users },
        { metric: 'sessions' as const, value: totals.traffic?.cur.sessions, previous: totals.traffic?.prev?.sessions },
    ];

    const isSearch = METRICS[selected].group === 'search';
    const rowDates = isSearch ? dates.search : dates.traffic;
    const win = isSearch ? windows.search : windows.traffic;
    const data = useMemo(() => {
        const cur = combined[selected];
        const prev = combinedPrev[selected] ?? [];
        return rowDates.map((date, i) => ({ date, value: cur[i] ?? null, prev: prev[i] ?? null }));
    }, [combined, combinedPrev, selected, rowDates]);

    const total = items.find((i) => i.metric === selected)?.value;

    return (
        <KpiStrip
            items={items}
            selected={selected}
            onSelect={(m: MetricKey) => setSelected(m as TotalsMetric)}
            comparisonLabel={long}
            ariaLabel="Portfolio totals"
        >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-meta text-fg-muted">
                <span>{METRICS[selected].label}, all sites{win ? ` · ${fmtDateRange(win.curStart, win.curEnd)}` : ''}{portfolio.bucketDays > 1 ? ' · weekly' : ''}</span>
                <span className="inline-flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: METRICS[selected].color }} />This period</span>
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0 w-3 border-t border-dashed" style={{ borderColor: METRICS[selected].color }} />{long.replace(/^previous/, 'Previous')}</span>
                </span>
            </div>
            <TimeSeriesChart
                data={data}
                series={[{ metric: selected, key: 'value', compareKey: 'prev' }]}
                height={chartHeight}
                ariaLabel={`${METRICS[selected].label} across all sites${win ? `, ${fmtDateRange(win.curStart, win.curEnd)}` : ''}, ${selected === 'position' ? `average position ${fmtMetric(selected, total ?? null)}` : `${fmtMetric(selected, total ?? null)} in total`}`}
            />
        </KpiStrip>
    );
}
