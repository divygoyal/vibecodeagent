'use client';

import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, Tooltip as RTooltip, type TooltipContentProps } from 'recharts';

import { cn } from '@/lib/cn';
import { fmtCompact, fmtFull, fmtPercent, fmtValue, type MetricFormat } from '@/lib/format';
import { categoricalColor, CATEGORICAL_OTHER } from '@/lib/metrics';
import { ChartTooltipCard } from './ChartTooltip';

export interface DonutItem {
    key: string;
    label: string;
    value: number;
    /** Fixed colour (channelColor / deviceColor). Default: categorical slot by rank. */
    color?: string;
}

export interface DonutProps {
    items: DonutItem[];
    /** Under the total in the centre: "Sessions". */
    centerLabel?: string;
    format?: MetricFormat;
    /** Diameter in px (default 160). */
    size?: number;
    /** Max slices including "Other" (default 6). */
    maxSlices?: number;
    /** Legend right (default) or below. Below is forced under 640px. */
    legend?: 'right' | 'bottom';
    className?: string;
}

/**
 * Parts of a whole, 6 slices max (top 5 + Other), inner radius 64%, 2px
 * surface gaps, total in the centre, legend with value and % (DESIGN 3.7).
 */
export function Donut({ items, centerLabel, format = 'count', size = 160, maxSlices = 6, legend = 'right', className }: DonutProps) {
    const [active, setActive] = useState<string | null>(null);
    const slices = useMemo(() => {
        const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
        if (sorted.length <= maxSlices) return sorted.map((s, i) => ({ ...s, color: s.color ?? categoricalColor(i) }));
        const head = sorted.slice(0, maxSlices - 1).map((s, i) => ({ ...s, color: s.color ?? categoricalColor(i) }));
        const rest = sorted.slice(maxSlices - 1).reduce((a, b) => a + b.value, 0);
        return [...head, { key: '__other', label: 'Other', value: rest, color: CATEGORICAL_OTHER }];
    }, [items, maxSlices]);
    const total = slices.reduce((a, b) => a + b.value, 0);

    const renderTooltip = (p: TooltipContentProps<number, string>) => {
        if (!p.active || !p.payload?.length) return null;
        const s = p.payload[0]?.payload as (typeof slices)[number] | undefined;
        if (!s) return null;
        return (
            <ChartTooltipCard
                rows={[{ key: s.key, label: s.label, color: s.color, value: `${fmtValue(format, s.value)} · ${total > 0 ? fmtPercent(s.value / total) : '–'}` }]}
            />
        );
    };

    return (
        <div className={cn('flex flex-col items-center gap-5', legend === 'right' && 'sm:flex-row sm:items-center', className)}>
            <div className="relative shrink-0" style={{ width: size, height: size }}>
                <PieChart width={size} height={size} accessibilityLayer>
                    <Pie
                        data={slices.length ? slices : [{ key: 'empty', label: 'No data', value: 1, color: 'var(--color-subtle)' }]}
                        dataKey="value"
                        nameKey="label"
                        innerRadius="64%"
                        outerRadius="100%"
                        startAngle={90}
                        endAngle={-270}
                        stroke="var(--color-surface)"
                        strokeWidth={2}
                        isAnimationActive={false}
                        onMouseEnter={(_, i) => setActive(slices[i]?.key ?? null)}
                        onMouseLeave={() => setActive(null)}
                    >
                        {(slices.length ? slices : [{ key: 'empty', color: 'var(--color-subtle)' }]).map((s) => (
                            <Cell key={s.key} fill={s.color} fillOpacity={active && active !== s.key ? 0.55 : 1} />
                        ))}
                    </Pie>
                    {slices.length ? <RTooltip content={renderTooltip} isAnimationActive={false} /> : null}
                </PieChart>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-stat-sm text-fg">{format === 'count' ? fmtCompact(total) : fmtValue(format, total)}</span>
                    {centerLabel ? <span className="text-meta text-fg-muted">{centerLabel}</span> : null}
                </div>
            </div>
            <ul className="flex w-full min-w-0 flex-col gap-1">
                {slices.map((s) => (
                    <li
                        key={s.key}
                        onMouseEnter={() => setActive(s.key)}
                        onMouseLeave={() => setActive(null)}
                        className={cn('flex h-7 items-center gap-2 rounded-md px-1.5 text-body-sm transition-colors duration-120', active === s.key && 'bg-subtle')}
                    >
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="min-w-0 flex-1 truncate text-fg-secondary">{s.label}</span>
                        <span className="text-fg tabular-nums">{format === 'count' ? fmtFull(s.value) : fmtValue(format, s.value)}</span>
                        <span className="w-10 text-right text-meta text-fg-muted tabular-nums">{total > 0 ? fmtPercent(s.value / total, { tile: true }) : '–'}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
