import { NextRequest, NextResponse } from 'next/server';
import { googleAccessFor, sessionIdentifier } from '@/lib/portfolio/auth';
import { isSyncRunning, lastSyncResult, startSync } from '@/lib/portfolio/sync';

export const dynamic = 'force-dynamic';

const MANUAL_COOLDOWN_MS = 60_000;

/**
 * POST /api/portfolio/sync  { force?: boolean, wait?: boolean }
 * Starts the signed-in user's sync (joins a running one). `force` refetches
 * fresh assets and the inventory too (once a minute at most). `wait` returns
 * the finished sync with its Google call counts instead of returning at once.
 */
export async function POST(req: NextRequest) {
    const identifier = await sessionIdentifier();
    if (!identifier) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { force?: unknown; wait?: unknown };
    const force = body.force === true;
    const wait = body.wait === true;

    const access = await googleAccessFor(identifier, req);
    if (!access.ok) {
        return NextResponse.json({ error: 'Google is not connected', code: 'GOOGLE_NOT_CONNECTED' }, { status: 400 });
    }
    const running = isSyncRunning(identifier);
    const last = lastSyncResult(identifier);
    if (!running && force && last && Date.now() - last.startedAt < MANUAL_COOLDOWN_MS) {
        return NextResponse.json({ started: false, syncing: false, error: 'Synced a moment ago. Try again in a minute.' }, { status: 429 });
    }
    const p = startSync({ identifier, accessToken: access.token, reason: 'manual', force, refreshInventory: force });
    if (!wait) return NextResponse.json({ started: !running, syncing: true });
    const result = await p;
    return NextResponse.json({ started: !running, syncing: false, result });
}
