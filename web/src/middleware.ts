import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Same rule as lib/sites/siteDirectory isSiteRouteKey (kept inline: middleware runs on the edge).
const SITE_KEY_RE = /^[a-z0-9.-]+(--\d+)?$|^ga4-\d+$/;
const SITE_COOKIE = 'tc_site';

/**
 * Old single-site pages moved under /dashboard/s/<host>/… (DESIGN 4.3).
 * Returns the new path for a known site, or null.
 */
function movedSitePath(pathname: string, host: string): { path: string; tab?: string } | null {
    const base = `/dashboard/s/${encodeURIComponent(host)}`;
    if (pathname === '/dashboard/seo' || pathname.startsWith('/dashboard/seo/')) return { path: `${base}/search` };
    if (pathname === '/dashboard/audit' || pathname.startsWith('/dashboard/audit/')) return { path: `${base}/actions/audit` };
    if (pathname === '/dashboard/analytics' || pathname.startsWith('/dashboard/analytics/')) {
        const sub = pathname.replace(/^\/dashboard\/analytics\/?/, '').split('/')[0];
        if (sub === 'pages') return { path: `${base}/pages` };
        return { path: `${base}/traffic`, tab: sub || undefined };
    }
    return null;
}

export async function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl;

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

        // Old single-site URLs -> /dashboard/s/<host>/… for the site the user
        // last picked (cookie written by the app shell). Temporary (307): the
        // target depends on the cookie. Without the cookie the old route's
        // layout redirects on the client once the saved site is known.
        if (pathname.startsWith('/dashboard/')) {
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
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard', '/dashboard/:path*', '/admin', '/admin/:path*', '/superadmin', '/superadmin/:path*'],
};
