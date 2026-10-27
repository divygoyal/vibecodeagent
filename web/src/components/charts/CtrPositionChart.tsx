'use client';

/**
 * CTR vs average position for search queries, against the usual CTR at each
 * position (dashed curve). Dots below the curve's 70% line are highlighted:
 * those queries get fewer clicks than results at that position normally do,
 * which usually means the title or snippet loses the click. Dot size follows
 * impressions. Hover for the numbers; click to open the query.
 */
import { useMemo, useState } from 'react';

import { cn } from '@/lib/cn';
import { fmtFull, fmtPercent, fmtPosition } from '@/lib/format';
import { niceTicks } from './chartScales';
import { useElementWidth } from './useElementWidth';

export interface CtrPoint {
    key: string;
    label: string;
    position: number;
    ctr: number;
    impressions: number;
    clicks: number;
    /** Usual CTR at this position (ratio). */
    expected: number;
    under: boolean;
}

export interface CtrPositionChartProps {
    points: CtrPoint[];
    /** Usual CTR by position (ratio). */
    curve: (position: number) => number;
    /** Highest position shown (default 20, two result pages). */
    maxPosition?: number;
    height?: number;
    /** Colour for normal dots (CSS var). */
    color: string;
    onPointClick?: (key: string) => void;
    className?: string;
}

const M = { top: 10, right: 12, bottom: 26, left: 44 };

