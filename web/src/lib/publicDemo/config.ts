/**
 * The public live demo (/demo): one shared, read-only demo user that visitors browse in the
 * real app, with the sample `.example` sites of lib/demo. Pure constants and helpers, safe for
 * the edge runtime (middleware) and for node tests.
 *
 * How it fits together (see also middleware.ts):
 *   /demo            -> api/demo/start: ensures the demo user, sets the httpOnly `tc_demo` cookie
 *                       (a NextAuth-format JWT for that user, claim demo: true, 2 h), redirects into /dashboard
 *   /dashboard, /api -> middleware swaps the session cookie in the REQUEST for the demo JWT, so every
 *                       existing auth path sees the demo user; the browser's own session cookie is never touched
 *   /api/*           -> guard.ts decides allow / deny (403) / noop per route and method
 *   Google           -> lib/demo/fetchShim.ts (publicDemo mode) answers demo tokens from the generator
 *   /demo/exit       -> clears tc_demo, back to / (or /dashboard with a real session)
 * Kill switch: TC_PUBLIC_DEMO=0 (the old marketing /demo page comes back, the cookie is ignored).
 */

/** The demo user's identifier in the admin DB (its "provider id"). Not numeric, so it can never collide with a Google sub or a GitHub id. */
export const DEMO_USER_ID = 'tc-public-demo';
export const DEMO_USER_NAME = 'Demo';
/** Shown in the app's user menu only. Never stored in the admin DB (no welcome email, no digests). */
export const DEMO_USER_EMAIL = 'demo@trafficclaw.com';
/** The demo Google account of lib/demo/catalog.ts behind the demo user (11 sample sites). */
export const DEMO_ACCOUNT_KEY = 'main';
/** Its tokens (lib/demo/catalog.ts demoAccessToken / demoRefreshToken; inlined so middleware does not bundle the catalogue, a test keeps them equal). */
export const DEMO_ACCESS_TOKEN = 'demo-access:main';
export const DEMO_REFRESH_TOKEN = 'demo-refresh:main';
/** Workspace the demo opens on. */
export const DEMO_WORKSPACE = {
    property: 'properties/412300101',
    site: 'sc-domain:acmeanalytics.example',
    label: 'Acme Analytics',
} as const;

export const DEMO_COOKIE = 'tc_demo';
/** Demo session lifetime (cookie and JWT). */
export const DEMO_MAX_AGE_S = 2 * 60 * 60;

/** Both NextAuth session cookie names (dev and https). The demo JWT is projected under both. */
export const SESSION_COOKIES = ['next-auth.session-token', '__Secure-next-auth.session-token'] as const;

/** The message every refused demo action shows. */
export const DEMO_READONLY_MESSAGE = 'This is the demo. Connect Google to do this on your own sites.';
/** Response header on demo refusals (the client toasts on it). */
export const DEMO_HEADER = 'x-tc-demo';
/** Request header middleware sets on requests it serves as the demo user (lib/demo/fetchShim.ts reads it; same value there). */
export const DEMO_REQUEST_HEADER = 'x-tc-demo-request';

/** Public demo on unless TC_PUBLIC_DEMO=0. */
export function publicDemoEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return env.TC_PUBLIC_DEMO !== '0';
}

/** Is this NextAuth JWT (decoded) the demo identity? Keys on the claim AND the id, so either one is enough. */
export function isDemoToken(token: { demo?: unknown; sub?: unknown; primarySub?: unknown } | null | undefined): boolean {
    if (!token) return false;
    return token.demo === true || token.sub === DEMO_USER_ID || token.primarySub === DEMO_USER_ID;
}

/**
 * `/demo?to=` target: only paths under /dashboard (no open redirect). Returns the normalised
 * path + query + hash, or '/dashboard' for anything else.
 */
export function safeDemoTarget(to: string | null | undefined): string {
    const fallback = '/dashboard';
    if (typeof to !== 'string' || !to || to.length > 512) return fallback;
    // Must be a plain absolute path: no scheme, no protocol-relative //, no backslashes, no control chars.
    if (!to.startsWith('/') || to.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(to)) return fallback;
    let parsed: URL;
    try {
        parsed = new URL(to, 'http://demo.invalid');
    } catch {
        return fallback;
    }
    if (parsed.origin !== 'http://demo.invalid') return fallback;
    const path = parsed.pathname;
    // Encoded slashes / dots could re-resolve later; refuse them.
    if (/%2f|%5c|%2e/i.test(path)) return fallback;
    if (path !== '/dashboard' && !path.startsWith('/dashboard/')) return fallback;
    if (path.startsWith('/dashboard/setup')) return fallback;
    return `${path}${parsed.search}${parsed.hash}`;
}
