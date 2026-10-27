import { getToken, type JWT } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { DEMO_COOKIE, DEMO_HEADER, DEMO_READONLY_MESSAGE, DEMO_REQUEST_HEADER, publicDemoEnabled } from '@/lib/publicDemo/config';
import { ownSessionCookie, projectDemoCookieHeader } from '@/lib/publicDemo/cookies';
import { demoApiDecision } from '@/lib/publicDemo/guard';
import { clientIp, DEMO_API_LIMIT_PER_MIN, DEMO_START_LIMIT_PER_MIN, demoRateOk } from '@/lib/publicDemo/rateLimit';
import { demoSessionJson } from '@/lib/publicDemo/session';
import { readDemoJwt, sessionJwtIsDemo } from '@/lib/publicDemo/token';

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

/** The request as the demo user: the session cookie is swapped for the demo JWT in the REQUEST only. */
function projectAsDemo(request: NextRequest, demoJwt: string, extra?: (res: NextResponse) => void): NextResponse {
    const headers = new Headers(request.headers);
    headers.set('cookie', projectDemoCookieHeader(request.headers.get('cookie'), demoJwt));
    headers.set(DEMO_REQUEST_HEADER, '1');
    const res = NextResponse.next({ request: { headers } });
    extra?.(res);
    return res;
}

