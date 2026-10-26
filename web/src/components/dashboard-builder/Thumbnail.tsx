'use client';

/**
 * Wireframe thumbnail drawn from a layout (DESIGN.md 5.9, BUILDER.md 11.1): grey blocks with a
 * metric-colour mark, no stored images. Used by the dashboards list and the template gallery.
 */
import { metricColor } from '@/lib/builder/catalog';
import type { WidgetType } from '@/lib/builder/types';

export interface ThumbItem { x: number; y: number; w: number; h: number; type: WidgetType | string; metric?: string }

export function Thumbnail({ items, className }: { items: ThumbItem[]; className?: string }) {
    const rows = Math.max(12, items.reduce((m, i) => Math.max(m, i.y + i.h), 0));
    const W = 120;
    const unit = W / 12;
    const rowH = 4;
    const H = Math.max(56, Math.min(rows * rowH, 140));
    const scaleY = H / (rows * rowH);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet" className={className} aria-hidden>
            {items.slice(0, 40).map((it, i) => {
                const x = it.x * unit + 1;
                const y = it.y * rowH * scaleY + 1;
                const w = Math.max(2, it.w * unit - 2);
                const h = Math.max(2, it.h * rowH * scaleY - 2);
                const color = it.metric ? metricColor(it.metric) : 'var(--color-fg-faint)';
                const type = String(it.type);
                return (
                    <g key={i}>
                        {type === 'section' || type === 'text' ? (
                            <>
                                <rect x={x} y={y + h * 0.25} width={Math.min(w, 30)} height={Math.max(1.5, h * 0.18)} rx={0.8} fill="var(--color-border-strong)" />
                                {type === 'text' && h > 6 ? <rect x={x} y={y + h * 0.6} width={w * 0.7} height={1.2} rx={0.6} fill="var(--color-border)" /> : null}
                            </>
                        ) : (
                            <rect x={x} y={y} width={w} height={h} rx={1.6} fill="var(--color-surface)" stroke="var(--color-border-subtle)" strokeWidth={0.5} />
                        )}
                        {type === 'timeseries' ? (
                            <polyline fill="none" stroke={color} strokeWidth={0.9} strokeLinejoin="round" points={[0, 0.55, 0.15, 0.45, 0.3, 0.6, 0.45, 0.35, 0.6, 0.42, 0.75, 0.25, 0.9, 0.3].reduce<string[]>((acc, v, j, arr) => { if (j % 2 === 0) acc.push(`${x + 2 + arr[j] * (w - 4) / 0.9},${y + h * 0.25 + arr[j + 1] * h * 0.6}`); return acc; }, []).join(' ')} />
                        ) : type === 'bar' ? (
                            [0.9, 0.7, 0.55, 0.4, 0.3].map((f, j) => <rect key={j} x={x + 2} y={y + 3 + j * Math.max(2, (h - 6) / 5)} width={(w - 4) * f} height={Math.max(1, (h - 6) / 5 - 1)} rx={0.5} fill={color} opacity={0.35} />)
                        ) : type === 'pie' ? (
                            <circle cx={x + w / 2} cy={y + h / 2} r={Math.max(2, Math.min(w, h) / 3)} fill="none" stroke={color} strokeWidth={Math.max(1.2, Math.min(w, h) / 8)} opacity={0.6} />
                        ) : type === 'table' || type === 'portfolio-grid' ? (
                            Array.from({ length: Math.max(1, Math.min(6, Math.floor(h / 4))) }, (_, j) => <rect key={j} x={x + 2} y={y + 3 + j * 3.6} width={(w - 4) * (j === 0 ? 1 : 0.85)} height={1.2} rx={0.6} fill={j === 0 ? 'var(--color-border-strong)' : 'var(--color-border)'} />)
                        ) : type === 'geo' ? (
                            <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 3} ry={h / 4} fill={color} opacity={0.18} />
                        ) : type === 'scorecard' || type === 'kpi-strip' ? (
                            <>
                                <rect x={x + 2} y={y + h * 0.3} width={Math.min(w * 0.4, 14)} height={Math.max(1.5, h * 0.22)} rx={0.8} fill="var(--color-fg-faint)" opacity={0.6} />
                                <rect x={x + 2} y={y + h - 3} width={w - 4} height={1} rx={0.5} fill={color} />
                            </>
                        ) : null}
                    </g>
                );
            })}
        </svg>
    );
}
