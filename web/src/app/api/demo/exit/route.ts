import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

import { DEMO_COOKIE, isDemoToken, isScriptFetch } from '@/lib/publicDemo/config';

export const dynamic = 'force-dynamic';

/**
 * GET /demo/exit (middleware rewrites it here): end the demo. Back to /dashboard when the visitor
 * has a real session (it was never touched), else to the home page. Also forgets the site the demo
 * picked last (tc_site), so the visitor's own old links do not point at a sample site.
 */
export async function GET(req: NextRequest) {
    // A prefetch must not end the demo.
    if (isScriptFetch(req.headers)) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    let signedIn = false;
    try {
        const token = await getToken({ req });
        signedIn = Boolean(token && !isDemoToken(token));
    } catch {
        signedIn = false;
    }
    const res = new NextResponse(null, { status: 307, headers: { Location: signedIn ? '/dashboard' : '/', 'Cache-Control': 'no-store' } });
    res.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' });
    res.cookies.set('tc_site', '', { path: '/', maxAge: 0, sameSite: 'lax' });
    return res;
}
