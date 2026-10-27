'use client';

import { useMemo } from 'react';
import { useElementWidth } from '../useElementWidth';
import { useReducedMotion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, Tooltip as RTooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';

import { AXIS_LINE, AXIS_TICK, BarList, ChartTooltipCard, Donut, GRID_STROKE, niceAxis, type ChartTooltipRow } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { fmtAxis } from '@/lib/format';
import { channelColor, deviceColor, CATEGORICAL, CATEGORICAL_OTHER } from '@/lib/metrics';
import { fmtMetricValue, getMetric, metricColor, metricLabel, dimLabel } from '@/lib/builder/catalog';
import { countryName } from '@/lib/builder/countries';
import { autoGranularity, toDay } from '@/lib/builder/dates';
import type { BarWidget, CellValue, PieWidget, TimeSeriesWidget } from '@/lib/builder/types';
import { BuilderTimeSeries, breakdownColor, breakdownLabel } from '../charts/BuilderTimeSeries';
import { okResult, WidgetFrame, type WidgetViewProps } from './WidgetFrame';
import { dsFormat, dsKey } from './metricUi';

/** Display text for a dimension value. */
export function dimText(dim: string, v: CellValue, labels?: Record<string, string>): string {
    if (v === null || v === undefined || v === '') return '(not set)';
    const s = String(v);
    if (labels?.[s]) return labels[s];
    if (dim === 'country') return s === '(other)' ? 'Other' : countryName(s);
    if (dim === 'device') return s.charAt(0).toUpperCase() + s.slice(1);
    if (s === '(other)') return 'Other';
    return s;
}

function categoryColor(dim: string, value: string, index: number): string {
    if (value === '(other)') return CATEGORICAL_OTHER;
    if (dim === 'channel') {
        const c = channelColor(value);
        return c === CATEGORICAL_OTHER ? CATEGORICAL[index] ?? CATEGORICAL_OTHER : c;
    }
    if (dim === 'device') return deviceColor(value);
    return CATEGORICAL[index] ?? CATEGORICAL_OTHER;
}

/** Body height left for the plot inside a WidgetFrame of this cell height. */
export function plotHeight(cell: number, title: boolean, notes = true): number {
    return Math.max(80, cell - 32 - (title ? 34 : 0) - (notes ? 18 : 0));
}

// ── Time series ──────────────────────────────────────────────────────────

export function TimeSeriesView(props: WidgetViewProps<TimeSeriesWidget>) {
    const { widget, result, resolved } = props;
    const ok = okResult(result);
    const frame = ok?.parts.series;
    const c = widget.config;
    const granularity = c.granularity === 'auto' ? (resolved ? autoGranularity(resolved.range.start, resolved.range.end, 'line') : 'day') : c.granularity;
    const rows = useMemo(() => frame?.rows ?? [], [frame]);
    const partialFrom = useMemo(() => {
        const pf = ok?.flags.preliminaryFrom;
        if (!pf || !c.markPreliminary || granularity !== 'day') return undefined;
        const i = rows.findIndex((r) => typeof r['d:date'] === 'string' && toDay(r['d:date'] as string) >= toDay(pf));
        return i > 0 ? i : undefined;
    }, [ok, rows, c.markPreliminary, granularity]);
    const breakdown = c.breakdown && frame?.seriesKeys ? { metric: c.series[0].metric.id, dimension: c.breakdown.dimension, keys: frame.seriesKeys, stacked: c.stacked !== false, labels: frame.labels } : undefined;
    const compare = props.compare !== 'none' && c.compare === 'inherit' && !breakdown && rows.some((r) => `m:${c.series[0]?.metric.id}:prev` in r);
    const h = plotHeight(props.height, widget.showTitle !== false);
    return (
        <WidgetFrame props={props}>
            {frame && rows.length ? (
                <BuilderTimeSeries
                    rows={rows}
                    series={c.series.map((s) => ({ metric: s.metric.id, kind: s.kind, label: s.metric.label, axis: s.axis }))}
                    breakdown={breakdown}
                    compare={compare}
                    granularity={granularity}
                    partialFrom={partialFrom}
                    height={h}
                    currency={ok?.flags.currency}
                    showLegend={c.legend !== 'none'}
                />
            ) : ok ? <EmptyState variant="inline" title="No data in this period" /> : null}
        </WidgetFrame>
    );
}

// ── Bar ──────────────────────────────────────────────────────────────────

function BarChartPlot({ widget, rows, seriesKeys, compare, height, currency, labels, onPick }: { widget: BarWidget; rows: Array<Record<string, CellValue>>; seriesKeys?: string[]; compare: boolean; height: number; currency?: string; labels?: Record<string, string>; onPick?: (value: string) => void }) {
    const c = widget.config;
    const anim = !useReducedMotion();
    const vertical = c.orientation === 'vertical';
    const dim = c.dimension;
    const data = rows.map((r) => ({ ...r, __label: dimText(dim, r[`d:${dim}`], labels) }));
    const metrics = c.metrics.map((m) => m.id);
    const stacked = Boolean(seriesKeys?.length);
    const fmtV = (id: string) => (v: number) => (getMetric(id)?.format === 'integer' ? fmtAxis(v) : fmtMetricValue(id, v, { compact: true, currency }));
    const tooltip = (p: TooltipContentProps<number, string>) => {
        if (!p.active || !p.payload?.length) return null;
        const row = p.payload[0]?.payload as Record<string, CellValue>;
        const out: ChartTooltipRow[] = stacked
            ? seriesKeys!.map((k, i) => ({ key: k, label: breakdownLabel(c.stackBy ?? '', k, labels), color: breakdownColor(c.stackBy ?? '', k, i), value: fmtMetricValue(metrics[0], typeof row[k] === 'number' ? (row[k] as number) : null, { currency }) }))
            : metrics.flatMap((id) => {
                const v = row[`m:${id}`];
                const pv = row[`m:${id}:prev`];
                const r: ChartTooltipRow[] = [{ key: id, label: metricLabel(id), color: metricColor(id), value: fmtMetricValue(id, typeof v === 'number' ? v : null, { currency }) }];
                if (compare && pv !== undefined) r.push({ key: `${id}-p`, label: 'Previous period', color: metricColor(id), dashed: true, value: fmtMetricValue(id, typeof pv === 'number' ? pv : null, { currency }) });
                return r;
            });
        return <ChartTooltipCard title={String(row.__label ?? '')} rows={out} />;
    };
    // Round value steps (0 / 5K / 10K) shared with every other chart (components/charts/axis.ts).
    let valMax = 0;
    for (const r of data) {
        const keys = stacked ? seriesKeys! : metrics.flatMap((id) => (compare ? [`m:${id}`, `m:${id}:prev`] : [`m:${id}`]));
        let sum = 0;
        for (const k of keys) {
            const v = (r as Record<string, unknown>)[k];
            if (typeof v !== 'number' || !Number.isFinite(v)) continue;
            if (stacked) sum += v; else if (v > valMax) valMax = v;
        }
        if (stacked && sum > valMax) valMax = sum;
    }
    const valFmt = getMetric(metrics[0])?.format;
    const nice = niceAxis(valMax, { format: valFmt === 'percent' || valFmt === 'duration' ? valFmt : valFmt === 'integer' ? 'count' : 'number' });
    const catAxis = { dataKey: '__label', type: 'category' as const, tick: AXIS_TICK, tickLine: false, axisLine: AXIS_LINE, interval: 0 as const };
    const valAxis = { type: 'number' as const, tickFormatter: fmtV(metrics[0]), tick: AXIS_TICK, tickLine: false, axisLine: false, domain: nice.domain, ticks: nice.ticks, interval: 0 as const };
    return (
        <BarChart responsive data={data} layout={vertical ? 'horizontal' : 'vertical'} style={{ width: '100%', height, ...(onPick ? { cursor: 'pointer' } : {}) }}
            onClick={onPick ? (st: { activeLabel?: string | number; activeIndex?: number | string | null }) => { const r = typeof st?.activeIndex === 'number' ? rows[st.activeIndex] : rows.find((x) => dimText(dim, x[`d:${dim}`], labels) === st?.activeLabel); const raw = r?.[`d:${dim}`]; if (raw !== undefined && raw !== null && raw !== '(other)') onPick(String(raw)); } : undefined} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%" accessibilityLayer>
            <CartesianGrid horizontal={vertical} vertical={!vertical} stroke={GRID_STROKE} />
            {vertical ? <XAxis {...catAxis} tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)} /> : <YAxis {...catAxis} width={Math.min(140, Math.max(60, Math.max(...data.map((d) => String(d.__label).length)) * 6.5))} tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)} />}
            {vertical ? <YAxis {...valAxis} width={44} /> : <XAxis {...valAxis} />}
            <RTooltip content={tooltip} cursor={{ fill: 'var(--color-subtle)' }} isAnimationActive={false} />
            {stacked
                ? seriesKeys!.map((k, i) => <Bar key={k} dataKey={k} stackId="s" fill={breakdownColor(c.stackBy ?? '', k, i)} maxBarSize={24} stroke="var(--color-surface)" strokeWidth={1} isAnimationActive={anim} animationDuration={400} />)
                : metrics.flatMap((id) => [
                    ...(compare ? [<Bar key={`${id}-p`} dataKey={`m:${id}:prev`} fill={metricColor(id)} fillOpacity={0.3} maxBarSize={24} radius={vertical ? [4, 4, 0, 0] : [0, 4, 4, 0]} isAnimationActive={anim} animationDuration={400} />] : []),
                    <Bar key={id} dataKey={`m:${id}`} fill={metricColor(id)} maxBarSize={24} radius={vertical ? [4, 4, 0, 0] : [0, 4, 4, 0]} isAnimationActive={anim} animationDuration={400} />,
                ])}
        </BarChart>
    );
}

