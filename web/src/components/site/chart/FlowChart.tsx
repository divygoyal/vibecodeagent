'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/cn';
import { useElementWidth } from '@/components/charts/useElementWidth';
import { clipLabel } from '../lib/clipLabel';

/**
 * A small column flow chart (Sankey) drawn as plain SVG (round 5, Traffic › Journeys). Columns are fixed
 * (channel -> landing page -> next step), so the layout is simple: nodes stacked per column on one shared scale,
 * links as bands whose width is their value. Hover a node or a band to isolate its flows; every band and node
 * has a native tooltip with the exact numbers. Colours are CSS variables, so both themes work.
 */
export interface FlowChartNode {
    id: string;
    col: number;
    label: string;
    /** Tooltip text (full path, title). */
    title?: string;
    color: string;
    value: number;
}

export interface FlowChartLink {
    source: string;
    target: string;
    value: number;
    color: string;
}

interface Placed extends FlowChartNode { x: number; y: number; h: number }
interface PlacedLink extends FlowChartLink { sy: number; ty: number; w: number; x0: number; x1: number }

const NODE_W = 10;
const GAP = 10;
const CHAR_W = 6.6;

export { clipLabel };

export function FlowChart({ nodes, links, columns, height = 380, format, unit, ariaLabel, className }: {
    nodes: FlowChartNode[];
    links: FlowChartLink[];
    /** Column headings, left to right. */
    columns: string[];
    height?: number;
    format: (n: number) => string;
    /** "sessions", "clicks": tooltips. */
    unit: string;
    ariaLabel: string;
    className?: string;
}) {
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [hover, setHover] = useState<string | null>(null);
    const cols = columns.length;
    const layout = useMemo(() => {
        if (!width) return null;
        // Room for the labels left of the first column and right of the last; middle labels sit on the bands.
        const side = Math.min(230, Math.max(110, width * 0.19));
        const top = 26;
        const plotH = height - top - 4;
        const innerW = width - side * 2;
        const xOf = (c: number) => side + (cols > 1 ? (c * (innerW - NODE_W)) / (cols - 1) : 0);
        const byCol = Array.from({ length: cols }, (_, c) => nodes.filter((n) => n.col === c));
        const size = new Map<string, number>();
        for (const n of nodes) {
            const inSum = links.filter((l) => l.target === n.id).reduce((a, l) => a + l.value, 0);
            const outSum = links.filter((l) => l.source === n.id).reduce((a, l) => a + l.value, 0);
            size.set(n.id, Math.max(n.value, inSum, outSum));
        }
        const k = Math.min(...byCol.map((list) => {
            const sum = list.reduce((a, n) => a + (size.get(n.id) ?? 0), 0);
            return sum > 0 ? (plotH - GAP * Math.max(0, list.length - 1)) / sum : Infinity;
        }));
        const scale = Number.isFinite(k) ? k : 0;
        const placed = new Map<string, Placed>();
        byCol.forEach((list, c) => {
            const colH = list.reduce((a, n) => a + Math.max(2, (size.get(n.id) ?? 0) * scale), 0) + GAP * Math.max(0, list.length - 1);
            let y = top + Math.max(0, (plotH - colH) / 2);
            for (const n of list) {
                const h = Math.max(2, (size.get(n.id) ?? 0) * scale);
                placed.set(n.id, { ...n, x: xOf(c), y, h });
                y += h + GAP;
            }
        });
        // Bands leave a node in the order of their targets and enter in the order of their sources (fewer crossings).
        const outOff = new Map<string, number>();
        const inOff = new Map<string, number>();
        const sorted = [...links].filter((l) => placed.has(l.source) && placed.has(l.target) && l.value > 0)
            .sort((a, b) => placed.get(a.source)!.y - placed.get(b.source)!.y || placed.get(a.target)!.y - placed.get(b.target)!.y);
        const out: PlacedLink[] = [];
        for (const l of [...sorted].sort((a, b) => placed.get(a.target)!.y - placed.get(b.target)!.y)) {
            const s = placed.get(l.source)!;
            const w = Math.max(1, l.value * scale);
            const so = outOff.get(l.source) ?? 0;
            outOff.set(l.source, so + w);
            out.push({ ...l, sy: s.y + so + w / 2, ty: 0, w, x0: s.x + NODE_W, x1: placed.get(l.target)!.x });
        }
        for (const pl of [...out].sort((a, b) => placed.get(a.source)!.y - placed.get(b.source)!.y || a.sy - b.sy)) {
            const t = placed.get(pl.target)!;
            const to = inOff.get(pl.target) ?? 0;
            inOff.set(pl.target, to + pl.w);
            pl.ty = t.y + to + pl.w / 2;
        }
        return { placed: [...placed.values()], links: out, side, xOf, top };
    }, [width, nodes, links, cols, height]);

    const related = useMemo(() => {
        if (!hover || !layout) return null;
        const set = new Set<string>([hover]);
        for (const l of layout.links) {
            const id = `${l.source}>${l.target}`;
            if (hover === id) { set.add(l.source); set.add(l.target); set.add(id); }
            if (l.source === hover || l.target === hover) { set.add(id); set.add(l.source); set.add(l.target); }
        }
        return set;
    }, [hover, layout]);

    const nodeVal = (id: string) => nodes.find((n) => n.id === id);
    return (
        <div ref={ref} className={cn('relative w-full', className)} style={{ height }}>
            {layout ? (
                <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
                    {columns.map((c, i) => {
                        const x = layout.xOf(i);
                        const anchor = i === 0 ? 'end' : 'start';
                        return (
                            <text key={c} x={i === 0 ? x + NODE_W : x} y={12} textAnchor={anchor} className="fill-fg-muted text-[11px] font-medium uppercase tracking-wide">
                                {c}
                            </text>
                        );
                    })}
                    <g fill="none">
                        {layout.links.map((l) => {
                            const id = `${l.source}>${l.target}`;
                            const mx = (l.x0 + l.x1) / 2;
                            const dim = related && !related.has(id);
                            return (
                                <path
                                    key={id}
                                    d={`M${l.x0},${l.sy} C${mx},${l.sy} ${mx},${l.ty} ${l.x1},${l.ty}`}
                                    stroke={l.color}
                                    strokeWidth={l.w}
                                    strokeOpacity={dim ? 0.06 : related ? 0.55 : 0.3}
                                    onMouseEnter={() => setHover(id)}
                                    onMouseLeave={() => setHover(null)}
                                    style={{ transition: 'stroke-opacity 120ms' }}
                                >
                                    <title>{`${nodeVal(l.source)?.title ?? nodeVal(l.source)?.label} → ${nodeVal(l.target)?.title ?? nodeVal(l.target)?.label}: ${format(l.value)} ${unit}`}</title>
                                </path>
                            );
                        })}
                    </g>
                    {layout.placed.map((n) => {
                        const dim = related && !related.has(n.id);
                        const first = n.col === 0;
                        const last = n.col === cols - 1;
                        // Middle labels sit on the bands: most of the gap to the next column, on a surface-coloured box.
                        const room = first || last ? layout.side - 12 : Math.max(60, (layout.xOf(n.col + 1) - layout.xOf(n.col)) * 0.78);
                        const value = format(n.value);
                        const maxChars = Math.max(6, Math.floor((room - value.length * CHAR_W - 8) / CHAR_W));
                        const tx = first ? n.x - 6 : n.x + NODE_W + 6;
                        const cy = n.y + n.h / 2;
                        const text = clipLabel(n.label, maxChars);
                        const boxW = (text.length + value.length) * CHAR_W + 14;
                        return (
                            <g key={n.id} opacity={dim ? 0.35 : 1} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} style={{ transition: 'opacity 120ms' }}>
                                <title>{`${n.title ?? n.label}: ${format(n.value)} ${unit}`}</title>
                                <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={2} fill={n.color} />
                                {(n.h >= 9 || first || last) && !first && !last ? (
                                    <rect aria-hidden x={tx - 4} y={cy - 9} width={boxW} height={18} rx={4} fill="var(--color-surface)" fillOpacity={0.92} />
                                ) : null}
                                {n.h >= 9 || first || last ? (
                                    <text x={tx} y={cy} dy="0.35em" textAnchor={first ? 'end' : 'start'} className="text-[12px]">
                                        <tspan className="fill-fg">{text}</tspan>
                                        <tspan className="fill-fg-muted tabular-nums" dx={6}>{value}</tspan>
                                    </text>
                                ) : null}
                            </g>
                        );
                    })}
                </svg>
            ) : null}
        </div>
    );
}
