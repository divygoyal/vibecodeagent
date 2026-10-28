'use client';

/**
 * Time series for builder widgets: any catalogue metric (percent, duration, currency ...),
 * multi-metric overlay with a dashed comparison line, split panels for metrics of different
 * colour groups, stacked breakdowns, bars. Follows DESIGN.md section 6 exactly like
 * components/charts/TimeSeriesChart (same grid, axes, tooltip card and partial tail); it exists
 * because that chart formats by the nine design-system metrics only.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
    Area,
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceArea,
    ReferenceLine,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
    type TooltipContentProps,
} from 'recharts';

import { cn } from '@/lib/cn';
import { fmtAxis, fmtDayLong, fmtDuration, fmtMonthYear, fmtPercent, makeDateTickFormatter } from '@/lib/format';
import { CATEGORICAL, CATEGORICAL_OTHER, channelColor, deviceColor } from '@/lib/metrics';
import { AXIS_LINE, AXIS_TICK, CURSOR, ChartTooltipCard, GRID_STROKE, dateAxisTick, dateTicks as evenDateTicks, maxOf, niceAxis, type AxisFormat, type ChartTooltipRow, type NiceAxis } from '@/components/charts';
import { MetricDelta, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { fmtMetricValue, getMetric, metricColor, metricFamilies, metricLabel } from '@/lib/builder/catalog';
import { countryName } from '@/lib/builder/countries';
import type { ChartMark, ResolvedRefLine } from '@/lib/builder/chartMarks';
import type { CellValue } from '@/lib/builder/types';
import { useElementWidth } from '../useElementWidth';
import { useTvScreen } from '../TvMode';
import { dsFormat, metricBetter } from '../widgets/metricUi';

export interface TsSeries {
    metric: string;
    kind: 'line' | 'area' | 'bar';
    label?: string;
    axis?: 'left' | 'right';
}

export interface BuilderTimeSeriesProps {
    rows: Array<Record<string, CellValue>>;
    series: TsSeries[];
    /** Breakdown frame: series keys 'b:<value>' (one metric). */
    breakdown?: { metric: string; dimension: string; keys: string[]; stacked: boolean; labels?: Record<string, string> };
    compare: boolean;
    granularity: 'day' | 'week' | 'month';
    /** Rows from this index are partial (Search Console lag): dotted. */
    partialFrom?: number;
    height: number;
    currency?: string;
    showLegend?: boolean;
    className?: string;
    /** Round 7: numbered markers (your notes, Google updates) on their row dates. */
    marks?: ChartMark[];
    /** Round 7: horizontal goal / reference / average lines (each on its metric's axis). */
    refLines?: ResolvedRefLine[];
}

// Theme tokens (--tc-*), not the --color-* aliases: those resolve on :root, so a dark dashboard theme
// inside the light app would get light colours (dashboard-themes.css section 0).
// --tc-mark-note: a theme whose brand is as warm as the Google colour (Sunrise) gives notes their own hue.
export const MARK_COLOR: Record<ChartMark['kind'], string> = { note: 'var(--tc-mark-note, var(--tc-brand-text))', google: 'var(--tc-warn)' };
const REF_STYLE: Record<ResolvedRefLine['kind'], { stroke: string; dash: string; width: number }> = {
    goal: { stroke: 'var(--tc-up)', dash: '6 4', width: 1.5 },
    reference: { stroke: 'var(--tc-fg-muted)', dash: '4 4', width: 1.25 },
    average: { stroke: 'var(--tc-fg-secondary)', dash: '2 3', width: 1.25 },
};

/** The number badge of a marker, as HTML (tooltip and footnote); the chart draws the same in SVG. */
export function MarkBadge({ mark }: { mark: Pick<ChartMark, 'n' | 'kind'> }) {
    return (
        <span aria-hidden className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums" style={{ background: MARK_COLOR[mark.kind], color: 'var(--color-surface)' }}>
            {mark.n}
        </span>
    );
}

