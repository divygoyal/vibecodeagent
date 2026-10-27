'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
    type TooltipContentProps,
} from 'recharts';

import { cn } from '@/lib/cn';
import { fmtAxis, fmtDayLong, fmtDuration, fmtPercent, makeDateTickFormatter } from '@/lib/format';
import { fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { AXIS_LINE, AXIS_TICK, CURSOR, dateTicks, GRID_STROKE, maxOf, niceAxis } from './axis';
import { dateAxisTick } from './AxisTick';
import { ChartTooltipCard, type ChartTooltipRow } from './ChartTooltip';

export type TimeSeriesRow = { [key: string]: number | string | null | undefined };

export interface TimeSeriesSeries {
    metric: MetricKey;
    /** Field in each data row with this series' value. */
    key: string;
    /** Field with the comparison value (previous period), drawn dashed. */
    compareKey?: string;
    /** Legend / tooltip label (defaults to the metric label). */
    label?: string;
}

export interface TimeSeriesAnnotation {
    /** Must match a row's date. */
    date: string;
    label: string;
}

export interface TimeSeriesChartProps {
    /** One row per day; `date` is 'YYYY-MM-DD' (see dateKey). */
    data: TimeSeriesRow[];
    series: TimeSeriesSeries[];
    /**
     * single: first series + its comparison (default).
     * overlay: up to 4 series on separate hidden scales, first axis labelled, no comparison.
     * split: one small chart per series.
     */
    mode?: 'single' | 'overlay' | 'split';
    /** Index where partial data starts (today, GSC lag days): drawn dotted. */
    partialFrom?: number;
    annotations?: TimeSeriesAnnotation[];
    /** 200 compact · 280 default · 340 large. Y axis hides at 200 or less. */
    height?: number;
    dateKey?: string;
    /** Field with the comparison date of each row, for the tooltip "vs …" line. */
    compareDateKey?: string;
    /** Screen-reader summary, e.g. "Clicks per day, Jul 28 – Oct 24, 1,282 in total". */
    ariaLabel?: string;
    className?: string;
}

function axisFormatter(metric: MetricKey): (v: number) => string {
    const f = METRICS[metric].format;
    if (f === 'percent') return (v) => fmtPercent(v, { tile: true });
    if (f === 'position') return (v) => String(Math.round(v));
    if (f === 'duration') return (v) => (v === 0 ? '0' : fmtDuration(v));
    return (v) => fmtAxis(v);
}

/** Width of an element, kept current with a ResizeObserver (date ticks thin to fit). */
function useWidth<T extends HTMLElement>(fallback: number) {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(fallback);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([entry]) => {
            const w = Math.round(entry.contentRect.width);
            if (w > 0) setWidth((prev) => (Math.abs(prev - w) > 4 ? w : prev));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, width] as const;
}

const MAX_ANNOTATIONS = 10;

/**
 * Recharts ComposedChart wrapper that applies DESIGN section 6: horizontal grid
 * only, zero-based counts, reversed position axis, dashed comparison, dotted
 * partial tail, crosshair tooltip with full numbers, keyboard tooltip
 * (Recharts accessibility layer: focus the chart, then arrow keys).
 */
export function TimeSeriesChart({ mode = 'single', series, height = 280, className, ...rest }: TimeSeriesChartProps) {
    if (mode === 'split') {
        const each = Math.max(140, Math.round(height / Math.max(1, series.length)));
        return (
            <div className={cn('flex flex-col gap-4', className)}>
                {series.map((s) => (
                    <div key={s.key}>
                        <p className="mb-1 flex items-center gap-2 text-body-sm text-fg-secondary">
                            <span aria-hidden className="size-2 rounded-full" style={{ background: METRICS[s.metric].color }} />
                            {s.label ?? METRICS[s.metric].label}
                        </p>
                        <ChartInner {...rest} mode="single" series={[s]} height={each} />
                    </div>
                ))}
            </div>
        );
    }
    return <ChartInner {...rest} mode={mode} series={series} height={height} className={className} />;
}

function ChartInner({ data, series: allSeries, mode, partialFrom, annotations, height, dateKey = 'date', compareDateKey, ariaLabel, className }: TimeSeriesChartProps & { height: number }) {
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const reduce = useReducedMotion();
    const [animate, setAnimate] = useState(true);
    useEffect(() => {
        const t = window.setTimeout(() => setAnimate(false), 500);
        return () => window.clearTimeout(t);
    }, []);

    const series = mode === 'overlay' ? allSeries.slice(0, 4) : allSeries.slice(0, 1);
    const withCompare = mode === 'single';
    const hasPartial = typeof partialFrom === 'number' && partialFrom > 0 && partialFrom < data.length;

    // Split each series into a solid head and a dotted partial tail that share the boundary point.
    const rows = useMemo(() => {
        if (!hasPartial) return data;
        return data.map((row, i) => {
            const out: TimeSeriesRow = { ...row };
            for (const s of series) {
                out[`${s.key}__solid`] = i <= (partialFrom as number) - 1 ? row[s.key] : null;
                out[`${s.key}__partial`] = i >= (partialFrom as number) - 1 ? row[s.key] : null;
            }
            return out;
        });
    }, [data, series, hasPartial, partialFrom]);

    const dates = useMemo(() => data.map((r) => String(r[dateKey] ?? '')), [data, dateKey]);
    const [figureRef, figureWidth] = useWidth<HTMLElement>(640);
    const showY = height > 200;
    // Evenly spaced dates anchored on the last day (axis.ts); the formatter's index is the tick's.
    const xTicks = useMemo(() => dateTicks(dates, { width: figureWidth - (showY ? 52 : 16) }), [dates, figureWidth, showY]);
    const tickFmt = useMemo(() => makeDateTickFormatter(dates), [dates]);
    const xTick = useMemo(() => dateAxisTick({ first: dates[0], last: dates[dates.length - 1], ticks: xTicks, format: tickFmt }), [dates, xTicks, tickFmt]);
    // Round Y steps per series (0 / 5K / 10K, never 4.5K / 9K); the comparison line shares its series' axis.
    const yAxes = useMemo(() => {
        const out: Record<string, ReturnType<typeof niceAxis>> = {};
        for (const s of series) {
            const format = METRICS[s.metric].format;
            out[s.key] = niceAxis(maxOf(data, [s.key, withCompare ? s.compareKey : undefined]), { format: format === 'count' ? 'count' : format });
        }
        return out;
    }, [data, series, withCompare]);
    const first = series[0];
    const allZero = first ? data.every((r) => !r[first.key]) : true;
    const anim = animate && !reduce;

    const renderTooltip = (props: TooltipContentProps<number, string>) => {
        if (!props.active || !props.payload?.length) return null;
        const row = props.payload[0]?.payload as TimeSeriesRow | undefined;
        if (!row) return null;
        const idx = data.indexOf(row) >= 0 ? data.indexOf(row) : dates.indexOf(String(row[dateKey]));
        const tRows: ChartTooltipRow[] = [];
        for (const s of series) {
            const m = METRICS[s.metric];
            const v = row[s.key] as number | null | undefined;
            const pv = withCompare && s.compareKey ? (row[s.compareKey] as number | null | undefined) : undefined;
            tRows.push({
                key: s.key,
                label: s.label ?? m.label,
                color: m.color,
                value: fmtMetric(s.metric, v ?? null),
                delta: pv !== undefined ? <MetricDelta metric={s.metric} current={v} previous={pv} /> : undefined,
            });
            if (pv !== undefined) tRows.push({ key: `${s.key}-prev`, label: 'Previous period', color: m.color, dashed: true, value: fmtMetric(s.metric, pv ?? null) });
        }
        const cd = compareDateKey ? row[compareDateKey] : undefined;
        return (
            <ChartTooltipCard
                title={row[dateKey] ? fmtDayLong(String(row[dateKey])) : undefined}
                subtitle={cd ? `vs ${fmtDayLong(String(cd))}` : undefined}
                rows={tRows}
                partial={hasPartial && idx >= (partialFrom as number)}
            />
        );
    };

    return (
        <figure
            ref={figureRef}
            aria-label={ariaLabel}
            // Mobile caps charts at 220px (DESIGN 3.7); the chart follows its box.
            className={cn('relative m-0 h-[var(--ts-h)] max-md:h-[min(var(--ts-h),220px)]', className)}
            style={{ ['--ts-h' as string]: `${height}px` }}
        >
            <ComposedChart
                responsive
                data={rows}
                style={{ width: '100%', height: '100%' }}
                margin={{ top: 8, right: 8, bottom: 0, left: showY ? 0 : 8 }}
                accessibilityLayer
            >
                <defs>
                    {first ? (
                        <linearGradient id={`ts-${uid}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={METRICS[first.metric].color} style={{ stopOpacity: 'var(--tc-chart-fill-top)' }} />
                            <stop offset="100%" stopColor={METRICS[first.metric].color} stopOpacity={0} />
                        </linearGradient>
                    ) : null}
                </defs>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis
                    dataKey={dateKey}
                    ticks={xTicks}
                    interval={0}
                    tick={xTick}
                    tickLine={false}
                    axisLine={AXIS_LINE}
                    tickMargin={8}
                />
                {series.map((s, i) => {
                    const isPos = METRICS[s.metric].format === 'position';
                    const visible = showY && i === 0;
                    return (
                        <YAxis
                            key={s.key}
                            yAxisId={s.key}
                            hide={!visible}
                            width={visible ? 44 : 0}
                            orientation="left"
                            reversed={isPos}
                            domain={yAxes[s.key].domain}
                            ticks={yAxes[s.key].ticks}
                            interval={0}
                            tickFormatter={axisFormatter(s.metric)}
                            tick={AXIS_TICK}
                            tickLine={false}
                            axisLine={false}
                        />
                    );
                })}
                <RTooltip
                    content={renderTooltip}
                    cursor={CURSOR}
                    isAnimationActive={false}
                    offset={12}
                />
                {annotations?.slice(0, MAX_ANNOTATIONS).map((a) => (
                    <ReferenceLine
                        key={`${a.date}-${a.label}`}
                        x={a.date}
                        yAxisId={first?.key}
                        stroke="var(--color-chart-cursor)"
                        strokeDasharray="3 3"
                        label={{ value: '●', position: 'insideTop', fill: 'var(--color-fg-muted)', fontSize: 10 }}
                    />
                ))}
                {withCompare && first?.compareKey ? (
                    <Line
                        yAxisId={first.key}
                        dataKey={first.compareKey}
                        type="monotone"
                        stroke={METRICS[first.metric].color}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        strokeOpacity={0.5}
                        dot={false}
                        activeDot={false}
                        connectNulls={false}
                        isAnimationActive={anim}
                        animationDuration={400}
                        name="Previous period"
                    />
                ) : null}
                {first ? (
                    <Area
                        yAxisId={first.key}
                        dataKey={first.key}
                        type="monotone"
                        stroke="none"
                        fill={`url(#ts-${uid})`}
                        connectNulls={false}
                        isAnimationActive={anim}
                        animationDuration={400}
                        activeDot={false}
                        tooltipType="none"
                    />
                ) : null}
                {series.map((s) => {
                    const color = METRICS[s.metric].color;
                    const common = {
                        yAxisId: s.key,
                        type: 'monotone' as const,
                        stroke: color,
                        strokeWidth: 2,
                        strokeLinecap: 'round' as const,
                        strokeLinejoin: 'round' as const,
                        connectNulls: false,
                        isAnimationActive: anim,
                        animationDuration: 400,
                    };
                    if (!hasPartial) {
                        return (
                            <Line
                                key={s.key}
                                {...common}
                                dataKey={s.key}
                                dot={data.length === 1 ? { r: 3, fill: color, strokeWidth: 0 } : false}
                                activeDot={{ r: 4, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                                name={s.label ?? METRICS[s.metric].label}
                            />
                        );
                    }
                    return [
                        <Line key={`${s.key}-solid`} {...common} dataKey={`${s.key}__solid`} dot={false} activeDot={{ r: 4, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }} name={s.label ?? METRICS[s.metric].label} />,
                        <Line key={`${s.key}-partial`} {...common} dataKey={`${s.key}__partial`} strokeDasharray="2 3" dot={false} activeDot={false} tooltipType="none" />,
                    ];
                })}
            </ComposedChart>
            {allZero && data.length > 0 && first ? (
                <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-body-sm text-fg-muted">
                    No {METRICS[first.metric].label.toLowerCase()} in this period
                </p>
            ) : null}
        </figure>
    );
}
