/**
 * A small per-visitor limit for the public demo (anonymous, so nobody can use it to run the server hot):
 * fixed one-minute windows per client address, in memory (one web process). IPv6 counts per /64 (one
 * customer's whole block), and when the table is full the oldest windows are dropped, never everyone's.
 * Edge-safe and Node-safe.
 *
 * The address comes from Cloudflare's cf-connecting-ip. That is only trustworthy while the origin answers
 * Cloudflare alone (an infra setting for the owner: firewall the origin to Cloudflare's ranges or use
 * authenticated origin pulls).
 */

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

/** An IPv6 address's /64 prefix ('2001:db8:1:2::/64'); IPv4 and anything else unchanged. */
export function addressKey(ip: string): string {
    const raw = ip.trim().replace(/^\[|\]$/g, '').split('%')[0];
    if (!raw.includes(':')) return raw;
    const v4tail = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);
    if (v4tail) return v4tail[1];
    const [head, tail = ''] = raw.split('::');
    const h = head ? head.split(':') : [];
    const t = raw.includes('::') ? (tail ? tail.split(':') : []) : [];
    const groups = raw.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
    if (groups.length < 4) return raw.toLowerCase();
    return `${groups.slice(0, 4).map((g) => (parseInt(g || '0', 16) || 0).toString(16)).join(':')}::/64`;
}

/** The client address key, as the proxies in front of us report it (Cloudflare first). */
export function clientIp(headers: Headers): string {
    const ip = headers.get('cf-connecting-ip')
        || headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || headers.get('x-real-ip')
        || 'unknown';
    return addressKey(ip);
}
