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
        default: return null;
    }
}
