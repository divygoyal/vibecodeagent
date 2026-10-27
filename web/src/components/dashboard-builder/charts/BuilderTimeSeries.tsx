'use client';

/**
 * Time series for builder widgets: any catalogue metric (percent, duration, currency ...),
 * multi-metric overlay with a dashed comparison line, split panels for metrics of different
 * colour groups, stacked breakdowns, bars. Follows DESIGN.md section 6 exactly like
 * components/charts/TimeSeriesChart (same grid, axes, tooltip card and partial tail); it exists
 * because that chart formats by the nine design-system metrics only.
 */
import { useId, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
    Area,
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
    type TooltipContentProps,
} from 'recharts';

import { cn } from '@/lib/cn';
import { fmtAxis, fmtDayLong, fmtDuration, fmtMonthYear, fmtPercent, makeDateTickFormatter } from '@/lib/format';
import { CATEGORICAL, CATEGORICAL_OTHER, channelColor, deviceColor } from '@/lib/metrics';
import { ChartTooltipCard, type ChartTooltipRow } from '@/components/charts';
import { MetricDelta } from '@/components/ui';
import { fmtMetricValue, getMetric, metricColor, metricLabel } from '@/lib/builder/catalog';
import { countryName } from '@/lib/builder/countries';
import type { CellValue } from '@/lib/builder/types';
import { dsFormat, metricBetter } from '../widgets/metricUi';

export interface TsSeries {
    metric: string;
    kind: 'line' | 'area' | 'bar';
    label?: string;
    axis?: 'left' | 'right';
}

export interface BuilderTimeSeriesProps {
    rows: Array<Record<string, CellValue>>;
    series: TsSeries[];
    /** Breakdown frame: series keys 'b:<value>' (one metric). */
    breakdown?: { metric: string; dimension: string; keys: string[]; stacked: boolean; labels?: Record<string, string> };
    compare: boolean;
    granularity: 'day' | 'week' | 'month';
    /** Rows from this index are partial (Search Console lag): dotted. */
    partialFrom?: number;
    height: number;
    currency?: string;
    showLegend?: boolean;
    className?: string;
}

function axisFmt(metricId: string, currency?: string): (v: number) => string {
    const f = getMetric(metricId)?.format;
    if (f === 'percent') return (v) => fmtPercent(v);
    if (f === 'position') return (v) => String(Math.round(v));
    if (f === 'duration') return (v) => fmtDuration(v);
    if (f === 'currency') return (v) => fmtMetricValue(metricId, v, { compact: true, currency });
    return (v) => fmtAxis(v);
}

export function breakdownColor(dimension: string, key: string, index: number): string {
    const value = key.replace(/^b:/, '');
    if (value === '__other') return CATEGORICAL_OTHER;
    if (dimension === 'channel') {
        const c = channelColor(value);
        return c === CATEGORICAL_OTHER ? CATEGORICAL[index] ?? CATEGORICAL_OTHER : c;
    }
    if (dimension === 'device') return deviceColor(value);
    return CATEGORICAL[index] ?? CATEGORICAL_OTHER;
}

export function breakdownLabel(dimension: string, key: string, labels?: Record<string, string>): string {
    const v = key.replace(/^b:/, '');
    if (v === '__other') return 'Other';
    if (labels?.[v]) return labels[v];
    if (dimension === 'country') return countryName(v);
    return v || '(not set)';
}

function dateTicks(rows: Array<Record<string, CellValue>>, g: 'day' | 'week' | 'month') {
    const dates = rows.map((r) => String(r['d:date'] ?? ''));
    if (g === 'month') return (v: string) => fmtMonthYear(v);
    const f = makeDateTickFormatter(dates);
    return (v: string, i: number) => f(v, i);
}

export function BuilderTimeSeries(props: BuilderTimeSeriesProps) {
    const { series, breakdown, height } = props;
    // Different colour groups never share a plot (DESIGN 2.3): split panels.
    const groups = new Set(series.map((s) => getMetric(s.metric)?.colorKey && (['clicks', 'impressions', 'ctr', 'position'].includes(getMetric(s.metric)!.colorKey) ? 'search' : 'traffic')));
    if (!breakdown && series.length > 1 && groups.size > 1) {
        const each = Math.max(110, Math.floor((height - (series.length - 1) * 12) / series.length) - 20);
        return (
            <div className={cn('flex h-full flex-col gap-3', props.className)}>
                {series.map((s) => (
                    <div key={s.metric} className="min-h-0">
                        <p className="mb-1 flex items-center gap-2 text-body-sm text-fg-secondary">
                            <span aria-hidden className="size-2 rounded-full" style={{ background: metricColor(s.metric) }} />
                            {s.label ?? metricLabel(s.metric)}
                        </p>
                        <Plot {...props} series={[s]} height={each} />
                    </div>
                ))}
            </div>
        );
    }
    return <Plot {...props} />;
}

