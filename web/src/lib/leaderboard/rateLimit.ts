import { clientKey } from '@/lib/clientIp';
/**
 * Small in-memory sliding-window limiter (per process, like the other public
 * endpoints in this app). Keys should include the route name.
 */
const store = new Map<string, number[]>();

export function allow(key: string, max: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const recent = (store.get(key) || []).filter((t) => t > now - windowMs);
    if (recent.length >= max) {
        store.set(key, recent);
        return { ok: false, retryAfterSeconds: Math.max(Math.ceil((recent[0] + windowMs - now) / 1000), 1) };
    }
    recent.push(now);
    store.set(key, recent);
    if (store.size > 5000) {
        for (const [k, v] of store) if (!v.some((t) => t > now - windowMs)) store.delete(k);
    }
    return { ok: true, retryAfterSeconds: 0 };
}

/** Rate-limit key of the caller (lib/clientIp.ts). */
export function clientIp(req: Request): string {
    return clientKey(req.headers);
}
