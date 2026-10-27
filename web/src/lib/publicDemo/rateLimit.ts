/**
 * A small per-visitor limit for the public demo (anonymous, so nobody can use it to run the server hot):
 * fixed one-minute windows per client address, in memory (one web process). IPv6 counts per /64 (one
 * customer's whole block), and when the table is full the oldest windows are dropped, never everyone's.
 * Edge-safe and Node-safe.
 *
 * The address comes from lib/clientIp.ts: CF-Connecting-IP only when the TCP peer is a Cloudflare edge, else the
 * peer itself, so a forged header sent straight to the origin does not pick the key.
 */
import { clientKey } from '@/lib/clientIp';

export const DEMO_API_LIMIT_PER_MIN = 300;   // a busy page fires ~30 calls; this is ten pages a minute
export const DEMO_START_LIMIT_PER_MIN = 20;  // /demo itself

const WINDOW_MS = 60_000;
export const RATE_MAX_KEYS = 20_000;
const hits = new Map<string, { n: number; t: number }>();

/** True when this key is still under `limit` hits in the current minute (and counts the hit). */
export function demoRateOk(key: string, limit: number, now: number = Date.now()): boolean {
    const h = hits.get(key);
    if (!h || now - h.t >= WINDOW_MS) {
        if (h) hits.delete(key);
        if (hits.size >= RATE_MAX_KEYS) {
            // Expired windows first, then the oldest (Map keeps insertion order), one tenth at a time.
            for (const [k, v] of hits) if (now - v.t >= WINDOW_MS) hits.delete(k);
            let drop = hits.size - RATE_MAX_KEYS + Math.ceil(RATE_MAX_KEYS / 10);
            for (const k of hits.keys()) {
                if (drop-- <= 0) break;
                hits.delete(k);
            }
        }
        hits.set(key, { n: 1, t: now });
        return true;
    }
    h.n += 1;
    return h.n <= limit;
}

/** Test helper: is this key still counted? */
export function demoRateTracked(key: string): boolean {
    return hits.has(key);
}

export { addressKey } from '@/lib/clientIp';

/** The client address key (lib/clientIp.ts: CF-Connecting-IP only from a Cloudflare peer; IPv6 by /64). */
export function clientIp(headers: Headers): string {
    return clientKey(headers);
}
