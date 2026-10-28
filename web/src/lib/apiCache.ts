/**
 * Simple in-memory server-side cache with TTL.
 * Used to avoid hammering the container exec endpoint on every page load.
 * Cache is per-process (lost on restart), which is fine for this use case.
 *
 * Two bounded buckets: one for real users and one for requests of the public live demo (marked by middleware,
 * lib/publicDemo/marker.ts). Demo traffic is anonymous and its answers are cheap (the demo data generator), so it
 * gets a small bucket of its own: it can never push real users' entries out, and never reads them either.
 */
import { DEMO_REQUEST_HEADER } from '@/lib/publicDemo/config';
import { isDemoMarker } from '@/lib/publicDemo/marker';
import { inSampleScope } from '@/lib/demo/sampleScope';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
    /** Approximate size in bytes (JSON length), for the memory bound. */
    size: number;
}

interface Bucket {
    name: 'main' | 'demo';
    entries: Map<string, CacheEntry<unknown>>;
    bytes: number;
    maxEntries: number;
    maxBytes: number;
}

/**
 * Bounds: the cache must not grow with what anyone asks for. Past either bound, expired entries go first, then
 * the oldest (Map keeps insertion order; a write re-inserts).
 */
export const API_CACHE_MAX_ENTRIES = 5_000;
export const API_CACHE_MAX_BYTES = 64 * 1024 * 1024;
export const DEMO_CACHE_MAX_ENTRIES = 500;
export const DEMO_CACHE_MAX_BYTES = 8 * 1024 * 1024;

const main: Bucket = { name: 'main', entries: new Map(), bytes: 0, maxEntries: API_CACHE_MAX_ENTRIES, maxBytes: API_CACHE_MAX_BYTES };
const demo: Bucket = { name: 'demo', entries: new Map(), bytes: 0, maxEntries: DEMO_CACHE_MAX_ENTRIES, maxBytes: DEMO_CACHE_MAX_BYTES };
const pendingFetches = new Map<string, Promise<unknown>>();

/** The bucket of the current request: demo for a request middleware marked as the public demo, else main. */
async function currentBucket(): Promise<Bucket> {
    // The home page's sample rows (lib/demo/sampleScope): demo data, and no request headers to read on a static page.
    if (inSampleScope()) return demo;
    try {
        const { headers } = await import('next/headers');
        const marker = (await headers()).get(DEMO_REQUEST_HEADER);
        return marker && (await isDemoMarker(marker)) ? demo : main;
    } catch {
        return main; // outside a request (schedulers, tests)
    }
}

function approxSize(value: unknown): number {
    try {
        return Math.max(64, (JSON.stringify(value) ?? '').length);
    } catch {
        return 1024;
    }
}

function dropEntry(b: Bucket, key: string) {
    const e = b.entries.get(key);
    if (!e) return;
    b.bytes -= e.size;
    b.entries.delete(key);
}

function store(b: Bucket, key: string, data: unknown, ttl: number, now: number) {
    dropEntry(b, key);
    const size = approxSize(data);
    if (size > b.maxBytes / 8) return; // one huge answer is not worth evicting everything for
    b.entries.set(key, { data, timestamp: now, ttl, size });
    b.bytes += size;
    if (b.entries.size <= b.maxEntries && b.bytes <= b.maxBytes) return;
    for (const [k, e] of b.entries) if (now - e.timestamp > e.ttl) dropEntry(b, k);
    for (const k of b.entries.keys()) {
        if (b.entries.size <= b.maxEntries && b.bytes <= b.maxBytes) break;
        dropEntry(b, k);
    }
}

/** Test / diagnostics: entry count and approximate bytes per bucket. */
export function apiCacheStats(bucket: 'main' | 'demo' = 'main'): { entries: number; bytes: number } {
    const b = bucket === 'demo' ? demo : main;
    return { entries: b.entries.size, bytes: b.bytes };
}