/** Marker glyph on top of a dashed line: one pill per row date, numbered (several on one date: "2,3" or "2+"). */
function markGlyph(group: ChartMark[], drop = 0) {
    const text = group.length === 1 ? String(group[0].n) : group.length === 2 ? `${group[0].n},${group[1].n}` : `${group[0].n}+`;
    const color = MARK_COLOR[group.some((m) => m.kind === 'note') ? 'note' : 'google'];
    const label = group.map((m) => `${m.n}: ${m.label}`).join('; ');
    const Glyph = (p: { viewBox?: { x?: number; y?: number } }) => {
        const x = p.viewBox?.x ?? 0;
        const y = (p.viewBox?.y ?? 0) + 1 + drop;
        const w = 8 + text.length * 6;
        return (
            <g role="img" aria-label={label}>
                <title>{label}</title>
                <rect x={x - w / 2} y={y} width={w} height={14} rx={7} fill={color} />
                <text x={x} y={y + 10.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-surface)" style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</text>
            </g>
        );
    };
    return Glyph;
}

/** Ref line label at the right end, above the line (below it near the top edge), with a halo. */
function refLabel(text: string, color: string, side: 'left' | 'right') {
    const Label = (p: { viewBox?: { x?: number; y?: number; width?: number } }) => {
        const vb = p.viewBox ?? {};
        const x = side === 'right' ? (vb.x ?? 0) + (vb.width ?? 0) - 4 : (vb.x ?? 0) + 4;
        const y = (vb.y ?? 0) < 18 ? (vb.y ?? 0) + 13 : (vb.y ?? 0) - 5;
        return (
            <text x={x} y={y} textAnchor={side === 'right' ? 'end' : 'start'} fontSize={11} fontWeight={500} fill={color} stroke="var(--color-surface)" strokeWidth={3} strokeLinejoin="round" style={{ paintOrder: 'stroke' }}>
                {text}
            </text>
        );
    };
    return Label;
}

function axisFmt(metricId: string, currency?: string): (v: number) => string {
    const f = getMetric(metricId)?.format;
    if (f === 'percent') return (v) => fmtPercent(v);
    if (f === 'position') return (v) => String(Math.round(v));
    if (f === 'duration') return (v) => fmtDuration(v);
    if (f === 'currency') return (v) => fmtMetricValue(metricId, v, { compact: true, currency });
    return (v) => fmtAxis(v);
}

export function breakdownColor(dimension: string, key: string, index: number): string {
    const value = key.replace(/^b:/, '');
    if (value === '__other') return CATEGORICAL_OTHER;
    if (dimension === 'channel') {
        const c = channelColor(value);
        return c === CATEGORICAL_OTHER ? CATEGORICAL[index] ?? CATEGORICAL_OTHER : c;
    }
    if (dimension === 'device') return deviceColor(value);
    return CATEGORICAL[index] ?? CATEGORICAL_OTHER;
}