function Plot({ rows, series, breakdown, compare, granularity, partialFrom, height, currency, showLegend, className }: BuilderTimeSeriesProps) {
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const reduce = useReducedMotion();
    const showY = height > 200;
    const tick = useMemo(() => dateTicks(rows, granularity), [rows, granularity]);
    const hasPartial = typeof partialFrom === 'number' && partialFrom > 0 && partialFrom < rows.length;
    const first = series[0];

    const data = useMemo(() => {
        if (!hasPartial || breakdown) return rows;
        return rows.map((row, i) => {
            const out: Record<string, CellValue> = { ...row };
            for (const s of series) {
                const k = `m:${s.metric}`;
                out[`${k}__solid`] = i <= (partialFrom as number) - 1 ? row[k] : null;
                out[`${k}__partial`] = i >= (partialFrom as number) - 1 ? row[k] : null;
            }
            return out;
        });
    }, [rows, series, hasPartial, partialFrom, breakdown]);

    const fmtDate = (d: string) => (granularity === 'month' ? fmtMonthYear(d) : granularity === 'week' ? `Week of ${fmtDayLong(d)}` : fmtDayLong(d));

    const renderTooltip = (p: TooltipContentProps<number, string>) => {
        if (!p.active || !p.payload?.length) return null;
        const row = p.payload[0]?.payload as Record<string, CellValue> | undefined;
        if (!row) return null;
        const idx = rows.findIndex((r) => r['d:date'] === row['d:date']);
        const out: ChartTooltipRow[] = [];
        if (breakdown) {
            breakdown.keys.forEach((k, i) => {
                const v = row[k];
                out.push({ key: k, label: breakdownLabel(breakdown.dimension, k, breakdown.labels), color: breakdownColor(breakdown.dimension, k, i), value: fmtMetricValue(breakdown.metric, typeof v === 'number' ? v : null, { currency }) });
            });
        } else {
            for (const s of series) {
                const v = row[`m:${s.metric}`];
                const pv = compare ? row[`m:${s.metric}:prev`] : undefined;
                out.push({
                    key: s.metric,
                    label: s.label ?? metricLabel(s.metric),
                    color: metricColor(s.metric),
                    value: fmtMetricValue(s.metric, typeof v === 'number' ? v : null, { currency }),
                    delta: pv !== undefined ? <MetricDelta current={typeof v === 'number' ? v : null} previous={typeof pv === 'number' ? pv : null} format={dsFormat(s.metric)} better={metricBetter(s.metric)} /> : undefined,
                });
                if (pv !== undefined) out.push({ key: `${s.metric}-prev`, label: 'Previous period', color: metricColor(s.metric), dashed: true, value: fmtMetricValue(s.metric, typeof pv === 'number' ? pv : null, { currency }) });
            }
        }
        const pd = row['d:date:prev'];
        return <ChartTooltipCard title={row['d:date'] ? fmtDate(String(row['d:date'])) : undefined} subtitle={compare && pd ? `vs ${fmtDate(String(pd))}` : undefined} rows={out} partial={hasPartial && idx >= (partialFrom as number)} />;
    };

    const allZero = !breakdown && first ? rows.every((r) => !r[`m:${first.metric}`]) : false;
    const anim = !reduce;

    return (
        <figure className={cn('relative m-0', className)} style={{ height }} aria-label={breakdown ? `${metricLabel(breakdown.metric)} by ${breakdown.dimension}` : series.map((s) => s.label ?? metricLabel(s.metric)).join(', ')}>
            {showLegend && (breakdown || series.length > 1) ? (
                <div className="mb-1 flex h-5 flex-wrap gap-x-3 gap-y-1 overflow-hidden text-meta text-fg-secondary">
                    {breakdown
                        ? breakdown.keys.map((k, i) => (
                            <span key={k} className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded" style={{ background: breakdownColor(breakdown.dimension, k, i) }} />{breakdownLabel(breakdown.dimension, k, breakdown.labels)}</span>
                        ))
                        : series.map((s) => (
                            <span key={s.metric} className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded" style={{ background: metricColor(s.metric) }} />{s.label ?? metricLabel(s.metric)}</span>
                        ))}
                </div>
            ) : null}
            <ComposedChart responsive data={data} style={{ width: '100%', height: showLegend && (breakdown || series.length > 1) ? height - 22 : height }} margin={{ top: 8, right: series.some((s) => s.axis === 'right') && showY ? 0 : 8, bottom: 0, left: showY ? 0 : 8 }} accessibilityLayer>
                <defs>
                    {first && !breakdown ? (
                        <linearGradient id={`bts-${uid}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={metricColor(first.metric)} style={{ stopOpacity: 'var(--tc-chart-fill-top)' }} />
                            <stop offset="100%" stopColor={metricColor(first.metric)} stopOpacity={0} />
                        </linearGradient>
                    ) : null}
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                <XAxis dataKey="d:date" tickFormatter={(v, i) => tick(String(v), i)} tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--color-chart-axis)' }} tickMargin={8} minTickGap={32} interval="preserveStartEnd" />
                {breakdown ? (
                    <YAxis yAxisId="b" hide={!showY} width={showY ? 44 : 0} domain={[0, 'auto']} allowDecimals={false} tickFormatter={axisFmt(breakdown.metric, currency)} tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }} tickLine={false} axisLine={false} tickCount={5} />
                ) : series.map((s, i) => {
                    const isPos = getMetric(s.metric)?.format === 'position';
                    const visible = showY && (i === 0 || s.axis === 'right');
                    return (
                        <YAxis
                            key={s.metric} yAxisId={s.metric} hide={!visible} width={visible ? 44 : 0} orientation={s.axis === 'right' ? 'right' : 'left'}
                            reversed={isPos} domain={isPos ? [1, (max: number) => Math.ceil(max) + 1] : [0, 'auto']}
                            allowDecimals={getMetric(s.metric)?.format !== 'integer'} tickFormatter={axisFmt(s.metric, currency)}
                            tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }} tickLine={false} axisLine={false} tickCount={5}
                        />
                    );
                })}
                <RTooltip content={renderTooltip} cursor={{ stroke: 'var(--color-chart-cursor)', strokeWidth: 1 }} isAnimationActive={false} offset={12} />

                {breakdown
                    ? breakdown.keys.map((k, i) => {
                        const color = breakdownColor(breakdown.dimension, k, i);
                        return breakdown.stacked ? (
                            <Area key={k} className={`tc-series-${i}`} yAxisId="b" dataKey={k} stackId="b" type="monotone" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.18} isAnimationActive={anim} animationDuration={400} name={breakdownLabel(breakdown.dimension, k, breakdown.labels)} activeDot={false} />
                        ) : (
                            <Line key={k} className={`tc-series-${i}`} yAxisId="b" dataKey={k} type="monotone" stroke={color} strokeWidth={2} dot={false} isAnimationActive={anim} animationDuration={400} name={breakdownLabel(breakdown.dimension, k, breakdown.labels)} />
                        );
                    })
                    : null}

                {!breakdown && compare ? series.slice(0, 2).map((s) => (
                    <Line key={`${s.metric}-prev`} yAxisId={s.metric} dataKey={`m:${s.metric}:prev`} type="monotone" stroke={metricColor(s.metric)} strokeWidth={1.5} strokeDasharray="4 4" strokeOpacity={0.5} dot={false} activeDot={false} connectNulls={false} isAnimationActive={anim} animationDuration={400} name="Previous period" />
                )) : null}

                {!breakdown && first && first.kind !== 'bar' && (first.kind === 'area' || series.length === 1) ? (
                    <Area yAxisId={first.metric} dataKey={`m:${first.metric}`} type="monotone" stroke="none" fill={`url(#bts-${uid})`} connectNulls={false} isAnimationActive={anim} animationDuration={400} activeDot={false} tooltipType="none" />
                ) : null}

                {!breakdown ? series.map((s, si) => {
                    const color = metricColor(s.metric);
                    const k = `m:${s.metric}`;
                    if (s.kind === 'bar') {
                        return <Bar key={k} yAxisId={s.metric} dataKey={k} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={anim} animationDuration={400} name={s.label ?? metricLabel(s.metric)} />;
                    }
                    const common = { yAxisId: s.metric, type: 'monotone' as const, stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, connectNulls: false, isAnimationActive: anim, animationDuration: 400 };
                    const isGsc = s.metric.startsWith('gsc:');
                    if (!hasPartial || !isGsc) {
                        return <Line key={k} className={`tc-series-${si}`} {...common} dataKey={k} dot={rows.length === 1 ? { r: 3, fill: color, strokeWidth: 0 } : false} activeDot={{ r: 4, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }} name={s.label ?? metricLabel(s.metric)} />;
                    }
                    return [
                        <Line key={`${k}-solid`} className={`tc-series-${si}`} {...common} dataKey={`${k}__solid`} dot={false} activeDot={{ r: 4, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }} name={s.label ?? metricLabel(s.metric)} />,
                        <Line key={`${k}-partial`} {...common} dataKey={`${k}__partial`} strokeDasharray="2 3" dot={false} activeDot={false} tooltipType="none" />,
                    ];
                }) : null}
            </ComposedChart>
            {allZero && rows.length > 0 && first ? (
                <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-body-sm text-fg-muted">No {metricLabel(first.metric).toLowerCase()} in this period</p>
            ) : null}
        </figure>
    );
}