export function BarView(props: WidgetViewProps<BarWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const frame = ok?.parts.rows;
    const c = widget.config;
    const metric = c.metrics[0]?.id ?? 'gsc:clicks';
    const rows = frame?.rows ?? [];
    const compare = props.compare !== 'none' && c.compare === 'inherit' && rows.some((r) => `m:${metric}:prev` in r);
    const h = plotHeight(props.height, widget.showTitle !== false);
    const useList = c.variant === 'list' && !c.stackBy && c.metrics.length === 1;
    return (
        <WidgetFrame props={props} skeleton={useList ? 'table' : 'chart'}>
            {!frame ? null : !rows.length ? (
                <EmptyState variant="inline" title={`No ${metricLabel(metric).toLowerCase()} in this period`} />
            ) : useList ? (
                <div className="h-full overflow-y-auto">
                    <BarList
                        onItemClick={props.onFilterClick ? (it) => { const raw = String(it.key).replace(/-\d+$/, ''); if (raw && raw !== '(other)') props.onFilterClick!(raw); } : undefined}
                        items={rows.map((r, i) => ({
                            key: `${String(r[`d:${c.dimension}`])}-${i}`,
                            label: dimText(c.dimension, r[`d:${c.dimension}`], frame.labels),
                            text: dimText(c.dimension, r[`d:${c.dimension}`], frame.labels),
                            value: typeof r[`m:${metric}`] === 'number' ? (r[`m:${metric}`] as number) : 0,
                        }))}
                        metric={dsKey(metric)}
                        limit={Math.max(3, Math.min(c.top, Math.floor(h / 36)))}
                        showShare={c.showShare && Boolean(getMetric(metric)?.additive)}
                        formatValue={(v) => fmtMetricValue(metric, v, { currency: ok?.flags.currency })}
                        labelHeader={dimLabel(c.dimension)}
                        valueHeader={metricLabel(metric)}
                        viewAllTitle={`${metricLabel(metric)} by ${dimLabel(c.dimension).toLowerCase()}`}
                    />
                </div>
            ) : (
                <BarChartPlot widget={widget} rows={rows} seriesKeys={frame.seriesKeys} compare={compare} height={h} currency={ok?.flags.currency} labels={frame.labels} onPick={props.onFilterClick} />
            )}
        </WidgetFrame>
    );
}

