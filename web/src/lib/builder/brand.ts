/**
 * One brand colour in, accessible tokens out (white-label kit, builder-templates-themes.md B.6).
 * Pure and deterministic: the editor, the save route and the viewers all derive the same tokens.
 * Only lightness moves (hue and as much chroma as fits are kept), so the brand stays recognisable,
 * and every output pair meets WCAG: brand-fg on brand 4.5:1, brand on surface 3:1, brand-text on
 * surface 4.5:1, focus 3:1, soft-fg on soft 4.5:1.
 */

export interface Oklch { L: number; C: number; h: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function isHexColor(v: unknown): v is string {
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

function hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): Oklch {
    const [r, g, b] = hexToRgb(hex).map(toLin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const C = Math.sqrt(A * A + B * B);
    const h = C < 1e-6 ? 0 : (Math.atan2(B, A) * 180) / Math.PI;
    return { L, C, h: h < 0 ? h + 360 : h };
}

function oklchToLinear({ L, C, h }: Oklch): [number, number, number] {
    const a = C * Math.cos((h * Math.PI) / 180);
    const b = C * Math.sin((h * Math.PI) / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
}

const inGamut = (rgb: [number, number, number]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH to hex, lowering chroma until the colour fits sRGB. */
export function oklchToHex(c: Oklch): string {
    let lo = 0;
    let hi = c.C;
    let rgb = oklchToLinear(c);
    if (!inGamut(rgb)) {
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (inGamut(oklchToLinear({ ...c, C: mid }))) lo = mid;
            else hi = mid;
        }
        rgb = oklchToLinear({ ...c, C: lo });
    }
    return rgbToHex(toGamma(clamp01(rgb[0])), toGamma(clamp01(rgb[1])), toGamma(clamp01(rgb[2])));
}

function luminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex).map(toLin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Step lightness from `base` in `dir` until `ok`; white or black when nothing passes. */
function seek(base: Oklch, dir: 1 | -1, ok: (hex: string) => boolean): string {
    for (let L = base.L; L >= 0 && L <= 1; L += dir * 0.01) {
        const hex = oklchToHex({ ...base, L });
        if (ok(hex)) return hex;
    }
    return dir > 0 ? '#ffffff' : '#000000';
}

export interface BrandTokens {
    '--tc-brand': string;
    '--tc-brand-hover': string;
    '--tc-brand-fg': string;
    '--tc-brand-text': string;
    '--tc-brand-soft': string;
    '--tc-brand-soft-fg': string;
    '--tc-focus': string;
    /** Single-series chart tint, only for colours with real chroma that reach 3:1. */
    chart: string | null;
}

const INK = '#0b0d10';

export function deriveBrand(hex: string, mode: 'light' | 'dark', surface: string): BrandTokens {
    const o = hexToOklch(hex);
    const dark = mode === 'dark';
    const fg = (bg: string) => (contrast('#ffffff', bg) >= contrast(INK, bg) ? '#ffffff' : INK);
    let brand = hex.toLowerCase();
    if (Math.max(contrast('#ffffff', brand), contrast(INK, brand)) < 4.5) {
        brand = seek(o, contrast('#ffffff', brand) > contrast(INK, brand) ? -1 : 1, (c) => Math.max(contrast('#ffffff', c), contrast(INK, c)) >= 4.5);
    }
    const text = seek(o, dark ? 1 : -1, (c) => contrast(c, surface) >= 4.5);
    const focus = seek(o, dark ? 1 : -1, (c) => contrast(c, surface) >= 3);
    if (contrast(brand, surface) < 3) brand = focus;
    const b = hexToOklch(brand);
    // Hover moves away from the text colour on it: darker under white text, lighter under ink.
    const hover = oklchToHex({ ...b, L: clamp01(b.L + (fg(brand) === '#ffffff' ? -0.05 : 0.05)) });
    const soft = oklchToHex({ L: dark ? 0.27 : 0.96, C: Math.min(o.C, dark ? 0.05 : 0.03), h: o.h });
    const softFg = seek(o, dark ? 1 : -1, (c) => contrast(c, soft) >= 4.5);
    let chart: string | null = null;
    if (o.C >= 0.08) {
        const t = seek({ ...o, C: Math.max(o.C, 0.11) }, dark ? 1 : -1, (c) => contrast(c, surface) >= 3);
        if (contrast(t, surface) >= 3 && hexToOklch(t).C >= 0.09) chart = t;
    }
    return {
        '--tc-brand': brand,
        '--tc-brand-hover': contrast(fg(brand), hover) >= 4.5 ? hover : brand,
        '--tc-brand-fg': fg(brand),
        '--tc-brand-text': text,
        '--tc-brand-soft': soft,
        '--tc-brand-soft-fg': softFg,
        '--tc-focus': focus,
        chart,
    };
}

/** Surface colour per theme and mode (deriveBrand checks contrast against it). */
export const SURFACES: Record<string, { light: string; dark: string }> = {
    trafficclaw: { light: '#ffffff', dark: '#15171c' },
    executive: { light: '#ffffff', dark: '#141b29' },
    analyst: { light: '#ffffff', dark: '#12141a' },
    midnight: { light: '#ffffff', dark: '#0d1117' },
    paper: { light: '#ffffff', dark: '#ffffff' },
    sunrise: { light: '#fffdf9', dark: '#201a14' },
    studio: { light: '#ffffff', dark: '#131316' },
    contrast: { light: '#ffffff', dark: '#0a0a0b' },
};

/** Inline style for the themed root: only the whitelisted brand properties. */
export function brandStyle(color: string | undefined, themeId: string | undefined, mode: 'light' | 'dark'): Record<string, string> | undefined {
    if (!isHexColor(color)) return undefined;
    const surface = (SURFACES[themeId ?? 'trafficclaw'] ?? SURFACES.trafficclaw)[mode];
    const t = deriveBrand(color, mode, surface);
    const out: Record<string, string> = {};
    for (const k of ['--tc-brand', '--tc-brand-hover', '--tc-brand-fg', '--tc-brand-text', '--tc-brand-soft', '--tc-brand-soft-fg', '--tc-focus'] as const) out[k] = t[k];
    return out;
}
