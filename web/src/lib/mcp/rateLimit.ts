/**
 * In-process rate limiting for the MCP endpoints (one web replica today;
 * move to Upstash if the app ever runs several). MCP.md section 8.1.
 */
import { shared } from './shared';
import { clientKey } from '@/lib/clientIp';

interface Window {
    count: number;
    resetAt: number;
}

const windows = shared('rateWindows', () => new Map<string, Window>());

function sweep(now: number) {
    if (windows.size < 5000) return;
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
}

/** Fixed-window counter. Returns ok=false with seconds until the window resets. */
export function hitLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
    sweep(now);
    let w = windows.get(key);
    if (!w || w.resetAt <= now) {
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
    }
    w.count += 1;
    if (w.count > limit) return { ok: false, retryAfterS: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
    return { ok: true, retryAfterS: 0 };
}

/**
 * Token bucket for per-user tool cost units: capacity 100, refill 2 units/s.
 * The heaviest single call (site_health on 20 sites) costs 65, so it always fits.
 */
const buckets = shared('costBuckets', () => new Map<string, { tokens: number; at: number }>());
export const COST_BUCKET = { capacity: 100, refillPerS: 2 };

export function chargeUnits(key: string, units: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
    const b = buckets.get(key) ?? { tokens: COST_BUCKET.capacity, at: now };
    const refilled = Math.min(COST_BUCKET.capacity, b.tokens + ((now - b.at) / 1000) * COST_BUCKET.refillPerS);
    if (refilled < units) {
        buckets.set(key, { tokens: refilled, at: now });
        return { ok: false, retryAfterS: Math.ceil((units - refilled) / COST_BUCKET.refillPerS) };
    }
    buckets.set(key, { tokens: refilled - units, at: now });
    if (buckets.size > 20000) buckets.clear();
    return { ok: true, retryAfterS: 0 };
}

/** Concurrency gate: at most `max` in flight per key, waiting up to `waitMs`. */
const inflight = shared('inflightSlots', () => new Map<string, number>());
export async function acquireSlot(key: string, max: number, waitMs: number): Promise<(() => void) | null> {
    const deadline = Date.now() + waitMs;
    while ((inflight.get(key) ?? 0) >= max) {
        if (Date.now() >= deadline) return null;
        await new Promise((r) => setTimeout(r, 100));
    }
    inflight.set(key, (inflight.get(key) ?? 0) + 1);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const n = (inflight.get(key) ?? 1) - 1;
        if (n <= 0) inflight.delete(key);
        else inflight.set(key, n);
    };
}

/** Rate-limit key of the caller: CF-Connecting-IP only from a Cloudflare peer, else the peer (lib/clientIp.ts). */
export function clientIp(req: Request): string {
    return clientKey(req.headers);
}

/** /24 for IPv4, /48 for IPv6: what we store in audit rows. */
export function ipPrefix(ip: string): string {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split('.').slice(0, 3).join('.') + '.0/24';
    if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::/48';
    return 'unknown';
}