// ── Pie / donut ──────────────────────────────────────────────────────────

export function PieView(props: WidgetViewProps<PieWidget>) {
    const { widget, result } = props;
    const [box, width] = useElementWidth<HTMLDivElement>();
    const ok = okResult(result);
    const frame = ok?.parts.rows;
    const c = widget.config;
    const id = c.metric.id;
    const rows = frame?.rows ?? [];
    const h = plotHeight(props.height, widget.showTitle !== false);
    const bottom = props.bp === 'sm' || c.legend === 'bottom' || (width > 0 && width < 380);
    // Legend below (phones, narrow cells): the donut, a 20px gap and legend rows (28px + 4px gap) must fit
    // the cell, or the centred content was cut at both ends. Keep room for 3 rows; fold the rest into "Other".
    const size = bottom ? Math.max(72, Math.min(160, h - 20 - 3 * 32, width - 16)) : Math.max(96, Math.min(180, h - 8, width - 230));
    const maxSlices = bottom ? Math.min(6, Math.max(2, Math.floor((h - size - 20 + 4) / 32))) : 6;
    return (
        <WidgetFrame props={props}>
            {!frame ? null : !rows.length ? (
                <EmptyState variant="inline" title={`No ${metricLabel(id).toLowerCase()} in this period`} />
            ) : (
                <div ref={box} className="flex h-full items-center overflow-hidden">
                    {/* Size and legend side depend on the cell width: draw nothing until it is measured, so the
                        donut never paints at the 96px fallback first (the golden-screenshot race). */}
                    {width > 0 ? <Donut
                        items={rows.map((r, i) => {
                            const raw = String(r[`d:${c.dimension}`] ?? '');
                            return { key: `${raw}-${i}`, label: dimText(c.dimension, raw, frame.labels), value: typeof r[`m:${id}`] === 'number' ? (r[`m:${id}`] as number) : 0, color: categoryColor(c.dimension, raw, i) };
                        })}
                        centerLabel={c.centerLabel === 'none' ? undefined : metricLabel(id)}
                        format={dsFormat(id)}
                        size={size}
                        maxSlices={maxSlices}
                        legend={bottom ? 'bottom' : 'right'}
                        className="w-full"
                    /> : null}
                </div>
            )}
        </WidgetFrame>
    );
}
