/**
 * SVG for the embeddable verified badge. Colours are the design tokens' raw values
 * (an <img> cannot read CSS variables). Everything shown follows the owner's
 * privacy settings because the data comes from the admin API's embed payload.
 */
import { compact, deltaText, metricText } from './format';
import type { EmbedPayload } from './types';

export type BadgeVariant = 'minimal' | 'rank' | 'stats' | 'live';
export type BadgeTheme = 'light' | 'dark';

type Palette = Record<'bg' | 'border' | 'fg' | 'muted' | 'brand' | 'brandBg' | 'up' | 'down' | 'spark' | 'live', string>;

const PALETTE: Record<'light' | 'dark', Palette> = {
    light: { bg: '#ffffff', border: '#dde1e7', fg: '#171a20', muted: '#636b78', brand: '#157459', brandBg: '#ebfbf4', up: '#157f3c', down: '#c92a2a', spark: '#5b4fe0', live: '#1f906f' },
    dark: { bg: '#15171c', border: '#2c3139', fg: '#edeff2', muted: '#858d98', brand: '#78d3b1', brandBg: '#0d3a2c', up: '#5fd08a', down: '#ff7b7b', spark: '#8f86ff', live: '#43b28e' },
};

const FONT = '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif';

export function escapeXml(s: string): string {
    return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c));
}

function sparkPath(values: Array<number | null>, x: number, y: number, w: number, h: number): string {
    const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
    if (pts.length < 2) return '';
    const lo = Math.min(...pts.map((p) => p.v));
    const hi = Math.max(...pts.map((p) => p.v));
    const span = hi - lo || 1;
    const last = values.length - 1 || 1;
    return pts
        .map((p, k) => `${k === 0 ? 'M' : 'L'}${(x + (p.i / last) * w).toFixed(1)} ${(y + h - ((p.v - lo) / span) * h).toFixed(1)}`)
        .join(' ');
}

function check(c: Palette, cx: number, cy: number): string {
    return `<circle cx="${cx}" cy="${cy}" r="12" fill="${c.brandBg}"/><path d="M${cx - 5} ${cy} l3.6 3.6 l6.4 -7" fill="none" stroke="${c.brand}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function badgeSvg(opts: {
    data: EmbedPayload | null;
    variant: BadgeVariant;
    theme: BadgeTheme;
    liveUsers?: number | null;
    brand?: string;
}): string {
    const c = PALETTE[opts.theme];
    const brand = escapeXml(opts.brand || 'TrafficClaw');
    const d = opts.data;
    const name = escapeXml((d?.name || 'Unknown site').slice(0, 34));

    if (!d) {
        return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48" viewBox="0 0 240 48" role="img" aria-label="Not listed"><rect x=".5" y=".5" width="239" height="47" rx="10" fill="${c.bg}" stroke="${c.border}"/><text x="16" y="29" font-family="${FONT}" font-size="13" fill="${c.muted}">Not listed on ${brand}</text></svg>\n`;
    }

    const verified = d.verification.label;
    const visitors = metricText(d.visitors);
    const delta = d.visitors?.delta_pct;
    const deltaLabel = deltaText(delta ?? null);
    const rangeLabel = d.range === '3m' ? '3 mo' : d.range;

    if (opts.variant === 'minimal' || opts.variant === 'rank') {
        const rank = opts.variant === 'rank' && d.rank_category && d.category ? `#${d.rank_category} in ${escapeXml(d.category)}` : null;
        const line1 = rank ? `${rank} on ${brand}` : `Verified on ${brand}`;
        const line2 = visitors ? `${escapeXml(visitors)} visitors / ${rangeLabel}` : escapeXml(verified);
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48" viewBox="0 0 240 48" role="img" aria-label="${name}: ${escapeXml(line1)}">
  <rect x=".5" y=".5" width="239" height="47" rx="10" fill="${c.bg}" stroke="${c.border}"/>
  ${check(c, 26, 24)}
  <text x="48" y="21" font-family="${FONT}" font-size="13" font-weight="600" fill="${c.fg}">${line1}</text>
  <text x="48" y="37" font-family="${FONT}" font-size="11" fill="${c.muted}">${line2}</text>
</svg>
`;
    }

    // stats / live: 300 x 76 card with sparkline.
    const w = 300;
    const h = 76;
    const spark = d.spark ? sparkPath(d.spark.values, 176, 28, 108, 28) : '';
    const live = opts.variant === 'live' && d.live_enabled && opts.liveUsers !== null && opts.liveUsers !== undefined;
    const liveLine = live ? `<circle cx="22" cy="63" r="3.5" fill="${c.live}"/><text x="31" y="67" font-family="${FONT}" font-size="11" fill="${c.muted}">${compact(opts.liveUsers as number)} online now</text>` : '';
    const deltaColor = (delta ?? 0) >= 0 ? c.up : c.down;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${name} on ${brand}: ${visitors ? escapeXml(visitors) + ' visitors' : escapeXml(verified)}">
  <rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="12" fill="${c.bg}" stroke="${c.border}"/>
  ${check(c, 26, 24)}
  <text x="46" y="21" font-family="${FONT}" font-size="12" font-weight="600" fill="${c.fg}">${name}</text>
  <text x="46" y="35" font-family="${FONT}" font-size="10.5" fill="${c.brand}">${escapeXml(verified)}</text>
  <text x="16" y="${live ? 56 : 62}" font-family="${FONT}" font-size="${live ? 18 : 20}" font-weight="650" fill="${c.fg}">${visitors ? escapeXml(visitors) : '&#8212;'}</text>
  <text x="${16 + (visitors ? Math.min(visitors.length, 9) * (live ? 10.5 : 11.5) + 6 : 28)}" y="${live ? 56 : 62}" font-family="${FONT}" font-size="10.5" fill="${c.muted}">visitors / ${rangeLabel}${deltaLabel ? '' : ''}</text>
  ${deltaLabel ? `<text x="${w - 16}" y="20" text-anchor="end" font-family="${FONT}" font-size="11" font-weight="600" fill="${deltaColor}">${escapeXml(deltaLabel)}</text>` : ''}
  ${spark ? `<path d="${spark}" fill="none" stroke="${c.spark}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  ${liveLine}
  <text x="${w - 16}" y="${h - 9}" text-anchor="end" font-family="${FONT}" font-size="9" fill="${c.muted}">${brand}</text>
</svg>
`;
}
