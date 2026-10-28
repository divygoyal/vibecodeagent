/**
 * The demo request marker: middleware puts `x-tc-demo-request: <marker>` on the requests it serves as the demo
 * user, and only those. The value is HMAC-SHA256(NEXTAUTH_SECRET, purpose), so nobody outside the server can
 * forge it; middleware also strips the header from every incoming request. Server code trusts a demo session
 * (lib/publicDemo/sessionGuard.ts) and answers Google from demo data (lib/demo/fetchShim.ts) only with it.
 * Web Crypto only: works in the edge middleware and in Node. Pure apart from a per-secret memo.
 */

const PURPOSE = 'trafficclaw public demo request v1';
const memo = new Map<string, Promise<string>>();

function b64url(bytes: ArrayBuffer): string {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The marker for this secret (null without a secret). */
export function demoMarker(secret: string | undefined = process.env.NEXTAUTH_SECRET): Promise<string | null> {
    if (!secret) return Promise.resolve(null);
    let p = memo.get(secret);
    if (!p) {
        const enc = new TextEncoder();
        p = crypto.subtle
            .importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
            .then((key) => crypto.subtle.sign('HMAC', key, enc.encode(PURPOSE)))
            .then(b64url);
        if (memo.size > 4) memo.clear();
        memo.set(secret, p);
    }
    return p;
}

/** Constant-time check of a presented marker. */
export async function isDemoMarker(value: string | null | undefined, secret: string | undefined = process.env.NEXTAUTH_SECRET): Promise<boolean> {
    if (!value) return false;
    const want = await demoMarker(secret);
    if (!want || value.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ value.charCodeAt(i);
    return diff === 0;
}
