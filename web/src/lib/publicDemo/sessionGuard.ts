/**
 * Defence in depth for every place a session is decoded on the server (lib/serverAuth.ts getAuthJwt, the NextAuth
 * jwt callback in lib/auth.ts, middleware): a token that is the demo identity counts as signed out unless the
 * request carries middleware's unforgeable demo marker and the live demo is switched on. The browser never holds
 * such a token (tc_demo has its own salt), so this only matters if one ever leaked; then it is useless as a
 * cookie under any name, as a Bearer header, on any route, and NextAuth never renews it.
 */
import { DEMO_REQUEST_HEADER, isDemoToken, publicDemoEnabled } from './config';
import { isDemoMarker } from './marker';

type HeaderSource = Headers | Record<string, string | string[] | undefined> | null | undefined;

function headerValue(h: HeaderSource, name: string): string | null {
    if (!h) return null;
    if (typeof (h as Headers).get === 'function') return (h as Headers).get(name);
    const rec = h as Record<string, string | string[] | undefined>;
    const v = rec[name] ?? rec[name.toLowerCase()];
    return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

/** May this decoded session token be used for this request? Non-demo tokens: always. */
export async function demoSessionAllowed(token: { demo?: unknown; sub?: unknown; primarySub?: unknown } | null | undefined, headers: HeaderSource): Promise<boolean> {
    if (!isDemoToken(token)) return true;
    if (!publicDemoEnabled()) return false;
    return isDemoMarker(headerValue(headers, DEMO_REQUEST_HEADER));
}

/**
 * For the NextAuth jwt callback (lib/auth.ts): throws for a demo token outside a marked demo request. NextAuth then
 * answers "no session" and clears the cookie instead of re-issuing it (no renewal), in getServerSession as well.
 */
export async function assertDemoSessionHere(token: { demo?: unknown; sub?: unknown; primarySub?: unknown } | null | undefined): Promise<void> {
    if (!(await demoSessionAllowedHere(token))) throw new Error('demo session outside a demo request');
}

/** The same, reading the current request's headers (next/headers); outside a request: not allowed. */
export async function demoSessionAllowedHere(token: { demo?: unknown; sub?: unknown; primarySub?: unknown } | null | undefined): Promise<boolean> {
    if (!isDemoToken(token)) return true;
    try {
        const { headers } = await import('next/headers');
        return demoSessionAllowed(token, await headers());
    } catch {
        return false;
    }
}