export function breakdownLabel(dimension: string, key: string, labels?: Record<string, string>): string {
    const v = key.replace(/^b:/, '');
    if (v === '__other') return 'Other';
    if (labels?.[v]) return labels[v];
    if (dimension === 'country') return countryName(v);
    return v || '(not set)';
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface LegendItem { key: string; label: string; color: string }

/** One legend line is 20 px; lines are 4 px apart. */
const LEGEND_LINE = 20;

/**
 * Chart legend that names every drawn series (round 5, audit #14: "Clicks by site" drew 6 bands
 * and named 4). Items wrap onto at most `lines` lines; whatever still does not fit folds into a
 * "+N more" button that lists the rest with their colours (a popover, so it works on touch too).
 * Reports its height so the plot below gives it room.
 */
function ChartLegend({ items, lines, onHeight }: { items: LegendItem[]; lines: number; onHeight: (h: number) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const [fit, setFit] = useState(items.length);
    useIsoLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const kids = [...el.children] as HTMLElement[];
        const tops = [...new Set(kids.map((k) => k.offsetTop))].sort((a, b) => a - b);
        if (tops.length > lines && fit > 1) {
            // Keep what fits on the allowed lines, minus one item to make room for "+N more".
            const limit = tops[lines - 1];
            const shownFit = kids.slice(0, fit).filter((k) => k.offsetTop <= limit).length;
            setFit(Math.max(1, Math.min(fit - 1, shownFit - (fit < items.length ? 0 : 1))));
            return;
        }
        onHeight(el.offsetHeight);
    });
    const rest = items.slice(fit);
    return (
        <div ref={ref} className="mb-1 flex flex-wrap gap-x-3 gap-y-1 overflow-hidden text-meta text-fg-secondary">
            {items.slice(0, fit).map((it) => (
                <span key={it.key} className="inline-flex h-5 items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded" style={{ background: it.color }} />{it.label}</span>
            ))}
            {rest.length ? (
                <Popover>
                    <PopoverTrigger asChild>
                        <button type="button" title={rest.map((r) => r.label).join(', ')} className="inline-flex h-5 items-center rounded px-1 font-medium text-fg-secondary hover:bg-subtle hover:text-fg">
                            +{rest.length} more
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="max-w-[280px] p-2" aria-label="More series">
                        <ul className="space-y-1 text-meta text-fg-secondary">
                            {rest.map((it) => (
                                <li key={it.key} className="flex min-w-0 items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 shrink-0 rounded" style={{ background: it.color }} /><span className="truncate">{it.label}</span></li>
                            ))}
                        </ul>
                    </PopoverContent>
                </Popover>
            ) : null}
        </div>
    );
}

function dateTickFormat(dates: string[], g: 'day' | 'week' | 'month'): (v: string, i: number) => string {
    if (g === 'month') return (v: string) => fmtMonthYear(v);
    const f = makeDateTickFormatter(dates);
    return (v: string, i: number) => f(v, i);
}

/** Round Y steps (axis.ts niceAxis: 0 / 5K / 10K, positions from 1) for a catalogue metric. */
function axisKind(metricId: string): AxisFormat {
    const f = getMetric(metricId)?.format;
    return f === 'percent' || f === 'position' || f === 'duration' ? f : f === 'integer' ? 'count' : 'number';
}

export function BuilderTimeSeries(props: BuilderTimeSeriesProps) {
    const { series, breakdown, height } = props;
    // Different colour groups never share a plot (DESIGN 2.3): split panels.
    const groups = new Set(series.map((s) => getMetric(s.metric)?.colorKey && (['clicks', 'impressions', 'ctr', 'position'].includes(getMetric(s.metric)!.colorKey) ? 'search' : 'traffic')));
    if (!breakdown && series.length > 1 && groups.size > 1) {
        const each = Math.max(110, Math.floor((height - (series.length - 1) * 12) / series.length) - 20);
        return (
            <div className={cn('flex h-full flex-col gap-3', props.className)}>
                {series.map((s) => (
                    <div key={s.metric} className="min-h-0">
                        <p className="mb-1 flex items-center gap-2 text-body-sm text-fg-secondary">
                            <span aria-hidden className="size-2 rounded-full" style={{ background: metricColor(s.metric) }} />
                            {s.label ?? metricLabel(s.metric)}
                        </p>
                        <Plot {...props} series={[s]} height={each} refLines={props.refLines?.filter((l) => l.metric === s.metric)} />
                    </div>
                ))}
            </div>
        );
    }
    // Every series is drawn on its own scale, so a second line without an axis of its own (templates and saved
    // dashboards, e.g. clicks + impressions) used to sit on an unlabelled scale. Two lines: label the second on the right.
    if (!breakdown && series.length === 2 && !series.some((s) => s.axis)) {
        return <Plot {...props} series={[series[0], { ...series[1], axis: 'right' }]} />;
    }
    return <Plot {...props} />;
}

