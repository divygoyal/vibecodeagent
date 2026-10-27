/**
 * A small per-visitor limit for the public demo (anonymous, so nobody can use it to run the server hot):
 * fixed one-minute windows per client IP, in memory (one web process). Pure apart from the shared map; edge-safe.
 */

export const DEMO_API_LIMIT_PER_MIN = 300;   // a busy page fires ~30 calls; this is ten pages a minute
export const DEMO_START_LIMIT_PER_MIN = 20;  // /demo itself

const WINDOW_MS = 60_000;
const MAX_KEYS = 20_000;
const hits = new Map<string, { n: number; t: number }>();

/** True when this key is still under `limit` hits in the current minute (and counts the hit). */
export function demoRateOk(key: string, limit: number, now: number = Date.now()): boolean {
    const h = hits.get(key);
    if (!h || now - h.t >= WINDOW_MS) {
        if (hits.size >= MAX_KEYS) {
            for (const [k, v] of hits) if (now - v.t >= WINDOW_MS) hits.delete(k);
            if (hits.size >= MAX_KEYS) hits.clear();
        }
        hits.set(key, { n: 1, t: now });
        return true;
    }
    h.n += 1;
    return h.n <= limit;
}

/** The client IP as the proxies in front of us report it (Cloudflare first). */
export function clientIp(headers: Headers): string {
    return headers.get('cf-connecting-ip')
        || headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || headers.get('x-real-ip')
        || 'unknown';
}
