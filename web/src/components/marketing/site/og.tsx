import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

import { BRAND_NAME, SITE_HOST } from '@/lib/brand';
import { ellipsize, fitText, fontMeasurer, type FittedText, type Measure } from '@/lib/ogFit';

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

export function OgMark({ size = 56 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 36 36">
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

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };
let fontsPromise: Promise<OgFont[]> | null = null;

/**
 * Geist Regular + Bold from public/og-fonts (OFL), so share images use the site's face with a real bold. public/ ships
 * next to the standalone server, so process.cwd() finds it in dev and in the container. Missing files fall back to
 * the renderer's built-in font rather than failing the image.
 */
function ogFonts(): Promise<OgFont[]> {
    fontsPromise ??= Promise.all(
        ([['Geist-Regular.ttf', 400], ['Geist-Bold.ttf', 700]] as const).map(async ([file, weight]) => {
            const buf = await readFile(join(process.cwd(), 'public', 'og-fonts', file));
            return { name: 'Geist', data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: 'normal' as const };
        }),
    ).catch(() => {
        fontsPromise = null;
        return [];
    });
    return fontsPromise;
}

/** Rough width when the font files are missing (the renderer then uses its own font): about 0.58 em per character. */
const approxMeasure: Measure = (text, size, letterSpacing = 0) => [...text].length * (size * 0.58 + letterSpacing);

/** Width measurers for the bold and regular Geist files, so cards can fit text before drawing it. */
export async function ogMeasure(): Promise<{ bold: Measure; regular: Measure }> {
    const fonts = await ogFonts();
    const of = (weight: number): Measure => {
        const f = fonts.find((x) => x.weight === weight);
        return f ? fontMeasurer(f.data) : approxMeasure;
    };
    return { bold: of(700), regular: of(400) };
}

/** Fits `text` into `maxWidth` using the bold face: the size steps down, long text wraps, then ends in an ellipsis. */
export async function ogFitBold(text: string, opts: { maxWidth: number; sizes: number[]; maxLines?: number; letterSpacing?: number; maxLinesAt?: (size: number) => number }): Promise<FittedText> {
    return fitText(text, (await ogMeasure()).bold, opts);
}

export async function ogRender(node: React.ReactElement, headers?: Record<string, string>): Promise<ImageResponse> {
    const fonts = await ogFonts();
    return new ImageResponse(node, { ...OG_SIZE, ...(fonts.length ? { fonts } : {}), ...(headers ? { headers } : {}) });
}

export function marketingOgImage({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }): Promise<ImageResponse> {
    const a = curve(28, 1, 0.55);
    const b = curve(28, 2.4, 0.35);
    const W = 360;
    const H = 120;
    const titleSize = title.length > 46 ? 56 : title.length > 30 ? 64 : 72;
    return ogRender(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: C.canvas, padding: 72, color: C.fg, fontFamily: 'Geist' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <OgMark />
                    <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, letterSpacing: -0.5, color: C.fg }}>{BRAND_NAME}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 600 }}>
                        {eyebrow ? (
                            <div style={{ display: 'flex', alignSelf: 'flex-start', marginBottom: 24, padding: '8px 18px', borderRadius: 999, background: C.brandSoft, color: C.brandSoftFg, fontSize: 24 }}>
                                {eyebrow}
                            </div>
                        ) : null}
                        <div style={{ display: 'flex', fontSize: titleSize, fontWeight: 700, lineHeight: 1.06, letterSpacing: -2.5, color: C.fg }}>{title}</div>
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
    );
}

/** A check mark drawn as SVG (Geist has no tick glyph). */
export function OgTick({ size = 20, color = '#157459' }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 18 18"><path d="M3.5 9.5 L7.5 13 L14.5 5" stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    );
}

