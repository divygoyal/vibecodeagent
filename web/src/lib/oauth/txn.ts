/**
 * Signed consent transaction: the validated authorization request travels
 * from /oauth/authorize to the consent page and the decision POST as an
 * HMAC-signed blob, bound to the browser's CSRF cookie. MCP.md 6.1.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { issuer, txnSecret } from '@/lib/mcp/config';
import { safeEqual, sha256Hex } from './primitives';

export interface ConsentTxn {
    /** client_id */
    c: string;
    /** redirect_uri exactly as presented */
    r: string;
    /** PKCE S256 code_challenge */
    ch: string;
    /** granted scope string */
    s: string;
    /** canonical resource */
    res: string;
    /** client state, echoed verbatim (may be absent) */
    st: string | null;
    /** prompt=consent was requested */
    pc?: boolean;
    /** binding to the CSRF cookie: sha256(cookie)[0..32] */
    n: string;
    /** expiry, epoch seconds */
    exp: number;
}

const TXN_TTL_S = 30 * 60;

function sign(payload: string): string {
    return createHmac('sha256', txnSecret()).update(payload).digest('base64url');
}

export function csrfBinding(csrf: string): string {
    return sha256Hex(`tc-csrf:${csrf}`).slice(0, 32);
}

export function newCsrfToken(): string {
    return randomBytes(24).toString('base64url');
}

export function encodeTxn(txn: Omit<ConsentTxn, 'exp'>, now = Date.now()): string {
    const payload = Buffer.from(JSON.stringify({ ...txn, exp: Math.floor(now / 1000) + TXN_TTL_S })).toString('base64url');
    return `${payload}.${sign(payload)}`;
}

export function decodeTxn(raw: string | null | undefined, now = Date.now()): ConsentTxn | null {
    if (!raw || typeof raw !== 'string' || raw.length > 8000) return null;
    const [payload, sig, extra] = raw.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    if (!safeEqual(sig, sign(payload))) return null;
    try {
        const txn = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ConsentTxn;
        if (!txn || typeof txn.c !== 'string' || typeof txn.r !== 'string' || typeof txn.ch !== 'string') return null;
        if (!Number.isFinite(txn.exp) || txn.exp * 1000 <= now) return null;
        return txn;
    } catch {
        return null;
    }
}

export function csrfCookieName(): string {
    return issuer().startsWith('https:') ? '__Host-tc_oauth_csrf' : 'tc_oauth_csrf';
}

export function csrfCookieHeader(value: string): string {
    const secure = issuer().startsWith('https:') ? '; Secure' : '';
    return `${csrfCookieName()}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`;
}

export function readCookie(req: Request, name: string): string | null {
    const header = req.headers.get('cookie') || '';
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
    }
    return null;
}

/** Build the client redirect with RFC 9207 `iss` (always) and `state` (when given). */
export function clientRedirect(redirectUri: string, params: Record<string, string | null | undefined>): string {
    const url = new URL(redirectUri);
    for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) url.searchParams.set(k, v);
    url.searchParams.set('iss', issuer());
    return url.toString();
}
