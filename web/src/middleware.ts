import { getToken, type JWT } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { DEMO_COOKIE, DEMO_HEADER, DEMO_READONLY_MESSAGE, DEMO_REQUEST_HEADER, isDemoToken, publicDemoEnabled } from '@/lib/publicDemo/config';
import { ownSessionCookie, projectDemoCookieHeader } from '@/lib/publicDemo/cookies';
import { demoApiDecision } from '@/lib/publicDemo/guard';
import { demoMarker } from '@/lib/publicDemo/marker';
import { clientIp, DEMO_API_LIMIT_PER_MIN, demoRateOk } from '@/lib/publicDemo/rateLimit';
import { demoSessionJson } from '@/lib/publicDemo/session';
import { mintProjectedSessionJwt, PROJECTED_MAX_AGE_S, readDemoJwt } from '@/lib/publicDemo/token';

// Same rule as lib/sites/siteDirectory isSiteRouteKey (kept inline: middleware runs on the edge).
const SITE_KEY_RE = /^[a-z0-9.-]+(--\d+)?$|^ga4-\d+$/;
const SITE_COOKIE = 'tc_site';

/** Link-preview fetchers (not search engines) get the marketing /demo page and its Open Graph tags. */
const UNFURL_BOTS = /facebookexternalhit|Facebot|Twitterbot|Slackbot|LinkedInBot|Discordbot|TelegramBot|WhatsApp|redditbot|Embedly|SkypeUriPreview|Pinterest|vkShare|Iframely|Mastodon/i;

/**
 * Old single-site pages moved under /dashboard/s/<host>/… (DESIGN 4.3).
 * Returns the new path for a known site, or null.
 */
function movedSitePath(pathname: string, host: string): { path: string; tab?: string } | null {
    const base = `/dashboard/s/${encodeURIComponent(host)}`;
    if (pathname === '/dashboard/site' || pathname === '/dashboard/s') return { path: base };
    if (pathname === '/dashboard/seo' || pathname.startsWith('/dashboard/seo/')) return { path: `${base}/search` };
    if (pathname === '/dashboard/audit' || pathname.startsWith('/dashboard/audit/')) return { path: `${base}/actions/audit` };
    if (pathname === '/dashboard/analytics' || pathname.startsWith('/dashboard/analytics/')) {
        const sub = pathname.replace(/^\/dashboard\/analytics\/?/, '').split('/')[0];
        if (sub === 'pages') return { path: `${base}/pages` };
        return { path: `${base}/traffic`, tab: sub || undefined };
    }
    return null;
}

const isDashboardPath = (p: string) => p === '/dashboard' || p.startsWith('/dashboard/');

function clearDemoCookie(res: NextResponse): NextResponse {
    res.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
    return res;
}

/** Headers without the demo marker: nobody outside may send it (it is also an HMAC, see lib/publicDemo/marker.ts). */
function strippedHeaders(request: NextRequest): Headers {
    const headers = new Headers(request.headers);
    headers.delete(DEMO_REQUEST_HEADER);
    return headers;
}

/** The request unchanged, except the demo marker header, which is always removed. */
function passThrough(request: NextRequest): NextResponse {
    if (!request.headers.has(DEMO_REQUEST_HEADER)) return NextResponse.next();
    return NextResponse.next({ request: { headers: strippedHeaders(request) } });
}

// One projected (session-format, 5-minute) token per tc_demo value, re-minted every 4 minutes.
const projected = new Map<string, { jwt: string; until: number }>();
async function projectedFor(cookieValue: string, claims: JWT, secret: string): Promise<string> {
    const now = Date.now();
    const hit = projected.get(cookieValue);
    if (hit && hit.until > now) return hit.jwt;
    const jwt = await mintProjectedSessionJwt(claims, secret);
    if (projected.size >= 2000) projected.delete(projected.keys().next().value as string);
    projected.set(cookieValue, { jwt, until: now + (PROJECTED_MAX_AGE_S - 60) * 1000 });
    return jwt;
}

