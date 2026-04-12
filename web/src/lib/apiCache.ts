/**
 * Simple in-memory server-side cache with TTL.
 * Used to avoid hammering the container exec endpoint on every page load.
 * Cache is per-process (lost on restart), which is fine for this use case.
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
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
            cache.set(key, { data: result, timestamp: fetchedAt, ttl: ttlMs });
        }

        // Lazy cleanup: remove expired entries when cache gets large
        if (cache.size > 200) {
            for (const [cacheKey, entry] of cache.entries()) {
                if ((fetchedAt - entry.timestamp) > entry.ttl) {
                    cache.delete(cacheKey);
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
        cache.delete(keyOrPrefix);
        pendingFetches.delete(keyOrPrefix);
    } else {
        // Prefix match
        for (const key of cache.keys()) {
            if (key.startsWith(keyOrPrefix)) {
                cache.delete(key);
            }
        }

        for (const key of pendingFetches.keys()) {
            if (key.startsWith(keyOrPrefix)) {
                pendingFetches.delete(key);
            }
        }
    }
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
