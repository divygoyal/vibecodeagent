/**
 * "Connect another Google account": the OAuth 2.0 authorization-code flow that adds an extra
 * Google account as a read-only DATA connection (Settings -> Google). It never touches the
 * NextAuth sign-in, so the signed-in identity cannot change.
 *
 *   GET /api/google/link/start      -> Google's consent screen (state + PKCE S256, offline access,
 *                                      prompt "select_account consent", the sign-in's read-only scopes)
 *   GET /api/google/link/callback   -> code exchange, id_token check, store via the admin
 *                                      (admin/google_accounts.py), back to Settings -> Google
 *
 * The redirect URI is same-origin: `${NEXTAUTH_URL origin}/api/google/link/callback`, or
 * GOOGLE_LINK_REDIRECT_URI when set. It must be listed under the OAuth client's "Authorized
 * redirect URIs" in Google Cloud (see NOTES-B3-ACCOUNTS.md).
 *
 * The flow state (state, PKCE verifier, the user it was started for, where to return) lives in
 * an encrypted, HttpOnly, SameSite=Lax cookie scoped to /api/google/link, valid 10 minutes and
 * deleted by the callback. Pure helpers here; the routes do the I/O.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { GOOGLE_CONSENT_PROMPT, GOOGLE_DATA_SCOPES, GOOGLE_SCOPE, missingGoogleScopes, safeCallbackPath } from '@/lib/googleConsent';

export const LINK_COOKIE = 'tc_glink';
export const LINK_COOKIE_PATH = '/api/google/link';
export const LINK_TTL_S = 600;
export const LINK_CALLBACK_PATH = '/api/google/link/callback';
export const LINK_RETURN_DEFAULT = '/dashboard/settings?tab=google';
export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export interface LinkFlowState {
    state: string;
    verifier: string;
    /** Session user id the flow was started for; the callback must see the same user. */
    uid: string;
    /** Same-site path to return to. */
    ret: string;
    /** Google sub of the linked account being reconnected (login_hint), if any. */
    hint?: string;
    iat: number;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

export function randomToken(bytes = 32): string {
    return b64url(randomBytes(bytes));
}

/** RFC 7636 S256 challenge for a verifier. */
export function pkceChallenge(verifier: string): string {
    return b64url(createHash('sha256').update(verifier).digest());
}

export function newFlowState(uid: string, ret: string | null | undefined, hint?: string | null, now = Date.now()): LinkFlowState {
    return {
        state: randomToken(32),
        // 43-128 characters from the unreserved set: 64 random bytes -> 86 base64url characters.
        verifier: randomToken(64),
        uid,
        ret: safeCallbackPath(ret || LINK_RETURN_DEFAULT),
        ...(hint ? { hint } : {}),
        iat: Math.floor(now / 1000),
    };
}

/** Constant-time comparison of the returned `state` with the cookie's. */
export function stateMatches(expected: string, got: string | null | undefined): boolean {
    if (!got || !expected) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(got);
    return a.length === b.length && timingSafeEqual(a, b);
}

export function flowExpired(flow: Pick<LinkFlowState, 'iat'>, now = Date.now()): boolean {
    return !flow.iat || Math.floor(now / 1000) - flow.iat > LINK_TTL_S;
}

/** The redirect URI Google sends the code back to (same origin as the app). */
export function linkRedirectUri(env: Record<string, string | undefined> = process.env): string {
    const override = (env.GOOGLE_LINK_REDIRECT_URI || '').trim();
    if (override) return override;
    const base = new URL(env.NEXTAUTH_URL || 'http://localhost:3000');
    return `${base.origin}${LINK_CALLBACK_PATH}`;
}

/** Google's authorization URL for the link flow. */
export function authorizeUrl(flow: LinkFlowState, opts: { clientId: string; redirectUri: string; loginHint?: string | null }): string {
    const q = new URLSearchParams({
        client_id: opts.clientId,
        redirect_uri: opts.redirectUri,
        response_type: 'code',
        // The same read-only scopes as the sign-in (openid email profile + analytics.readonly + webmasters.readonly).
        scope: GOOGLE_SCOPE,
        // A refresh token, and the account picker plus consent every time: a new grant for this account.
        access_type: 'offline',
        prompt: GOOGLE_CONSENT_PROMPT,
        state: flow.state,
        code_challenge: pkceChallenge(flow.verifier),
        code_challenge_method: 'S256',
    });
    if (opts.loginHint) q.set('login_hint', opts.loginHint);
    return `${GOOGLE_AUTHORIZE_URL}?${q.toString()}`;
}

export interface IdTokenClaims {
    sub: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
}

/**
 * The claims of the id_token Google returned from the token endpoint. The token came straight
 * from Google over TLS in our own back-channel request, so per OpenID Connect Core 3.1.3.7 the
 * signature check may be skipped; issuer, audience and expiry are still checked. `allowUnsigned`
 * (demo mode only) accepts the demo shim's alg "none" tokens; real Google tokens are RS256.
 */
export function parseIdToken(idToken: string | undefined, clientId: string, opts: { now?: number; allowUnsigned?: boolean } = {}): IdTokenClaims {
    if (!idToken) throw new LinkError('no_id_token', 'Google did not say which account was chosen.');
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new LinkError('bad_id_token', 'Google returned an unreadable account token.');
    let header: Record<string, unknown>;
    let payload: Record<string, unknown>;
    try {
        header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
        throw new LinkError('bad_id_token', 'Google returned an unreadable account token.');
    }
    if (header.alg === 'none' && !opts.allowUnsigned) throw new LinkError('bad_id_token', 'Unsigned account token.');
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    if (!GOOGLE_ISSUERS.has(String(payload.iss))) throw new LinkError('bad_id_token', 'The account token is not from Google.');
    const aud = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud)];
    if (!clientId || !aud.includes(clientId)) throw new LinkError('bad_id_token', 'The account token is for another app.');
    if (typeof payload.exp !== 'number' || payload.exp + 300 < now) throw new LinkError('bad_id_token', 'The account token has expired.');
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255) throw new LinkError('bad_id_token', 'The account token has no account id.');
    return {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
        emailVerified: payload.email_verified === true || payload.email_verified === 'true',
        name: typeof payload.name === 'string' ? payload.name.slice(0, 255) : null,
    };
}

/** Data scopes the user did not grant (both are needed: Analytics and Search Console). */
export function missingDataScopes(granted: string | null | undefined): string[] {
    if (!granted || !granted.trim()) return [...GOOGLE_DATA_SCOPES];
    return missingGoogleScopes(granted);
}

export type LinkResultCode =
    | 'added' | 'updated' | 'same' | 'cancelled' | 'expired' | 'scopes' | 'limit' | 'failed' | 'signed_out';

export class LinkError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

/** Where the callback sends the browser: the return path with `?link=<result>` (Settings shows a message). */
export function resultUrl(base: string, ret: string | null | undefined, result: LinkResultCode): string {
    const path = safeCallbackPath(ret || LINK_RETURN_DEFAULT);
    const u = new URL(path, base);
    u.searchParams.set('link', result);
    return u.toString();
}

/** The app's own origin (NEXTAUTH_URL), never the request's Host header. */
export function appOrigin(env: Record<string, string | undefined> = process.env): string {
    try {
        return new URL(env.NEXTAUTH_URL || '').origin;
    } catch {
        return 'http://localhost:3000';
    }
}
