'use client';

/**
 * Scatter widget (round 9): one point per value of a dimension, two metrics on the axes, an optional
 * third as the point area. Dashed guides at the medians split the plot in four; one quadrant can be
 * shaded and counted. Drawn with Recharts (already installed). The axes, grid and tooltip follow the other
 * dashboard charts; a one-line summary and a hidden table carry the same numbers for screen readers.
 */
import { CartesianGrid, ReferenceArea, ReferenceLine, Scatter, ScatterChart, Tooltip as RTooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';

import { AXIS_LINE, AXIS_TICK, ChartTooltipCard, GRID_STROKE, niceAxis, type AxisFormat } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { fmtAxis } from '@/lib/format';
import { dimLabel, fmtMetricValue, getMetric, metricColor, metricLabel } from '@/lib/builder/catalog';
import { axisPixel, LABEL_FONT, logTicks, lowerIsBetter, lowerLabel, placeLabels, pointRadius, quadrantOf, quadrantText, shapeScatter, type LabelRect, type ScatterPoint } from '@/lib/builder/charts/scatter';
import type { ScatterWidget } from '@/lib/builder/charts/types';
import { useBox } from './useBox';
import { okResult, WidgetFrame, type WidgetViewProps } from '../widgets/WidgetFrame';
import { dimText, plotHeight } from '../widgets/Charts';

const axisFormat = (id: string): AxisFormat => {
    const f = getMetric(id)?.format;
    return f === 'percent' || f === 'duration' || f === 'position' ? f : f === 'integer' ? 'count' : 'number';
};

interface Axis { domain: [number, number]; ticks: number[]; scale: 'linear' | 'log'; reversed: boolean }

// Chart geometry the label placement shares with the chart (fixed so the two always agree).
const MARGIN = { top: 8, right: 14, bottom: 0, left: 0 };
const Y_AXIS_W = 46;
const X_AXIS_H = 28;
const NAMED_DEFAULT = 5;
const NAMED_MORE = 10;

function buildAxis(id: string, scale: 'linear' | 'log', min: number, max: number): Axis {
    if (scale === 'log' && min > 0) {
        const lo = min / 1.4;
        const hi = max * 1.4;
        return { domain: [lo, hi], ticks: logTicks(lo, hi), scale: 'log', reversed: lowerIsBetter(id) };
    }
    const n = niceAxis(max, { format: axisFormat(id) });
    return { domain: n.domain, ticks: n.ticks, scale: 'linear', reversed: lowerIsBetter(id) };
}

/** " (log scale, 1 at top)": the notes under an axis name. */
function axisNote(log: boolean, reversed: boolean, side: 'top' | 'right'): string {
    const parts = [...(log ? ['log scale'] : []), ...(reversed ? [`1 at ${side}`] : [])];
    return parts.length ? ` (${parts.join(', ')})` : '';
}

export function ScatterView(props: WidgetViewProps<ScatterWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const frame = ok?.parts.rows;
    const c = widget.config;
    const [box, { w: width, h: boxH }] = useBox<HTMLDivElement>();
    const currency = ok?.flags.currency;
    const model = frame ? shapeScatter(frame.rows, c) : null;
    const xLabel = c.x.label || metricLabel(c.x.id);
    const yLabel = c.y.label || metricLabel(c.y.id);
    const sizeLabel = c.size ? c.size.label || metricLabel(c.size.id) : null;
    const colour = metricColor(c.y.id);
    const guides = c.quadrants !== false;
    // A shaded quadrant needs the median guides it is cut by.
    const highlight = guides ? c.highlight : undefined;
    const fx = (v: number) => (getMetric(c.x.id)?.format === 'integer' ? fmtAxis(v) : fmtMetricValue(c.x.id, v, { compact: true, currency }));
    const fy = (v: number) => (getMetric(c.y.id)?.format === 'integer' ? fmtAxis(v) : fmtMetricValue(c.y.id, v, { compact: true, currency }));
    const text = (p: ScatterPoint) => dimText(c.dimension, p.key, frame?.labels);

    const view = (() => {
        if (!model || !model.points.length) return null;
        const xAxis = buildAxis(c.x.id, c.xScale ?? 'linear', model.xMin, model.xMax);
        const yAxis = buildAxis(c.y.id, c.yScale ?? 'linear', model.yMin, model.yMax);
        const inQuad = highlight ? model.points.filter((p) => quadrantOf(p, model.medianX, model.medianY) === highlight) : [];
        // The biggest points are the ones worth naming (and the ones a "what to fix first" list starts with).
        const bySize = (a: ScatterPoint, b: ScatterPoint) => (b.size ?? b.x) - (a.size ?? a.x);
        return { xAxis, yAxis, inQuad: [...inQuad].sort(bySize), ranked: [...model.points].sort(bySize) };
    })();

    // The plot fills the space the legend lines leave; before it is measured, estimate from the card height.
    const h = Math.max(120, boxH > 0 ? boxH : plotHeight(props.height, widget.showTitle !== false) - 52);
    // Names and median labels are drawn in one overlay so they can be placed against each other: no two overlap,
    // a name near the right edge flips to the left, long names end in an ellipsis (the tooltip has the full one).
    const overlay = (() => {
        if (!model || !view || width <= 0) return null;
        const plot = { x0: Y_AXIS_W + MARGIN.left, x1: width - MARGIN.right, y0: MARGIN.top, y1: h - MARGIN.bottom - X_AXIS_H };
        const pxOf = (v: number) => axisPixel(v, view.xAxis.domain, view.xAxis.scale, plot.x0, plot.x1, view.xAxis.reversed);
        const pyOf = (v: number) => axisPixel(v, view.yAxis.domain, view.yAxis.scale, plot.y1, plot.y0, view.yAxis.reversed);
        const dots = model.points.map((p) => ({ key: p.key, cx: pxOf(p.x), cy: pyOf(p.y), r: pointRadius(p.size, model.sizeMin, model.sizeMax) }));
        const dotOf = new Map(dots.map((d) => [d.key, d]));
        const reserved: LabelRect[] = [];
        const medians: Array<{ text: string; x: number; y: number; anchor: 'start' | 'end' }> = [];
        if (guides) {
            const charW = 5.6;
            const mx = pxOf(model.medianX);
            const my = pyOf(model.medianY);
            const tx = `median ${fx(model.medianX)}`;
            const ty = `median ${fy(model.medianY)}`;
            const wx = Math.ceil(tx.length * charW);
            const wy = Math.ceil(ty.length * charW);
            // The x median sits at the top-left of its line (top-right when the line is near the left edge); the y median above its line at the left end.
            const left = mx - 4 - wx >= plot.x0;
            const rx: LabelRect = { x: left ? mx - 4 - wx : mx + 4, y: plot.y0 + 1, w: wx, h: 12 };
            reserved.push(rx);
            medians.push({ text: tx, x: left ? mx - 4 : mx + 4, y: rx.y + 9, anchor: left ? 'end' : 'start' });
            const above = my - 15 >= plot.y0;
            const ry = above ? my - 15 : my + 3;
            let ryRect: LabelRect = { x: plot.x0 + 4, y: ry, w: wy, h: 12 };
            let anchor: 'start' | 'end' = 'start';
            if (ryRect.x < rx.x + rx.w + 2 && rx.x < ryRect.x + wy + 2 && ryRect.y < rx.y + rx.h + 2 && rx.y < ryRect.y + 12 + 2) {
                ryRect = { x: plot.x1 - 4 - wy, y: ry, w: wy, h: 12 };
                anchor = 'end';
            }
            reserved.push(ryRect);
            medians.push({ text: ty, x: anchor === 'start' ? ryRect.x : ryRect.x + wy, y: ry + 9, anchor });
        }
        const count = c.labels ? NAMED_MORE : NAMED_DEFAULT;
        const items = view.ranked.slice(0, count).map((p) => ({ ...dotOf.get(p.key)!, text: text(p) }));
        const labels = placeLabels(items, { x: 2, y: plot.y0, w: width - 4, h: plot.y1 - plot.y0 }, reserved, 24, dots);
        return { labels, medians };
    })();
    const tooltip = (p: TooltipContentProps<number, string>) => {
        if (!p.active || !p.payload?.length) return null;
        const pt = p.payload[0]?.payload as ScatterPoint | undefined;
        if (!pt) return null;
        return (
            <ChartTooltipCard
                title={text(pt)}
                rows={[
                    { key: 'x', label: xLabel, color: metricColor(c.x.id), value: fmtMetricValue(c.x.id, pt.x, { currency }) },
                    { key: 'y', label: yLabel, color: colour, value: fmtMetricValue(c.y.id, pt.y, { currency }) },
                    ...(c.size && pt.size !== null ? [{ key: 's', label: sizeLabel ?? '', color: metricColor(c.size.id), value: fmtMetricValue(c.size.id, pt.size, { currency }) }] : []),
                ]}
            />
        );
    };

    const summary = model && view
        ? `${model.points.length} ${dimLabel(c.dimension).toLowerCase()} values plotted. Median ${lowerLabel(xLabel)} ${fmtMetricValue(c.x.id, model.medianX, { currency })}, median ${lowerLabel(yLabel)} ${fmtMetricValue(c.y.id, model.medianY, { currency })}.${highlight ? ` ${view.inQuad.length} in the shaded quadrant: ${lowerLabel(quadrantText(highlight, c))}.` : ''}`
        : '';
    return (
        <WidgetFrame props={props}>
            {!frame ? null : !model || !view || !model.points.length ? (
                <EmptyState variant="inline" title={`No ${dimLabel(c.dimension).toLowerCase()} values with ${lowerLabel(xLabel)} and ${lowerLabel(yLabel)} in this period`} />
            ) : (
                <div className="flex h-full min-h-0 flex-col">
                    <div ref={box} role="group" aria-label={summary} className="relative min-h-0 flex-1">
                        {width > 0 ? (
                            <ScatterChart width={width} height={h} margin={MARGIN} accessibilityLayer>
                                <CartesianGrid stroke={GRID_STROKE} />
                                <XAxis type="number" dataKey="x" name={xLabel} height={X_AXIS_H} reversed={view.xAxis.reversed} scale={view.xAxis.scale} domain={view.xAxis.domain} ticks={view.xAxis.ticks} interval={0} tickFormatter={fx} tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} allowDataOverflow />
                                <YAxis type="number" dataKey="y" name={yLabel} width={Y_AXIS_W} reversed={view.yAxis.reversed} scale={view.yAxis.scale} domain={view.yAxis.domain} ticks={view.yAxis.ticks} interval={0} tickFormatter={fy} tick={AXIS_TICK} tickLine={false} axisLine={false} allowDataOverflow />
                                {highlight ? (
                                    <ReferenceArea
                                        x1={highlight[1] === 'r' ? model.medianX : view.xAxis.domain[0]} x2={highlight[1] === 'r' ? view.xAxis.domain[1] : model.medianX}
                                        y1={highlight[0] === 't' ? model.medianY : view.yAxis.domain[0]} y2={highlight[0] === 't' ? view.yAxis.domain[1] : model.medianY}
                                        fill="var(--color-brand)" fillOpacity={0.08} stroke="none" ifOverflow="hidden"
                                    />
                                ) : null}
                                {guides ? <ReferenceLine x={model.medianX} stroke="var(--color-fg-muted)" strokeDasharray="4 3" strokeOpacity={0.7} ifOverflow="hidden" /> : null}
                                {guides ? <ReferenceLine y={model.medianY} stroke="var(--color-fg-muted)" strokeDasharray="4 3" strokeOpacity={0.7} ifOverflow="hidden" /> : null}
                                <RTooltip content={tooltip} cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-chart-cursor)' }} isAnimationActive={false} />
                                <Scatter
                                    data={model.points}
                                    isAnimationActive={false}
                                    shape={(sp: { cx?: number; cy?: number; payload?: ScatterPoint }) => {
                                        const pt = sp.payload;
                                        if (!pt || sp.cx === undefined || sp.cy === undefined) return <g />;
                                        const hot = highlight ? quadrantOf(pt, model.medianX, model.medianY) === highlight : true;
                                        const r = pointRadius(pt.size, model.sizeMin, model.sizeMax);
                                        return (
                                            <g>
                                                <circle cx={sp.cx} cy={sp.cy} r={r} fill={colour} fillOpacity={hot ? 0.6 : 0.28} stroke={colour} strokeOpacity={hot ? 0.95 : 0.5} strokeWidth={hot && highlight ? 1.5 : 1} />
                                            </g>
                                        );
                                    }}
                                />
                            </ScatterChart>
                        ) : null}
                        {overlay ? (
                            <svg aria-hidden className="pointer-events-none absolute left-0 top-0" width={width} height={h}>
                                {overlay.medians.map((m) => <text key={m.text} x={m.x} y={m.y} textAnchor={m.anchor} fontSize={LABEL_FONT} fill="var(--color-fg-muted)" stroke="var(--color-surface)" strokeWidth={3} paintOrder="stroke">{m.text}</text>)}
                                {overlay.labels.map((l) => (
                                    <text key={l.key} x={l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x + l.w : l.x + l.w / 2} y={l.baseline} textAnchor={l.anchor} fontSize={LABEL_FONT} fill="var(--color-fg-secondary)" stroke="var(--color-surface)" strokeWidth={3} paintOrder="stroke">{l.text}</text>
                                ))}
                            </svg>
                        ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-caption text-fg-muted">
                        <span>X: <span className="text-fg-secondary">{xLabel}</span>{axisNote(c.xScale === 'log', view.xAxis.reversed, 'right')}</span>
                        <span>Y: <span className="text-fg-secondary">{yLabel}</span>{axisNote(c.yScale === 'log', view.yAxis.reversed, 'top')}</span>
                        {sizeLabel ? <span>Size: <span className="text-fg-secondary">{sizeLabel}</span></span> : null}
                    </div>
                    {highlight ? (
                        <p className="mt-1 line-clamp-2 text-meta text-fg-secondary" title={view.inQuad.map(text).join(', ')}>
                            <span className="font-medium text-fg">{view.inQuad.length}</span> shaded: {lowerLabel(quadrantText(highlight, c))}
                            {view.inQuad.length ? <span className="text-fg-muted"> · biggest: {view.inQuad.slice(0, 3).map(text).join(', ')}</span> : null}
                        </p>
                    ) : null}
                    <table className="sr-only">
                        <caption>{summary}</caption>
                        <thead><tr><th>{dimLabel(c.dimension)}</th><th>{xLabel}</th><th>{yLabel}</th>{sizeLabel ? <th>{sizeLabel}</th> : null}</tr></thead>
                        <tbody>
                            {[...model.points].sort((a, b) => (b.size ?? b.x) - (a.size ?? a.x)).slice(0, 25).map((p) => (
                                <tr key={p.key}>
                                    <th scope="row">{text(p)}</th>
                                    <td>{fmtMetricValue(c.x.id, p.x, { currency })}</td>
                                    <td>{fmtMetricValue(c.y.id, p.y, { currency })}</td>
                                    {c.size ? <td>{p.size === null ? '' : fmtMetricValue(c.size.id, p.size, { currency })}</td> : null}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </WidgetFrame>
    );
}
