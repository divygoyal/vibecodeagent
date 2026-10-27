'use client';

/**
 * Tiny bar sparkline for table and list rows (views per bar across the
 * range). Bars share one scale per row; the last bar can be marked partial
 * (today). Decorative: the row's numbers carry the meaning, the aria label
 * sums it up.
 */
import { cn } from '@/lib/cn';

export interface TrendBarsProps {
    values: number[];
    /** Metric colour (CSS var). */
    color: string;
    /** Draw the last bar lighter (incomplete period). */
    partialLast?: boolean;
    height?: number;
    barWidth?: number;
    className?: string;
    ariaLabel?: string;
}

export function TrendBars({ values, color, partialLast, height = 20, barWidth = 4, className, ariaLabel }: TrendBarsProps) {
    const max = Math.max(0, ...values);
    const gap = 2;
    const w = values.length * (barWidth + gap) - gap;
    return (
        <svg
            width={Math.max(0, w)}
            height={height}
            viewBox={`0 0 ${Math.max(1, w)} ${height}`}
            role={ariaLabel ? 'img' : undefined}
            aria-label={ariaLabel}
            aria-hidden={ariaLabel ? undefined : true}
            className={cn('block shrink-0', className)}
        >
            {values.map((v, i) => {
                const h = max > 0 ? Math.max(v > 0 ? 2 : 1, Math.round((v / max) * height)) : 1;
                const last = partialLast && i === values.length - 1;
                return (
                    <rect
                        key={i}
                        x={i * (barWidth + gap)}
                        y={height - h}
                        width={barWidth}
                        height={h}
                        rx={1}
                        fill={v > 0 ? color : 'var(--color-border-strong)'}
                        opacity={v > 0 ? (last ? 0.45 : 0.85) : 0.6}
                    />
                );
            })}
        </svg>
    );
}

export default TrendBars;