/**
 * The request as the demo user. Only inside this request: the session cookie becomes a freshly minted
 * session-format token (the browser holds only the salted tc_demo, which is not a session), plus the demo marker.
 */
async function projectAsDemo(request: NextRequest, claims: JWT, cookieValue: string, extra?: (res: NextResponse) => void): Promise<NextResponse> {
    const secret = process.env.NEXTAUTH_SECRET || '';
    const [sessionJwt, marker] = await Promise.all([projectedFor(cookieValue, claims, secret), demoMarker(secret)]);
    const headers = strippedHeaders(request);
    headers.set('cookie', projectDemoCookieHeader(request.headers.get('cookie'), sessionJwt));
    headers.delete('authorization'); // never a second identity next to the demo one
    if (marker) headers.set(DEMO_REQUEST_HEADER, marker);
    const res = NextResponse.next({ request: { headers } });
    extra?.(res);
    return res;
}

function demoTooFast(): NextResponse {
    return NextResponse.json(
        { error: 'The demo is getting a lot of clicks from you. Wait a minute and try again.', demo: true },
        { status: 429, headers: { [DEMO_HEADER]: 'busy', 'Retry-After': '60', 'Cache-Control': 'no-store' } },
    );
}

function demoRefusal(): NextResponse {
    return NextResponse.json(
        { error: DEMO_READONLY_MESSAGE, demo: true },
        { status: 403, headers: { [DEMO_HEADER]: 'readonly', 'Cache-Control': 'no-store' } },
    );
}

/** /api/* for a demo visitor (valid tc_demo cookie). */
async function demoApi(request: NextRequest, token: JWT, cookieValue: string): Promise<NextResponse> {
    const { pathname } = request.nextUrl;
    // NextAuth's session route would re-issue a session cookie: answer it here. POST is useSession().update().
    if (pathname === '/api/auth/session') {
        const realSession = ownSessionCookie(request.headers.get('cookie')).present;
        return NextResponse.json(demoSessionJson(token, { realSession }), { headers: { 'Cache-Control': 'no-store' } });
    }
    const { decision, noopBody } = demoApiDecision(pathname, request.method);
    if (decision === 'allow' && !demoRateOk(`api:${clientIp(request.headers)}`, DEMO_API_LIMIT_PER_MIN)) return demoTooFast();
    switch (decision) {
        case 'allow':
            return projectAsDemo(request, token, cookieValue);
        case 'noop':
            return NextResponse.json(noopBody ?? { ok: true, demo: true }, { headers: { [DEMO_HEADER]: 'noop', 'Cache-Control': 'no-store' } });
        case 'public': {
            const res = passThrough(request);
            // Starting a real sign-in (or signing out) from inside the demo ends the demo.
            if (/^\/api\/auth\/(signin|signout|callback)(\/|$)/.test(pathname)) clearDemoCookie(res);
            return res;
        }
        default:
            return demoRefusal();
    }
}

/**
 * /demo, /demo/<slug>, /demo/exit: rewritten to the route handlers in app/api/demo, which do every check
 * (prefetch, rate limit, cross-site confirmation), so a direct call to those routes gets the same treatment.
 */
function demoEntry(request: NextRequest): NextResponse {
    const { pathname, searchParams } = request.nextUrl;
    if (!publicDemoEnabled()) {
        // Kill switch: the marketing demo pages, and no demo session.
        const res = passThrough(request);
        return request.cookies.has(DEMO_COOKIE) ? clearDemoCookie(res) : res;
    }
    const rewrite = (to: string, params: Record<string, string> = {}) => {
        const url = request.nextUrl.clone();
        url.pathname = to;
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        return NextResponse.rewrite(url, { request: { headers: strippedHeaders(request) } });
    };
    if (pathname === '/demo/exit') return rewrite('/api/demo/exit');
    // The marketing page stays reachable (link previews, ?static=1 fallback) and its OG images are assets.
    const ua = request.headers.get('user-agent') || '';
    if (searchParams.get('static') === '1' || UNFURL_BOTS.test(ua) || /\/(opengraph|twitter)-image/.test(pathname)) return passThrough(request);
    const slug = pathname === '/demo' || pathname === '/demo/' ? '' : pathname.slice('/demo/'.length);
    if (slug && !/^[a-z0-9.-]{1,80}$/i.test(slug)) return passThrough(request);
    return slug ? rewrite('/api/demo/start', { slug }) : rewrite('/api/demo/start');
}

