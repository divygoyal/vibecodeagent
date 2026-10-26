/**
 * Thin, cached Google calls for /api/site/*. Each call is cached by
 * (user, asset, request) so the tabs and the Actions page share results, and
 * GA4 calls are limited to a few at a time per property (GA4 allows 10
 * concurrent requests per property; other features need some headroom).
 */
import { cachedFetch } from '@/lib/apiCache';

const GA_DATA = 'https://analyticsdata.googleapis.com/v1beta';
const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';
const TIMEOUT_MS = 25_000;

export const TTL = {
    /** GA4 reports that include today (partial day). */
    ga4: 5 * 60_000,
    /** Search Console data changes once a day. */
    gsc: 15 * 60_000,
    realtime: 30_000,
    slow: 30 * 60_000,
} as const;

// ─── Concurrency ──────────────────────────────────────────────────────────

const MAX_PER_ASSET = 6;
const running = new Map<string, number>();
const waiting = new Map<string, (() => void)[]>();

async function withSlot<T>(asset: string, fn: () => Promise<T>): Promise<T> {
    const n = running.get(asset) ?? 0;
    if (n >= MAX_PER_ASSET) {
        await new Promise<void>((resolve) => {
            const q = waiting.get(asset) ?? [];
            q.push(resolve);
            waiting.set(asset, q);
        });
    }
    running.set(asset, (running.get(asset) ?? 0) + 1);
    try {
        return await fn();
    } finally {
        const left = (running.get(asset) ?? 1) - 1;
        if (left <= 0) running.delete(asset);
        else running.set(asset, left);
        const q = waiting.get(asset);
        const next = q?.shift();
        if (q && q.length === 0) waiting.delete(asset);
        next?.();
    }
}

async function googleFetch(url: string, token: string, body?: unknown, method?: string): Promise<unknown> {
    const res = await fetch(url, {
        method: method ?? (body ? 'POST' : 'GET'),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Google API error ${res.status}: ${text.slice(0, 300)}`);
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Google API returned non-JSON: ${text.slice(0, 120)}`);
    }
}

/**
 * Cache wrapper that rethrows errors without caching them (lib/apiCache only
 * skips objects with an `error` key, so errors travel in a box).
 */
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
    const out = await cachedFetch<{ ok: T } | { error: string; status?: number }>(key, ttl, async () => {
        try {
            return { ok: await fn() };
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e), status: e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 504 : undefined };
        }
    });
    if ('ok' in out) return out.ok;
    const err = new Error(out.error);
    if (out.status === 504) err.name = 'TimeoutError';
    throw err;
}

export function propertyPath(property: string): string {
    const p = property.trim();
    return p.startsWith('properties/') ? p : `properties/${p}`;
}

// ─── GA4 ──────────────────────────────────────────────────────────────────

export interface GaReportRow {
    dimensionValues?: { value?: string }[];
    metricValues?: { value?: string }[];
}
export interface GaReport {
    rows?: GaReportRow[];
    rowCount?: number;
    dimensionHeaders?: { name: string }[];
    metricHeaders?: { name: string }[];
}

export function ga4Report(userId: string, token: string, property: string, body: Record<string, unknown>, ttl: number = TTL.ga4): Promise<GaReport> {
    const pid = propertyPath(property);
    return cached(`site-ga4:${userId}:${pid}:${JSON.stringify(body)}`, ttl, () =>
        withSlot(`ga4:${pid}`, () => googleFetch(`${GA_DATA}/${pid}:runReport`, token, body) as Promise<GaReport>));
}

export function ga4Realtime(userId: string, token: string, property: string, body: Record<string, unknown>): Promise<GaReport> {
    const pid = propertyPath(property);
    return cached(`site-ga4rt:${userId}:${pid}:${JSON.stringify(body)}`, TTL.realtime, () =>
        withSlot(`ga4:${pid}`, () => googleFetch(`${GA_DATA}/${pid}:runRealtimeReport`, token, body) as Promise<GaReport>));
}

// ─── Search Console ─────────────────────────────────────────────────────────

export interface GscApiRow {
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
}

export interface GscQuery {
    dimensions: string[];
    startDate: string;
    endDate: string;
    rowLimit?: number;
    /** Equals filters: { query: 'x' } or { page: 'https://…' }. */
    filters?: Record<string, string>;
}

export async function gscQuery(userId: string, token: string, siteUrl: string, q: GscQuery, ttl: number = TTL.gsc): Promise<GscApiRow[]> {
    const body: Record<string, unknown> = {
        startDate: q.startDate,
        endDate: q.endDate,
        dimensions: q.dimensions,
        rowLimit: q.rowLimit ?? 1000,
        type: 'web',
    };
    if (q.filters && Object.keys(q.filters).length) {
        body.dimensionFilterGroups = [{
            groupType: 'and',
            filters: Object.entries(q.filters).map(([dimension, expression]) => ({ dimension, operator: 'equals', expression })),
        }];
    }
    const data = await cached(`site-gsc:${userId}:${siteUrl}:${JSON.stringify(body)}`, ttl, () =>
        withSlot(`gsc:${siteUrl}`, () => googleFetch(`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, token, body) as Promise<{ rows?: GscApiRow[] }>));
    return data.rows ?? [];
}

export async function gscSitemaps(userId: string, token: string, siteUrl: string): Promise<unknown> {
    return cached(`site-gsc-sitemaps:${userId}:${siteUrl}`, TTL.slow, () =>
        googleFetch(`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/sitemaps`, token));
}

export async function gscInspect(userId: string, token: string, siteUrl: string, url: string): Promise<unknown> {
    return cached(`site-gsc-inspect:${userId}:${siteUrl}:${url}`, TTL.slow, () =>
        googleFetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', token, { siteUrl, inspectionUrl: url, languageCode: 'en-US' }));
}

/** Search Console sites this user can read (cached), to validate a siteUrl. */
export async function gscSiteList(userId: string, token: string): Promise<string[]> {
    const data = await cached(`site-gsc-list:${userId}`, TTL.gsc, () => googleFetch(`${GSC_BASE}/sites`, token) as Promise<{ siteEntry?: { siteUrl: string }[] }>);
    return (data.siteEntry ?? []).map((s) => s.siteUrl);
}

export { cached as cachedResult };