/**
 * Get a cached value or compute it.
 * @param key - Unique cache key (e.g., "analytics:userId:propertyId")
 * @param ttlMs - Time-to-live in milliseconds
 * @param fetcher - Async function to compute the value if not cached
 */
export async function cachedFetch<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>
): Promise<T> {
    return cachedFetchIn((await currentBucket()).name, key, ttlMs, fetcher);
}

/** cachedFetch in a given bucket (exported for tests; app code uses cachedFetch, which picks the bucket). */
export async function cachedFetchIn<T>(bucket: 'main' | 'demo', key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const b = bucket === 'demo' ? demo : main;
    const existing = b.entries.get(key);
    const now = Date.now();

    if (existing && (now - existing.timestamp) < existing.ttl) {
        return existing.data as T;
    }

    const pendingKey = `${b.name}|${key}`;
    const pending = pendingFetches.get(pendingKey) as Promise<T> | undefined;
    if (pending) {
        return pending;
    }

    const fetchPromise = (async () => {
        const result = await fetcher();
        const fetchedAt = Date.now();

        // Don't cache error objects — allow fresh attempts on retry
        // Only treat as error if 'error' key has a truthy value (not null/false/undefined)
        const isError = result && (typeof result === 'object') && (
            ('__isError' in result && result.__isError) ||
            ('error' in result && result.error != null && result.error !== false)
        );
        if (!isError) {
            store(b, key, result, ttlMs, fetchedAt);
        }

        // Lazy cleanup: remove expired entries when the bucket gets large
        if (b.entries.size > 200) {
            for (const [cacheKey, entry] of b.entries.entries()) {
                if ((fetchedAt - entry.timestamp) > entry.ttl) {
                    dropEntry(b, cacheKey);
                }
            }
        }

        return result;
    })();

    pendingFetches.set(pendingKey, fetchPromise as Promise<unknown>);

    try {
        return await fetchPromise;
    } finally {
        if (pendingFetches.get(pendingKey) === fetchPromise) {
            pendingFetches.delete(pendingKey);
        }
    }
}

/**
 * Invalidate a specific cache key or all keys matching a prefix (both buckets).
 */
export function invalidateCache(keyOrPrefix: string) {
    for (const b of [main, demo]) {
        if (b.entries.has(keyOrPrefix)) {
            dropEntry(b, keyOrPrefix);
            pendingFetches.delete(`${b.name}|${keyOrPrefix}`);
            continue;
        }
        for (const key of b.entries.keys()) {
            if (key.startsWith(keyOrPrefix)) dropEntry(b, key);
        }
    }
    for (const key of pendingFetches.keys()) {
        if (key.slice(key.indexOf('|') + 1).startsWith(keyOrPrefix)) pendingFetches.delete(key);
    }
}

/**
 * Drop every key that contains `fragment` (e.g. `:<userId>`), cached or in flight. Used after a
 * Google account is disconnected, so nothing read through it is served from the cache afterwards.
 */
export function invalidateCacheContaining(fragment: string) {
    if (!fragment) return;
    for (const b of [main, demo]) for (const key of b.entries.keys()) if (key.includes(fragment)) dropEntry(b, key);
    for (const key of pendingFetches.keys()) if (key.includes(fragment)) pendingFetches.delete(key);
}

// Cache TTL constants (in milliseconds)
export const CACHE_TTL = {
    PROPERTY_LIST: 5 * 60 * 1000,    // 5 minutes - property/site lists rarely change
    DASHBOARD_DATA: 3 * 60 * 1000,   // 3 minutes - dashboard data
    CONTAINER_STATUS: 10 * 1000,      // 10 seconds - container status
    REALTIME: 15 * 1000,              // 15 seconds - dashboard realtime
    EMBED_REALTIME: 60 * 1000,        // 60 seconds - embed realtime (lower frequency)
    EMBED_TOKEN: 5 * 60 * 1000,      // 5 minutes - embed token validation
} as const;
