import { NextResponse } from 'next/server';

import { BRAND_NAME } from '@/lib/brand';
import { lbAdmin } from '@/lib/leaderboard/admin';
import type { BadgeTheme } from '@/lib/leaderboard/badgeSvg';
import { trafficBadgeSvg, trafficBadgeText } from '@/lib/leaderboard/trafficBadge';
import type { EmbedPayload } from '@/lib/leaderboard/types';

export const dynamic = 'force-dynamic';

const FILE_RE = /^([a-z0-9-]{1,150})\.svg$/;

/**
 * GET /badge/<profile-slug>.svg[?theme=light|dark]: "Verified traffic · 12.3K visitors/mo", for verified, public
 * leaderboard profiles (numbers follow the owner's privacy settings, last 28 days). Anything else (unknown, pending,
 * paused) gets the same neutral "Not listed" badge with a 404, so the badge never says which. Cached at the edge for
 * an hour. The matching copy-paste snippets (linking to the profile with ?ref=badge) are in the leaderboard profile's
 * "Get your badge" box.
 */
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
    const { file } = await ctx.params;
    const m = FILE_RE.exec(file.toLowerCase());
    if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const theme: BadgeTheme = new URL(req.url).searchParams.get('theme') === 'dark' ? 'dark' : 'light';

    const res = await lbAdmin<EmbedPayload>(`/api/lb/embed/${encodeURIComponent(m[1])}`, { query: { range: '28d' }, timeoutMs: 6_000 });
    const data = res.ok ? res.data : null;
    const svg = trafficBadgeSvg({ data, theme, brand: BRAND_NAME });
    const listed = trafficBadgeText(data) !== null;
    // An outage of the admin API (not a 404) must not be cached for long as "not listed".
    const outage = !res.ok && res.status !== 404;
    return new NextResponse(svg, {
        status: listed ? 200 : outage ? 503 : 404,
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            'Cache-Control': listed ? 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400' : outage ? 'public, max-age=30, s-maxage=30' : 'public, max-age=300, s-maxage=300',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
