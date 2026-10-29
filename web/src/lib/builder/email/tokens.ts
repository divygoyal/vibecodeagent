/**
 * Signed tokens for scheduled dashboard emails (round 9). Server only (node:crypto).
 *
 * Every link in an email carries one: the unsubscribe link, the "yes, send me these" and "no" links
 * of the confirmation email, and the chart images. A token is `base64url(JSON) . base64url(HMAC)`;
 * only this server can make one and nobody can change what it says. Unsubscribe and decline links
 * never expire (they must always work); the confirmation link lasts 14 days.
 *
 * The secret is EMAIL_TOKEN_SECRET, else NEXTAUTH_SECRET. Without either, production refuses to make
 * or accept tokens (no email goes out rather than links anyone could forge).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type TokenKind = 'unsub' | 'confirm' | 'decline' | 'img';

export interface LinkPayload { k: 'unsub' | 'confirm' | 'decline'; d: string; e: string; x?: number }
export interface ImagePayload { k: 'img'; c: unknown }
export type Payload = LinkPayload | ImagePayload;

export const CONFIRM_TTL_MS = 14 * 86_400_000;

export function tokenSecret(env: Record<string, string | undefined> = process.env): string | null {
    const s = env.EMAIL_TOKEN_SECRET || env.NEXTAUTH_SECRET;
    if (s) return s;
    return env.NODE_ENV === 'production' ? null : 'dev-only-email-token-secret';
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function mac(secret: string, body: string): string {
    return createHmac('sha256', secret).update(`dash-email|${body}`).digest('base64url');
}

export function signToken(payload: Payload, secret: string | null = tokenSecret()): string {
    if (!secret) throw new Error('EMAIL_TOKEN_SECRET (or NEXTAUTH_SECRET) is not set');
    const body = b64(JSON.stringify(payload));
    return `${body}.${mac(secret, body)}`;
}

/** The payload when the signature is ours (and a link token has not expired), else null. Never throws. */
export function verifyToken(token: unknown, now = Date.now(), secret: string | null = tokenSecret()): Payload | null {
    if (!secret || typeof token !== 'string' || token.length > 4000) return null;
    const i = token.lastIndexOf('.');
    if (i <= 0) return null;
    const body = token.slice(0, i);
    const want = Buffer.from(mac(secret, body));
    const got = Buffer.from(token.slice(i + 1));
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    try {
        const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
        if (!p || typeof p !== 'object') return null;
        if (p.k === 'img') return p;
        if ((p.k !== 'unsub' && p.k !== 'confirm' && p.k !== 'decline') || typeof p.d !== 'string' || typeof p.e !== 'string') return null;
        if (typeof p.x === 'number' && p.x < now) return null;
        return p;
    } catch {
        return null;
    }
}

export function linkToken(kind: LinkPayload['k'], dashboardId: string, email: string, now = Date.now(), secret: string | null = tokenSecret()): string {
    const payload: LinkPayload = { k: kind, d: dashboardId, e: email.trim().toLowerCase(), ...(kind === 'confirm' ? { x: now + CONFIRM_TTL_MS } : {}) };
    return signToken(payload, secret);
}
