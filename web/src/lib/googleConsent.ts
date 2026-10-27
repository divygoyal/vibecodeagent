/**
 * When Google sign-in asks for consent, and which Google refresh token the session keeps.
 *
 * Google keeps about 100 refresh tokens per account and OAuth client and silently revokes
 * the oldest. Asking `prompt=consent` on every sign-in issued a new one each time, so users
 * who sign in often (preview and live share one client) lost their stored, working token.
 *
 * Now a plain sign-in asks `prompt=select_account` (+ access_type=offline). Google then
 * returns a refresh token only when it shows its consent screen anyway (first grant, a
 * revoked grant, new scopes); otherwise we keep the stored one. Consent is asked for only:
 *   - first-time Google connect (no stored refresh token),
 *   - Reconnect (the buttons pass prompt 'select_account consent' per call),
 *   - a scope upgrade (the grant lacks a data scope),
 *   - a stored token Google rejects (invalid_grant: revoked, expired, evicted).
 * The last three are detected after a select_account sign-in: the NextAuth signIn callback
 * (lib/auth.ts) sends the browser once to /connect-google, which starts a consent sign-in.
 * If that sign-in still brings no token, sign-in completes and the app's Reconnect state
 * (google_reauth) takes over. A stored token is never replaced by an empty value.
 *
 * Server-only (reads the admin DB and calls Google's token endpoint). Pure apart from the
 * injectable fetch, so tests/googleConsent.test.mjs can drive it.
 */

export const GOOGLE_DATA_SCOPES = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
] as const;

export const GOOGLE_SCOPE = ['openid', 'email', 'profile', ...GOOGLE_DATA_SCOPES].join(' ');

/** Default authorization params of the Google provider: no consent screen for returning users. */
export const GOOGLE_SIGNIN_PARAMS = {
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'select_account',
} as const;

/** `prompt` for Reconnect / first connect / scope upgrade: Google shows consent and issues a refresh token. */
export const GOOGLE_CONSENT_PROMPT = 'select_account consent';

/** Page that starts the one consent sign-in (app/(marketing)/connect-google). */
export const GOOGLE_CONSENT_PATH = '/connect-google';

/** Set by that page just before it starts the consent sign-in; stops a second automatic redirect. */
export const GOOGLE_CONSENT_COOKIE = 'tc_g_consent';
export const GOOGLE_CONSENT_COOKIE_MAX_AGE = 600;

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type StoredRefreshStatus =
    | 'none'      // no Google refresh token stored for this Google account
    | 'ok'        // stored, and Google accepted it just now
    | 'revoked'   // stored, Google answered invalid_grant
    | 'unknown';  // could not tell (admin or Google unreachable, no admin key): assume usable

export interface StoredGoogleRefresh {
    status: StoredRefreshStatus;
    refreshToken?: string;
}

export type ConsentReason = 'first_connect' | 'revoked' | 'scope_upgrade';

export type GoogleTokenDecision =
    /** Google returned a refresh token: store it (session JWT and admin DB). */
    | { action: 'store_new'; refreshToken: string }
    /** No new token: keep the stored one (undefined when only the DB knows it; server code reads it there). */
    | { action: 'keep_stored'; refreshToken?: string }
    /** Abort this sign-in and redirect once to a consent sign-in. */
    | { action: 'ask_consent'; reason: ConsentReason }
    /** Consent was already tried: finish sign-in without a refresh token; the app shows Reconnect when access expires. */
    | { action: 'reconnect'; reason: ConsentReason };

