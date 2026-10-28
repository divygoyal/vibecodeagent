import { chartImage } from '@/lib/builder/email/ChartImage';
import { specFromToken } from '@/lib/builder/email/chartSpec';
import { rateLimited, clientIp } from '@/lib/builder/server/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/email/chart?t=<signed spec>: the chart picture inside a scheduled dashboard email. No session, no
 * data access: the signed token carries the (already formatted) numbers, so it can only draw what this server
 * signed. Mail apps fetch it from their own proxies, so the answer is cacheable for good.
 */
export async function GET(req: Request) {
    if (rateLimited(`email-chart:${clientIp(req)}`, 120)) return new Response('Too many requests', { status: 429 });
    const t = new URL(req.url).searchParams.get('t');
    const spec = specFromToken(t);
    if (!spec) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const img = chartImage(spec);
    img.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    img.headers.set('X-Robots-Tag', 'noindex');
    return img;
}
