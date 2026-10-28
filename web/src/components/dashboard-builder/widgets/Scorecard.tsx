'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MetricDelta, Skeleton, Tooltip } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { getMetric, metricColor, metricLabel, fmtMetricValue, fmtMetricPair } from '@/lib/builder/catalog';
import { compareText, compareTail, type CompareText } from '@/lib/builder/compare';
import { widgetCompareText } from '@/lib/builder/widgetDates';
import { DateChip } from './DateChip';
import type { KpiStripWidget, MetricRef, ScorecardWidget, DataFrame } from '@/lib/builder/types';
import { okResult, WidgetError, flagNotes, type WidgetViewProps } from './WidgetFrame';
import { dsFormat, dsKey, metricBetter } from './metricUi';

/** The comparison words of a tile: with the days when the widget knows them ("vs Sep 2 – Sep 29", "vs last year"). */
function cmpOf(props: WidgetViewProps): CompareText {
    if (props.dates) return widgetCompareText(props.dates);
    const m = props.compare;
    return compareText(m === 'previous_year' ? { mode: m } : m === 'previous_period' ? { mode: m } : { mode: 'none' });
}

function Tile({ m, total, spark, showDelta, showSpark, sparkHeight, big, cmp, currency, missing, wrapCompare, compareLine = true, chip }: {
    m: MetricRef; total?: DataFrame; spark?: DataFrame; showDelta: boolean; showSpark: boolean; sparkHeight: number; big?: boolean; cmp: CompareText; currency?: string; missing?: boolean;
    /** The widget's own-dates chip, next to the metric name. */
    chip?: React.ReactNode;
    /** Phones: the "vs 20.7K previous period" line wraps instead of being cut. */
    wrapCompare?: boolean;
    /** false: no "vs …" line (a titled strip of 3 rows has no room for it; it was cut in half). */
    compareLine?: boolean;
}) {
    const def = getMetric(m.id);
    const row = total?.rows[0] ?? {};
    const raw = row[`m:${m.id}`];
    const value = typeof raw === 'number' ? raw : null;
    const prevRaw = row[`m:${m.id}:prev`];
    const prev = typeof prevRaw === 'number' ? prevRaw : prevRaw === null ? null : undefined;
    const values = spark?.rows.map((r) => (typeof r[`m:${m.id}`] === 'number' ? (r[`m:${m.id}`] as number) : null)) ?? [];
    const dates = spark?.rows.map((r) => String(r['d:date'] ?? '')) ?? [];
    const label = m.label || metricLabel(m.id);
    // The value and the "vs …" figure are written together: never "65% vs 65%" with a change between them, and the
    // delta chip (lib/format computeDelta) takes the same decimals.
    const pair = fmtMetricPair(m.id, value, showDelta && typeof prev === 'number' ? prev : null, { compact: true, tile: true, currency, format: m.format });
    return (
        <div className="@container/tile flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: metricColor(m.id) }} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">{label}</span>
                {chip}
                {def?.description ? (
                    <Tooltip content={def.description}>
                        <button type="button" aria-label={`About ${label}`} className="relative ml-auto shrink-0 rounded text-fg-muted hover:text-fg pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"><Info aria-hidden size={14} strokeWidth={1.75} /></button>
                    </Tooltip>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('text-fg', big ? 'text-stat-lg' : 'text-stat')} title={missing ? 'No source for this metric' : undefined}>
                    {missing ? '–' : pair.value}
                </span>
                {showDelta && prev !== undefined && !missing ? (
                    <MetricDelta current={value} previous={prev} format={dsFormat(m.id)} better={metricBetter(m.id)} variant="chip" comparisonLabel={cmp.short ? cmp.short.replace(/^vs /, 'versus ') : undefined} />
                ) : null}
            </div>
            {showDelta && compareLine && prev !== undefined && cmp.short && !missing ? (
                <p title={cmp.title} className={cn('text-meta text-fg-muted', wrapCompare ? 'line-clamp-2' : 'truncate')}>vs {typeof prev === 'number' ? pair.previous : fmtMetricValue(m.id, prev, { compact: true, tile: true, currency, format: m.format })} {compareTail(cmp)}</p>
            ) : null}
            {showSpark && values.length > 1 && !missing ? (
                <div className="mt-auto pt-1">
                    <Sparkline series={[{ metric: dsKey(m.id), values, label }]} dates={dates} height={sparkHeight} interactive={false} />
                </div>
            ) : null}
        </div>
    );
}

/**
 * Progress towards a goal for the period (round 2, C10). "Lower is better" metrics (position,
 * bounce rate) count as met at or under the target.
 */
export function TargetBar({ metricId, value, target, label, currency }: { metricId: string; value: number | null; target: number; label?: string; currency?: string }) {
    if (!(target > 0) || value === null) return null;
    const lower = metricBetter(metricId) === 'down';
    const ratio = lower ? (value > 0 ? target / value : 1) : value / target;
    const met = lower ? value <= target : value >= target;
    const pct = Math.max(0, Math.min(1, ratio));
    const text = `${Math.round(ratio * 100)}% of ${label || 'target'} ${fmtMetricValue(metricId, target, { compact: true, tile: true, currency })}`;
    return (
        <div className="mt-2 w-full" data-dash-target="">
            <div className="flex items-baseline justify-between gap-2 text-meta">
                <span className={met ? 'font-medium text-up' : 'text-fg-muted'}>{met ? `${label || 'Target'} met` : text}</span>
                {met ? <span className="text-fg-muted">{text}</span> : null}
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={text}>
                <div className={cn('h-full rounded-full', met ? 'bg-up' : 'bg-brand')} style={{ width: `${pct * 100}%` }} />
            </div>
        </div>
    );
}

export function ScorecardView(props: WidgetViewProps<ScorecardWidget>) {
    const { widget, result, loading, refetching, height } = props;
    const ok = okResult(result);
    const notes = flagNotes(ok, widget);
    const c = widget.config;
    const fam = c.metric.id.split(':')[0];
    const missing = ok?.flags.missingFamilies?.includes(fam as 'ga4' | 'gsc');
    const target = c.target && c.target.value > 0 && !missing ? c.target : undefined;
    const totalRaw = ok?.parts.total?.rows[0]?.[`m:${c.metric.id}`];
    return (
        <div data-dash-widget="md" className={cn('relative flex h-full flex-col overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card', height < 100 ? 'p-3' : 'p-4', c.align === 'center' && 'items-center text-center')}>
            {loading && !ok ? (
                <div className="flex flex-col gap-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-28" /><Skeleton className="h-3.5 w-36" /></div>
            ) : result?.status === 'error' && !ok ? (
                <WidgetError result={result} onRetry={props.onRetry} onChooseSource={props.onChooseSource} compact />
            ) : (
                <div className={cn('flex h-full min-h-0 flex-col', refetching && 'opacity-60')}>
                    <Tile
                        m={{ ...c.metric, label: c.metric.label || (widget.showTitle !== false ? widget.title : undefined) }}
                        total={ok?.parts.total} spark={ok?.parts.spark}
                        showDelta={c.comparison.show && props.compare !== 'none'}
                        chip={<DateChip widget={widget} dates={props.dates} tile />}
                        sparkHeight={Math.max(28, Math.min(72, height - (target ? 176 : 120)))} showSpark={c.sparkline.show && (!target || height >= 200)} big={height >= 220} cmp={cmpOf(props)} currency={ok?.flags.currency} missing={missing}
                    />
                    {target ? <TargetBar metricId={c.metric.id} value={typeof totalRaw === 'number' ? totalRaw : null} target={target.value} label={target.label} currency={ok?.flags.currency} /> : null}
                </div>
            )}
            {notes.length && height >= (target ? 260 : 200) ? <p className="mt-1 truncate text-caption text-fg-muted" title={notes.join(' · ')}>{notes.join(' · ')}</p> : null}
        </div>
    );
}

export function KpiStripView(props: WidgetViewProps<KpiStripWidget>) {
    const { widget, result, loading, refetching, height } = props;
    const ok = okResult(result);
    const c = widget.config;
    const notes = flagNotes(ok, widget);
    const phone = props.bp === 'sm' && props.mode !== 'edit';
    return (
        <div data-dash-widget="strip" className="relative flex h-full flex-col overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card">
            {widget.showTitle && widget.title ? (
                <div className="flex items-center gap-2 px-4 pt-3"><h3 className="min-w-0 truncate text-title-sm text-fg">{widget.title}</h3><DateChip widget={widget} dates={props.dates} /></div>
            ) : props.dates?.own && widget.dateOverride ? (
                // No title to carry the chip: a slim row of its own above the tiles, so the days read for the whole strip.
                <div className="flex items-center gap-2 px-4 pt-2"><DateChip widget={widget} dates={props.dates} /></div>
            ) : null}
            {result?.status === 'error' && !ok ? (
                <WidgetError result={result} onRetry={props.onRetry} onChooseSource={props.onChooseSource} compact />
            ) : (
                <div
                    className={cn(
                        // Phones: a 2-column grid that grows with its tiles (a scrolling row cut the third tile mid-number,
                        // round 4 polish); an odd last tile spans both columns. Wider: one row.
                        phone
                            ? 'grid min-h-0 flex-1 grid-cols-2 gap-px bg-border-subtle [&>*:last-child:nth-child(odd)]:col-span-2'
                            : 'flex min-h-0 flex-1 snap-x overflow-x-auto [scrollbar-width:none]',
                        refetching && 'opacity-60',
                    )}
                    role="list"
                >
                    {c.metrics.map((m) => (
                        <div key={m.id} role="listitem" className={phone ? 'flex min-w-0 bg-surface p-3' : cn('flex min-w-[150px] flex-1 snap-start border-r border-border-subtle last:border-r-0', height < 100 ? 'p-3' : 'p-4')}>
                            {loading && !ok ? (
                                <div className="flex flex-col gap-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-7 w-24" /></div>
                            ) : (
                                <Tile
                                    m={m} total={ok?.parts.total} spark={ok?.parts.spark}
                                    showDelta={c.comparison.show && props.compare !== 'none'} showSpark={c.sparkline.show && (phone ? false : height >= 170)} wrapCompare={phone}
                                    compareLine={phone || !(widget.showTitle && widget.title) || height >= 150}
                                    sparkHeight={28} cmp={cmpOf(props)} currency={ok?.flags.currency}
                                    missing={ok?.flags.missingFamilies?.includes(m.id.split(':')[0] as 'ga4' | 'gsc')}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
            {notes.length && height >= 140 ? <p className="truncate border-t border-border-subtle px-4 py-1 text-caption text-fg-muted" title={notes.join(' · ')}>{notes.join(' · ')}</p> : null}
        </div>
    );
}
