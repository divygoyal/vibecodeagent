/**
 * Server probe of a web embed's address (round 9): does the page refuse to be shown in a frame?
 *
 * The browser cannot tell a blocked frame from a slow one, so the server reads the response headers once
 * (X-Frame-Options, CSP frame-ancestors) and caches the verdict for an hour. SSRF guards, because the address
 * is chosen by a dashboard owner:
 * - https only, validated by embedUrlProblem (no IP literals, no internal names, never our own hosts);
 * - the address the socket connects to is checked inside the DNS lookup (no rebinding gap): any private,
 *   loopback, link-local or CGNAT answer refuses the request (isPrivateAddress);
 * - at most 3 redirects, each one validated again; headers only (the body is never read); 5 s limit;
 * - no cookies, no credentials, a fixed User-Agent; nothing from the response except the verdict is returned.
 */
import { lookup as dnsLookup } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import { isPrivateAddress } from '@/lib/oauth/ssrf';
import { embedUrlProblem, frameVerdict, type EmbedProbe } from '../embed';

const guardedLookup: LookupFunction = (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, '', 0);
        const list = Array.isArray(addresses) ? addresses : [];
        if (!list.length || list.some((a) => isPrivateAddress(a.address))) return callback(new Error('private address'), '', 0);
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
        return callback(null, list[0].address, list[0].family);
    });
};

export type HeaderFetch = (url: URL) => Promise<{ status: number; headers: Record<string, string>; location?: string }>;

/** One HEAD-like read: GET, headers only, then the socket is closed. */
const realFetch: HeaderFetch = (url) => new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
        method: 'GET',
        headers: { 'user-agent': 'TrafficClaw-EmbedCheck/1.0', accept: 'text/html,*/*;q=0.1', range: 'bytes=0-0' },
        lookup: guardedLookup,
        timeout: 4000,
    }, (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') headers[k.toLowerCase()] = v;
            else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(', ');
        }
        res.destroy();
        resolve({ status: res.statusCode ?? 0, headers, location: headers.location });
    });
    const total = setTimeout(() => req.destroy(new Error('timeout')), 5000);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => { clearTimeout(total); reject(e); });
    req.on('close', () => clearTimeout(total));
    req.end();
});

/** Verdict for an address. `appHosts` are the hosts of the page that will frame it. */
export async function probeEmbeddable(raw: string, appHosts: string[], fetchHeaders: HeaderFetch = realFetch): Promise<EmbedProbe> {
    let url: URL;
    if (embedUrlProblem(raw)) return { status: 'unknown' };
    try {
        url = new URL(raw.trim());
    } catch {
        return { status: 'unknown' };
    }
    try {
        for (let hop = 0; hop < 4; hop++) {
            const res = await fetchHeaders(url);
            if (res.status >= 300 && res.status < 400 && res.location) {
                const next = new URL(res.location, url);
                if (embedUrlProblem(next.href)) return { status: 'unknown' };
                url = next;
                continue;
            }
            const v = frameVerdict(res.headers, appHosts);
            return v.blocked ? { status: 'blocked', reason: v.reason ?? 'The page refuses to be framed' } : { status: 'ok' };
        }
    } catch {
        // timeouts, DNS failures, refused private addresses: the iframe is tried anyway
    }
    return { status: 'unknown' };
}

// ── cache ──

const cache = new Map<string, { at: number; ttl: number; value: EmbedProbe }>();
const inflight = new Map<string, Promise<EmbedProbe>>();

export function clearEmbedProbeCache(): void {
    cache.clear();
    inflight.clear();
}

/** Cached verdict: an hour for an answer, a minute for "unknown" (so a slow site is tried again soon). */
export async function probeEmbeddableCached(raw: string, appHosts: string[], fetchHeaders?: HeaderFetch, now: () => number = Date.now): Promise<EmbedProbe> {
    const key = `${raw.trim()}|${appHosts.join(',')}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < hit.ttl) return hit.value;
    const running = inflight.get(key);
    if (running) return running;
    const p = probeEmbeddable(raw, appHosts, fetchHeaders).then((value) => {
        cache.set(key, { at: now(), ttl: value.status === 'unknown' ? 60_000 : 3_600_000, value });
        if (cache.size > 500) for (const [k, e] of cache) if (now() - e.at >= e.ttl) cache.delete(k);
        return value;
    }).finally(() => { inflight.delete(key); });
    inflight.set(key, p);
    return p;
}

/** Hosts of this app as the request sees them (the page that will frame the embed). */
export function appHostsFor(req: Request): string[] {
    const hosts = new Set<string>(['trafficclaw.com']);
    try { hosts.add(new URL(req.url).hostname); } catch { /* ignore */ }
    for (const h of [req.headers.get('x-forwarded-host'), req.headers.get('host')]) if (h) hosts.add(h.split(':')[0]);
    for (const env of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
        try { if (env) hosts.add(new URL(env).hostname); } catch { /* ignore */ }
    }
    return [...hosts].map((h) => h.toLowerCase());
}
