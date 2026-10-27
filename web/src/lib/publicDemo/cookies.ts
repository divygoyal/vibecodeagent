/**
 * Cookie-header helpers for the demo projection in middleware. Pure, edge-safe.
 */
import { DEMO_COOKIE, SESSION_COOKIES } from './config';

/**
 * Cookie names NextAuth may read as (part of) a session: both names and anything that starts with them (chunks
 * name.0, name.1, … and odd names like nameX, which NextAuth also joins in).
 */
export function isSessionCookieName(name: string): boolean {
    return SESSION_COOKIES.some((n) => name.startsWith(n));
}

function parse(header: string | null | undefined): [string, string][] {
    const out: [string, string][] = [];
    for (const part of (header || '').split(';')) {
        const i = part.indexOf('=');
        if (i <= 0) continue;
        const name = part.slice(0, i).trim();
        if (name) out.push([name, part.slice(i + 1).trim()]);
    }
    return out;
}

/**
 * The request Cookie header with the visitor's own session cookies (all names and chunks) and the
 * demo cookie removed, and the demo JWT added under both session cookie names. Every other cookie
 * (theme, tc_site, csrf …) is kept as is.
 */
export function projectDemoCookieHeader(header: string | null | undefined, demoJwt: string): string {
    const kept = parse(header).filter(([name]) => !isSessionCookieName(name) && name !== DEMO_COOKIE);
    return [...kept, ...SESSION_COOKIES.map((n) => [n, demoJwt] as [string, string])].map(([n, v]) => `${n}=${v}`).join('; ');
}

/** The visitor's own (unchunked) session cookie value, if any. A chunked one is never the small demo JWT. */
export function ownSessionCookie(header: string | null | undefined): { value: string | null; present: boolean } {
    let value: string | null = null;
    let present = false;
    for (const [name, v] of parse(header)) {
        if (!isSessionCookieName(name)) continue;
        present = true;
        if ((SESSION_COOKIES as readonly string[]).includes(name) && !value) value = v;
    }
    return { value, present };
}