/** A change figure ("18.4%") with its arrow drawn as SVG (Geist has no triangle glyphs). `label` is deltaText(): "▲ 18.4%". */
export function OgDelta({ label, size = 24, up = '#157f3c', down = '#c92a2a' }: { label: string; size?: number; up?: string; down?: string }) {
    const isUp = !label.includes('▼') && !label.trim().startsWith('-');
    const color = isUp ? up : down;
    const text = label.replace(/[▲▼+\-−\s]/g, '');
    // No change: no arrow, muted.
    if (/^0(\.0+)?%?$/.test(text)) return <div style={{ display: 'flex', fontSize: size, fontWeight: 700, color: '#636b78' }}>{text}</div>;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: size, fontWeight: 700, color }}>
            <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 12 12">{isUp ? <path d="M6 1.5 L11 10.5 L1 10.5 Z" fill={color} /> : <path d="M6 10.5 L11 1.5 L1 1.5 Z" fill={color} />}</svg>
            <div style={{ display: 'flex' }}>{text}</div>
        </div>
    );
}

/** Left text column of the share cards, and the numbers card beside it: 72 px margins each side, a 44 px gap. */
const SHARE_TEXT_W = 600;
const SHARE_CARD_W = 412;
/** Without numbers the title has the whole width. */
const SHARE_WIDE_W = 1056;

/** A change figure with its arrow drawn as SVG, coloured by what the change means (a falling bounce rate is good). */
function OgChange({ text, dir, tone, size = 22 }: { text: string; dir: 'up' | 'down' | 'flat'; tone: 'good' | 'bad' | 'neutral'; size?: number }) {
    const color = tone === 'good' ? '#157f3c' : tone === 'bad' ? '#c92a2a' : C.muted;
    if (dir === 'flat') return <div style={{ display: 'flex', fontSize: size, fontWeight: 700, color }}>{text}</div>;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: size, fontWeight: 700, color }}>
            <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 12 12">{dir === 'up' ? <path d="M6 1.5 L11 10.5 L1 10.5 Z" fill={color} /> : <path d="M6 10.5 L11 1.5 L1 1.5 Z" fill={color} />}</svg>
            <div style={{ display: 'flex' }}>{text}</div>
        </div>
    );
}

/** The real figures of a shared dashboard or share page, as the card shows them (lib/builder/shareCard.ts). */
export interface SharedCardNumbers {
    site?: string;
    range: string;
    kpis: Array<{ label: string; value: string; delta?: { text: string; dir: 'up' | 'down' | 'flat'; tone: 'good' | 'bad' | 'neutral' } }>;
}

/**
 * Share card for a public dashboard or share page: the same light look as the marketing cards. With `numbers` a white card
 * on the right lists the date range and two or three real KPIs with their change; without (protected, slow, failed, no
 * KPI widget) the title takes the whole width and nothing is drawn that looks like data. The title is fitted to its
 * column (smaller type, two lines, then an ellipsis), so it never runs under the card.
 */
