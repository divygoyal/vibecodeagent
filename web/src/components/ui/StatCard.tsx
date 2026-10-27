'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Info } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';
import { Sparkline } from '@/components/charts/Sparkline';
import { Card } from './Card';
import { MetricDelta } from './MetricDelta';
import { Skeleton } from './Skeleton';
import { Tooltip } from './Tooltip';

export interface StatCardProps {
    metric: MetricKey;
    value: number | null | undefined;
    previous?: number | null;
    /** Override the metric label ("Visitors" on public pages). */
    label?: string;
    /** "previous 3 months" -> "vs 10.5K previous 3 months". Omit to hide the comparison line. */
    comparisonLabel?: string;
    /** true = metric definition from lib/metrics, string = custom tooltip. */
    info?: boolean | string;
    /** Optional 40px sparkline under the numbers. */
    sparkline?: (number | null)[];
    sparklineDates?: string[];
    size?: 'md' | 'lg';
    loading?: boolean;
    className?: string;
    footer?: ReactNode;
}

/** Standalone KPI tile (DESIGN 3.5). */
export function StatCard({ metric, value, previous, label, comparisonLabel, info, sparkline, sparklineDates, size = 'md', loading, className, footer }: StatCardProps) {
    const m = METRICS[metric];
    const tip = info === true ? m.description : typeof info === 'string' ? info : null;
    return (
        <Card padding="sm" className={cn('flex flex-col gap-1', className)}>
            <div className="flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">{label ?? m.label}</span>
                {tip ? (
                    <Tooltip content={tip}>
                        <button type="button" aria-label={`About ${label ?? m.label}`} className="relative ml-auto rounded text-fg-faint hover:text-fg-muted pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5">
                            <Info aria-hidden size={14} strokeWidth={1.75} />
                        </button>
                    </Tooltip>
                ) : null}
            </div>
            {loading ? (
                <>
                    <Skeleton className={cn('mt-1', size === 'lg' ? 'h-9 w-28' : 'h-7 w-24')} />
                    {comparisonLabel ? <Skeleton className="h-3.5 w-36" /> : null}
                </>
            ) : (
                <>
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                        <span className={cn('text-fg tabular-nums', size === 'lg' ? 'text-stat-lg' : 'text-stat')}>
                            {fmtMetric(metric, value, { compact: true, tile: true })}
                        </span>
                        {previous !== undefined ? (
                            <MetricDelta metric={metric} current={value} previous={previous} size={size === 'lg' ? 'md' : 'sm'} comparisonLabel={comparisonLabel ? `versus ${comparisonLabel}` : undefined} />
                        ) : null}
                    </div>
                    {comparisonLabel && previous !== undefined ? (
                        <p className="text-meta text-fg-muted">
                            {previous === null || (previous === 0 && m.format === 'count')
                                ? `None in the ${comparisonLabel}`
                                : `vs ${fmtMetric(metric, previous, { compact: true, tile: true })} ${comparisonLabel}`}
                        </p>
                    ) : null}
                </>
            )}
            {sparkline ? (
                <div className="mt-2">
                    <Sparkline series={[{ metric, values: sparkline }]} dates={sparklineDates} height={40} interactive={false} />
                </div>
            ) : null}
            {footer}
        </Card>
    );
}

export interface KpiItem {
    metric: MetricKey;
    value: number | null | undefined;
    previous?: number | null;
    label?: string;
    /** Extra note on the tile (hover title + screen readers), e.g. "Summed across sites". */
    hint?: string;
    loading?: boolean;
}

export interface KpiStripProps {
    items: KpiItem[];
    selected: MetricKey;
    onSelect: (metric: MetricKey) => void;
    /** Spoken comparison: "previous 3 months". */
    comparisonLabel?: string;
    /** Content under the tiles inside the same card (the main chart). */
    children?: ReactNode;
    className?: string;
    ariaLabel?: string;
}

/**
 * KPI tiles in one card that control a chart (Plausible style). Tiles are tabs:
 * arrow keys move, the selected tile has a 2px bar in its metric colour.
 */
export function KpiStrip({ items, selected, onSelect, comparisonLabel = 'previous period', children, className, ariaLabel = 'Metrics' }: KpiStripProps) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const onKey = (e: KeyboardEvent, i: number) => {
        let next = -1;
        if (e.key === 'ArrowRight') next = (i + 1) % items.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = items.length - 1;
        if (next < 0) return;
        e.preventDefault();
        onSelect(items[next].metric);
        const el = refs.current[next];
        el?.focus();
        el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    return (
        <Card padding="none" className={cn('overflow-hidden', className)}>
            <div role="tablist" aria-label={ariaLabel} className="flex snap-x overflow-x-auto border-b border-border-subtle [scrollbar-width:none]">
                {items.map((it, i) => {
                    const m = METRICS[it.metric];
                    const active = it.metric === selected;
                    return (
                        <button
                            key={it.metric}
                            ref={(el) => { refs.current[i] = el; }}
                            role="tab"
                            type="button"
                            aria-selected={active}
                            tabIndex={active ? 0 : -1}
                            onClick={() => onSelect(it.metric)}
                            onKeyDown={(e) => onKey(e, i)}
                            title={it.hint}
                            className={cn(
                                'relative min-w-[140px] flex-1 snap-start border-r border-border-subtle px-4 py-3.5 text-left last:border-r-0',
                                'transition-colors duration-120 ease-standard focus-visible:-outline-offset-2',
                                active ? 'bg-surface-sunken' : 'hover:bg-subtle/60',
                            )}
                        >
                            <span className="flex items-center gap-2">
                                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
                                <span className="truncate text-body-sm font-medium text-fg-secondary">{it.label ?? m.label}</span>
                                {it.hint ? <span className="sr-only">({it.hint})</span> : null}
                            </span>
                            {it.loading ? (
                                <span className="mt-1.5 flex items-center gap-2">
                                    <Skeleton className="h-7 w-20" />
                                    <Skeleton className="h-3.5 w-10" />
                                </span>
                            ) : (
                                // Two lines per tile (critique #11): label, then the value with its delta inline.
                                <span className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                                    <span className="text-stat text-fg tabular-nums">{fmtMetric(it.metric, it.value, { compact: true, tile: true })}</span>
                                    <MetricDelta metric={it.metric} current={it.value} previous={it.previous} comparisonLabel={`versus ${comparisonLabel}`} />
                                </span>
                            )}
                            {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: m.color }} /> : null}
                        </button>
                    );
                })}
            </div>
            {children ? <div role="tabpanel" className="p-4">{children}</div> : null}
        </Card>
    );
}
