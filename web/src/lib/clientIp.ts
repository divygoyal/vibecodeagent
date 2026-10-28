/**
 * The one place that decides a request's client address (for rate limits and abuse logs). Edge- and Node-safe, pure.
 *
 * Production path: browser -> Cloudflare -> Traefik (Coolify) -> Next. Traefik trusts no incoming X-Forwarded-*
 * and sets X-Real-Ip / X-Forwarded-For to the TCP peer it saw: a Cloudflare edge, or anyone who connects to the
 * origin directly (the origin answers 80/443 from anywhere). So:
 *   peer   = X-Real-Ip, else the LAST X-Forwarded-For entry (the hop our own proxy appended)
 *   client = CF-Connecting-IP only when the peer is a Cloudflare address; otherwise the peer itself.
 * A forged CF-Connecting-IP sent straight to the origin is ignored. Rate limits key IPv6 by /64 (clientKey).
 */

// Cloudflare's published ranges, copied 2026-10-27 from https://www.cloudflare.com/ips-v4 and
// https://www.cloudflare.com/ips-v6. Re-check now and then; a missing new range only means those visitors are
// keyed by the Cloudflare edge address (stricter limits), never that a forged header is trusted.
export const CLOUDFLARE_IPV4 = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
    '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
export const CLOUDFLARE_IPV6 = [
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

/** Strips brackets, zone ids and the IPv4-mapped prefix; '' when empty. */
function clean(ip: string | null | undefined): string {
    const raw = (ip ?? '').trim().replace(/^\[|\]$/g, '').split('%')[0];
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);
    return mapped ? mapped[1] : raw;
}

function ipv4ToInt(ip: string): number | null {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (!m) return null;
    const parts = m.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return null;
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/** Eight 16-bit groups, or null. */
function ipv6Groups(ip: string): number[] | null {
    if (!ip.includes(':') || !/^[0-9a-f:]+$/i.test(ip)) return null;
    const halves = ip.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
    if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
    const groups = [...head, ...Array(fill).fill('0'), ...tail].map((g) => (g === '' ? NaN : parseInt(g, 16)));
    return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

export function inCidr(ip: string, cidr: string): boolean {
    const [base, bitsRaw] = cidr.split('/');
    const bits = Number(bitsRaw);
    const a4 = ipv4ToInt(ip);
    const b4 = ipv4ToInt(base);
    if (a4 !== null && b4 !== null) {
        if (bits === 0) return true;
        const mask = (0xffffffff << (32 - bits)) >>> 0;
        return ((a4 & mask) >>> 0) === ((b4 & mask) >>> 0);
    }
    const a6 = ipv6Groups(ip);
    const b6 = ipv6Groups(base);
    if (!a6 || !b6) return false;
    let left = bits;
    for (let i = 0; i < 8 && left > 0; i++) {
        const take = Math.min(16, left);
        const mask = (0xffff << (16 - take)) & 0xffff;
        if ((a6[i] & mask) !== (b6[i] & mask)) return false;
        left -= take;
    }
    return true;
}

/** Is this a Cloudflare edge address? */
export function isCloudflareIp(ip: string | null | undefined): boolean {
    const c = clean(ip);
    if (!c) return false;
    return (c.includes(':') ? CLOUDFLARE_IPV6 : CLOUDFLARE_IPV4).some((r) => inCidr(c, r));
}

/** The TCP peer our proxy reports: X-Real-Ip, else the last X-Forwarded-For entry. */
export function peerAddress(headers: Headers): string {
    const real = clean(headers.get('x-real-ip'));
    if (real) return real;
    const xff = (headers.get('x-forwarded-for') || '').split(',').map((s) => clean(s)).filter(Boolean);
    return xff.length ? xff[xff.length - 1] : '';
}

/** The client address: CF-Connecting-IP when the peer is Cloudflare, else the peer; 'unknown' when neither exists. */
export function clientAddress(headers: Headers): string {
    const peer = peerAddress(headers);
    if (peer && isCloudflareIp(peer)) {
        const cf = clean(headers.get('cf-connecting-ip'));
        if (cf && (ipv4ToInt(cf) !== null || ipv6Groups(cf))) return cf;
    }
    return peer || 'unknown';
}

/** An IPv6 address's /64 prefix ('2001:db8:1:2::/64'); IPv4 and anything else unchanged. */
export function addressKey(ip: string): string {
    const c = clean(ip);
    const g = ipv6Groups(c);
    if (!g) return c || 'unknown';
    return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

/** The rate-limit key of a request: clientAddress, IPv6 by /64. */
export function clientKey(headers: Headers): string {
    return addressKey(clientAddress(headers));
}
