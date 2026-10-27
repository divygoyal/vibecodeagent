/**
 * Leaf cache for builder queries (BUILDER.md 8.4). One entry per Google call ("leaf"), keyed by
 * (user, family, asset, canonical request with absolute dates), so overlapping widgets share
 * work and a public view is served from the owner's entries.
 *
 * Fresh TTL depends on how recent the range is; after that, entries are served stale while a
 * background refresh runs (stale-while-revalidate). Upstream failures are cached briefly
 * (negative cache) so a broken property is not hammered.
 *
 * L1 only (in-process, size-capped LRU). TODO(P1): L2 Upstash Redis when UPSTASH_REDIS_REST_URL
 * is set, and L3 = Portfolio snapshot store for daily snapshot metrics.
 */
import { createHash } from 'node:crypto';
import { daysBetween } from '../dates';
import type { Iso } from '../types';

export interface CachePolicy { freshMs: number; staleMs: number }

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** TTL by recency of the range end (BUILDER.md 8.4 table). */
export function policyFor(family: 'ga4' | 'gsc', rangeEnd: Iso, today: Iso): CachePolicy {
    const age = daysBetween(rangeEnd, today) - 1; // 0 = ends today, 1 = ends yesterday
    if (age <= 2) return { freshMs: family === 'ga4' ? 10 * MIN : 30 * MIN, staleMs: DAY };
    if (age <= 35) return { freshMs: 2 * HOUR, staleMs: 7 * DAY };
    return { freshMs: DAY, staleMs: 30 * DAY };
}

export const NEGATIVE_TTL_MS = { QUOTA: 60_000, UPSTREAM: 60_000, NO_ACCESS: 5 * MIN, INCOMPATIBLE: 5 * MIN } as const;

interface Entry {
    value: unknown;
    fetchedAt: number;
    freshUntil: number;
    staleUntil: number;
    size: number;
}

interface NegEntry { error: unknown; until: number }

const MAX_ENTRIES = 3000;
const MAX_BYTES = 80 * 1024 * 1024;

const store = new Map<string, Entry>();
const negative = new Map<string, NegEntry>();
const inflight = new Map<string, Promise<unknown>>();
let bytes = 0;

export function leafKey(parts: unknown[]): string {
    return createHash('sha1').update(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('|')).digest('hex');
}

export type CacheState = 'fresh' | 'stale';

export function cacheGet(key: string, now = Date.now()): { value: unknown; fetchedAt: number; state: CacheState } | null {
    const e = store.get(key);
    if (!e) return null;
    if (e.staleUntil <= now) {
        store.delete(key);
        bytes -= e.size;
        return null;
    }
    store.delete(key);
    store.set(key, e); // LRU touch
    return { value: e.value, fetchedAt: e.fetchedAt, state: e.freshUntil > now ? 'fresh' : 'stale' };
}

export function cacheSet(key: string, value: unknown, policy: CachePolicy, now = Date.now()): void {
    let size = 1024;
    try {
        size = JSON.stringify(value).length;
    } catch {
        /* keep estimate */
    }
    const old = store.get(key);
    if (old) {
        bytes -= old.size;
        store.delete(key);
    }
    store.set(key, { value, fetchedAt: now, freshUntil: now + policy.freshMs, staleUntil: now + policy.freshMs + policy.staleMs, size });
    bytes += size;
    negative.delete(key);
    while ((store.size > MAX_ENTRIES || bytes > MAX_BYTES) && store.size) {
        const [k, e] = store.entries().next().value as [string, Entry];
        store.delete(k);
        bytes -= e.size;
    }
}

export function negativeGet(key: string, now = Date.now()): unknown | null {
    const n = negative.get(key);
    if (!n) return null;
    if (n.until <= now) {
        negative.delete(key);
        return null;
    }
    return n.error;
}

export function negativeSet(key: string, error: unknown, ttlMs: number, now = Date.now()): void {
    negative.set(key, { error, until: now + ttlMs });
    if (negative.size > 5000) {
        for (const [k, v] of negative) if (v.until <= now) negative.delete(k);
    }
}

/** Single-flight: concurrent identical leaves share one promise. */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const p = fn().finally(() => {
        if (inflight.get(key) === p) inflight.delete(key);
    });
    inflight.set(key, p);
    return p;
}

export function isInflight(key: string): boolean {
    return inflight.has(key);
}

export function clearBuilderCache(): void {
    store.clear();
    negative.clear();
    inflight.clear();
    bytes = 0;
}

export function cacheStats(): { entries: number; bytes: number; negative: number } {
    return { entries: store.size, bytes, negative: negative.size };
}