export function CtrPositionChart({ points, curve, maxPosition = 20, height = 300, color, onPointClick, className }: CtrPositionChartProps) {
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [hover, setHover] = useState<CtrPoint | null>(null);
    const shown = useMemo(() => points.filter((p) => p.position >= 1 && p.position <= maxPosition && p.impressions > 0), [points, maxPosition]);
    const h = width > 0 && width < 640 ? Math.min(height, 240) : height;

    const scales = useMemo(() => {
        const ctrs = shown.map((p) => p.ctr).sort((a, b) => a - b);
        const p95 = ctrs.length ? ctrs[Math.min(ctrs.length - 1, Math.floor(ctrs.length * 0.95))] : 0;
        const yTicks = niceTicks(Math.min(1, Math.max(curve(1) * 1.1, p95)), 4);
        const yMax = yTicks[yTicks.length - 1];
        const iw = Math.max(1, width - M.left - M.right);
        const ih = Math.max(1, h - M.top - M.bottom);
        const x = (pos: number) => M.left + ((pos - 1) / (maxPosition - 1)) * iw;
        const y = (ctr: number) => M.top + ih - (Math.min(ctr, yMax) / yMax) * ih;
        const maxImpr = Math.max(1, ...shown.map((p) => p.impressions));
        const r = (impr: number) => 2.5 + 6.5 * Math.sqrt(impr / maxImpr);
        const curvePath = Array.from({ length: (maxPosition - 1) * 4 + 1 }, (_, i) => 1 + i / 4)
            .map((pos, i) => `${i ? 'L' : 'M'}${x(pos).toFixed(1)},${y(curve(pos)).toFixed(1)}`).join('');
        const floorPath = Array.from({ length: (maxPosition - 1) * 4 + 1 }, (_, i) => 1 + i / 4)
            .map((pos, i) => `${i ? 'L' : 'M'}${x(pos).toFixed(1)},${y(curve(pos) * 0.7).toFixed(1)}`).join('');
        return { x, y, r, yTicks, yMax, curvePath, floorPath, iw, ih };
    }, [shown, width, h, curve, maxPosition]);

    const xTicks = [1, 5, 10, 15, 20].filter((t) => t <= maxPosition);
    // Draw big dots first so small ones stay visible; under-performers on top.
    const order = useMemo(() => [...shown].sort((a, b) => (a.under === b.under ? b.impressions - a.impressions : a.under ? 1 : -1)), [shown]);

    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - box.left;
        const my = e.clientY - box.top;
        let best: CtrPoint | null = null;
        let bestD = 18 * 18;
        for (const p of shown) {
            const dx = scales.x(p.position) - mx;
            const dy = scales.y(p.ctr) - my;
            const d = dx * dx + dy * dy;
            if (d < bestD) {
                best = p;
                bestD = d;
            }
        }
        setHover(best);
    };

    const under = shown.filter((p) => p.under).length;
    return (
        <div ref={ref} className={cn('relative w-full min-w-0', className)}>
            {width <= 0 ? <div className="skeleton w-full rounded-md" style={{ height: h }} /> : (
                <svg
                    width={width}
                    height={h}
                    role="img"
                    aria-label={`CTR by average position for ${shown.length} queries; ${under} get fewer clicks than usual for their position.`}
                    onMouseMove={onMove}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => hover && onPointClick?.(hover.key)}
                    className={cn('block', hover && onPointClick && 'cursor-pointer')}
                >
                    {scales.yTicks.map((t) => (
                        <g key={t}>
                            <line x1={M.left} x2={width - M.right} y1={scales.y(t)} y2={scales.y(t)} stroke="var(--color-chart-grid)" />
                            <text x={M.left - 8} y={scales.y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-chart-tick)">{fmtPercent(t, { tile: true })}</text>
                        </g>
                    ))}
                    {xTicks.map((t) => (
                        <text key={t} x={scales.x(t)} y={h - 6} textAnchor="middle" fontSize={11} fill="var(--color-chart-tick)">{t}</text>
                    ))}
                    <text x={width - M.right} y={h - 6} textAnchor="end" fontSize={11} fill="var(--color-chart-tick)" className="max-sm:hidden">position →</text>
                    {scales.x(10.5) < width - M.right ? (
                        <line x1={scales.x(10.5)} x2={scales.x(10.5)} y1={M.top} y2={M.top + scales.ih} stroke="var(--color-chart-axis)" strokeDasharray="2 3" />
                    ) : null}
                    <text x={scales.x(10.5) + 4} y={M.top + 10} fontSize={10} fill="var(--color-fg-muted)">page 2</text>
                    <path d={scales.floorPath} fill="none" stroke="var(--color-down)" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 3" />
                    <path d={scales.curvePath} fill="none" stroke="var(--color-fg-muted)" strokeWidth={1.5} strokeDasharray="5 4" />
                    {order.map((p) => (
                        <circle
                            key={p.key}
                            cx={scales.x(p.position)}
                            cy={scales.y(p.ctr)}
                            r={scales.r(p.impressions)}
                            fill={p.under ? 'var(--color-down)' : color}
                            fillOpacity={p.under ? 0.7 : 0.28}
                            stroke={hover?.key === p.key ? 'var(--color-fg)' : p.under ? 'var(--color-down)' : 'none'}
                            strokeWidth={hover?.key === p.key ? 1.5 : 0.75}
                        />
                    ))}
                </svg>
            )}
            {hover ? (
                <div
                    className="pointer-events-none absolute z-10 w-60 rounded-popover border border-border-subtle bg-surface-raised p-3 text-meta shadow-popover"
                    style={{ left: Math.max(0, Math.min(width - 248, scales.x(hover.position) + 12)), top: Math.max(0, scales.y(hover.ctr) - 70) }}
                >
                    <p className="truncate text-body-sm font-medium text-fg">{hover.label}</p>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
                        <dt className="text-fg-muted">Position</dt><dd className="text-right text-fg">{fmtPosition(hover.position)}</dd>
                        <dt className="text-fg-muted">CTR</dt><dd className={cn('text-right font-medium', hover.under ? 'text-down' : 'text-fg')}>{fmtPercent(hover.ctr)}</dd>
                        <dt className="text-fg-muted">Usual CTR</dt><dd className="text-right text-fg">{fmtPercent(hover.expected)}</dd>
                        <dt className="text-fg-muted">Impressions</dt><dd className="text-right text-fg">{fmtFull(hover.impressions)}</dd>
                        <dt className="text-fg-muted">Clicks</dt><dd className="text-right text-fg">{fmtFull(hover.clicks)}</dd>
                    </dl>
                </div>
            ) : null}
        </div>
    );
}

export default CtrPositionChart;
