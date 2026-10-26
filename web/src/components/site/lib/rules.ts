/**
 * Pure rules for the site pages (no React, no fetch), shared by the
 * /api/site routes and the client: page-path normalisation for joining GA4
 * with Search Console, the expected-CTR curve, opportunity presets
 * (DESIGN 5.5), movers and decay (DESIGN 5.7).
 */
import type { GscMetrics, GscRow } from './types';

// ─── Pages ────────────────────────────────────────────────────────────────

/** Lowercase host without protocol, port or "www.". */
export function bareHost(input: string): string {
    let raw = input.trim().toLowerCase();
    if (raw.startsWith('sc-domain:')) raw = raw.slice('sc-domain:'.length);
    raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split('/')[0].split('?')[0].split('#')[0];
    raw = raw.replace(/:\d+$/, '').replace(/\.$/, '');
    return raw.startsWith('www.') ? raw.slice(4) : raw;
}

/** '/Blog/Post/?utm=x#top' -> '/blog/post'. Root stays '/'. */
export function normalizePath(path: string): string {
    let p = (path || '/').split('#')[0].split('?')[0];
    try {
        p = decodeURI(p);
    } catch {
        // keep as is
    }
    p = p.replace(/\/{2,}/g, '/').toLowerCase();
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
}

export interface PageRef {
    /** Join key: host + normalised path ('acme.com/pricing'), host may be empty. */
    key: string;
    host: string;
    path: string;
}

/** Normalise a GSC page URL or a GA4 (hostName, pagePath) pair. */
export function pageRef(urlOrPath: string, host?: string | null): PageRef {
    const raw = (urlOrPath || '').trim();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
        let u: URL | null = null;
        try {
            u = new URL(raw);
        } catch {
            u = null;
        }
        if (u) {
            const h = bareHost(u.host);
            const path = normalizePath(u.pathname);
            return { key: `${h}${path}`, host: h, path };
        }
    }
    const h = host ? bareHost(host) : '';
    const path = normalizePath(raw);
    return { key: `${h}${path}`, host: h, path };
}

/** Path for display: '/pricing', or 'docs.acme.com/start' when the host is not the site's own. */
export function displayPage(ref: PageRef, siteHost: string | null): string {
    if (!ref.host || !siteHost || ref.host === bareHost(siteHost)) return ref.path;
    return `${ref.host}${ref.path === '/' ? '' : ref.path}`;
}

// ─── Search ───────────────────────────────────────────────────────────────

/**
 * Typical organic CTR by position (ratio). Same curve as lib/alertEngine
 * expectedCTR (industry averages), as a ratio and smoothed between ranks.
 */
const CTR_CURVE = [0.317, 0.247, 0.187, 0.136, 0.095, 0.062, 0.042, 0.031, 0.026, 0.024];
export function expectedCtr(position: number): number {
    if (!Number.isFinite(position) || position <= 0) return 0;
    if (position <= 1) return CTR_CURVE[0];
    if (position >= 20) return 0.006;
    if (position > 10) return 0.024 - ((position - 10) / 10) * 0.018;
    const lo = Math.floor(position);
    const hi = Math.min(10, lo + 1);
    const t = position - lo;
    return CTR_CURVE[lo - 1] * (1 - t) + CTR_CURVE[hi - 1] * t;
}

export function median(values: number[]): number {
    const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return 0;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Striking distance (DESIGN 5.5): position 8–20 and impressions above the site median. */
export function isStriking(r: GscMetrics, medianImpressions: number): boolean {
    return r.position >= 8 && r.position <= 20 && r.impressions > Math.max(medianImpressions, 10);
}

/** Low CTR: on page 1 with real impressions, CTR under 70% of the usual CTR for its position. */
export function isLowCtr(r: GscMetrics, minImpressions = 100): boolean {
    if (r.position <= 0 || r.position > 10 || r.impressions < minImpressions) return false;
    return r.ctr < expectedCtr(r.position) * 0.7;
}

/** Extra clicks if a query reached position 3 at the usual CTR. */
export function strikingPotential(r: GscMetrics): number {
    return Math.max(0, Math.round(r.impressions * expectedCtr(3) - r.clicks));
}

/** Extra clicks if CTR rose to the usual CTR for its current position. */
export function lowCtrPotential(r: GscMetrics): number {
    return Math.max(0, Math.round(r.impressions * expectedCtr(r.position) - r.clicks));
}

export function isNewRow(r: GscRow): boolean {
    return r.prev !== undefined && (r.prev === null || r.prev.clicks === 0) && r.clicks > 0;
}

export type MoverKind = 'winner' | 'loser' | 'new' | 'lost';

/** Winners / losers (same thresholds as the old /api/seo/winners-losers: ±5 clicks and ±20%). */
export function moverKind(r: GscRow): MoverKind | null {
    if (r.prev === undefined) return null;
    const prevClicks = r.prev?.clicks ?? 0;
    if (!r.prev || prevClicks === 0) return r.clicks >= 5 ? 'new' : null;
    if (r.clicks === 0 && prevClicks >= 5) return 'lost';
    const delta = r.clicks - prevClicks;
    const pct = prevClicks > 0 ? delta / prevClicks : 0;
    if (delta >= 5 && pct >= 0.2) return 'winner';
    if (delta <= -5 && pct <= -0.2) return 'loser';
    return null;
}

/** Decaying (DESIGN 5.7): clicks fell in each of three consecutive 28-day windows, 30%+ overall. */
export function isDecaying(clicks: [number, number, number]): boolean {
    const [a, b, c] = clicks;
    return a >= 10 && b < a && c < b && c <= a * 0.7;
}

// ─── Totals ───────────────────────────────────────────────────────────────

/** Sum GSC rows: CTR from the sums, position weighted by impressions. */
export function sumGsc(rows: GscMetrics[]): GscMetrics {
    let clicks = 0;
    let impressions = 0;
    let posW = 0;
    for (const r of rows) {
        clicks += r.clicks;
        impressions += r.impressions;
        posW += r.position * r.impressions;
    }
    return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position: impressions > 0 ? posW / impressions : 0 };
}

/** AI assistants as GA4 session sources. */
export const AI_SOURCE_PATTERN = '(chatgpt\\.com|chat\\.openai\\.com|openai\\.com|perplexity\\.ai|claude\\.ai|anthropic\\.com|gemini\\.google\\.com|bard\\.google\\.com|copilot\\.microsoft\\.com|bing\\.com/chat|you\\.com|phind\\.com|meta\\.ai|deepseek\\.com|grok\\.com|mistral\\.ai)';
const AI_SOURCE_RE = new RegExp(AI_SOURCE_PATTERN, 'i');
export function isAiSource(source: string): boolean {
    return AI_SOURCE_RE.test(source);
}
