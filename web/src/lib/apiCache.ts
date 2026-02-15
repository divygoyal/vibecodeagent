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

const cache = new Map<string, CacheEntry<any>>();

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
        return existing.data;
    }

    const data = await fetcher();
    cache.set(key, { data, timestamp: now, ttl: ttlMs });

    // Lazy cleanup: remove expired entries when cache gets large
    if (cache.size > 200) {
        for (const [k, v] of cache.entries()) {
            if ((now - v.timestamp) > v.ttl) {
                cache.delete(k);
            }
        }
    }

    return data;
}

/**
 * Invalidate a specific cache key or all keys matching a prefix.
 */
export function invalidateCache(keyOrPrefix: string) {
    if (cache.has(keyOrPrefix)) {
        cache.delete(keyOrPrefix);
    } else {
        // Prefix match
        for (const key of cache.keys()) {
            if (key.startsWith(keyOrPrefix)) {
                cache.delete(key);
            }
        }
    }
}

// Cache TTL constants (in milliseconds)
export const CACHE_TTL = {
    PROPERTY_LIST: 5 * 60 * 1000,    // 5 minutes - property/site lists rarely change
    DASHBOARD_DATA: 3 * 60 * 1000,   // 3 minutes - dashboard data
    CONTAINER_STATUS: 10 * 1000,      // 10 seconds - container status
} as const;