function Plot({ rows, series, breakdown, compare, granularity, partialFrom, height, currency, showLegend, className, marks, refLines }: BuilderTimeSeriesProps) {
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const reduce = useReducedMotion();
    // TV screens keep the y axis down to a 120 px plot (round 4): numbers read from across the room.
    const showY = height > (useTvScreen() ? 120 : 200);
    // Evenly spaced dates anchored on the last day and round Y steps (components/charts/axis.ts, round 2 critique #2).
    const [figRef, figW] = useElementWidth<HTMLElement>();
    const dates = useMemo(() => rows.map((r) => String(r['d:date'] ?? '')), [rows]);
    const tick = useMemo(() => dateTickFormat(dates, granularity), [dates, granularity]);
    const xTicks = useMemo(() => evenDateTicks(dates, { width: (figW || 640) - (showY ? 52 : 16) }), [dates, figW, showY]);
    const xTick = useMemo(() => dateAxisTick({ first: dates[0], last: dates[dates.length - 1], ticks: xTicks, format: tick }), [dates, xTicks, tick]);
    const hasPartial = typeof partialFrom === 'number' && partialFrom > 0 && partialFrom < rows.length;
    const first = series[0];

    const data = useMemo(() => {
        if (!hasPartial || breakdown) return rows;
        return rows.map((row, i) => {
            const out: Record<string, CellValue> = { ...row };
            for (const s of series) {
                const k = `m:${s.metric}`;
                out[`${k}__solid`] = i <= (partialFrom as number) - 1 ? row[k] : null;
                out[`${k}__partial`] = i >= (partialFrom as number) - 1 ? row[k] : null;
            }
            return out;
        });
    }, [rows, series, hasPartial, partialFrom, breakdown]);

    const fmtDate = (d: string) => (granularity === 'month' ? fmtMonthYear(d) : granularity === 'week' ? `Week of ${fmtDayLong(d)}` : fmtDayLong(d));

    const renderTooltip = (p: TooltipContentProps<number, string>) => {
        if (!p.active || !p.payload?.length) return null;
        const row = p.payload[0]?.payload as Record<string, CellValue> | undefined;
        if (!row) return null;
        const idx = rows.findIndex((r) => r['d:date'] === row['d:date']);
        const out: ChartTooltipRow[] = [];
        if (breakdown) {
            breakdown.keys.forEach((k, i) => {
                const v = row[k];
                out.push({ key: k, label: breakdownLabel(breakdown.dimension, k, breakdown.labels), color: breakdownColor(breakdown.dimension, k, i), value: fmtMetricValue(breakdown.metric, typeof v === 'number' ? v : null, { currency }) });
            });
        } else {
            for (const s of series) {
                const v = row[`m:${s.metric}`];
                const pv = compare ? row[`m:${s.metric}:prev`] : undefined;
                out.push({
                    key: s.metric,
                    label: s.label ?? metricLabel(s.metric),
                    color: metricColor(s.metric),
                    value: fmtMetricValue(s.metric, typeof v === 'number' ? v : null, { currency }),
                    delta: pv !== undefined ? <MetricDelta current={typeof v === 'number' ? v : null} previous={typeof pv === 'number' ? pv : null} format={dsFormat(s.metric)} better={metricBetter(s.metric)} /> : undefined,
                });
                if (pv !== undefined) out.push({ key: `${s.metric}-prev`, label: 'Previous period', color: metricColor(s.metric), dashed: true, value: fmtMetricValue(s.metric, typeof pv === 'number' ? pv : null, { currency }) });
            }
        }
        const pd = row['d:date:prev'];
        const here = marks?.filter((m) => m.at === row['d:date']) ?? [];
        const footer = here.length ? (
            <ul className="flex max-w-[260px] flex-col gap-1">
                {here.map((m) => (
                    <li key={m.key} className="flex items-start gap-1.5 text-meta text-fg-secondary">
                        <MarkBadge mark={m} />
                        <span className="min-w-0">
                            <span className="text-fg">{m.label}</span>
                            <span className="text-fg-muted">{m.kind === 'google' ? ' · Google update' : m.date !== m.at ? ` · ${fmtDayLong(m.date)}` : ''}</span>
                        </span>
                    </li>
                ))}
            </ul>
        ) : undefined;
        return <ChartTooltipCard title={row['d:date'] ? fmtDate(String(row['d:date'])) : undefined} subtitle={compare && pd ? `vs ${fmtDate(String(pd))}` : undefined} rows={out} partial={hasPartial && idx >= (partialFrom as number)} footer={footer} />;
    };

    const yAxes = useMemo(() => {
        const out: Record<string, NiceAxis> = {};
        if (breakdown) {
            let max = 0;
            for (const r of data) {
                if (breakdown.stacked) {
                    let sum = 0;
                    for (const k of breakdown.keys) { const v = r[k]; if (typeof v === 'number' && Number.isFinite(v)) sum += v; }
                    if (sum > max) max = sum;
                } else {
                    max = Math.max(max, maxOf([r], breakdown.keys));
                }
            }
            for (const l of refLines ?? []) if (l.y > max) max = l.y;
            out.b = niceAxis(max, { format: axisKind(breakdown.metric) });
        } else {
            for (const s of series) {
                // A goal above the data still shows: the axis reaches it.
                const lineMax = Math.max(0, ...(refLines ?? []).filter((l) => l.metric === s.metric).map((l) => l.y));
                out[s.metric] = niceAxis(Math.max(maxOf(data, [`m:${s.metric}`, compare ? `m:${s.metric}:prev` : undefined]), lineMax), { format: axisKind(s.metric) });
            }
        }
        return out;
    }, [data, breakdown, series, compare, refLines]);
    // One glyph per row date; a glyph too close to the previous one drops a row so both stay readable.
    const markGroups = useMemo(() => {
        const by = new Map<string, ChartMark[]>();
        for (const m of marks ?? []) by.set(m.at, [...(by.get(m.at) ?? []), m]);
        const step = ((figW || 640) - 60) / Math.max(1, rows.length);
        const index = new Map(rows.map((r, i) => [String(r['d:date'] ?? ''), i]));
        const sorted = [...by.entries()].sort(([a], [b]) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
        const out: Array<{ at: string; group: ChartMark[]; drop: number }> = [];
        for (const [at, group] of sorted) {
            const last = out[out.length - 1];
            const close = last && ((index.get(at) ?? 0) - (index.get(last.at) ?? 0)) * step < 24;
            out.push({ at, group, drop: close && last.drop === 0 ? 16 : 0 });
        }
        return out;
    }, [marks, rows, figW]);
    const markAxis = breakdown ? 'b' : first?.metric;
    // Two line labels closer than ~14 px: the next one moves to the left end, so they never overlap.
    const refSides = useMemo(() => {
        const plotH = Math.max(60, height - 40);
        const px = (l: ResolvedRefLine) => {
            const top = (breakdown ? yAxes.b : yAxes[l.metric])?.domain?.[1];
            return typeof top === 'number' && top > 0 ? (l.y / top) * plotH : 0;
        };
        const sides = new Map<string, 'left' | 'right'>();
        const sorted = [...(refLines ?? [])].sort((a, b) => px(a) - px(b));
        sorted.forEach((l, i) => {
            const prev = sorted[i - 1];
            const close = prev && Math.abs(px(l) - px(prev)) < 14;
            sides.set(l.key, close && sides.get(prev.key) === 'right' ? 'left' : 'right');
        });
        return sides;
    }, [refLines, yAxes, breakdown, height]);

    const allZero = !breakdown && first ? rows.every((r) => !r[`m:${first.metric}`]) : false;
    const anim = !reduce;
    const legend = showLegend && (breakdown || series.length > 1);
    const legendItems: LegendItem[] = breakdown
        ? breakdown.keys.map((k, i) => ({ key: k, label: breakdownLabel(breakdown.dimension, k, breakdown.labels), color: breakdownColor(breakdown.dimension, k, i) }))
        : series.map((s) => ({ key: s.metric, label: s.label ?? metricLabel(s.metric), color: metricColor(s.metric) }));
    // One line by default (as before); tall plots may use two before folding into "+N more". The plot
    // waits for the legend's measured height (a layout effect, before paint), so it is drawn once at
    // its final size: no resize after the first frame (golden screenshots stay stable).
    const [legendH, setLegendH] = useState<number | null>(null);
    // Phones: up to three lines, so the stacked colours are named on the chart, not behind "+5 more" (round 5 judge).
    const legendLines = figW > 0 && figW < 480 ? 3 : height >= 240 ? 2 : 1;

    return (
        <figure ref={figRef} className={cn('relative m-0', className)} style={{ height }} aria-label={breakdown ? `${metricLabel(breakdown.metric)} by ${breakdown.dimension}` : series.map((s) => s.label ?? metricLabel(s.metric)).join(', ')}>
            {legend ? (
                // Remount on a new width or series set, so the fit is measured again from all items.
                <ChartLegend key={`${figW}:${legendItems.map((it) => `${it.key}=${it.label}`).join('|')}`} items={legendItems} lines={legendLines} onHeight={setLegendH} />
            ) : null}
            {legend && legendH === null ? null : <ComposedChart responsive data={data} style={{ width: '100%', height: legend ? height - (legendH ?? LEGEND_LINE) - 2 : height }} margin={{ top: 8, right: series.some((s) => s.axis === 'right') && showY ? 0 : 8, bottom: 0, left: showY ? 0 : 8 }} accessibilityLayer>
                <defs>
                    {first && !breakdown ? (
                        <linearGradient id={`bts-${uid}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={metricColor(first.metric)} style={{ stopOpacity: 'var(--tc-chart-fill-top)' }} />
                            <stop offset="100%" stopColor={metricColor(first.metric)} stopOpacity={0} />
                        </linearGradient>
                    ) : null}
                </defs>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="d:date" ticks={xTicks} interval={0} tick={xTick} tickLine={false} axisLine={AXIS_LINE} tickMargin={8} />
                {breakdown ? (
                    <YAxis yAxisId="b" hide={!showY} width={showY ? 44 : 0} domain={yAxes.b.domain} ticks={yAxes.b.ticks} interval={0} tickFormatter={axisFmt(breakdown.metric, currency)} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                ) : series.map((s, i) => {
                    const isPos = getMetric(s.metric)?.format === 'position';
                    const visible = showY && (i === 0 || s.axis === 'right');
                    return (
                        <YAxis
                            key={s.metric} yAxisId={s.metric} hide={!visible} width={visible ? 44 : 0} orientation={s.axis === 'right' ? 'right' : 'left'}
                            reversed={isPos} domain={yAxes[s.metric].domain} ticks={yAxes[s.metric].ticks} interval={0}
                            tickFormatter={axisFmt(s.metric, currency)}
                            // Two scales: each axis's numbers in its series colour, so it is clear which line they measure.
                            tick={series.some((x) => x.axis === 'right') ? { ...AXIS_TICK, fill: metricColor(s.metric) } : AXIS_TICK} tickLine={false} axisLine={false}
                        />
                    );
                })}
                <RTooltip content={renderTooltip} cursor={CURSOR} isAnimationActive={false} offset={12} />

                {(marks ?? []).filter((m) => m.kind === 'google' && m.endAt).map((m) => (
                    <ReferenceArea key={`area-${m.key}`} x1={m.at} x2={m.endAt} yAxisId={markAxis} fill={MARK_COLOR.google} fillOpacity={0.07} stroke="none" ifOverflow="hidden" />
                ))}
                {markGroups.map(({ at, group, drop }) => (
                    <ReferenceLine key={`mark-${at}`} x={at} yAxisId={markAxis} stroke={MARK_COLOR[group.some((m) => m.kind === 'note') ? 'note' : 'google']} strokeOpacity={0.7} strokeDasharray="3 3" label={markGlyph(group, drop)} />
                ))}
                {(refLines ?? []).map((l) => (
                    <ReferenceLine key={l.key} y={l.y} yAxisId={breakdown ? 'b' : l.metric} stroke={REF_STYLE[l.kind].stroke} strokeWidth={REF_STYLE[l.kind].width} strokeDasharray={REF_STYLE[l.kind].dash} label={refLabel(l.label, REF_STYLE[l.kind].stroke, refSides.get(l.key) ?? 'right')} />
                ))}

                {breakdown
                    ? breakdown.keys.map((k, i) => {
                        const color = breakdownColor(breakdown.dimension, k, i);
                        return breakdown.stacked ? (
                            <Area key={k} className={`tc-series-${i}`} yAxisId="b" dataKey={k} stackId="b" type="monotone" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.18} isAnimationActive={anim} animationDuration={400} name={breakdownLabel(breakdown.dimension, k, breakdown.labels)} activeDot={false} />
                        ) : (
                            <Line key={k} className={`tc-series-${i}`} yAxisId="b" dataKey={k} type="monotone" stroke={color} strokeWidth={2} dot={false} isAnimationActive={anim} animationDuration={400} name={breakdownLabel(breakdown.dimension, k, breakdown.labels)} />
                        );
                    })
                    : null}

                {!breakdown && compare ? series.slice(0, 2).map((s) => (
                    <Line key={`${s.metric}-prev`} yAxisId={s.metric} dataKey={`m:${s.metric}:prev`} type="monotone" stroke={metricColor(s.metric)} strokeWidth={1.5} strokeDasharray="4 4" strokeOpacity={0.5} dot={false} activeDot={false} connectNulls={false} isAnimationActive={anim} animationDuration={400} name="Previous period" />
                )) : null}

                {!breakdown && first && first.kind !== 'bar' && (first.kind === 'area' || series.length === 1) ? (
                    <Area yAxisId={first.metric} dataKey={`m:${first.metric}`} type="monotone" stroke="none" fill={`url(#bts-${uid})`} connectNulls={false} isAnimationActive={anim} animationDuration={400} activeDot={false} tooltipType="none" />
                ) : null}

                {!breakdown ? series.map((s, si) => {
                    const color = metricColor(s.metric);
                    const k = `m:${s.metric}`;
                    if (s.kind === 'bar') {
                        return <Bar key={k} yAxisId={s.metric} dataKey={k} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={anim} animationDuration={400} name={s.label ?? metricLabel(s.metric)} />;
                    }
                    const common = { yAxisId: s.metric, type: 'monotone' as const, stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, connectNulls: false, isAnimationActive: anim, animationDuration: 400 };
                    // Calculated metrics on a Search Console input get the dashed lag tail too.
                    const isGsc = metricFamilies(s.metric).includes('gsc');
                    if (!hasPartial || !isGsc) {
                        return <Line key={k} className={`tc-series-${si}`} {...common} dataKey={k} dot={rows.length === 1 ? { r: 3, fill: color, strokeWidth: 0 } : false} activeDot={{ r: 4, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }} name={s.label ?? metricLabel(s.metric)} />;
                    }
                    return [
                        <Line key={`${k}-solid`} className={`tc-series-${si}`} {...common} dataKey={`${k}__solid`} dot={false} activeDot={{ r: 4, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }} name={s.label ?? metricLabel(s.metric)} />,
                        <Line key={`${k}-partial`} {...common} dataKey={`${k}__partial`} strokeDasharray="2 3" dot={false} activeDot={false} tooltipType="none" />,
                    ];
                }) : null}
            </ComposedChart>}
            {allZero && rows.length > 0 && first ? (
                <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-body-sm text-fg-muted">No {metricLabel(first.metric).toLowerCase()} in this period</p>
            ) : null}
        </figure>
    );
}