/** True when the request presents a session token somewhere NextAuth would read it (any session cookie name, Bearer). */
function presentsSession(request: NextRequest): boolean {
    if (/^bearer\s/i.test(request.headers.get('authorization') || '')) return true;
    return /(?:^|;\s*)(?:__Secure-)?next-auth\.session-token/.test(request.headers.get('cookie') || '');
}

/**
 * The visitor's own session as NextAuth reads it (cookie, chunks, prefixed names, Bearer), or null. A token that is
 * the demo identity is never a session outside a projected demo request (lib/publicDemo/sessionGuard.ts): signed out.
 */
async function ownSession(request: NextRequest): Promise<JWT | null> {
    if (!presentsSession(request)) return null;
    const token = await getToken({ req: request });
    return token && !isDemoToken(token) ? token : null;
}

const HANDLED = /^\/(?:dashboard|admin|superadmin|demo|api)(?:\/|$)/;

export async function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl;

    // Every other page (the matcher covers all non-asset paths): only strip the demo marker.
    if (!HANDLED.test(pathname)) return passThrough(request);

    // The styleguide is dev-only. Its page calls notFound(), but the app shell's Suspense boundary streams
    // before the page renders, so the status was already 200 ("Page not found" body, HTTP 200). Answer the 404
    // here instead, before anything renders, for every visitor (signed in or not).
    if (process.env.NODE_ENV === 'production' && (pathname === '/dashboard/styleguide' || pathname.startsWith('/dashboard/styleguide/'))) {
        return NextResponse.rewrite(new URL('/_tc-not-found', request.url), { status: 404 });
    }

    if (pathname === '/demo' || pathname.startsWith('/demo/')) return demoEntry(request);

    const secret = process.env.NEXTAUTH_SECRET;
    const isApi = pathname.startsWith('/api/');

    // ── Public live demo: a valid tc_demo cookie makes /dashboard and /api act as the demo user ──
    const demoCookie = request.cookies.get(DEMO_COOKIE)?.value;
    let staleDemoCookie = false;
    if (demoCookie) {
        const demoToken = publicDemoEnabled() ? await readDemoJwt(demoCookie, secret) : null;
        staleDemoCookie = !demoToken;
        if (demoToken) {
            if (isApi) return demoApi(request, demoToken, demoCookie);
            if (isDashboardPath(pathname)) return demoDashboard(request, demoToken, demoCookie);
            // /admin, /superadmin: the visitor's own cookies, unchanged.
        } else if (publicDemoEnabled() && isDashboardPath(pathname) && request.method === 'GET') {
            // Expired demo: start a fresh one at the same place.
            const url = new URL('/demo', request.url);
            url.searchParams.set('to', `${pathname}${search}`);
            return clearDemoCookie(NextResponse.redirect(url, 307));
        } else if (isApi && !['GET', 'HEAD'].includes(request.method) && !pathname.startsWith('/api/auth/')) {
            // A stale demo page must not write as whoever the visitor really is.
            return clearDemoCookie(NextResponse.json(
                { error: 'The demo session ended. Reload the page to start again.', demo: true },
                { status: 401, headers: { [DEMO_HEADER]: 'ended', 'Cache-Control': 'no-store' } },
            ));
        }
    }

    if (isApi) {
        // Defence in depth: a demo-identity token presented as a session (any cookie name, Bearer) is refused here
        // as well as in every route (sessionGuard.ts). NextAuth's own routes included: no renewal.
        if (presentsSession(request)) {
            const token = await getToken({ req: request }).catch(() => null);
            if (token && isDemoToken(token)) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
            }
        }
        const res = passThrough(request);
        if (staleDemoCookie) clearDemoCookie(res); // invalid / expired / switched off
        return res;
    }

    // Auth gate for dashboard / admin / superadmin
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/superadmin')) {
        const token = await ownSession(request);

        // Preserve the FULL original URL (path + query string) so deep-link
        // emails like /dashboard/ask?q=…&property=…&site=… survive both
        // the auth round-trip and the setup gate.
        const originalPathPlusSearch = `${pathname}${search}`;

        if (!token) {
            const signInUrl = new URL('/', request.url);
            signInUrl.searchParams.set('callbackUrl', originalPathPlusSearch);
            const res = NextResponse.redirect(signInUrl);
            return staleDemoCookie ? clearDemoCookie(res) : res;
        }

        // Setup gate. A user with Google connected goes straight into the app
        // (Portfolio lists everything they can access; picking one property +
        // site is no longer required, PRODUCT "App IA"). Only users without a
        // Google connection and without a finished setup are sent to
        // /dashboard/setup to connect it. The setup route itself is exempt.
        if (
            pathname.startsWith('/dashboard')
            && pathname !== '/dashboard/setup'
            && !pathname.startsWith('/dashboard/setup/')
            && !token.workspaceSetupCompleted
            && !token.googleAccessToken
        ) {
            const setupUrl = new URL('/dashboard/setup', request.url);
            setupUrl.searchParams.set('returnTo', originalPathPlusSearch);
            return NextResponse.redirect(setupUrl);
        }

        const moved = legacySiteRedirect(request);
        if (moved) return moved;
    }

    const res = passThrough(request);
    if (staleDemoCookie) clearDemoCookie(res);
    return res;
}

