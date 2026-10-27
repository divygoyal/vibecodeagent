/**
 * Fetch a Google account's site inventory: GA4 properties (with the URIs of
 * their web data streams) and Search Console sites, ready for pairSites().
 *
 * Generic on purpose: the portfolio, the MCP tools and the leaderboard call
 * it with a Google access token. Read-only Google endpoints only.
 *
 *   const inv = await fetchInventory(accessToken, { cacheKey: userId });
 *   const pairs = pairSites(inv.properties, inv.sites);
 *
 * Caching: the whole inventory for 10 minutes per cacheKey (pass the user id;
 * the default is a hash of the token, which changes hourly), and each
 * property's stream URIs for 24 hours. Identical concurrent calls share one
 * request.
 *
 * Demo data: with TC_DEMO_DATA=1 (dev kit) the global fetch is already
 * answered by src/lib/demo. `{ demo: true }` uses the demo generator directly
 * with a scoped fetch that never reaches the network, so it also works in
 * production (public demo page, MCP demo grants).
 */
import { createHash } from 'node:crypto';
import { demoAccessToken, demoGoogleFetch } from '@/lib/demo';
import type { Ga4PropertyInput, GscSiteInput } from './pairing';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface InventoryProperty extends Ga4PropertyInput {
    /** "accounts/123" */
    account?: string;
    accountName?: string;
}

export interface InventoryError {
    /** HTTP status from Google (401 = token expired or revoked, 403 = API disabled or no access). */
    status: number;
    message: string;
}

export interface Inventory {
    properties: InventoryProperty[];
    sites: GscSiteInput[];
    /** Set when one side could not be listed; the other side is still returned. */
    errors: { ga4?: InventoryError; gsc?: InventoryError };
    fetchedAt: number;
}

export interface InventoryOptions {
    /** Cache key for this account's inventory, e.g. the user id. */
    cacheKey?: string;
    /** Skip the inventory cache (stream URIs stay cached). */
    refresh?: boolean;
    /** Answer from the demo generator; the token is ignored. */
    demo?: boolean;
    /** Custom fetch (tests). */
    fetch?: FetchLike;
    signal?: AbortSignal;
    /** Inventory cache lifetime, default 10 minutes. */
    ttlMs?: number;
}

const GA_ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const GSC = 'https://www.googleapis.com/webmasters/v3';
const INVENTORY_TTL_MS = 10 * 60_000;
const STREAMS_TTL_MS = 24 * 3600_000;
const STREAM_CONCURRENCY = 5;
const MAX_ACCOUNT_PAGES = 10;

// On globalThis so every route bundle in the process shares one cache.
const store = ((globalThis as unknown as { __tcInventory?: unknown }).__tcInventory ??= {
    inventoryCache: new Map<string, { value: Inventory; until: number }>(),
    inventoryInflight: new Map<string, Promise<Inventory>>(),
    streamCache: new Map<string, { uris: string[]; until: number }>(),
}) as {
    inventoryCache: Map<string, { value: Inventory; until: number }>;
    inventoryInflight: Map<string, Promise<Inventory>>;
    streamCache: Map<string, { uris: string[]; until: number }>;
};
const { inventoryCache, inventoryInflight, streamCache } = store;

/** A fetch that answers Google APIs from the demo generator and refuses everything else. */
export function createDemoGoogleFetch(): FetchLike {
    const refuse = (() => Promise.reject(new Error('demo fetch: network disabled'))) as typeof fetch;
    return async (input, init) => {
        const res = await demoGoogleFetch(input, init, refuse);
        return res ?? new Response(JSON.stringify({ error: { code: 501, message: 'not simulated in demo mode', status: 'UNIMPLEMENTED' } }), {
            status: 501,
            headers: { 'content-type': 'application/json' },
        });
    };
}

/** Access token the demo generator accepts. */
export function demoGoogleAccessToken(): string {
    return demoAccessToken();
}

class GoogleHttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

/** Waits (ms) before each retry of a listing request that failed transiently. Mutable for tests. */
export const inventoryRetry = { delays: [500, 1500] };

async function getJsonOnce(fetchFn: FetchLike, url: string, token: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const res = await fetchFn(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: signal ?? AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
        // A 5xx is usually Google's front end answering in HTML ("502 Bad Gateway"): say that, not "HTTP 502".
        let message = res.status >= 500 ? 'Google had a temporary problem' : `HTTP ${res.status}`;
        try {
            const parsed = JSON.parse(text) as { error?: { message?: string } };
            if (parsed?.error?.message) message = parsed.error.message.slice(0, 300);
        } catch {
            /* keep the status text */
        }
        throw new GoogleHttpError(res.status, message);
    }
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new GoogleHttpError(502, 'Google returned a non-JSON response');
    }
}

/** GET one listing page; a transient failure (5xx, dropped connection, timeout) is retried silently. */
async function getJson(fetchFn: FetchLike, url: string, token: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await getJsonOnce(fetchFn, url, token, signal);
        } catch (err) {
            const transient = err instanceof GoogleHttpError ? err.status >= 500 : err instanceof Error && (err.name === 'TimeoutError' || err instanceof TypeError);
            if (!transient || attempt >= inventoryRetry.delays.length || signal?.aborted) throw err;
            await new Promise((resolve) => setTimeout(resolve, inventoryRetry.delays[attempt]));
        }
    }
}

function toError(err: unknown): InventoryError {
    if (err instanceof GoogleHttpError) return { status: err.status, message: err.message };
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return { status: 504, message: 'Google did not answer in time' };
    return { status: 500, message: err instanceof Error ? err.message.slice(0, 300) : 'unknown error' };
}

