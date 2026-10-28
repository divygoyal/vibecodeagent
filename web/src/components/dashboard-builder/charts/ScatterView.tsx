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
import { logTicks, lowerLabel, pointRadius, quadrantOf, quadrantText, shapeScatter, type ScatterPoint } from '@/lib/builder/charts/scatter';
import type { ScatterWidget } from '@/lib/builder/charts/types';
import { useBox } from './useBox';
import { okResult, WidgetFrame, type WidgetViewProps } from '../widgets/WidgetFrame';
import { dimText, plotHeight } from '../widgets/Charts';

const axisFormat = (id: string): AxisFormat => {
    const f = getMetric(id)?.format;
    return f === 'percent' || f === 'duration' || f === 'position' ? f : f === 'integer' ? 'count' : 'number';
};

interface Axis { domain: [number, number]; ticks: number[]; scale: 'linear' | 'log' }

function buildAxis(id: string, scale: 'linear' | 'log', min: number, max: number): Axis {
    if (scale === 'log' && min > 0) {
        const lo = min / 1.4;
        const hi = max * 1.4;
        return { domain: [lo, hi], ticks: logTicks(lo, hi), scale: 'log' };
    }
    const n = niceAxis(max, { format: axisFormat(id) });
    return { domain: n.domain, ticks: n.ticks, scale: 'linear' };
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
        return { xAxis, yAxis, inQuad: [...inQuad].sort(bySize), named: new Set([...model.points].sort(bySize).slice(0, 8).map((p) => p.key)) };
    })();

    // The plot fills the space the legend lines leave; before it is measured, estimate from the card height.
    const h = Math.max(120, boxH > 0 ? boxH : plotHeight(props.height, widget.showTitle !== false) - 52);
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
                    <div ref={box} role="group" aria-label={summary} className="min-h-0 flex-1">
                        {width > 0 ? (
                            <ScatterChart width={width} height={h} margin={{ top: 8, right: 14, bottom: 0, left: 0 }} accessibilityLayer>
                                <CartesianGrid stroke={GRID_STROKE} />
                                <XAxis type="number" dataKey="x" name={xLabel} scale={view.xAxis.scale} domain={view.xAxis.domain} ticks={view.xAxis.ticks} interval={0} tickFormatter={fx} tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} allowDataOverflow />
                                <YAxis type="number" dataKey="y" name={yLabel} width={46} scale={view.yAxis.scale} domain={view.yAxis.domain} ticks={view.yAxis.ticks} interval={0} tickFormatter={fy} tick={AXIS_TICK} tickLine={false} axisLine={false} allowDataOverflow />
                                {highlight ? (
                                    <ReferenceArea
                                        x1={highlight[1] === 'r' ? model.medianX : view.xAxis.domain[0]} x2={highlight[1] === 'r' ? view.xAxis.domain[1] : model.medianX}
                                        y1={highlight[0] === 't' ? model.medianY : view.yAxis.domain[0]} y2={highlight[0] === 't' ? view.yAxis.domain[1] : model.medianY}
                                        fill="var(--color-brand)" fillOpacity={0.08} stroke="none" ifOverflow="hidden"
                                    />
                                ) : null}
                                {guides ? <ReferenceLine x={model.medianX} stroke="var(--color-fg-muted)" strokeDasharray="4 3" strokeOpacity={0.7} ifOverflow="hidden" label={{ value: `median ${fx(model.medianX)}`, position: 'insideTopRight', fill: 'var(--color-fg-muted)', fontSize: 10 }} /> : null}
                                {guides ? <ReferenceLine y={model.medianY} stroke="var(--color-fg-muted)" strokeDasharray="4 3" strokeOpacity={0.7} ifOverflow="hidden" label={{ value: `median ${fy(model.medianY)}`, position: 'insideTopRight', fill: 'var(--color-fg-muted)', fontSize: 10 }} /> : null}
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
                                                {c.labels && view.named.has(pt.key) ? <text x={sp.cx + r + 3} y={sp.cy + 3} fontSize={10} fill="var(--color-fg-secondary)" stroke="var(--color-surface)" strokeWidth={3} paintOrder="stroke">{text(pt).slice(0, 24)}</text> : null}
                                            </g>
                                        );
                                    }}
                                />
                            </ScatterChart>
                        ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-caption text-fg-muted">
                        <span>Across: <span className="text-fg-secondary">{xLabel}</span>{c.xScale === 'log' ? ' (log scale)' : ''}</span>
                        <span>Up: <span className="text-fg-secondary">{yLabel}</span>{c.yScale === 'log' ? ' (log scale)' : ''}</span>
                        {sizeLabel ? <span>Size: <span className="text-fg-secondary">{sizeLabel}</span></span> : null}
                    </div>
                    {highlight ? (
                        <p className="mt-1 truncate text-meta text-fg-secondary" title={view.inQuad.map(text).join(', ')}>
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
