/**
 * What one chart picture of the email says (round 9). The spec travels inside the signed URL of the
 * image (`/api/email/chart?t=<token>`), so the image route needs no data access and no session: a mail
 * app can fetch it years later, and nobody can make it draw anything we did not sign.
 */
import { signToken, verifyToken } from './tokens';

export interface ChartSpec {
    g: 'line' | 'bar';
    /** Title, at most 60 characters. */
    t: string;
    /** Colour '#rrggbb'. */
    c: string;
    /** Values: line points in date order, or one value per bar. */
    v: number[];
    /** Line only: the previous period, same length (drawn dashed). `null` = no data that day: the line breaks there. */
    p?: Array<number | null>;
    /** Bar only: what the bars measure ("Sessions"), shown muted next to the title. */
    m?: string;
    /** Bar: a label per bar. Line: [first date, last date]. */
    l: string[];
    /** Bar: the formatted value per bar. Line: [highest, latest]. */
    f: string[];
}

export const LINE_SIZE = { width: 560, height: 210 };
export const barSize = (n: number) => ({ width: 560, height: 86 + Math.max(1, n) * 26 });
const MAX_POINTS = 48;
const MAX_BARS = 8;

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(5)) : 0);
const str = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : '');

/** Keeps at most `max` points by averaging neighbours (the shape matters, not each day). A gap (`null`) stays a gap unless a neighbour has data. */
export function downsample(values: number[], max?: number): number[];
export function downsample(values: Array<number | null>, max?: number): Array<number | null>;
export function downsample(values: Array<number | null>, max = MAX_POINTS): Array<number | null> {
    if (values.length <= max) return values;
    const out: Array<number | null> = [];
    const step = values.length / max;
    for (let i = 0; i < max; i++) {
        const a = Math.floor(i * step);
        const b = Math.max(a + 1, Math.floor((i + 1) * step));
        const slice = values.slice(a, b).filter((x): x is number => x !== null);
        out.push(slice.length ? slice.reduce((s, x) => s + x, 0) / slice.length : null);
    }
    return out;
}

/** The spec cleaned to what the renderer accepts (also what a verified token is read through). */
export function cleanSpec(raw: unknown): ChartSpec | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (r.g !== 'line' && r.g !== 'bar') return null;
    const max = r.g === 'line' ? MAX_POINTS : MAX_BARS;
    const v = (Array.isArray(r.v) ? r.v : []).slice(0, max).map(num);
    if (v.length < (r.g === 'line' ? 2 : 1)) return null;
    const p = r.g === 'line' && Array.isArray(r.p) && r.p.length ? (r.p as unknown[]).slice(0, max).map((x) => (x === null ? null : num(x))) : undefined;
    const m = r.g === 'bar' ? str(r.m, 40) : '';
    return {
        g: r.g,
        t: str(r.t, 60),
        c: typeof r.c === 'string' && HEX.test(r.c) ? r.c : '#1f5bd6',
        v,
        ...(p ? { p } : {}),
        ...(m ? { m } : {}),
        l: (Array.isArray(r.l) ? r.l : []).slice(0, max).map((x) => str(x, 32)),
        f: (Array.isArray(r.f) ? r.f : []).slice(0, max).map((x) => str(x, 24)),
    };
}

export function chartUrl(origin: string, spec: ChartSpec, secret?: string | null): string {
    return `${origin}/api/email/chart?t=${signToken({ k: 'img', c: spec }, secret)}`;
}

export function specFromToken(token: unknown, secret?: string | null): ChartSpec | null {
    const p = verifyToken(token, Date.now(), secret);
    return p && p.k === 'img' ? cleanSpec(p.c) : null;
}
