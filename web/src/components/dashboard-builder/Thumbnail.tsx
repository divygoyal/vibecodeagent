'use client';

/**
 * Wireframe thumbnail drawn from a layout (DESIGN.md 5.9, BUILDER.md 11.1): blocks with a
 * metric-colour mark, no stored images. Template thumbnails pass `values` (normalised demo-data
 * shapes from lib/builder/templatePreviews.json, made by tests/builder/gen-template-previews.ts).
 */
import { metricColor } from '@/lib/builder/catalog';
import type { WidgetType } from '@/lib/builder/types';
import { chartThumb } from './charts/ChartThumb';

export interface ThumbItem { x: number; y: number; w: number; h: number; type: WidgetType | string; metric?: string; values?: number[] }

function linePoints(values: number[], x: number, y: number, w: number, h: number): string {
    const n = values.length;
    return values.map((v, j) => `${(x + (j / Math.max(1, n - 1)) * w).toFixed(1)},${(y + h - Math.max(0, Math.min(1, v)) * h).toFixed(1)}`).join(' ');
}

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
                        {it.values?.length && (type === 'timeseries' || type === 'scorecard' || type === 'kpi-strip') ? (
                            <>
                                {type !== 'timeseries' ? <rect x={x + 2} y={y + 2.5} width={Math.min(w * 0.4, 14)} height={Math.max(1.5, h * 0.16)} rx={0.8} fill="var(--color-fg-faint)" opacity={0.6} /> : null}
                                <polygon points={`${x + 2},${y + h - 1.5} ${linePoints(it.values, x + 2, y + (type === 'timeseries' ? h * 0.2 : h * 0.45), w - 4, type === 'timeseries' ? h * 0.7 : h * 0.45)} ${x + w - 2},${y + h - 1.5}`} fill={color} opacity={0.12} />
                                <polyline fill="none" stroke={color} strokeWidth={0.8} strokeLinejoin="round" points={linePoints(it.values, x + 2, y + (type === 'timeseries' ? h * 0.2 : h * 0.45), w - 4, type === 'timeseries' ? h * 0.7 : h * 0.45)} />
                            </>
                        ) : it.values?.length && (type === 'bar' || type === 'table' || type === 'geo' || type === 'portfolio-grid') ? (
                            it.values.slice(0, 6).map((f, j) => <rect key={j} x={x + 2} y={y + 3 + j * Math.max(2, (h - 6) / 6)} width={Math.max(1, (w - 4) * Math.max(0.04, f))} height={Math.max(1, (h - 6) / 6 - 1)} rx={0.5} fill={color} opacity={0.35} />)
                        ) : it.values?.length && type === 'pie' ? (
                            (() => {
                                const r = Math.max(2, Math.min(w, h) / 3);
                                const cx = x + w / 2;
                                const cy = y + h / 2;
                                const total = it.values.reduce((a, b) => a + b, 0) || 1;
                                const c = 2 * Math.PI * r;
                                let off = 0;
                                const cols = ['var(--color-cat-1)', 'var(--color-cat-2)', 'var(--color-cat-3)', 'var(--color-cat-4)', 'var(--color-cat-5)', 'var(--color-cat-other)'];
                                return it.values.map((v, j) => {
                                    const len = (v / total) * c;
                                    const el = <circle key={j} cx={cx} cy={cy} r={r} fill="none" stroke={cols[j] ?? cols[5]} strokeWidth={Math.max(1.2, r / 2.4)} strokeDasharray={`${Math.max(0, len - 0.4)} ${c}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`} />;
                                    off += len;
                                    return el;
                                });
                            })()
                        ) : type === 'timeseries' ? (
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
                        ) : chartThumb(type, x, y, w, h, color)}
                    </g>
                );
            })}
        </svg>
    );
}
