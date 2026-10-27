'use client';

import { useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { area as d3area, curveMonotoneX, line as d3line } from 'd3-shape';

import { cn } from '@/lib/cn';
import { fmtDay } from '@/lib/format';
import { fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';

export interface SparklineSeries {
    metric: MetricKey;
    /** One value per date; null = gap (the line breaks). */
    values: (number | null)[];
    /** Override the tooltip label. */
    label?: string;
}

export interface SparklineProps {
    /** 1 or 2 series. The second draws on top of the first. */
    series: SparklineSeries[];
    /** 'YYYY-MM-DD' per index, for the hover tooltip. */
    dates?: string[];
    /** 72 portfolio card · 56 mobile card · 40 KPI tile · 28 table cell. */
    height?: number;
    /** Soft area under the first series (default) or none. */
    area?: 'first' | 'none';
    /** Hover cursor, dots and mini tooltip. Default: true when height >= 56. Touch never hovers. */
    interactive?: boolean;
    className?: string;
}

const VB_W = 300;

/**
 * Hand-rolled SVG sparkline (DESIGN 3.6): d3-shape monotone curves, each series
 * on its own zero-based scale (max x 1.08), soft gradient under the first
 * series. Light enough for 500 cards. aria-hidden: the card's text carries the
 * numbers.
 */
export function Sparkline({ series, dates, height = 72, area = 'first', interactive, className }: SparklineProps) {
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const wrap = useRef<HTMLDivElement>(null);
    const [hover, setHover] = useState<{ index: number; px: number; width: number } | null>(null);
    const isInteractive = interactive ?? height >= 56;
    const n = Math.max(0, ...series.map((s) => s.values.length));
    const pad = 2;
    const stroke = height <= 32 ? 1.25 : 1.5;

    const shapes = useMemo(() => {
        const x = (i: number) => (n > 1 ? (i / (n - 1)) * VB_W : VB_W / 2);
        return series.slice(0, 2).map((s, si) => {
            const max = Math.max(0, ...s.values.map((v) => (v === null || !Number.isFinite(v) ? 0 : v)));
            const top = max > 0 ? max * 1.08 : 1;
            const y = (v: number) => height - pad - (v / top) * (height - pad * 2);
            const defined = (v: number | null) => v !== null && Number.isFinite(v);
            const line = d3line<number | null>().defined(defined).x((_, i) => x(i)).y((v) => y(v as number)).curve(curveMonotoneX);
            const fill = si === 0 && area === 'first'
                ? d3area<number | null>().defined(defined).x((_, i) => x(i)).y0(height).y1((v) => y(v as number)).curve(curveMonotoneX)(s.values)
                : null;
            return { line: line(s.values) ?? '', fill, y, color: METRICS[s.metric].color };
        });
    }, [series, n, height, area]);

    const onMove = (e: PointerEvent<HTMLDivElement>) => {
        if (!isInteractive || e.pointerType !== 'mouse' || n === 0) return;
        const rect = wrap.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        const rel = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const index = n > 1 ? Math.round(rel * (n - 1)) : 0;
        setHover({ index, px: n > 1 ? (index / (n - 1)) * rect.width : rect.width / 2, width: rect.width });
    };

    const hoverRows = hover
        ? series.slice(0, 2).map((s, si) => ({
            key: si,
            color: METRICS[s.metric].color,
            label: s.label ?? METRICS[s.metric].label,
            value: s.values[hover.index],
            metric: s.metric,
            y: s.values[hover.index] === null || s.values[hover.index] === undefined ? null : shapes[si].y(s.values[hover.index] as number),
        }))
        : [];
    const flip = hover ? hover.px > hover.width - 170 : false;

    return (
        <div
            ref={wrap}
            className={cn('relative w-full', className)}
            style={{ height }}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
        >
            <svg aria-hidden width="100%" height={height} viewBox={`0 0 ${VB_W} ${height}`} preserveAspectRatio="none" className="block overflow-visible">
                {shapes[0]?.fill ? (
                    <>
                        <defs>
                            <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={shapes[0].color} style={{ stopOpacity: 'var(--tc-chart-fill-top)' }} />
                                <stop offset="100%" stopColor={shapes[0].color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <path d={shapes[0].fill} fill={`url(#spark-${uid})`} />
                    </>
                ) : null}
                {shapes.map((s, i) => (
                    <path
                        key={i}
                        d={s.line}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
                {hover ? (
                    <line
                        x1={n > 1 ? (hover.index / (n - 1)) * VB_W : VB_W / 2}
                        x2={n > 1 ? (hover.index / (n - 1)) * VB_W : VB_W / 2}
                        y1={0}
                        y2={height}
                        stroke="var(--color-chart-cursor)"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                    />
                ) : null}
            </svg>
            {n === 1
                ? shapes.map((s, i) => (
                    <span key={i} aria-hidden className="absolute size-1.5 -translate-1/2 rounded-full" style={{ left: '50%', top: s.y((series[i].values[0] ?? 0) as number), background: s.color }} />
                ))
                : null}
            {hover ? (
                <>
                    {hoverRows.map((r) => (r.y === null ? null : (
                        <span
                            key={r.key}
                            aria-hidden
                            className="pointer-events-none absolute size-1.5 -translate-1/2 rounded-full ring-2 ring-surface"
                            style={{ left: hover.px, top: r.y, background: r.color }}
                        />
                    )))}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute z-10 min-w-[150px] rounded-popover border border-border-subtle bg-surface-raised p-2.5 shadow-popover"
                        style={{ left: flip ? hover.px - 12 : hover.px + 12, top: 0, transform: flip ? 'translateX(-100%)' : undefined }}
                    >
                        {dates?.[hover.index] ? <p className="mb-1 text-meta text-fg-muted">{fmtDay(dates[hover.index])}</p> : null}
                        {hoverRows.map((r) => (
                            <p key={r.key} className="flex items-center gap-2 text-body-sm">
                                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
                                <span className="text-fg-secondary">{r.label}</span>
                                <span className="ml-auto pl-2 font-semibold text-fg tabular-nums">{fmtMetric(r.metric, r.value)}</span>
                            </p>
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
}
