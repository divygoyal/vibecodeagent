import { NextResponse, type NextRequest } from 'next/server';

/**
 * Favicon proxy for <Favicon> (DESIGN 2.8): wraps Google's s2 favicon service
 * and caches for 7 days. Answers 204 (empty) when there is no real icon so the
 * client falls back to its letter tile.
 *
 *   GET /api/favicon?host=acme.com&size=32|64
 */

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RESERVED_TLDS = ['.example', '.test', '.invalid', '.localhost', '.local'];
const WEEK = 60 * 60 * 24 * 7;

/** "No icon": 204 makes the <img> fail (letter tile) without a console 404. */
function notFound(maxAge = 60 * 60 * 24) {
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': `public, max-age=${maxAge}` } });
}

export async function GET(req: NextRequest) {
    const host = (req.nextUrl.searchParams.get('host') || '').trim().toLowerCase().replace(/^www\./, '');
    const size = req.nextUrl.searchParams.get('size') === '64' ? 64 : 32;
    if (!HOST_RE.test(host)) return notFound(WEEK);
    // Reserved names (demo data uses *.example) never have icons.
    if (RESERVED_TLDS.some((t) => host.endsWith(t))) return notFound(WEEK);

    try {
        const upstream = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`, {
            signal: AbortSignal.timeout(4000),
            next: { revalidate: WEEK },
        });
        // s2 answers 404 with a generic globe for unknown sites: treat it as "no icon".
        if (!upstream.ok) return notFound();
        const type = upstream.headers.get('content-type') || 'image/png';
        if (!type.startsWith('image/')) return notFound();
        const body = await upstream.arrayBuffer();
        if (body.byteLength === 0 || body.byteLength > 200_000) return notFound();
        return new NextResponse(body, {
            status: 200,
            headers: {
                'Content-Type': type,
                'Cache-Control': `public, max-age=${WEEK}, stale-while-revalidate=${WEEK}`,
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch {
        return notFound(60 * 10);
    }
}
