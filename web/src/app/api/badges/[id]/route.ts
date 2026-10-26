import { NextResponse } from 'next/server';
import { BRAND_NAME } from '@/lib/brand';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { badgeSvg, type BadgeTheme, type BadgeVariant } from '@/lib/leaderboard/badgeSvg';
import { DEFAULT_RANGE, RANGES } from '@/lib/leaderboard/constants';
import { getLiveNow } from '@/lib/leaderboard/live';
import type { EmbedPayload } from '@/lib/leaderboard/types';

export const dynamic = 'force-dynamic';

const SLUG_OR_ID_RE = /^[a-z0-9-]{1,150}$/;
const VARIANTS = new Set<BadgeVariant>(['minimal', 'rank', 'stats', 'live']);
const RANGE_SET = new Set<string>(RANGES.map((r) => r.value));

/**
 * GET /api/badges/[id]: the embeddable verified badge (SVG). `id` is the numeric id
 * that existing embeds use, or the slug.
 *
 *   ?variant=minimal (default) | rank | stats | live   ?theme=light (default) | dark
 *   &range=7d|28d|3m
 *
 * `live` adds "N online now" when the owner opted in to live (cached 60 s). All
 * numbers follow the owner's privacy settings; nothing hidden is drawn.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    if (!SLUG_OR_ID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const sp = new URL(req.url).searchParams;
    const variant = (VARIANTS.has(sp.get('variant') as BadgeVariant) ? sp.get('variant') : 'minimal') as BadgeVariant;
    const theme: BadgeTheme = sp.get('theme') === 'dark' ? 'dark' : 'light';
    const range = RANGE_SET.has(sp.get('range') || '') ? sp.get('range')! : DEFAULT_RANGE;

    const res = await lbAdmin<EmbedPayload>(`/api/lb/embed/${encodeURIComponent(id)}`, { query: { range }, timeoutMs: 6_000 });
    const data = res.ok ? res.data : null;

    let liveUsers: number | null = null;
    if (data && variant === 'live' && data.live_enabled) {
        const live = await getLiveNow(data.id).catch(() => null);
        liveUsers = live?.active_users ?? null;
    }

    const svg = badgeSvg({ data, variant, theme, liveUsers, brand: BRAND_NAME });
    const cache = !data
        ? 'public, max-age=300'
        : variant === 'live'
            ? 'public, max-age=60, s-maxage=60, stale-while-revalidate=60'
            : 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400';
    return new NextResponse(svg, {
        status: data ? 200 : 404,
        headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' },
    });
}
