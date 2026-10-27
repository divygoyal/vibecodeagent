import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runStalePortfolioSync } from '@/lib/portfolio/scheduledSync';

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
 * Cron: sync the stale portfolios (see runStalePortfolioSync). Optional in
 * production, where the in-process scheduler (instrumentation.ts) already runs
 * it every 30 minutes. Authorization: Bearer $CRON_SECRET.
 */
async function handle(req: NextRequest) {
    if (!verifyCronSecret(req.headers.get('authorization'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const run = await runStalePortfolioSync();
    console.log(`[CRON] portfolio-sync: ${run.results.length} synced, ${run.skipped.length} skipped in ${run.ms}ms`);
    return NextResponse.json({ ok: true, ...run });
}

export const GET = handle;
export const POST = handle;
