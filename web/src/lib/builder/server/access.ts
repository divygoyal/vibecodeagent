/**
 * Access helpers for the dashboard routes: the signed-in user, the owner's Google token,
 * unlock keys for password-protected shares, and small in-memory rate limits.
 * Server only.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';
import { accessForAsset, listLinkedGoogleConnections } from '@/lib/googleAccounts';

export async function sessionUserId(): Promise<string | null> {
    const session = (await getServerSession(authOptions)) as { user?: { id?: string } } | null;
    const id = session?.user?.id;
    return typeof id === 'string' && id ? id : null;
}

/** The user's Google access token (stored refresh token), or null when not connected. */
export async function googleTokenFor(userIdentifier: string): Promise<string | null> {
    const tokens = await fetchGoogleTokensFromDb(userIdentifier);
    if (!tokens) return null;
    try {
        return await getValidAccessToken(tokens.accessToken, tokens.refreshToken);
    } catch {
        return null;
    }
}

/**
 * Token for one asset of the user when extra Google accounts are linked: the account that lists it.
 * Null without linked accounts (the engine then uses googleTokenFor's token for everything).
 */
export async function googleTokenForAsset(userIdentifier: string, asset: { kind: 'ga4' | 'gsc'; id: string }): Promise<string | null> {
    if ((await listLinkedGoogleConnections(userIdentifier)).length === 0) return null;
    const access = await accessForAsset(userIdentifier, asset, async () => (await fetchGoogleTokensFromDb(userIdentifier)) ?? {});
    return access.ok ? access.token : null;
}

// ── unlock keys (24 h, HMAC with the app secret) ─────────────────────────

const UNLOCK_TTL_MS = 24 * 3600_000;

function secret(): string {
    return process.env.NEXTAUTH_SECRET || process.env.SHARE_WATERMARK_SECRET || 'dev-only-dashboard-unlock-secret';
}

function sign(token: string, exp: number): string {
    return createHmac('sha256', secret()).update(`dash-unlock|${token}|${exp}`).digest('base64url');
}

export function makeUnlockKey(token: string, now = Date.now()): { key: string; expiresAt: number } {
    const exp = now + UNLOCK_TTL_MS;
    return { key: `${exp}.${sign(token, exp)}`, expiresAt: exp };
}

export function checkUnlockKey(token: string, key: string | null | undefined, now = Date.now()): boolean {
    if (!key) return false;
    const [expRaw, sig] = key.split('.');
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp < now || !sig) return false;
    const want = Buffer.from(sign(token, exp));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
}

export function unlockCookieName(token: string): string {
    return `tc_dash_${token.slice(0, 12)}`;
}

/** Unlock key from `Authorization: Bearer <key>` (embeds) or the HttpOnly cookie (top-level pages). */
export function unlockKeyFrom(req: Request, token: string): string | null {
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
    const cookie = req.headers.get('cookie') ?? '';
    const name = unlockCookieName(token);
    for (const part of cookie.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
}

// ── rate limits ──────────────────────────────────────────────────────────

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
        if (buckets.size > 20_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    b.count++;
    return b.count > limit;
}

export function clientIp(req: Request): string {
    const xf = req.headers.get('x-forwarded-for');
    if (xf) return xf.split(',')[0].trim();
    return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Hash of token + IP, sent to the admin for its own password rate limit (no raw IPs stored). */
export function clientKey(req: Request, token: string): string {
    return createHash('sha256').update(`${token}|${clientIp(req)}`).digest('hex').slice(0, 24);
}
