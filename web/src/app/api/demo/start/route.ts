import { NextResponse, type NextRequest } from 'next/server';

import { DEMO_COOKIE, DEMO_MAX_AGE_S, publicDemoEnabled, safeDemoTarget } from '@/lib/publicDemo/config';
import { ensureDemoUser } from '@/lib/publicDemo/seed';
import { demoSlugTarget } from '@/lib/publicDemo/sites';
import { mintDemoJwt } from '@/lib/publicDemo/token';

export const dynamic = 'force-dynamic';

/**
 * GET /demo (middleware rewrites it here): start a read-only demo session and land in the real app.
 *   /demo?to=/dashboard/...   land there (only /dashboard paths; anything else -> /dashboard)
 *   /demo/<slug>              (rewritten with ?slug=) that sample site's page
 * Sets the httpOnly tc_demo cookie (2 h). The visitor's own session cookie is not touched.
 * If the demo user cannot be prepared (admin API down), the static marketing demo is shown instead.
 */
export async function GET(req: NextRequest) {
    if (!publicDemoEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const params = req.nextUrl.searchParams;
    const target = params.has('slug') ? demoSlugTarget(params.get('slug')) : safeDemoTarget(params.get('to'));
    const secret = process.env.NEXTAUTH_SECRET || '';
    let jwt: string;
    try {
        await ensureDemoUser();
        jwt = await mintDemoJwt(secret);
    } catch (err) {
        console.error('[public-demo] could not start a demo session:', err instanceof Error ? err.message : err);
        return new Response(null, { status: 307, headers: { Location: '/demo?static=1', 'Cache-Control': 'no-store' } });
    }
    // A relative Location keeps the visitor on the host they came from (the cookie is set for that host).
    const res = new NextResponse(null, { status: 307, headers: { Location: target, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    res.cookies.set(DEMO_COOKIE, jwt, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: DEMO_MAX_AGE_S,
        secure: (process.env.NEXTAUTH_URL || '').startsWith('https://'),
    });
    return res;
}
