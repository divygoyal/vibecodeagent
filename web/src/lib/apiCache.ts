/**
 * Simple in-memory server-side cache with TTL.
 * Used to avoid hammering the container exec endpoint on every page load.
 * Cache is per-process (lost on restart), which is fine for this use case.
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
    /** Approximate size in bytes (JSON length), for the memory bound. */
    size: number;
}

/**
 * Bounds: the cache must not grow with what anonymous visitors (the public demo) or anyone else asks for.
 * Past either bound, expired entries go first, then the oldest (Map keeps insertion order; a write re-inserts).
 */
export const API_CACHE_MAX_ENTRIES = 5_000;
export const API_CACHE_MAX_BYTES = 64 * 1024 * 1024;

const cache = new Map<string, CacheEntry<unknown>>();
let cacheBytes = 0;

function approxSize(value: unknown): number {
    try {
        return Math.max(64, (JSON.stringify(value) ?? '').length);
    } catch {
        return 1024;
    }
}

function dropEntry(key: string) {
    const e = cache.get(key);
    if (!e) return;
    cacheBytes -= e.size;
    cache.delete(key);
}

function store(key: string, data: unknown, ttl: number, now: number) {
    dropEntry(key);
    const size = approxSize(data);
    if (size > API_CACHE_MAX_BYTES / 8) return; // one huge answer is not worth evicting everything for
    cache.set(key, { data, timestamp: now, ttl, size });
    cacheBytes += size;
    if (cache.size <= API_CACHE_MAX_ENTRIES && cacheBytes <= API_CACHE_MAX_BYTES) return;
    for (const [k, e] of cache) if (now - e.timestamp > e.ttl) dropEntry(k);
    for (const k of cache.keys()) {
        if (cache.size <= API_CACHE_MAX_ENTRIES && cacheBytes <= API_CACHE_MAX_BYTES) break;
        dropEntry(k);
    }
}

/** Test / diagnostics: entry count and approximate bytes. */
export function apiCacheStats(): { entries: number; bytes: number } {
    return { entries: cache.size, bytes: cacheBytes };
}
const pendingFetches = new Map<string, Promise<unknown>>();

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
    const existing = cache.get(key);
    const now = Date.now();

    if (existing && (now - existing.timestamp) < existing.ttl) {
        return existing.data as T;
    }

    const pending = pendingFetches.get(key) as Promise<T> | undefined;
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
            store(key, result, ttlMs, fetchedAt);
        }

        // Lazy cleanup: remove expired entries when cache gets large
        if (cache.size > 200) {
            for (const [cacheKey, entry] of cache.entries()) {
                if ((fetchedAt - entry.timestamp) > entry.ttl) {
                    dropEntry(cacheKey);
                }
            }
        }

        return result;
    })();

    pendingFetches.set(key, fetchPromise as Promise<unknown>);

    try {
        return await fetchPromise;
    } finally {
        if (pendingFetches.get(key) === fetchPromise) {
            pendingFetches.delete(key);
        }
    }
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 */
export function invalidateCache(keyOrPrefix: string) {
    if (cache.has(keyOrPrefix)) {
        dropEntry(keyOrPrefix);
        pendingFetches.delete(keyOrPrefix);
    } else {
        // Prefix match
        for (const key of cache.keys()) {
            if (key.startsWith(keyOrPrefix)) {
                dropEntry(key);
            }
        }

        for (const key of pendingFetches.keys()) {
            if (key.startsWith(keyOrPrefix)) {
                pendingFetches.delete(key);
            }
        }
    }
}

/**
 * Drop every key that contains `fragment` (e.g. `:<userId>`), cached or in flight. Used after a
 * Google account is disconnected, so nothing read through it is served from the cache afterwards.
 */
export function invalidateCacheContaining(fragment: string) {
    if (!fragment) return;
    for (const key of cache.keys()) if (key.includes(fragment)) dropEntry(key);
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