export function nonEmptyToken(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Data scopes missing from Google's granted `scope`. Unknown (no scope string) counts as nothing missing. */
export function missingGoogleScopes(granted?: string | null): string[] {
    if (typeof granted !== 'string' || !granted.trim()) return [];
    const have = new Set(granted.split(/[\s,]+/).filter(Boolean));
    return GOOGLE_DATA_SCOPES.filter((s) => !have.has(s));
}

/**
 * The decision table. `returnedRefreshToken` is account.refresh_token of this sign-in,
 * `grantedScope` account.scope, `stored` what lookupStoredGoogleRefresh() found,
 * `consentAttempted` whether the consent cookie is present.
 */
export function decideGoogleRefreshToken(input: {
    returnedRefreshToken?: string | null;
    grantedScope?: string | null;
    stored: StoredGoogleRefresh;
    consentAttempted: boolean;
}): GoogleTokenDecision {
    const returned = nonEmptyToken(input.returnedRefreshToken);
    // Google only issues a refresh token after showing its consent screen; what the user granted there stands.
    if (returned) return { action: 'store_new', refreshToken: returned };

    const { stored, consentAttempted } = input;
    const ask = (reason: ConsentReason): GoogleTokenDecision =>
        consentAttempted ? { action: 'reconnect', reason } : { action: 'ask_consent', reason };

    if (missingGoogleScopes(input.grantedScope).length && !consentAttempted) return ask('scope_upgrade');

    const storedToken = nonEmptyToken(stored.refreshToken);
    if (stored.status === 'ok' && storedToken) return { action: 'keep_stored', refreshToken: storedToken };
    if (stored.status === 'unknown') return { action: 'keep_stored', refreshToken: storedToken };
    if (stored.status === 'revoked') return ask('revoked');
    return ask('first_connect');
}

/**
 * The Google refresh token a sign-in leaves in the session JWT: the new one, the stored one it
 * keeps, or undefined (then the JWT field stays unset; it never becomes an empty string).
 */
export function refreshTokenToKeep(plan: GoogleTokenDecision): string | undefined {
    return plan.action === 'store_new' || plan.action === 'keep_stored' ? nonEmptyToken(plan.refreshToken) : undefined;
}

export interface ConsentDeps {
    fetch?: typeof globalThis.fetch;
    adminUrl?: string;
    adminKey?: string;
    clientId?: string;
    clientSecret?: string;
    timeoutMs?: number;
}

function deps(d: ConsentDeps = {}) {
    return {
        fetch: d.fetch ?? globalThis.fetch,
        adminUrl: (d.adminUrl ?? process.env.ADMIN_API_URL ?? 'http://admin-api:8000').replace(/\/+$/, ''),
        adminKey: d.adminKey ?? process.env.ADMIN_API_KEY ?? '',
        clientId: d.clientId ?? process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: d.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? '',
        timeoutMs: d.timeoutMs ?? 5000,
    };
}

/**
 * The refresh token the admin DB holds for this Google account (looked up by the Google
 * `sub` only, never by email, so another account's token is never picked up), checked
 * with one refresh call to Google. A refresh does not issue a new refresh token, so it
 * does not count towards Google's per-account limit.
 */
export async function lookupStoredGoogleRefresh(googleSub: string, options?: ConsentDeps): Promise<StoredGoogleRefresh> {
    const d = deps(options);
    if (!googleSub || !d.adminKey) return { status: 'unknown' };

    let refreshToken: string | undefined;
    try {
        const res = await d.fetch(`${d.adminUrl}/api/users/${encodeURIComponent(googleSub)}/oauth/google`, {
            headers: { 'X-API-Key': d.adminKey },
            cache: 'no-store',
            signal: AbortSignal.timeout(d.timeoutMs),
        });
        if (res.status === 404) return { status: 'none' };
        if (!res.ok) return { status: 'unknown' };
        const data = await res.json().catch(() => null) as { refresh_token?: unknown } | null;
        refreshToken = nonEmptyToken(data?.refresh_token);
    } catch {
        return { status: 'unknown' };
    }
    if (!refreshToken) return { status: 'none' };

    try {
        const res = await d.fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: d.clientId,
                client_secret: d.clientSecret,
                refresh_token: refreshToken,
            }),
            signal: AbortSignal.timeout(d.timeoutMs),
        });
        if (res.ok) return { status: 'ok', refreshToken };
        const body = await res.json().catch(() => null) as { error?: unknown } | null;
        // invalid_grant = revoked, expired or evicted. Anything else (invalid_client, 5xx) says nothing about the token.
        if (body?.error === 'invalid_grant') return { status: 'revoked', refreshToken };
        return { status: 'unknown', refreshToken };
    } catch {
        return { status: 'unknown', refreshToken };
    }
}

/** Full decision for one Google sign-in (`account` as NextAuth passes it to the callbacks). */
export async function planGoogleSignIn(
    account: { providerAccountId?: string; refresh_token?: string | null; scope?: string | null },
    consentAttempted: boolean,
    options?: ConsentDeps,
): Promise<GoogleTokenDecision> {
    const returned = nonEmptyToken(account.refresh_token);
    if (returned) return { action: 'store_new', refreshToken: returned };
    const stored = await lookupStoredGoogleRefresh(account.providerAccountId ?? '', options);
    return decideGoogleRefreshToken({ returnedRefreshToken: null, grantedScope: account.scope, stored, consentAttempted });
}

/** A same-site path for `raw` (a path or an absolute URL on `base`), else '/dashboard'. */
export function safeCallbackPath(raw: string | null | undefined, base?: string | null): string {
    const fallback = '/dashboard';
    if (!raw) return fallback;
    let value = raw;
    try { value = decodeURIComponent(raw); } catch { /* keep raw */ }
    if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) return value;
    try {
        const u = new URL(value);
        const b = base ? new URL(base) : null;
        if (b && u.origin === b.origin) return `${u.pathname}${u.search}${u.hash}` || fallback;
    } catch { /* not a URL */ }
    return fallback;
}

/** Where the signIn callback sends a sign-in that needs consent. `auto=1` makes the page start it. */
export function consentRedirectUrl(base: string, callbackUrl: string | null | undefined, reason: ConsentReason): string {
    const root = (base || '').replace(/\/+$/, '');
    const q = new URLSearchParams({ callbackUrl: safeCallbackPath(callbackUrl, root || null), reason, auto: '1' });
    return `${root}${GOOGLE_CONSENT_PATH}?${q.toString()}`;
}
