'use client';

/**
 * Treemap widget (round 9): boxes sized by one additive metric, optionally grouped (channel, then source).
 * The layout is computed in lib/builder/charts/treemap.ts (squarified) and drawn as absolutely positioned
 * boxes inside nested lists, so screen readers get the groups and values as text and PDF / TV render it
 * like any card. Boxes keep dark text on a light tint of the colour: it works on the light and dark card.
 */
import { useState } from 'react';

import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui';
import { fmtPercent } from '@/lib/format';
import { CATEGORICAL, CATEGORICAL_OTHER, channelColor, deviceColor } from '@/lib/metrics';
import { dimLabel, fmtMetricValue, metricColor, metricLabel } from '@/lib/builder/catalog';
import { heatLevel, heatThresholds } from '@/lib/builder/charts/heatmap';
import { groupLabel, layoutTreemap, shapeTreemap, tileLabel, type TreemapNode } from '@/lib/builder/charts/treemap';
import type { TreemapWidget } from '@/lib/builder/charts/types';
import { useBox } from './useBox';
import { okResult, WidgetFrame, type WidgetViewProps } from '../widgets/WidgetFrame';
import { dimText } from '../widgets/Charts';

const pct = (v: number) => fmtPercent(v, { tile: true });
const mix = (color: string, p: number) => `color-mix(in oklab, ${color} ${p}%, var(--color-surface))`;

function groupColor(dim: string | undefined, value: string, index: number): string {
    if (dim === 'channel') {
        const c = channelColor(value);
        return c === CATEGORICAL_OTHER ? CATEGORICAL[index] ?? CATEGORICAL_OTHER : c;
    }
    if (dim === 'device') return deviceColor(value);
    return CATEGORICAL[index] ?? CATEGORICAL_OTHER;
}

