import { NextResponse, type NextRequest } from 'next/server';

/**
 * Favicon proxy for <Favicon> (DESIGN 2.8): wraps Google's s2 favicon service
 * and caches for 7 days. When a site has no icon it answers 200 with a small
 * letter-mark SVG in the site's categorical colour (stable per host), so pages
 * never log failed image loads.
 *
 *   GET /api/favicon?host=acme.com&size=32|64
 */

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RESERVED_TLDS = ['.example', '.test', '.invalid', '.localhost', '.local'];
const WEEK = 60 * 60 * 24 * 7;

// Categorical palette (DESIGN 2.4, light values); white letters pass 3:1 on all of them at this size.
const LETTER_COLOURS = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#008300', '#6250d6', '#e34948'];

function letterMark(host: string, maxAge = 60 * 60 * 24) {
    let h = 0;
    for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
    const letter = /[a-z0-9]/.test(host[0] ?? '') ? host[0].toUpperCase() : '?';
    const fill = letter === '?' ? '#8a919c' : LETTER_COLOURS[h % LETTER_COLOURS.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${fill}"/>`
        + `<text x="16" y="21.5" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="17" font-weight="600" fill="#fff">${letter}</text></svg>`;
    return new NextResponse(svg, {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': `public, max-age=${maxAge}`, 'X-Content-Type-Options': 'nosniff' },
    });
}

export async function GET(req: NextRequest) {
    const host = (req.nextUrl.searchParams.get('host') || '').trim().toLowerCase().replace(/^www\./, '');
    const size = req.nextUrl.searchParams.get('size') === '64' ? 64 : 32;
    if (!HOST_RE.test(host)) return letterMark('', WEEK);
    // Reserved names (demo data uses *.example) never have icons.
    if (RESERVED_TLDS.some((t) => host.endsWith(t))) return letterMark(host, WEEK);

    try {
        const upstream = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`, {
            signal: AbortSignal.timeout(4000),
            next: { revalidate: WEEK },
        });
        // s2 answers 404 with a generic globe for unknown sites: treat it as "no icon".
        if (!upstream.ok) return letterMark(host);
        const type = upstream.headers.get('content-type') || 'image/png';
        if (!type.startsWith('image/')) return letterMark(host);
        const body = await upstream.arrayBuffer();
        if (body.byteLength === 0 || body.byteLength > 200_000) return letterMark(host);
        return new NextResponse(body, {
            status: 200,
            headers: {
                'Content-Type': type,
                'Cache-Control': `public, max-age=${WEEK}, stale-while-revalidate=${WEEK}`,
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch {
        return letterMark(host, 60 * 10);
    }
}
