/**
 * SSRF guard for fetching Client ID Metadata Documents (MCP.md 4.2).
 *
 * The address check runs inside the socket's DNS lookup, so the IP that is
 * actually connected to is the one that was checked (no DNS-rebinding gap).
 * HTTPS on port 443 only, no redirects, hard time and size caps.
 */
import { lookup as dnsLookup } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';

function v4ToInt(ip: string): number {
    return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inV4(ip: string, cidr: string): boolean {
    const [base, bitsRaw] = cidr.split('/');
    const bits = Number(bitsRaw);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

const BLOCKED_V4 = [
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
    '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15',
    '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
];

function expandV6(ip: string): number[] | null {
    let addr = ip.toLowerCase();
    const zone = addr.indexOf('%');
    if (zone >= 0) addr = addr.slice(0, zone);
    let tail: number[] = [];
    const lastColon = addr.lastIndexOf(':');
    const maybeV4 = addr.slice(lastColon + 1);
    if (maybeV4.includes('.')) {
        if (isIP(maybeV4) !== 4) return null;
        const n = v4ToInt(maybeV4);
        tail = [(n >>> 16) & 0xffff, n & 0xffff];
        addr = `${addr.slice(0, lastColon + 1)}0:0`;
    }
    const halves = addr.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
    const groups = [...head, ...Array(fill).fill('0'), ...rest].map((g) => parseInt(g || '0', 16));
    if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
    if (tail.length) {
        groups[6] = tail[0];
        groups[7] = tail[1];
    }
    return groups;
}

/** True for loopback, private, link-local, CGNAT, ULA, multicast, documentation and mapped variants. */
export function isPrivateAddress(ip: string): boolean {
    const family = isIP(ip);
    if (family === 4) return BLOCKED_V4.some((c) => inV4(ip, c)) || ip === '255.255.255.255';
    if (family !== 6) return true;
    const g = expandV6(ip);
    if (!g) return true;
    const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
    if (g.every((x) => x === 0)) return true; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateAddress(embeddedV4()); // ::ffff:a.b.c.d
    if (g.slice(0, 6).every((x) => x === 0)) return true; // deprecated IPv4-compatible
    if (g[0] === 0x64 && g[1] === 0xff9b) return isPrivateAddress(embeddedV4()); // NAT64
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
    if ((g[0] & 0xff00) === 0xff00) return true; // multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
    if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard
    if (g[0] === 0x2002) return isPrivateAddress(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`); // 6to4
    return false;
}

export class SafeFetchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SafeFetchError';
    }
}

export interface SafeFetchResult {
    status: number;
    headers: Record<string, string>;
    body: string;
}

export interface SafeFetchOptions {
    maxBytes?: number;
    timeoutMs?: number;
    /** Dev/test only: allow http://127.0.0.1 targets (never in production). */
    allowLoopbackHttp?: boolean;
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, '', 0);
        const list = Array.isArray(addresses) ? addresses : [];
        const bad = list.find((a) => isPrivateAddress(a.address));
        if (!list.length || bad) return callback(new SafeFetchError(`refusing to connect to a private address for ${hostname}`), '', 0);
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
        return callback(null, list[0].address, list[0].family);
    });
};

/** GET a public HTTPS JSON document with SSRF protections. */
export function safeFetchJsonDocument(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
    const maxBytes = opts.maxBytes ?? 64 * 1024;
    const timeoutMs = opts.timeoutMs ?? 5000;
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return Promise.reject(new SafeFetchError('invalid URL'));
    }
    const devLoopback = Boolean(opts.allowLoopbackHttp) && process.env.NODE_ENV !== 'production'
        && url.protocol === 'http:' && url.hostname === '127.0.0.1';
    if (!devLoopback) {
        if (url.protocol !== 'https:') return Promise.reject(new SafeFetchError('client metadata must be served over https'));
        if (url.port && url.port !== '443') return Promise.reject(new SafeFetchError('client metadata must be on port 443'));
        if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ''))) {
            return Promise.reject(new SafeFetchError('refusing to connect to a private address'));
        }
    }
    return new Promise((resolve, reject) => {
        const requester = devLoopback ? httpRequest : httpsRequest;
        const req = requester(url, {
            method: 'GET',
            headers: { accept: 'application/json', 'user-agent': 'TrafficClaw-MCP/1.0 (+client-metadata)' },
            lookup: devLoopback ? undefined : guardedLookup,
            timeout: Math.min(3000, timeoutMs),
        }, (res) => {
            const status = res.statusCode || 0;
            if (status >= 300 && status < 400) {
                res.resume();
                reject(new SafeFetchError('client metadata must not redirect'));
                return;
            }
            let size = 0;
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > maxBytes) {
                    req.destroy(new SafeFetchError('client metadata document is too large'));
                    return;
                }
                chunks.push(chunk);
            });
            res.on('end', () => {
                const headers: Record<string, string> = {};
                for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') headers[k] = v;
                resolve({ status, headers, body: Buffer.concat(chunks).toString('utf8') });
            });
            res.on('error', reject);
        });
        const total = setTimeout(() => req.destroy(new SafeFetchError('client metadata fetch timed out')), timeoutMs);
        req.on('timeout', () => req.destroy(new SafeFetchError('client metadata connect timed out')));
        req.on('error', (err) => {
            clearTimeout(total);
            reject(err instanceof SafeFetchError ? err : new SafeFetchError(err.message));
        });
        req.on('close', () => clearTimeout(total));
        req.end();
    });
}
