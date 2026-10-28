'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Info } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtMetric, fmtMetricPair, METRICS, type MetricKey } from '@/lib/metrics';
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
    const pair = fmtMetricPair(metric, value, typeof previous === 'number' ? previous : null, { compact: true, tile: true });
    const tip = info === true ? m.description : typeof info === 'string' ? info : null;
    return (
        <Card padding="sm" className={cn('flex flex-col gap-1', className)}>
            <div className="flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">{label ?? m.label}</span>
                {tip ? (
                    <Tooltip content={tip}>
                        <button type="button" aria-label={`About ${label ?? m.label}`} className="relative ml-auto rounded text-fg-muted hover:text-fg pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5">
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
                            {pair.value}
                        </span>
                        {previous !== undefined ? (
                            <MetricDelta metric={metric} current={value} previous={previous} size={size === 'lg' ? 'md' : 'sm'} comparisonLabel={comparisonLabel ? `versus ${comparisonLabel}` : undefined} />
                        ) : null}
                    </div>
                    {comparisonLabel && previous !== undefined ? (
                        <p className="text-meta text-fg-muted">
                            {previous === null || (previous === 0 && m.format === 'count')
                                ? `None in the ${comparisonLabel}`
                                : `vs ${pair.previous} ${comparisonLabel}`}
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
    /** The value is an estimate (shown with a leading "≈"; say why in `hint`). */
    approx?: boolean;
    /** Money metrics (revenue): the property's currency, ISO 4217. */
    currency?: string;
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
    /** 'slim': one ~60px row (small label over a 17px value), for pages where the tiles are a summary. */
    density?: 'default' | 'slim';
    /** Pinned at the right end of the tile row (does not scroll with the tiles), e.g. a "Show trend" toggle. */
    trailing?: ReactNode;
}

/**
 * KPI tiles in one card that control a chart (Plausible style). Tiles are tabs:
 * arrow keys move, the selected tile has a 2px bar in its metric colour.
 */
export function KpiStrip({ items, selected, onSelect, comparisonLabel = 'previous period', children, className, ariaLabel = 'Metrics', density = 'default', trailing }: KpiStripProps) {
    const slim = density === 'slim';
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
            <div className={cn('flex min-w-0', children ? 'border-b border-border-subtle' : null)}>
                <div role="tablist" aria-label={ariaLabel} className="flex min-w-0 flex-1 snap-x overflow-x-auto [scrollbar-width:none]">
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
                                    // 168px: the value and its delta fit on one line ("12.5M ▲ 1.9%"); content sits at the top.
                                    'relative flex flex-1 snap-start flex-col items-start justify-start border-r border-border-subtle text-left last:border-r-0',
                                    slim ? 'min-w-[150px] px-3.5 py-2' : 'min-w-[168px] px-4 py-3.5',
                                    'transition-colors duration-120 ease-standard focus-visible:-outline-offset-2',
                                    active ? 'bg-surface-sunken' : 'hover:bg-subtle/60',
                                )}
                            >
                                <span className="flex w-full min-w-0 items-center gap-2">
                                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
                                    <span className={cn('truncate font-medium text-fg-secondary', slim ? 'text-meta' : 'text-body-sm')}>{it.label ?? m.label}</span>
                                    {it.hint ? <span className="sr-only">({it.hint})</span> : null}
                                </span>
                                {it.loading ? (
                                    <span className={cn('flex items-center gap-2', slim ? 'mt-1' : 'mt-1.5')}>
                                        <Skeleton delay={0} className={slim ? 'h-5 w-16' : 'h-7 w-20'} />
                                        <Skeleton delay={0} className="h-3.5 w-10" />
                                    </span>
                                ) : (
                                    // Two lines per tile (critique #11): label, then the value with its delta inline.
                                    <span className={cn('flex flex-wrap items-baseline gap-x-1.5', slim ? 'mt-0.5' : 'mt-1')}>
                                        <span className={cn('text-fg tabular-nums', slim ? 'text-stat-sm' : 'text-stat')}>
                                            {it.approx ? <span aria-hidden className="text-fg-muted">≈</span> : null}
                                            {fmtMetric(it.metric, it.value, { compact: true, tile: true, currency: it.currency })}
                                        </span>
                                        <MetricDelta metric={it.metric} current={it.value} previous={it.previous} comparisonLabel={`versus ${comparisonLabel}`} />
                                    </span>
                                )}
                                {active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: m.color }} /> : null}
                            </button>
                        );
                    })}
                </div>
                {trailing ? <div className="flex shrink-0 items-center border-l border-border-subtle px-2">{trailing}</div> : null}
            </div>
            {children ? <div role="tabpanel" className="p-4">{children}</div> : null}
        </Card>
    );
}