export function TreemapView(props: WidgetViewProps<TreemapWidget>) {
    const { widget, result } = props;
    const ok = okResult(result);
    const frame = ok?.parts.rows;
    const c = widget.config;
    const [boxRef, box] = useBox<HTMLDivElement>();
    const [hover, setHover] = useState<{ group: string; node: TreemapNode } | null>(null);
    const currency = ok?.flags.currency;
    const fmt = (v: number) => fmtMetricValue(c.metric.id, v, { currency });
    const label = c.metric.label || metricLabel(c.metric.id);
    const model = frame ? shapeTreemap(frame.rows, c) : null;
    const grouped = Boolean(c.parent && c.parent !== c.dimension);
    const laid = model && box.w > 0 && box.h > 0 ? layoutTreemap(model, box.w, box.h) : [];
    const thresholds = model ? heatThresholds(model.groups.flatMap((g) => g.leaves.map((l) => l.amount))) : [];
    const leafName = (n: { value: string }, other?: boolean) => (other ? 'Other' : dimText(c.dimension, n.value, frame?.labels));
    const groupName = (parent: string | null) => dimText(c.parent ?? '', parent ?? '', frame?.labels);

    const fillOf = (n: TreemapNode, parent: string | null): string => {
        if (n.other) return 'var(--color-subtle)';
        if (c.colorBy === 'value') return mix(metricColor(c.metric.id), [0, 24, 34, 44, 54, 64][Math.max(1, heatLevel(n.amount, thresholds))]);
        if (grouped) return mix(groupColor(c.parent, parent ?? '', n.group), Math.round(60 - (n.rank / Math.max(1, n.groupSize - 1)) * 28));
        return mix(groupColor(c.dimension, n.value, n.group === 0 ? n.rank : n.group), 52);
    };

    const truncated = Boolean(frame?.truncated) && (frame?.rowCount ?? 0) > (model?.leafCount ?? 0);
    const footnote = truncated && model ? { node: `Top ${model.leafCount} of ${(frame?.rowCount ?? 0).toLocaleString('en-US')} ${dimLabel(c.dimension).toLowerCase()} values`, text: `Top ${model.leafCount} of ${(frame?.rowCount ?? 0).toLocaleString('en-US')} ${dimLabel(c.dimension).toLowerCase()} values` } : undefined;
    const summary = model ? `${label} by ${grouped ? `${dimLabel(c.parent!).toLowerCase()} and ` : ''}${dimLabel(c.dimension).toLowerCase()}: ${fmt(model.total)} in ${model.leafCount} boxes.` : '';

    return (
        <WidgetFrame props={props} footnote={footnote}>
            {!frame ? null : !model || !model.leafCount ? (
                <EmptyState variant="inline" title={`No ${label.toLowerCase()} in this period`} />
            ) : (
                <div className="flex h-full min-h-0 flex-col">
                    <div ref={boxRef} className="relative min-h-0 flex-1" onMouseLeave={() => setHover(null)}>
                        {laid.length ? (
                            <ul aria-label={summary} className="absolute inset-0 m-0 list-none p-0">
                                {laid.map((g) => (
                                    <li key={g.key || 'all'} className="absolute" style={{ left: g.x, top: g.y, width: g.w, height: g.h, padding: 1 }}>
                                        <div className="relative h-full w-full overflow-hidden" style={grouped ? { borderRadius: 5, background: mix(groupColor(c.parent, g.parent ?? '', g.index), 14) } : undefined}>
                                            {grouped ? (
                                                <p className={cn('truncate px-1.5 text-caption font-medium text-fg-secondary', g.header ? 'leading-[18px]' : 'sr-only')} style={g.header ? { height: g.header } : undefined} title={`${groupName(g.parent)} · ${pct(g.share)}`}>
                                                    {g.header ? groupLabel(g.w - 2, groupName(g.parent), pct(g.share)) : groupName(g.parent)}
                                                </p>
                                            ) : null}
                                            <ul className="m-0 list-none p-0" aria-label={grouped ? `${groupName(g.parent)}: ${fmt(g.amount)}` : undefined}>
                                                {g.leaves.map((n) => {
                                                    const name = leafName(n, n.other);
                                                    const lab = tileLabel(n.w, n.h, name, fmt(n.amount), pct(n.share), c.showValues);
                                                    const text = `${grouped ? `${groupName(g.parent)} › ` : ''}${name}: ${fmt(n.amount)} (${pct(n.share)} of ${fmt(model.total)})`;
                                                    return (
                                                        <li
                                                            key={n.key}
                                                            title={text}
                                                            onMouseEnter={() => setHover({ group: groupName(g.parent), node: n })}
                                                            onClick={() => setHover({ group: groupName(g.parent), node: n })}
                                                            className={cn('absolute overflow-hidden rounded-[4px] px-1.5 py-1 text-fg', hover?.node.key === n.key && 'ring-2 ring-inset ring-fg/60')}
                                                            style={{ left: n.x, top: n.y, width: Math.max(0, n.w - 2), height: Math.max(0, n.h - 2), background: fillOf(n, g.parent) }}
                                                        >
                                                            <span className="sr-only">{text}</span>
                                                            {lab.name ? <span aria-hidden className="block truncate text-caption font-medium leading-tight">{lab.name}</span> : null}
                                                            {lab.name && lab.detail ? <span aria-hidden className="block truncate text-caption tabular-nums text-fg-secondary">{lab.detail}</span> : null}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                    <p className="mt-2 h-4 truncate text-meta text-fg-muted tabular-nums" aria-live="polite">
                        {hover ? (
                            <><span className="text-fg-secondary">{hover.group ? `${hover.group} › ` : ''}{leafName(hover.node, hover.node.other)}:</span> <span className="font-medium text-fg">{fmt(hover.node.amount)}</span> · {pct(hover.node.share)}</>
                        ) : (
                            <>Total <span className="font-medium text-fg-secondary">{fmt(model.total)}</span> {label.toLowerCase()}</>
                        )}
                    </p>
                </div>
            )}
        </WidgetFrame>
    );
}
