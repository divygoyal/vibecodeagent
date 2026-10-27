'use client';

/**
 * Weekday x hour heatmap (peak hours). Rows run Monday to Sunday, columns
 * 0-23 h. Cell tint follows the value (a gentle power scale so quiet hours
 * still show a shape); the busiest run of hours can be outlined. Hover or
 * focus a cell for its exact value. Values come in GA4 order (0 = Sunday).
 */
import { useState } from 'react';

import { cn } from '@/lib/cn';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Display order: Monday first. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function hourText(h: number): string {
    const x = h % 24;
    const n = x % 12 === 0 ? 12 : x % 12;
    return `${n} ${x < 12 ? 'am' : 'pm'}`;
}

export interface WeekHourHeatmapProps {
    /** [day 0 = Sunday][hour 0-23]. */
    grid: number[][];
    /** Metric colour (CSS var). */
    color: string;
    format: (v: number) => string;
    /** "sessions". */
    unit: string;
    /** Busiest window to outline. */
    highlight?: { day: number; hour: number; length: number } | null;
    className?: string;
}

export function WeekHourHeatmap({ grid, color, format, unit, highlight, className }: WeekHourHeatmapProps) {
    const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
    const max = Math.max(0, ...grid.flat());
    const tint = (v: number) => {
        if (!v || max <= 0) return 'var(--color-subtle)';
        const t = (v / max) ** 0.85;
        return `color-mix(in oklab, ${color} ${Math.round(6 + t * 94)}%, var(--color-surface))`;
    };
    const inPeak = (d: number, h: number) => Boolean(highlight && highlight.day === d && h >= highlight.hour && h < highlight.hour + highlight.length);
    const hv = hover ? grid[hover.d]?.[hover.h] ?? 0 : 0;

    return (
        <div className={cn('min-w-0', className)}>
            <div
                role="grid"
                aria-label={`${unit} by weekday and hour`}
                className="grid items-center gap-[3px]"
                style={{ gridTemplateColumns: '2.25rem repeat(24, minmax(0, 1fr))' }}
                onMouseLeave={() => setHover(null)}
            >
                {ORDER.map((d) => (
                    <div key={d} role="row" className="contents">
                        <span role="rowheader" className="pr-1 text-caption text-fg-muted">{DAY_SHORT[d]}</span>
                        {Array.from({ length: 24 }, (_, h) => {
                            const v = grid[d]?.[h] ?? 0;
                            const peak = inPeak(d, h);
                            const isHover = hover?.d === d && hover?.h === h;
                            return (
                                <span
                                    key={h}
                                    role="gridcell"
                                    aria-label={`${DAY_LONG[d]} ${hourText(h)}: ${format(v)} ${unit}`}
                                    tabIndex={d === ORDER[0] && h === 0 ? 0 : -1}
                                    onMouseEnter={() => setHover({ d, h })}
                                    onFocus={() => setHover({ d, h })}
                                    onBlur={() => setHover(null)}
                                    className={cn(
                                        'block h-5 rounded-[3px] outline-offset-1 md:h-6',
                                        peak && 'ring-[1.5px] ring-fg ring-inset',
                                        isHover && 'outline-2 outline-fg-muted',
                                    )}
                                    style={{ background: tint(v) }}
                                />
                            );
                        })}
                    </div>
                ))}
                <span aria-hidden />
                {Array.from({ length: 24 }, (_, h) => (
                    <span key={h} aria-hidden className="overflow-visible text-left text-caption whitespace-nowrap text-fg-muted">
                        {h % 6 === 0 ? hourText(h).replace(' ', ' ') : ''}
                    </span>
                ))}
            </div>
            <p className="mt-2 h-4 text-meta text-fg-muted tabular-nums" aria-live="polite">
                {hover ? (
                    <>
                        <span className="text-fg-secondary">{DAY_LONG[hover.d]}, {hourText(hover.h)}–{hourText(hover.h + 1)}:</span>{' '}
                        <span className="font-medium text-fg">{format(hv)}</span> {unit}
                    </>
                ) : (
                    <>Hover a cell for its {unit}.</>
                )}
            </p>
        </div>
    );
}

export default WeekHourHeatmap;