async function listProperties(fetchFn: FetchLike, token: string, signal?: AbortSignal): Promise<InventoryProperty[]> {
    const out: InventoryProperty[] = [];
    let pageToken = '';
    for (let page = 0; page < MAX_ACCOUNT_PAGES; page++) {
        const url = `${GA_ADMIN}/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const data = await getJson(fetchFn, url, token, signal);
        const accounts = Array.isArray(data.accountSummaries) ? data.accountSummaries as Record<string, unknown>[] : [];
        for (const acc of accounts) {
            const props = Array.isArray(acc.propertySummaries) ? acc.propertySummaries as Record<string, unknown>[] : [];
            for (const p of props) {
                if (typeof p.property !== 'string') continue;
                out.push({
                    property: p.property,
                    displayName: typeof p.displayName === 'string' ? p.displayName : p.property,
                    streamUris: [],
                    account: typeof acc.account === 'string' ? acc.account : undefined,
                    accountName: typeof acc.displayName === 'string' ? acc.displayName : undefined,
                });
            }
        }
        pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
        if (!pageToken) break;
    }
    return out;
}

async function streamUris(fetchFn: FetchLike, token: string, property: string, keyPrefix: string, signal?: AbortSignal): Promise<string[]> {
    const key = `${keyPrefix}${property}`;
    const hit = streamCache.get(key);
    if (hit && hit.until > Date.now()) return hit.uris;
    const data = await getJson(fetchFn, `${GA_ADMIN}/${property}/dataStreams?pageSize=200`, token, signal);
    const streams = Array.isArray(data.dataStreams) ? data.dataStreams as Record<string, unknown>[] : [];
    const uris = streams
        .filter((s) => s.type === 'WEB_DATA_STREAM')
        .map((s) => (s.webStreamData as { defaultUri?: unknown } | undefined)?.defaultUri)
        .filter((u): u is string => typeof u === 'string' && u.length > 0);
    streamCache.set(key, { uris, until: Date.now() + STREAMS_TTL_MS });
    if (streamCache.size > 5000) {
        for (const [k, v] of streamCache) if (v.until < Date.now()) streamCache.delete(k);
    }
    return uris;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const item = items[next++];
            await fn(item);
        }
    });
    await Promise.all(workers);
}

async function load(token: string, fetchFn: FetchLike, keyPrefix: string, signal?: AbortSignal): Promise<Inventory> {
    const errors: Inventory['errors'] = {};
    const [propsResult, sitesResult] = await Promise.allSettled([
        listProperties(fetchFn, token, signal),
        getJson(fetchFn, `${GSC}/sites`, token, signal),
    ]);

    let properties: InventoryProperty[] = [];
    if (propsResult.status === 'fulfilled') {
        properties = propsResult.value;
        await mapLimit(properties, STREAM_CONCURRENCY, async (p) => {
            try {
                p.streamUris = await streamUris(fetchFn, token, p.property, keyPrefix, signal);
            } catch {
                p.streamUris = []; // property stays listed, just unpaired
            }
        });
    } else {
        errors.ga4 = toError(propsResult.reason);
    }

    let sites: GscSiteInput[] = [];
    if (sitesResult.status === 'fulfilled') {
        const entries = Array.isArray(sitesResult.value.siteEntry) ? sitesResult.value.siteEntry as Record<string, unknown>[] : [];
        sites = entries
            .filter((e) => typeof e.siteUrl === 'string')
            .map((e) => ({ siteUrl: e.siteUrl as string, permissionLevel: typeof e.permissionLevel === 'string' ? e.permissionLevel : undefined }));
    } else {
        errors.gsc = toError(sitesResult.reason);
    }

    return { properties, sites, errors, fetchedAt: Date.now() };
}

export async function fetchInventory(accessToken: string, opts: InventoryOptions = {}): Promise<Inventory> {
    const demo = Boolean(opts.demo);
    const token = demo ? demoGoogleAccessToken() : accessToken;
    if (!token) throw new Error('fetchInventory: an access token is required');
    const fetchFn: FetchLike = opts.fetch ?? (demo ? createDemoGoogleFetch() : (input, init) => fetch(input, init));
    const keyPrefix = demo ? 'demo:' : 'g:';
    const key = keyPrefix + (opts.cacheKey ?? createHash('sha256').update(token).digest('hex').slice(0, 32));
    const ttl = opts.ttlMs ?? INVENTORY_TTL_MS;

    if (!opts.refresh) {
        const hit = inventoryCache.get(key);
        if (hit && hit.until > Date.now()) return hit.value;
        const pending = inventoryInflight.get(key);
        if (pending) return pending;
    }

    const p = load(token, fetchFn, keyPrefix, opts.signal).then((inv) => {
        // Only cache complete answers so a transient Google error is retried next time.
        if (!inv.errors.ga4 && !inv.errors.gsc) {
            inventoryCache.set(key, { value: inv, until: Date.now() + ttl });
            if (inventoryCache.size > 2000) {
                for (const [k, v] of inventoryCache) if (v.until < Date.now()) inventoryCache.delete(k);
            }
        }
        return inv;
    }).finally(() => {
        if (inventoryInflight.get(key) === p) inventoryInflight.delete(key);
    });
    inventoryInflight.set(key, p);
    return p;
}

/** Drop cached inventories (all, or one cacheKey). */
export function invalidateInventory(cacheKey?: string): void {
    if (!cacheKey) {
        inventoryCache.clear();
        return;
    }
    inventoryCache.delete(`g:${cacheKey}`);
    inventoryCache.delete(`demo:${cacheKey}`);
}
