import { ImageResponse } from 'next/og';

import { BRAND_NAME, SITE_HOST } from '@/lib/brand';

/** Shared Open Graph card for marketing pages: light, pine mark, big title, a quiet sparkline card. */
export const OG_SIZE = { width: 1200, height: 630 };

const C = {
    canvas: '#f6f7f9',
    surface: '#ffffff',
    border: '#e7eaee',
    fg: '#171a20',
    fg2: '#4b5361',
    muted: '#636b78',
    brand: '#0d3a2c',
    brandSoft: '#ebfbf4',
    brandSoftFg: '#125e47',
    clicks: '#1f5bd6',
    impressions: '#b77be6',
    users: '#5b4fe0',
};

// A fixed, decorative curve (not data): a gentle climb with weekly ripples.
function curve(n: number, seed: number, rise: number): number[] {
    return Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        return 0.25 + rise * t + 0.08 * Math.sin(i * 0.9 + seed) + 0.04 * Math.sin(i * 2.3 + seed * 2);
    });
}

function path(values: number[], w: number, h: number): string {
    const max = Math.max(...values) * 1.08;
    return values
        .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - (v / max) * h).toFixed(1)}`)
        .join(' ');
}

function Mark() {
    return (
        <svg width="56" height="56" viewBox="0 0 36 36">
            <defs>
                <linearGradient id="g" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#43b28e" />
                    <stop offset="1" stopColor="#0d3a2c" />
                </linearGradient>
            </defs>
            <rect width="36" height="36" rx="10" fill="url(#g)" />
            <line x1="10" y1="26" x2="16" y2="10" stroke="rgba(0,0,0,0.32)" strokeWidth="3" strokeLinecap="round" />
            <line x1="16" y1="26" x2="22" y2="10" stroke="rgba(0,0,0,0.32)" strokeWidth="3" strokeLinecap="round" />
            <line x1="22" y1="26" x2="28" y2="10" stroke="rgba(0,0,0,0.32)" strokeWidth="3" strokeLinecap="round" />
            <path d="M8 28 L14 22 L20 24 L28 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="28" cy="12" r="2" fill="white" />
        </svg>
    );
}

export function marketingOgImage({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }): ImageResponse {
    const a = curve(28, 1, 0.55);
    const b = curve(28, 2.4, 0.35);
    const W = 360;
    const H = 120;
    const titleSize = title.length > 46 ? 56 : title.length > 30 ? 64 : 72;
    return new ImageResponse(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: C.canvas, padding: 72, color: C.fg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <Mark />
                    <div style={{ display: 'flex', fontSize: 34, letterSpacing: -0.5, color: C.fg }}>{BRAND_NAME}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 48 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 660 }}>
                        {eyebrow ? (
                            <div style={{ display: 'flex', alignSelf: 'flex-start', marginBottom: 24, padding: '8px 18px', borderRadius: 999, background: C.brandSoft, color: C.brandSoftFg, fontSize: 24 }}>
                                {eyebrow}
                            </div>
                        ) : null}
                        <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 1.08, letterSpacing: -2, color: C.fg }}>{title}</div>
                        {subtitle ? <div style={{ display: 'flex', marginTop: 24, fontSize: 28, lineHeight: 1.35, color: C.fg2 }}>{subtitle}</div> : null}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', width: 400, padding: 20, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, boxShadow: '0 1px 3px rgba(16,19,26,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20, color: C.muted }}>
                            <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: C.clicks }} />
                            <div style={{ display: 'flex' }}>clicks</div>
                            <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: C.impressions, marginLeft: 12 }} />
                            <div style={{ display: 'flex' }}>impressions</div>
                        </div>
                        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 14 }}>
                            <path d={`${path(a, W, H)} L${W} ${H} L0 ${H} Z`} fill={C.clicks} fillOpacity={0.12} />
                            <path d={path(a, W, H)} stroke={C.clicks} strokeWidth={3} fill="none" strokeLinejoin="round" />
                            <path d={path(b, W, H)} stroke={C.impressions} strokeWidth={3} fill="none" strokeLinejoin="round" />
                        </svg>
                        <div style={{ display: 'flex', marginTop: 12, fontSize: 18, color: C.muted }}>{SITE_HOST}</div>
                    </div>
                </div>
            </div>
        ),
        OG_SIZE,
    );
}