/** The request unchanged, except a demo marker header nobody outside may send. */
function passThrough(request: NextRequest): NextResponse {
    if (!request.headers.has(DEMO_REQUEST_HEADER)) return NextResponse.next();
    const headers = new Headers(request.headers);
    headers.delete(DEMO_REQUEST_HEADER);
    return NextResponse.next({ request: { headers } });
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

/** /api/* for a demo visitor (valid tc_demo cookie, or a session JWT that is the demo identity). */
function demoApi(request: NextRequest, token: JWT, demoJwt: string | null): NextResponse {
    const { pathname } = request.nextUrl;
    // NextAuth's session route would re-issue the session cookie (Set-Cookie) with the demo JWT in it:
    // answer it here. POST is useSession().update(); nothing to update for the demo.
    if (pathname === '/api/auth/session') {
        const realSession = demoJwt ? ownSessionCookie(request.headers.get('cookie')).present : false;
        return NextResponse.json(demoSessionJson(token, { realSession }), { headers: { 'Cache-Control': 'no-store' } });
    }
    const { decision, noopBody } = demoApiDecision(pathname, request.method);
    if (decision === 'allow' && !demoRateOk(`api:${clientIp(request.headers)}`, DEMO_API_LIMIT_PER_MIN)) return demoTooFast();
    switch (decision) {
        case 'allow':
            if (demoJwt) return projectAsDemo(request, demoJwt);
            // The visitor's own cookie already is the demo JWT (defence in depth path): just mark the request.
            {
                const headers = new Headers(request.headers);
                headers.set(DEMO_REQUEST_HEADER, '1');
                return NextResponse.next({ request: { headers } });
            }
        case 'noop':
            return NextResponse.json(noopBody ?? { ok: true, demo: true }, { headers: { [DEMO_HEADER]: 'noop', 'Cache-Control': 'no-store' } });
        case 'public': {
            const res = passThrough(request);
            // Starting a real sign-in (or signing out) from inside the demo ends the demo.
            if (demoJwt && /^\/api\/auth\/(signin|signout|callback)(\/|$)/.test(pathname)) clearDemoCookie(res);
            return res;
        }
        default:
            return demoRefusal();
    }
}

/** /demo, /demo/<slug>, /demo/exit. */
function demoEntry(request: NextRequest): NextResponse {
    const { pathname, searchParams } = request.nextUrl;
    const hasCookie = request.cookies.has(DEMO_COOKIE);
    if (!publicDemoEnabled()) {
        // Kill switch: the marketing demo pages, and no demo session.
        const res = NextResponse.next();
        return hasCookie ? clearDemoCookie(res) : res;
    }
    // A script fetch (next/link prefetch or soft navigation, fetch()) must never start or end the demo: a prefetch
    // of a /demo link on the home page would otherwise set the cookie behind the visitor's back. Next strips its
    // own RSC headers before middleware, so this keys on the browser's Sec-Fetch-Mode (only a real page load is
    // "navigate"; scripts cannot forge it). A non-RSC answer makes the router fall back to a full page load for a
    // real click; prefetches just fail. Clients without Sec-Fetch headers (curl, old browsers) count as page loads.
    const mode = request.headers.get('sec-fetch-mode');
    const speculative = /prefetch|prerender/i.test(`${request.headers.get('sec-purpose') ?? ''} ${request.headers.get('purpose') ?? ''} ${request.headers.get('x-moz') ?? ''}`);
    if ((mode && mode !== 'navigate') || speculative) {
        return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }
    const rewrite = (to: string, params: Record<string, string> = {}) => {
        const url = request.nextUrl.clone();
        url.pathname = to;
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        return NextResponse.rewrite(url);
    };
    if (pathname === '/demo/exit') return rewrite('/api/demo/exit');
    // The marketing page stays reachable (link previews, ?static=1 fallback) and its OG images are assets.
    const ua = request.headers.get('user-agent') || '';
    if (searchParams.get('static') === '1' || UNFURL_BOTS.test(ua) || /\/(opengraph|twitter)-image/.test(pathname)) return NextResponse.next();
    const slug = pathname === '/demo' || pathname === '/demo/' ? '' : pathname.slice('/demo/'.length);
    if (slug && !/^[a-z0-9.-]{1,80}$/i.test(slug)) return NextResponse.next();
    // Too many starts from one address: the static demo page instead (no session, nothing computed per visit).
    if (!demoRateOk(`start:${clientIp(request.headers)}`, DEMO_START_LIMIT_PER_MIN)) return rewrite('/demo', { static: '1' });
    if (!slug) return rewrite('/api/demo/start');
    return rewrite('/api/demo/start', { slug });
    return NextResponse.next();
}

export async function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl;

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
            // /admin, /superadmin and everything else: the visitor's own cookies, unchanged.
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
        // Defence in depth: a session JWT that is the demo identity is held to the demo rules even
        // without the tc_demo cookie (it should never end up in the real session cookie, but if it did,
        // it still cannot act like a real user).
        const own = ownSessionCookie(request.headers.get('cookie'));
        if (own.value && secret && await sessionJwtIsDemo(own.value, secret)) {
            const token = await getToken({ req: request });
            if (token) return demoApi(request, token, null);
            return demoRefusal();
        }
        const res = passThrough(request);
        if (staleDemoCookie) clearDemoCookie(res); // invalid / expired / switched off
        return res;
    }

    // Auth gate for dashboard / admin / superadmin
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/superadmin')) {
        const token = await getToken({ req: request });

        // Preserve the FULL original URL (path + query string) so deep-link
        // emails like /dashboard/ask?q=…&property=…&site=… survive both
        // the auth round-trip and the setup gate.
        const originalPathPlusSearch = `${pathname}${search}`;

        if (!token) {
            const signInUrl = new URL('/', request.url);
            signInUrl.searchParams.set('callbackUrl', originalPathPlusSearch);
            return NextResponse.redirect(signInUrl);
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
function demoDashboard(request: NextRequest, _token: JWT, demoJwt: string): NextResponse {
    const { pathname } = request.nextUrl;
    if (pathname === '/dashboard/setup' || pathname.startsWith('/dashboard/setup/')) {
        return NextResponse.redirect(new URL('/dashboard', request.url), 307);
    }
    const moved = legacySiteRedirect(request);
    if (moved) return moved;
    return projectAsDemo(request, demoJwt, (res) => {
        res.headers.set('X-Robots-Tag', 'noindex, nofollow');
        res.headers.set('Cache-Control', 'private, no-store');
    });
}

export const config = {
    matcher: [
        '/dashboard', '/dashboard/:path*', '/admin', '/admin/:path*', '/superadmin', '/superadmin/:path*',
        '/demo', '/demo/:path*', '/api/:path*',
    ],
};
