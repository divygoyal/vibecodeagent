import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminStore } from '@/lib/portfolio/adminStore';
import { googleAccessFor } from '@/lib/portfolio/auth';
import { STALE_AFTER_S } from '@/lib/portfolio/ranges';
import { startSync, type SyncResult } from '@/lib/portfolio/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const USERS_PER_RUN = 25;
const TIME_BUDGET_MS = 240_000;

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
 * Cron: sync the portfolios whose oldest visible asset is older than 6 hours.
 * Users run one after another (each sync fetches 4 assets at a time), within
 * a 4-minute budget; the next run picks up the rest.
 * Authorization: Bearer $CRON_SECRET.
 */
async function handle(req: NextRequest) {
    if (!verifyCronSecret(req.headers.get('authorization'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const started = Date.now();
    const users = await adminStore.staleUsers(STALE_AFTER_S, USERS_PER_RUN);
    const results: Pick<SyncResult, 'identifier' | 'due' | 'synced' | 'failed' | 'calls' | 'ms'>[] = [];
    const skipped: { identifier: string; reason: string }[] = [];
    for (const u of users) {
        if (Date.now() - started > TIME_BUDGET_MS) {
            skipped.push({ identifier: u.identifier, reason: 'time budget' });
            continue;
        }
        const access = await googleAccessFor(u.identifier);
        if (!access.ok) {
            skipped.push({ identifier: u.identifier, reason: access.reason });
            continue;
        }
        const r = await startSync({ identifier: u.identifier, accessToken: access.token, reason: 'cron' });
        results.push({ identifier: r.identifier, due: r.due, synced: r.synced, failed: r.failed, calls: r.calls, ms: r.ms });
    }
    console.log(`[CRON] portfolio-sync: ${results.length} synced, ${skipped.length} skipped in ${Date.now() - started}ms`);
    return NextResponse.json({ ok: true, users: users.length, results, skipped, ms: Date.now() - started });
}

export const GET = handle;
export const POST = handle;
