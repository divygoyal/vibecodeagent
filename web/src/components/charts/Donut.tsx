'use client';

import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, Tooltip as RTooltip, type TooltipContentProps } from 'recharts';

import { cn } from '@/lib/cn';
import { fmtCompact, fmtFull, fmtValue, type MetricFormat } from '@/lib/format';
import { categoricalColor, CATEGORICAL_OTHER } from '@/lib/metrics';
import { ChartTooltipCard } from './ChartTooltip';
import { fmtShare } from './style';

export interface DonutItem {
    key: string;
    label: string;
    value: number;
    /** Fixed colour (channelColor / deviceColor). Default: categorical slot by rank. */
    color?: string;
    /** An "(other)" row from the query: never ranked among the slices, always the last one (merged with the folded rest). */
    other?: boolean;
}

export interface DonutProps {
    items: DonutItem[];
    /** Under the total in the centre: "Sessions". */
    centerLabel?: string;
    /**
     * The number in the centre when it is not the sum of the slices: users per device add up to more
     * than the site's users (one person, two devices), so the centre shows the real total (round 4 polish).
     */
    centerValue?: number | null;
    format?: MetricFormat;
    /** Diameter in px (default 160). */
    size?: number;
    /** Max slices including "Other" (default 6). */
    maxSlices?: number;
    /** Legend right (default) or below. Below is forced under 640px. */
    legend?: 'right' | 'bottom';
    /**
     * A click on a slice or a legend row (drill down, round 8). The legend rows become buttons, so the keyboard
     * reaches them; "Other" is never clickable.
     */
    onItemClick?: (item: DonutItem) => void;
    className?: string;
}

/**
 * Parts of a whole, 6 slices max (top 5 + Other), inner radius 64%, 2px
 * surface gaps, total in the centre, legend with value and % (DESIGN 3.7).
 */
export function Donut({ items, centerLabel, centerValue, format = 'count', size = 160, maxSlices = 6, legend = 'right', onItemClick, className }: DonutProps) {
    const [active, setActive] = useState<string | null>(null);
    const slices = useMemo(() => {
        // "Other" is last whatever its size (round 9 review): a query's own "(other)" row joins the folded rest.
        const live = items.filter((i) => i.value > 0);
        const sorted = live.filter((i) => !i.other).sort((a, b) => b.value - a.value);
        const queryOther = live.filter((i) => i.other).reduce((a, b) => a + b.value, 0);
        const withOther = (head: DonutItem[], rest: number) => [
            ...head.map((s, i) => ({ ...s, color: s.color ?? categoricalColor(i) })),
            ...(rest > 0 ? [{ key: '__other', label: 'Other', value: rest, color: CATEGORICAL_OTHER }] : []),
        ];
        if (sorted.length + (queryOther > 0 ? 1 : 0) <= maxSlices) return withOther(sorted, queryOther);
        return withOther(sorted.slice(0, maxSlices - 1), sorted.slice(maxSlices - 1).reduce((a, b) => a + b.value, queryOther));
    }, [items, maxSlices]);
    const total = slices.reduce((a, b) => a + b.value, 0);

    const renderTooltip = (p: TooltipContentProps<number, string>) => {
        if (!p.active || !p.payload?.length) return null;
        const s = p.payload[0]?.payload as (typeof slices)[number] | undefined;
        if (!s) return null;
        return (
            <ChartTooltipCard
                rows={[{ key: s.key, label: s.label, color: s.color, value: `${fmtValue(format, s.value)} · ${total > 0 ? fmtShare(s.value / total) : '–'}` }]}
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
                        onClick={onItemClick ? (_, i) => { const s = slices[i]; if (s && s.key !== '__other') onItemClick(s); } : undefined}
                        style={onItemClick ? { cursor: 'pointer' } : undefined}
                    >
                        {(slices.length ? slices : [{ key: 'empty', color: 'var(--color-subtle)' }]).map((s) => (
                            <Cell key={s.key} fill={s.color} fillOpacity={active && active !== s.key ? 0.55 : 1} />
                        ))}
                    </Pie>
                    {slices.length ? <RTooltip content={renderTooltip} isAnimationActive={false} /> : null}
                </PieChart>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span title={centerValue == null ? `${fmtFull(total)}${centerLabel ? ` ${centerLabel.toLowerCase()}` : ''}: the sum of the slices` : undefined} className={cn('pointer-events-auto', size < 120 ? 'text-body-sm font-semibold tabular-nums text-fg' : 'text-stat-sm text-fg')}>{format === 'count' ? fmtCompact(centerValue ?? total) : fmtValue(format, centerValue ?? total)}</span>
                    {centerLabel && size >= 120 ? <span className="text-meta text-fg-muted">{centerLabel}</span> : null}
                </div>
            </div>
            <ul className="flex w-full min-w-0 flex-col gap-1">
                {slices.map((s) => {
                    const row = (
                        <>
                            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                            <span className="min-w-0 flex-1 truncate text-fg-secondary">{s.label}</span>
                            <span className="text-fg tabular-nums">{format === 'count' ? fmtFull(s.value) : fmtValue(format, s.value)}</span>
                            <span className="w-10 text-right text-meta text-fg-muted tabular-nums">{total > 0 ? fmtShare(s.value / total) : '–'}</span>
                        </>
                    );
                    const cls = cn('flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-body-sm transition-colors duration-120', active === s.key && 'bg-subtle');
                    const hover = { onMouseEnter: () => setActive(s.key), onMouseLeave: () => setActive(null) };
                    return (
                        <li key={s.key} {...hover}>
                            {onItemClick && s.key !== '__other'
                                ? <button type="button" onClick={() => onItemClick(s)} onFocus={() => setActive(s.key)} onBlur={() => setActive(null)} className={cn(cls, 'cursor-pointer')}>{row}</button>
                                : <div className={cls}>{row}</div>}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
