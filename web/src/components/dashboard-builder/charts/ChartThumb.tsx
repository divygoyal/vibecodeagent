import type { ReactNode } from 'react';

/**
 * Wireframe marks of the round 9 chart widgets for the template gallery and outline thumbnails
 * (Thumbnail.tsx draws the card; this draws what is inside it). Null for any other type.
 */
export function chartThumb(type: string, x: number, y: number, w: number, h: number, color: string): ReactNode {
    switch (type) {
        case 'heatmap': {
            const cols = Math.max(4, Math.min(12, Math.floor((w - 4) / 3)));
            const rows = Math.max(3, Math.min(7, Math.floor((h - 4) / 3)));
            const cw = (w - 4) / cols;
            const ch = (h - 4) / rows;
            return Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const v = (Math.sin(r * 1.7 + c * 0.9) + Math.cos(c * 0.5 - r)) / 4 + 0.5;
                return <rect key={i} x={x + 2 + c * cw} y={y + 2 + r * ch} width={Math.max(1, cw - 0.6)} height={Math.max(1, ch - 0.6)} rx={0.4} fill={color} opacity={0.12 + Math.max(0, Math.min(1, v)) * 0.7} />;
            });
        }
        case 'scatter': {
            const pts = [[0.2, 0.7, 2], [0.35, 0.45, 1.4], [0.5, 0.6, 1.8], [0.62, 0.3, 2.6], [0.75, 0.5, 1.2], [0.85, 0.2, 2.2], [0.28, 0.25, 1], [0.7, 0.75, 1.5]];
            return (
                <>
                    <line x1={x + w / 2} y1={y + 2} x2={x + w / 2} y2={y + h - 2} stroke="var(--color-fg-faint)" strokeWidth={0.4} strokeDasharray="1.2 1" />
                    <line x1={x + 2} y1={y + h / 2} x2={x + w - 2} y2={y + h / 2} stroke="var(--color-fg-faint)" strokeWidth={0.4} strokeDasharray="1.2 1" />
                    {pts.map(([px, py, r], i) => <circle key={i} cx={x + 3 + px * (w - 6)} cy={y + 3 + py * (h - 6)} r={Math.min(r, h / 6)} fill={color} opacity={0.5} />)}
                </>
            );
        }
        case 'funnel': {
            const n = Math.max(3, Math.min(5, Math.floor((h - 4) / 4)));
            return Array.from({ length: n }, (_, i) => {
                const bw = (w - 6) * (1 - i * (0.7 / n));
                return <rect key={i} x={x + (w - bw) / 2} y={y + 3 + i * ((h - 6) / n)} width={bw} height={Math.max(1.2, (h - 6) / n - 1.2)} rx={0.6} fill={color} opacity={0.75 - i * 0.12} />;
            });
        }
        default: return null;
    }
}
