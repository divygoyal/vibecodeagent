'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MetricDelta, Skeleton, Tooltip } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { getMetric, metricColor, metricLabel, fmtMetricValue } from '@/lib/builder/catalog';
import { compareLabel } from '@/lib/builder/dates';
import type { KpiStripWidget, MetricRef, ScorecardWidget, DataFrame } from '@/lib/builder/types';
import { okResult, WidgetError, flagNotes, type WidgetViewProps } from './WidgetFrame';
import { dsFormat, dsKey, metricBetter } from './metricUi';

function compareText(mode: WidgetViewProps['compare']): string {
    return compareLabel(mode === 'previous_year' ? { mode } : mode === 'previous_period' ? { mode } : { mode: 'none' });
}

function Tile({ m, total, spark, showDelta, showSpark, sparkHeight, big, mode, currency, missing }: {
    m: MetricRef; total?: DataFrame; spark?: DataFrame; showDelta: boolean; showSpark: boolean; sparkHeight: number; big?: boolean; mode: WidgetViewProps['compare']; currency?: string; missing?: boolean;
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
    const cmp = compareText(mode);
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: metricColor(m.id) }} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">{label}</span>
                {def?.description ? (
                    <Tooltip content={def.description}>
                        <button type="button" aria-label={`About ${label}`} className="relative ml-auto shrink-0 rounded text-fg-faint hover:text-fg-muted pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"><Info aria-hidden size={14} strokeWidth={1.75} /></button>
                    </Tooltip>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('text-fg', big ? 'text-stat-lg' : 'text-stat')} title={missing ? 'No source for this metric' : undefined}>
                    {missing ? '–' : fmtMetricValue(m.id, value, { compact: true, tile: true, currency, format: m.format })}
                </span>
                {showDelta && prev !== undefined && !missing ? (
                    <MetricDelta current={value} previous={prev} format={dsFormat(m.id)} better={metricBetter(m.id)} variant="chip" comparisonLabel={cmp ? cmp.replace(/^vs /, 'versus ') : undefined} />
                ) : null}
            </div>
            {showDelta && prev !== undefined && cmp && !missing ? (
                <p className="truncate text-meta text-fg-muted">vs {fmtMetricValue(m.id, prev, { compact: true, tile: true, currency })} {cmp.replace(/^vs /, '')}</p>
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
        <div data-dash-widget="md" className={cn('relative flex h-full flex-col overflow-hidden rounded-card border border-border-subtle bg-surface p-4 shadow-card', c.align === 'center' && 'items-center text-center')}>
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
                        sparkHeight={Math.max(28, Math.min(72, height - (target ? 176 : 120)))} showSpark={c.sparkline.show && (!target || height >= 200)} big={height >= 220} mode={props.compare} currency={ok?.flags.currency} missing={missing}
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
    return (
        <div data-dash-widget="strip" className="relative flex h-full flex-col overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card">
            {widget.showTitle && widget.title ? <h3 className="px-4 pt-3 text-title-sm text-fg">{widget.title}</h3> : null}
            {result?.status === 'error' && !ok ? (
                <WidgetError result={result} onRetry={props.onRetry} onChooseSource={props.onChooseSource} compact />
            ) : (
                <div className={cn('flex min-h-0 flex-1 snap-x overflow-x-auto [scrollbar-width:none]', refetching && 'opacity-60')} role="list">
                    {c.metrics.map((m) => (
                        <div key={m.id} role="listitem" className="flex min-w-[150px] flex-1 snap-start border-r border-border-subtle p-4 last:border-r-0">
                            {loading && !ok ? (
                                <div className="flex flex-col gap-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-7 w-24" /></div>
                            ) : (
                                <Tile
                                    m={m} total={ok?.parts.total} spark={ok?.parts.spark}
                                    showDelta={c.comparison.show && props.compare !== 'none'} showSpark={c.sparkline.show && height >= 170}
                                    sparkHeight={28} mode={props.compare} currency={ok?.flags.currency}
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
