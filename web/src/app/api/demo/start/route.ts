import { NextResponse, type NextRequest } from 'next/server';

import { DEMO_COOKIE, DEMO_MAX_AGE_S, isCrossSite, isScriptFetch, publicDemoEnabled, safeDemoTarget } from '@/lib/publicDemo/config';
import { ownSessionCookie } from '@/lib/publicDemo/cookies';
import { clientIp, DEMO_START_LIMIT_PER_MIN, demoRateOk } from '@/lib/publicDemo/rateLimit';
import { ensureDemoUser } from '@/lib/publicDemo/seed';
import { demoSlugTarget } from '@/lib/publicDemo/sites';
import { mintDemoJwt } from '@/lib/publicDemo/token';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

function redirect(location: string): Response {
    // Relative: keeps the visitor on the host they came from (the cookie is set for that host).
    return new Response(null, { status: 307, headers: { Location: location, ...NO_STORE } });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** A signed-in visitor sent here by another site: ask first instead of switching them into the demo. */
function confirmPage(again: string): Response {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Open the live demo?</title><style>
:root{--bg:#f6f7f8;--card:#fff;--fg:#14181f;--muted:#5b6472;--line:#e3e6ea;--brand:#0f3d2e;--brand-fg:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0d0f12;--card:#16191e;--fg:#eef1f4;--muted:#9aa3ae;--line:#272b31;--brand:#3ccf91;--brand-fg:#06281b}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
main{max-width:420px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:var(--muted)}
.row{display:flex;flex-wrap:wrap;gap:10px}a{display:inline-flex;align-items:center;height:40px;padding:0 16px;border-radius:9px;text-decoration:none;font-weight:600}
.primary{background:var(--brand);color:var(--brand-fg)}.ghost{color:var(--fg);border:1px solid var(--line)}
</style></head><body><main><h1>Open the live demo?</h1>
<p>You'll stay signed in. The demo shows sample sites, read-only, until you exit it.</p>
<div class="row"><a class="primary" href="${esc(again)}">Open the demo</a><a class="ghost" href="/dashboard">Back to your sites</a></div>
</main></body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
}

/**
 * GET /demo (middleware rewrites it here, and the route may be called directly: every check is here).
 *   /demo?to=/dashboard/...   land there (only /dashboard paths; anything else -> /dashboard)
 *   /demo/<slug>              (rewritten with ?slug=) that sample site's page
 * Sets the httpOnly tc_demo cookie (2 h; its own salt, so it is not a session token). The visitor's own
 * session cookie is not touched. Script fetches and prerenders get 204; more than 20 starts a minute from one
 * address get the static demo page; a signed-in visitor arriving from another site is asked first.
 */
export async function GET(req: NextRequest) {
    if (!publicDemoEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (isScriptFetch(req.headers)) return new Response(null, { status: 204, headers: NO_STORE });

    const params = req.nextUrl.searchParams;
    const slug = params.get('slug');
    const to = params.get('to');
    const target = slug !== null ? demoSlugTarget(slug) : safeDemoTarget(to);

    if (!demoRateOk(`start:${clientIp(req.headers)}`, DEMO_START_LIMIT_PER_MIN)) return redirect('/demo?static=1');

    if (isCrossSite(req.headers) && ownSessionCookie(req.headers.get('cookie')).present) {
        const again = slug !== null ? `/demo/${encodeURIComponent(slug)}` : to ? `/demo?to=${encodeURIComponent(safeDemoTarget(to))}` : '/demo';
        return confirmPage(again);
    }

    const secret = process.env.NEXTAUTH_SECRET || '';
    let jwt: string;
    try {
        await ensureDemoUser();
        jwt = await mintDemoJwt(secret);
    } catch (err) {
        console.error('[public-demo] could not start a demo session:', err instanceof Error ? err.message : err);
        return redirect('/demo?static=1');
    }
    const res = new NextResponse(null, { status: 307, headers: { Location: target, ...NO_STORE } });
    res.cookies.set(DEMO_COOKIE, jwt, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: DEMO_MAX_AGE_S,
        secure: (process.env.NEXTAUTH_URL || '').startsWith('https://'),
    });
    return res;
}
