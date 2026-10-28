'use client';

/**
 * Two different metrics on one time chart, each with its own labelled axis
 * (left and right) and its own colour. Used for "Search Console clicks vs
 * GA4 organic sessions". The key above the chart says which line belongs to
 * which axis; the tooltip shows both exact values.
 */
import { useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip as RTooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';

import { cn } from '@/lib/cn';
import { fmtAxis, fmtDayLong, fmtFull, makeDateTickFormatter } from '@/lib/format';
import { ChartTooltipCard } from './ChartTooltip';
import { niceAxis, type AxisFormat } from './axis';
import { evenDateTicks, niceTicks } from './chartScales';

export interface DualAxisSide {
    key: string;
    label: string;
    color: string;
    /** Tooltip value format (default: full number). */
    format?: (v: number) => string;
    /** Axis scale rules (axis.ts niceAxis): 'position' starts at 1 and runs top-down. Default: zero-based round ticks. */
    axis?: AxisFormat;
    /** Tick label format (default: compact number). */
    tickFormat?: (v: number) => string;
}

export interface DualAxisChartProps {
    data: { date: string; [k: string]: number | string | null }[];
    left: DualAxisSide;
    right: DualAxisSide;
    height?: number;
    /** Vertical markers (dates must match rows). */
    annotations?: { date: string; label: string }[];
    /** Tooltip title per row (default: the long date). */
    titleFor?: (date: string) => string;
    ariaLabel?: string;
    className?: string;
    /** Colour each axis's tick labels like its line (for metrics without a fixed pairing, e.g. Search > Performance). */
    tintAxes?: boolean;
}

function sideAxis(data: DualAxisChartProps['data'], side: DualAxisSide): { domain: [number, number]; ticks: number[] } {
    const values = data.map((d) => Number(d[side.key])).filter((v) => Number.isFinite(v));
    if (side.axis) return niceAxis(values.length ? Math.max(...values) : 0, { format: side.axis });
    const t = niceTicks(Math.max(0, ...values));
    return { domain: [0, t[t.length - 1]], ticks: t };
}

export function DualAxisChart({ data, left, right, height = 260, annotations, titleFor, ariaLabel, className, tintAxes }: DualAxisChartProps) {
    const dates = useMemo(() => data.map((d) => d.date), [data]);
    const tickFmt = useMemo(() => makeDateTickFormatter(dates), [dates]);
    const xTicks = useMemo(() => evenDateTicks(dates), [dates]);
    const la = useMemo(() => sideAxis(data, left), [data, left]);
    const ra = useMemo(() => sideAxis(data, right), [data, right]);
    const tick = (color: string) => ({ fill: tintAxes ? color : 'var(--color-chart-tick)', fontSize: 11 });
    const fl = left.format ?? fmtFull;
    const fr = right.format ?? fmtFull;

    const tooltip = (p: TooltipContentProps<number, string>) => {
        if (!p.active || !p.payload?.length) return null;
        const row = p.payload[0]?.payload as DualAxisChartProps['data'][number] | undefined;
        if (!row) return null;
        const note = annotations?.find((a) => a.date === row.date);
        return (
            <ChartTooltipCard
                title={titleFor ? titleFor(row.date) : fmtDayLong(row.date)}
                subtitle={note ? note.label : undefined}
                rows={[
                    { key: 'l', label: left.label, color: left.color, value: fl(Number(row[left.key]) || 0) },
                    { key: 'r', label: right.label, color: right.color, value: fr(Number(row[right.key]) || 0) },
                ]}
            />
        );
    };

    return (
        <figure aria-label={ariaLabel} className={cn('m-0', className)}>
            <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-fg-secondary">
                <span className="inline-flex items-center gap-1.5">
                    <svg aria-hidden width="14" height="2"><line x1="0" y1="1" x2="14" y2="1" stroke={left.color} strokeWidth="2" /></svg>
                    {left.label} <span className="text-fg-muted">(left axis)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <svg aria-hidden width="14" height="2"><line x1="0" y1="1" x2="14" y2="1" stroke={right.color} strokeWidth="2" /></svg>
                    {right.label} <span className="text-fg-muted">(right axis)</span>
                </span>
            </figcaption>
            <div className="h-[var(--da-h)] max-md:h-[min(var(--da-h),220px)]" style={{ ['--da-h' as string]: `${height}px` }}>
                <ComposedChart responsive data={data} style={{ width: '100%', height: '100%' }} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} accessibilityLayer>
                    <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" yAxisId="l" />
                    <XAxis
                        dataKey="date"
                        ticks={xTicks}
                        interval={0}
                        tickFormatter={(v: string) => tickFmt(v, dates.indexOf(v))}
                        tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-chart-axis)' }}
                        tickMargin={8}
                    />
                    <YAxis yAxisId="l" orientation="left" width={44} domain={la.domain} ticks={la.ticks} interval={left.axis ? 0 : undefined} reversed={left.axis === 'position'}
                        tickFormatter={left.tickFormat ?? ((v: number) => fmtAxis(v))} tick={tick(left.color)} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="r" orientation="right" width={44} domain={ra.domain} ticks={ra.ticks} interval={right.axis ? 0 : undefined} reversed={right.axis === 'position'}
                        tickFormatter={right.tickFormat ?? ((v: number) => fmtAxis(v))} tick={tick(right.color)} tickLine={false} axisLine={false} />
                    <RTooltip content={tooltip} cursor={{ stroke: 'var(--color-chart-cursor)', strokeWidth: 1 }} isAnimationActive={false} offset={12} />
                    {annotations?.map((a) => (
                        <ReferenceLine key={`${a.date}-${a.label}`} x={a.date} yAxisId="l" stroke="var(--color-chart-cursor)" strokeDasharray="3 3" />
                    ))}
                    <Line yAxisId="l" dataKey={left.key} name={left.label} type="monotone" stroke={left.color} strokeWidth={2} dot={false}
                        activeDot={{ r: 4, fill: left.color, stroke: 'var(--color-surface)', strokeWidth: 2 }} isAnimationActive={false} />
                    <Line yAxisId="r" dataKey={right.key} name={right.label} type="monotone" stroke={right.color} strokeWidth={2} dot={false}
                        activeDot={{ r: 4, fill: right.color, stroke: 'var(--color-surface)', strokeWidth: 2 }} isAnimationActive={false} />
                </ComposedChart>
            </div>
        </figure>
    );
}

export default DualAxisChart;
