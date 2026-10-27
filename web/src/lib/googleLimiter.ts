/**
 * Shared concurrency limiter and circuit breaker for Google Data API calls (BUILDER.md 8.5).
 *
 * GA4 allows 10 concurrent requests per property; we keep 8 (a batchRunReports call weighs its
 * report count, because Google does not document how a batch counts). Search Console gets 4 per
 * site, and each user gets at most 12 calls in flight. A 429 opens a 60 s breaker for that asset,
 * and so do 3 server errors within a minute (Google blocks a project after 10 server errors per
 * property per hour).
 *
 * In-process: correct for one web instance. With several instances move this to Redis (P2).
 * Other features (analytics pages, AI chat, MCP, portfolio sync) can adopt it by wrapping their
 * calls in withGoogleSlot().
 */

export type GoogleFamily = 'ga4' | 'gsc';

const CAPACITY: Record<GoogleFamily, number> = { ga4: 8, gsc: 4 };
const USER_CAPACITY = 12;
const BREAKER_MS = 60_000;
const ERROR_WINDOW_MS = 60_000;
const ERRORS_TO_OPEN = 3;

class WeightedSemaphore {
    private used = 0;
    private queue: Array<{ weight: number; resolve: () => void }> = [];
    constructor(readonly capacity: number) {}

    get inFlight(): number {
        return this.used;
    }

    async acquire(weight: number): Promise<void> {
        const w = Math.min(Math.max(1, weight), this.capacity);
        if (this.used + w <= this.capacity && this.queue.length === 0) {
            this.used += w;
            return;
        }
        await new Promise<void>((resolve) => this.queue.push({ weight: w, resolve }));
    }

    release(weight: number): void {
        const w = Math.min(Math.max(1, weight), this.capacity);
        this.used = Math.max(0, this.used - w);
        while (this.queue.length && this.used + this.queue[0].weight <= this.capacity) {
            const next = this.queue.shift()!;
            this.used += next.weight;
            next.resolve();
        }
    }
}

const assetSems = new Map<string, WeightedSemaphore>();
const userSems = new Map<string, WeightedSemaphore>();
const breakers = new Map<string, number>(); // asset key -> open until
const serverErrors = new Map<string, number[]>();
/** Highest concurrent weight seen per asset (tests and logs). */
const peaks = new Map<string, number>();

function sem(map: Map<string, WeightedSemaphore>, key: string, capacity: number): WeightedSemaphore {
    let s = map.get(key);
    if (!s) {
        s = new WeightedSemaphore(capacity);
        map.set(key, s);
        if (map.size > 10_000) {
            for (const [k, v] of map) if (v.inFlight === 0) map.delete(k);
        }
    }
    return s;
}

export class GoogleBreakerOpenError extends Error {
    constructor(readonly retryAfterSec: number) {
        super('Google is rate limiting this property. Try again shortly.');
        this.name = 'GoogleBreakerOpenError';
    }
}

function assetKey(family: GoogleFamily, asset: string): string {
    return `${family}:${asset}`;
}

/** Seconds until the breaker for this asset closes, or 0. */
export function breakerOpenFor(family: GoogleFamily, asset: string): number {
    const until = breakers.get(assetKey(family, asset)) ?? 0;
    const left = until - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Record the outcome of a call so the breaker can open (status = HTTP status, 0 for network errors). */
export function reportGoogleOutcome(family: GoogleFamily, asset: string, status: number): void {
    const key = assetKey(family, asset);
    if (status === 429) {
        breakers.set(key, Date.now() + BREAKER_MS);
        return;
    }
    if (status >= 500) {
        const now = Date.now();
        const list = (serverErrors.get(key) ?? []).filter((t) => now - t < ERROR_WINDOW_MS);
        list.push(now);
        serverErrors.set(key, list);
        if (list.length >= ERRORS_TO_OPEN) {
            breakers.set(key, now + BREAKER_MS);
            serverErrors.delete(key);
        }
    }
}

/**
 * Run fn with a slot for (family, asset) and the user. weight = number of reports in a batch.
 * Throws GoogleBreakerOpenError without calling Google while the breaker is open.
 */
export async function withGoogleSlot<T>(
    family: GoogleFamily,
    asset: string,
    userKey: string,
    weight: number,
    fn: () => Promise<T>,
): Promise<T> {
    const open = breakerOpenFor(family, asset);
    if (open) throw new GoogleBreakerOpenError(open);
    const key = assetKey(family, asset);
    const a = sem(assetSems, key, CAPACITY[family]);
    const u = sem(userSems, userKey || 'anon', USER_CAPACITY);
    await u.acquire(1);
    try {
        await a.acquire(weight);
        peaks.set(key, Math.max(peaks.get(key) ?? 0, a.inFlight));
        try {
            return await fn();
        } finally {
            a.release(weight);
        }
    } finally {
        u.release(1);
    }
}

export function limiterPeak(family: GoogleFamily, asset: string): number {
    return peaks.get(assetKey(family, asset)) ?? 0;
}

export function resetLimiterStats(): void {
    peaks.clear();
    breakers.clear();
    serverErrors.clear();
}
