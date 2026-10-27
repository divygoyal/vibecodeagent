import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { RefreshListError, startLeaderboardRefresh } from '@/lib/leaderboard/refreshAll';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function verifyCronSecret(header: string | null): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || !header) return false;
    const expected = `Bearer ${secret}`;
    const maxLen = Math.max(header.length, expected.length);
    const a = Buffer.alloc(maxLen);
    const b = Buffer.alloc(maxLen);
    Buffer.from(header).copy(a);
    Buffer.from(expected).copy(b);
    return header.length === expected.length && timingSafeEqual(a, b);
}

/**
 * Daily refresh (see lib/leaderboard/refreshAll.ts). Optional in production, where the in-process
 * scheduler (instrumentation.ts) already runs it once a day. Authorization: Bearer $CRON_SECRET.
 *
 * Idempotent and safe next to the scheduler:
 *  - if a run is already in progress it answers 202 `{ running: true }` at once;
 *  - `?minAgeHours=N` leaves listings refreshed less than N hours ago (default 0: every listing,
 *    as before), so a cron that fires twice does not need to refresh twice.
 */
export async function GET(req: NextRequest) {
    if (!verifyCronSecret(req.headers.get('authorization'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const minAgeHours = Number(req.nextUrl.searchParams.get('minAgeHours') ?? 0);
    const minAgeMs = Number.isFinite(minAgeHours) && minAgeHours > 0 ? Math.min(minAgeHours, 48) * 3_600_000 : 0;

    const started = startLeaderboardRefresh({ reason: 'cron', minAgeMs });
    if (!started) {
        console.log('[leaderboard-refresh:cron] a refresh is already running; nothing to do');
        return NextResponse.json({ success: true, running: true, message: 'A refresh is already running' }, { status: 202 });
    }
    try {
        return NextResponse.json(await started);
    } catch (err) {
        return NextResponse.json({ error: err instanceof RefreshListError ? err.message : 'Refresh failed' }, { status: 500 });
    }
}
