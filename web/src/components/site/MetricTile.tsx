'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { fmtValuePair, type MetricFormat } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { Sparkline } from '@/components/charts/Sparkline';
import { MetricDelta } from '@/components/ui/MetricDelta';
import { Skeleton } from '@/components/ui/Skeleton';

export interface TileSpec {
    /** Colour family, sparkline colour and (unless overridden) label/format/polarity. */
    metric: MetricKey;
    label?: string;
    format?: MetricFormat;
    better?: 'up' | 'down';
    /** Money tiles: the property's currency (ISO 4217) and whether to show cents (per-session values). */
    currency?: string;
    cents?: boolean;
}

export interface MetricTileProps extends TileSpec {
    value: number | null | undefined;
    previous?: number | null;
    spark?: (number | null)[];
    sparkDates?: string[];
    loading?: boolean;
    /** Makes the tile a toggle that selects the chart metric. */
    selected?: boolean;
    onSelect?: () => void;
    comparisonLabel?: string;
    footer?: ReactNode;
    className?: string;
}

/**
 * KPI tile with delta and a 40px sparkline (DESIGN 3.5). With onSelect it is a
 * toggle button for the chart below it; the selected tile gets a 2px bar in
 * its metric colour.
 */
export function MetricTile({
    metric, label, format, better, currency, cents, value, previous, spark, sparkDates, loading, selected, onSelect, comparisonLabel, footer, className,
}: MetricTileProps) {
    const m = METRICS[metric];
    const fmt = format ?? m.format;
    const name = label ?? m.label;
    const body = (
        <>
            <span className="flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">{name}</span>
            </span>
            {loading ? (
                <>
                    <Skeleton className="mt-2 h-7 w-20" />
                    <Skeleton className="mt-2 h-8 w-full" />
                </>
            ) : (
                <>
                    <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-stat text-fg">{fmtValuePair(fmt, value, typeof previous === 'number' ? previous : null, { compact: true, tile: true, currency, cents }).value}</span>
                        {previous !== undefined ? (
                            <MetricDelta
                                current={value}
                                previous={previous}
                                format={fmt}
                                better={better ?? m.better}
                                comparisonLabel={comparisonLabel ? `versus ${comparisonLabel}` : undefined}
                            />
                        ) : null}
                    </span>
                    {spark && spark.length > 1 ? (
                        <span className="mt-2 block">
                            <Sparkline series={[{ metric, values: spark, label: name }]} dates={sparkDates} height={36} interactive={false} />
                        </span>
                    ) : null}
                    {footer}
                </>
            )}
        </>
    );
    const base = 'relative flex min-w-0 flex-col rounded-card border border-border-subtle p-3.5 text-left';
    if (!onSelect) return <div className={cn(base, 'bg-surface', className)}>{body}</div>;
    return (
        <button
            type="button"
            aria-pressed={Boolean(selected)}
            onClick={onSelect}
            className={cn(
                base,
                'overflow-hidden transition-colors duration-120 ease-standard focus-visible:-outline-offset-2',
                selected ? 'bg-surface shadow-card' : 'bg-surface-sunken hover:bg-surface',
                className,
            )}
        >
            {selected ? <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: m.color }} /> : null}
            {body}
        </button>
    );
}