export async function sharedOgImage({ eyebrow, title, subtitle, lock, numbers }: { eyebrow: string; title: string; subtitle?: string; lock?: boolean; numbers?: SharedCardNumbers | null }): Promise<ImageResponse> {
    const kpis = numbers?.kpis.slice(0, 3) ?? [];
    const withNumbers = kpis.length > 0 && numbers !== null && numbers !== undefined;
    const textW = withNumbers ? SHARE_TEXT_W : SHARE_WIDE_W;
    const { bold, regular } = await ogMeasure();
    const fit = fitText(title, bold, { maxWidth: textW, sizes: withNumbers ? [76, 64, 54, 46] : [88, 76, 64, 54, 46], letterSpacing: -2.5, maxLinesAt: (size) => (size <= 54 ? 2 : 1) });
    const sub = subtitle ? (subtitle.length > 120 ? `${subtitle.slice(0, 117)}...` : subtitle) : undefined;
    const labelW = SHARE_CARD_W - 40 - 150;
    return ogRender(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: C.canvas, padding: 72, color: C.fg, fontFamily: 'Geist' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <OgMark />
                    <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, letterSpacing: -0.5, color: C.fg }}>{BRAND_NAME}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: textW }}>
                        <div style={{ display: 'flex', alignSelf: 'flex-start', alignItems: 'center', gap: 10, marginBottom: 24, padding: '8px 18px', borderRadius: 999, background: C.brandSoft, color: C.brandSoftFg, fontSize: 24 }}>
                            {lock ? <svg width="20" height="20" viewBox="0 0 20 20"><rect x="4" y="9" width="12" height="8" rx="2" fill={C.brandSoftFg} /><path d="M7 9 V6.5 a3 3 0 0 1 6 0 V9" stroke={C.brandSoftFg} strokeWidth="2" fill="none" /></svg> : null}
                            <div style={{ display: 'flex' }}>{eyebrow}</div>
                        </div>
                        {fit.lines.map((line, i) => (
                            <div key={i} style={{ display: 'flex', fontSize: fit.size, fontWeight: 700, lineHeight: 1.06, letterSpacing: -2.5, color: C.fg }}>{line}</div>
                        ))}
                        {sub ? <div style={{ display: 'flex', marginTop: 24, fontSize: 28, lineHeight: 1.35, color: C.fg2 }}>{ellipsize(sub, regular, 28, textW * 2.2)}</div> : null}
                    </div>
                    {withNumbers && numbers ? (
                        <div style={{ display: 'flex', flexDirection: 'column', width: SHARE_CARD_W, padding: 20, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, boxShadow: '0 1px 3px rgba(16,19,26,0.06)' }}>
                            <div style={{ display: 'flex', fontSize: 20, color: C.muted, paddingBottom: 12 }}>{ellipsize(numbers.range, regular, 20, SHARE_CARD_W - 40)}</div>
                            {kpis.map((k, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: `1px solid ${C.border}` }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', fontSize: 20, color: C.fg2 }}>{ellipsize(k.label, regular, 20, labelW)}</div>
                                        <div style={{ display: 'flex', fontSize: 46, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1, color: C.fg }}>{k.value}</div>
                                    </div>
                                    {k.delta ? <OgChange text={k.delta.text} dir={k.delta.dir} tone={k.delta.tone} /> : <div style={{ display: 'flex' }} />}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        ),
        // ImageResponse's default is a year, immutable: right for fixed cards, wrong for one that carries live numbers
        // (or that was drawn without them because Google was slow). Minutes, so edits and the numbers catch up.
        { 'Cache-Control': withNumbers ? 'public, max-age=600, s-maxage=900, stale-while-revalidate=3600' : 'public, max-age=60, s-maxage=120' },
    );
}

const DARK = {
    canvas: '#0b0c0f',
    surface: '#15171c',
    surface2: '#1b1e24',
    border: '#2a2e36',
    fg: '#f4f5f7',
    fg2: '#a3aab6',
    muted: '#7c8492',
    green: '#43d19e',
    up: '#3fcf8e',
    down: '#f16d6d',
    clicks: '#4c86f0',
    users: '#8b7ff5',
};

const L = {
    canvas: '#f6f7f9',
    surface: '#ffffff',
    surface2: '#f6f7f9',
    border: '#e3e7ec',
    fg: '#171a20',
    fg2: '#4b5361',
    muted: '#636b78',
    green: '#16825d',
    up: '#14804f',
    down: '#d33b3b',
    clicks: '#1f5bd6',
    users: '#5b4fe0',
};

/** One portfolio card row for the home share image: the app's demo sites (sample data, .example hosts). */
const HOME_SITES = [
    { host: 'acmeanalytics.example', letter: 'A', users: '47.4K', change: 10.3, seed: 0.4, rise: 0.5 },
    { host: 'healthinsights.example', letter: 'H', users: '49.5K', change: -2.9, seed: 2.1, rise: -0.1 },
    { host: 'searchmetrics.example', letter: 'S', users: '291K', change: 1.4, seed: 3.3, rise: 0.15 },
];

function Change({ value, size = 22, up: upC = DARK.up, down: downC = DARK.down }: { value: number; size?: number; up?: string; down?: string }) {
    const up = value >= 0;
    return (
        <div style={{ display: 'flex', fontSize: size, fontWeight: 700, color: up ? upC : downC }}>
            {`${up ? '▲' : '▼'}${Math.abs(value).toFixed(1)}%`}
        </div>
    );
}

/**
 * The home page's share card: dark (so it stands out in light feeds), the headline in Geist Bold with "Free." in brand
 * green, and a small portfolio panel in the app's own style (totals strip, three site rows with sparklines).
 */
export function homeOgImage(theme: 'dark' | 'light' = 'dark'): Promise<ImageResponse> {
    const D = theme === 'light' ? L : DARK;
    const W = 112;
    const H = 38;
    return ogRender(
        <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: D.canvas, color: D.fg, fontFamily: 'Geist', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -260, right: -180, width: 760, height: 760, borderRadius: 999, display: 'flex', background: `radial-gradient(circle, ${theme === 'light' ? 'rgba(22,130,93,0.10)' : 'rgba(67,209,158,0.20)'} 0%, rgba(67,209,158,0) 65%)` }} />

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 600, padding: '64px 0 60px 64px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <OgMark />
                    <div style={{ display: 'flex', fontSize: 32, fontWeight: 700, letterSpacing: -0.5 }}>{BRAND_NAME}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', fontSize: 74, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3 }}>All your sites.</div>
                    <div style={{ display: 'flex', fontSize: 74, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3 }}>One screen.</div>
                    <div style={{ display: 'flex', fontSize: 74, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3, color: D.green }}>Free.</div>
                    <div style={{ display: 'flex', marginTop: 26, fontSize: 27, lineHeight: 1.35, color: D.fg2 }}>
                        Google Analytics 4 and Search Console for every site you own.
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, color: D.fg2 }}>
                    {['Read-only', 'No card', 'ChatGPT & Claude'].map((t) => (
                        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, border: `1px solid ${D.border}`, background: theme === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)' }}>
                            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M3.5 9.5 L7.5 13 L14.5 5" stroke={D.green} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            <div style={{ display: 'flex' }}>{t}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ position: 'absolute', top: 86, left: 676, width: 480, display: 'flex', flexDirection: 'column', background: D.surface, border: `1px solid ${D.border}`, borderRadius: 26, padding: 26, boxShadow: theme === 'light' ? '0 20px 60px rgba(16,19,26,0.12)' : '0 30px 80px rgba(0,0,0,0.55)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>Portfolio</div>
                    <div style={{ display: 'flex', fontSize: 18, color: D.muted }}>11 sites · last 28 days</div>
                </div>
                <div style={{ display: 'flex', marginTop: 16, border: `1px solid ${D.border}`, borderRadius: 16, background: D.surface2 }}>
                    {[
                        { label: 'Clicks', value: '408K', change: -3.8, dot: D.clicks },
                        { label: 'Users', value: '470K', change: 2.4, dot: D.users },
                    ].map((m, i) => (
                        <div key={m.label} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '14px 18px', borderLeft: i ? `1px solid ${D.border}` : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, color: D.fg2 }}>
                                <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 999, background: m.dot }} />
                                <div style={{ display: 'flex' }}>{m.label}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                                <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>{m.value}</div>
                                <Change value={m.change} size={19} up={D.up} down={D.down} />
                            </div>
                        </div>
                    ))}
                </div>
                {HOME_SITES.map((s) => {
                    const v = curve(24, s.seed, s.rise > 0 ? s.rise : 0.05).map((x, i) => (s.rise < 0 ? x - 0.012 * i : x));
                    const color = s.change >= 0 ? D.up : D.down;
                    return (
                        <div key={s.host} style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, padding: '12px 16px', border: `1px solid ${D.border}`, borderRadius: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: D.surface2, border: `1px solid ${D.border}`, fontSize: 17, fontWeight: 700, color: D.fg2 }}>{s.letter}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <div style={{ display: 'flex', fontSize: 19, fontWeight: 700 }}>{s.host}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                                    <div style={{ display: 'flex', fontSize: 18, color: D.fg2 }}>{`${s.users} users`}</div>
                                    <Change value={s.change} size={16} up={D.up} down={D.down} />
                                </div>
                            </div>
                            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                                <path d={`${path(v, W, H)} L${W} ${H} L0 ${H} Z`} fill={color} fillOpacity={0.12} />
                                <path d={path(v, W, H)} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
                            </svg>
                        </div>
                    );
                })}
            </div>

            <div style={{ position: 'absolute', right: 56, bottom: 30, display: 'flex', fontSize: 20, color: D.muted }}>{`${SITE_HOST} · sample data`}</div>
        </div>,
    );
}
