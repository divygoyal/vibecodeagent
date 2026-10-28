/**
 * The "Verified traffic · N visitors/mo" badge: GET /badge/<profile-slug>.svg[?theme=light|dark].
 * One line, drawn from the same embed payload as every other badge, so the number is the leaderboard's own
 * (same rounding as the profile, band label when the owner shares a range, no number when they share none).
 * Nothing but the brand mark, the label and that number is ever drawn; no site name, no private data.
 */
import { BRAND_NAME } from '@/lib/brand';
import { escapeXml, FONT, PALETTE, type BadgeTheme } from './badgeSvg';
import { metricText } from './format';
import type { EmbedPayload } from './types';

/**
 * Only a profile that is verified and ranked on the board gets the badge. The admin API already answers 404 for
 * anything unlisted, paused or pending; this is the second check on this side.
 */
export function badgeEligible(d: Pick<EmbedPayload, 'verification'> | null | undefined): boolean {
    return Boolean(d && d.verification.ranked && d.verification.level === 'owner');
}

/** The number part: "12.3K", a band label ("10K-50K"), or null when the owner shares no visitor figure. */
export function trafficBadgeNumber(d: Pick<EmbedPayload, 'visitors'>): string | null {
    return metricText(d.visitors);
}

/** Pieces of the badge text, shared by the SVG and the tests. `title` is the alt/tooltip text. */
export function trafficBadgeText(d: EmbedPayload | null, brand: string = BRAND_NAME): { label: string; value: string; tail: string; title: string } | null {
    if (!d || !badgeEligible(d)) return null;
    const n = trafficBadgeNumber(d);
    return n
        ? { label: 'Verified traffic', value: n, tail: 'visitors/mo', title: `Verified traffic: ${n} visitors in the last 28 days, confirmed with Google Search Console on ${brand}` }
        : { label: 'Verified traffic', value: '', tail: `on ${brand}`, title: `Verified traffic on ${brand}` };
}

// Rough Helvetica/Segoe advance widths (em) so the SVG can reserve space and pin each run with textLength.
function textWidth(s: string, size: number, bold = false): number {
    let w = 0;
    for (const ch of s) {
        if ('iljI.,:;\'|!'.includes(ch) || ch === ' ') w += 0.3;
        else if ('mwMW'.includes(ch)) w += 0.88;
        else if (/[0-9]/.test(ch)) w += 0.58;
        else if (/[A-Z]/.test(ch)) w += 0.65;
        else w += 0.55;
    }
    return Math.ceil(w * size * (bold ? 1.06 : 1));
}

const MARK = (x: number, y: number, s: number, id: string) => {
    const k = s / 32;
    return `<g transform="translate(${x} ${y}) scale(${k})"><defs><linearGradient id="${id}" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#43b28e"/><stop offset="1" stop-color="#0d3a2c"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#${id})"/><g stroke="rgba(0,0,0,0.28)" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="24" x2="13" y2="9"/><line x1="13" y1="24" x2="18" y2="9"/><line x1="18" y1="24" x2="23" y2="9"/></g><path d="M5 25 L11 19 L17 21 L25 10" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="25" cy="10" r="1.5" fill="#fff"/></g>`;
};

export function trafficBadgeSvg(opts: { data: EmbedPayload | null; theme: BadgeTheme; brand?: string }): string {
    const c = PALETTE[opts.theme];
    const brand = opts.brand || BRAND_NAME;
    const t = trafficBadgeText(opts.data, brand);
    const H = 32;
    if (!t) {
        const msg = `Not listed on ${brand}`;
        const w = 16 + textWidth(msg, 12) + 16;
        return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${escapeXml(msg)}"><title>${escapeXml(msg)}</title><rect x=".5" y=".5" width="${w - 1}" height="${H - 1}" rx="9" fill="${c.bg}" stroke="${c.border}"/><text x="16" y="20.5" font-family="${FONT}" font-size="12" fill="${c.muted}" textLength="${textWidth(msg, 12)}">${escapeXml(msg)}</text></svg>\n`;
    }
    const size = 12;
    const GAP = 6;
    const labelW = textWidth(t.label, size, true);
    const dotW = textWidth('·', size);
    const valueW = t.value ? textWidth(t.value, size, true) : 0;
    const tailW = textWidth(t.tail, size);
    const x0 = 36;
    const w = x0 + labelW + GAP + dotW + GAP + (valueW ? valueW + GAP : 0) + tailW + 14;
    const y = 20.5;
    let x = x0;
    const text = (s: string, width: number, fill: string, weight?: number) =>
        `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''} fill="${fill}" textLength="${width}" lengthAdjust="spacingAndGlyphs">${escapeXml(s)}</text>`;
    const parts: string[] = [];
    parts.push(text(t.label, labelW, c.fg, 600));
    x += labelW + GAP;
    parts.push(text('·', dotW, c.muted));
    x += dotW + GAP;
    if (t.value) {
        parts.push(text(t.value, valueW, c.brand, 600));
        x += valueW + GAP;
    }
    parts.push(text(t.tail, tailW, c.muted));
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${escapeXml(t.title)}">
  <title>${escapeXml(t.title)}</title>
  <rect x=".5" y=".5" width="${w - 1}" height="${H - 1}" rx="9" fill="${c.bg}" stroke="${c.border}"/>
  ${MARK(10, 8, 16, 'tcm')}
  ${parts.join('\n  ')}
</svg>
`;
}
