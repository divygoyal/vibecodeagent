/**
 * First-touch attribution for the growth loops. A visit that arrives with ?ref=<kind> (share, embed, view, badge,
 * ...) or utm_* is remembered in a first-party cookie for 90 days, the first one wins, and the sign-up event
 * carries it (components/growth/AttributionCapture.tsx, lib/growth/track.ts). Pure functions: no DOM access here.
 *
 * Where the owner sees it: GA4 (property of the marketing site) -> sign_up event, parameters ref, utm_source,
 * utm_medium, utm_campaign, landing, referrer (register them as event-scoped custom dimensions once), and GA4's own
 * Traffic acquisition report by session source for the utm_source the links carry.
 */

export const TOUCH_COOKIE = 'tc_first_touch';
export const TOUCH_MAX_AGE_S = 90 * 24 * 3600;
/** Set once the sign_up event was sent from this browser (the event must fire once per person). */
export const SIGNUP_SENT_KEY = 'tc_signup_sent';

export interface Touch {
    /** Which surface sent the visitor: share | embed | view | badge | ... */
    ref?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    /** Path the visitor landed on (no query). */
    landing?: string;
    /** Host of the page that linked here, when the browser sent one. */
    referrer?: string;
}

const KEYS = ['ref', 'utm_source', 'utm_medium', 'utm_campaign'] as const;

function clean(v: unknown, max: number): string | undefined {
    if (typeof v !== 'string') return undefined;
    const s = v.trim().toLowerCase().replace(/[^a-z0-9._ -]/g, '').slice(0, max);
    return s || undefined;
}

function hostOf(url: string): string | undefined {
    try {
        const h = new URL(url).hostname.replace(/^www\./, '');
        return h || undefined;
    } catch {
        return undefined;
    }
}

/**
 * The touch a landing carries, or null when it carries no ref and no utm (plain visits are not first touches:
 * GA4 already reports those by channel). Values are lower-cased and limited to [a-z0-9._ -].
 */
export function parseTouch(search: string, opts: { pathname?: string; referrer?: string; ownHost?: string } = {}): Touch | null {
    const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const t: Touch = {};
    for (const k of KEYS) {
        const v = clean(sp.get(k), k === 'ref' ? 32 : 64);
        if (v) t[k] = v;
    }
    if (!t.ref && !t.utm_source) return null;
    if (opts.pathname) t.landing = opts.pathname.slice(0, 80);
    const ref = opts.referrer ? hostOf(opts.referrer) : undefined;
    if (ref && ref !== opts.ownHost) t.referrer = ref.slice(0, 80);
    return t;
}

/** First touch wins: an existing touch is never replaced. */
export function mergeFirstTouch(existing: Touch | null | undefined, next: Touch | null | undefined): Touch | null {
    return existing ?? next ?? null;
}

export function serializeTouch(t: Touch): string {
    return encodeURIComponent(JSON.stringify(t));
}

/** Reads a stored value back, re-cleaning every field (a cookie is user-editable). */
export function parseStoredTouch(raw: string | null | undefined): Touch | null {
    if (!raw) return null;
    try {
        const o = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
        const t: Touch = {};
        for (const k of KEYS) {
            const v = clean(o[k], k === 'ref' ? 32 : 64);
            if (v) t[k] = v;
        }
        if (!t.ref && !t.utm_source) return null;
        const landing = typeof o.landing === 'string' ? o.landing.replace(/[^a-zA-Z0-9/_.-]/g, '').slice(0, 80) : '';
        if (landing) t.landing = landing;
        const referrer = clean(o.referrer, 80);
        if (referrer) t.referrer = referrer;
        return t;
    } catch {
        return null;
    }
}

/** Finds the first-touch cookie in a Cookie header / document.cookie string. */
export function touchFromCookies(cookies: string | null | undefined): Touch | null {
    if (!cookies) return null;
    for (const part of cookies.split(/;\s*/)) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i) === TOUCH_COOKIE) return parseStoredTouch(part.slice(i + 1));
    }
    return null;
}

/** The `Set-Cookie`-style string for document.cookie. */
export function touchCookieString(t: Touch, secure: boolean): string {
    return `${TOUCH_COOKIE}=${serializeTouch(t)}; Max-Age=${TOUCH_MAX_AGE_S}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** GA4 event parameters for the sign_up event. Always names the method; adds the touch when there is one. */
export function signUpParams(t: Touch | null, method = 'google'): Record<string, string> {
    return { method, ...(t ?? {}) };
}