/**
 * Old single-site URLs -> /dashboard/s/<host>/… for the site the user
 * last picked (cookie written by the app shell). Temporary (307): the
 * target depends on the cookie. Without the cookie the old route's
 * layout redirects on the client once the saved site is known.
 */
function legacySiteRedirect(request: NextRequest): NextResponse | null {
    const { pathname } = request.nextUrl;
    if (!pathname.startsWith('/dashboard/')) return null;
    const host = request.cookies.get(SITE_COOKIE)?.value;
    const decoded = host ? decodeURIComponent(host) : '';
    if (decoded && SITE_KEY_RE.test(decoded)) {
        const moved = movedSitePath(pathname, decoded);
        if (moved) {
            const url = new URL(moved.path, request.url);
            request.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
            if (moved.tab) url.searchParams.set('tab', moved.tab);
            return NextResponse.redirect(url, 307);
        }
    }
    // No saved site: the site overview's old name and the bare /dashboard/s go to the portfolio.
    if (pathname === '/dashboard/site' || pathname === '/dashboard/s') {
        return NextResponse.redirect(new URL('/dashboard', request.url), 307);
    }
    return null;
}

/** A /dashboard page for the demo: projected session, no setup, never indexed. */
async function demoDashboard(request: NextRequest, token: JWT, cookieValue: string): Promise<NextResponse> {
    const { pathname } = request.nextUrl;
    if (pathname === '/dashboard/setup' || pathname.startsWith('/dashboard/setup/')) {
        return NextResponse.redirect(new URL('/dashboard', request.url), 307);
    }
    const moved = legacySiteRedirect(request);
    if (moved) return moved;
    return projectAsDemo(request, token, cookieValue, (res) => {
        res.headers.set('X-Robots-Tag', 'noindex, nofollow');
        res.headers.set('Cache-Control', 'private, no-store');
    });
}

export const config = {
    // Every path but static assets: the demo marker header is stripped everywhere (see passThrough).
    matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|woff2?|ttf|css|js|map)$).*)'],
};
