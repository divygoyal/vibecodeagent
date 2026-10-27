import { NextResponse } from 'next/server';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { DEFAULT_RANGE, RANGES } from '@/lib/leaderboard/constants';
import type { ProfilePayload } from '@/lib/leaderboard/types';

export const dynamic = 'force-dynamic';

const RANGE_SET = new Set<string>(RANGES.map((r) => r.value));
const SLUG_OR_ID_RE = /^[a-z0-9-]{1,150}$/;

/**
 * Public profile JSON. The path segment is a numeric id (legacy) or the slug.
 * Privacy is applied by the admin API; hidden metrics and sections are absent.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!SLUG_OR_ID_RE.test(id)) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    const rangeParam = new URL(req.url).searchParams.get('range') || '';
    const range = RANGE_SET.has(rangeParam) ? rangeParam : DEFAULT_RANGE;

    const res = await lbAdmin<ProfilePayload>(`/api/lb/profile/${encodeURIComponent(id)}`, { query: { range }, timeoutMs: 8_000 });
    if (!res.ok || !res.data) {
        if (res.status === 404) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        return NextResponse.json({ error: 'Failed to fetch entry' }, { status: 502 });
    }
    return NextResponse.json(res.data, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}
