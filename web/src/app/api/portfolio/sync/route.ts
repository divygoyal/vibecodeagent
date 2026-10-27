import { NextRequest, NextResponse } from 'next/server';
import { googleAccessFor, sessionIdentifier, sessionUserRegistrar } from '@/lib/portfolio/auth';
import { isSyncRunning, startSync } from '@/lib/portfolio/sync';

export const dynamic = 'force-dynamic';

const MANUAL_COOLDOWN_MS = 60_000;
const lastForcedAt = new Map<string, number>();

/**
 * POST /api/portfolio/sync  { force?: boolean, wait?: boolean }
 * Starts the signed-in user's sync in the background and answers at once (202, `{ started, syncing: true }`):
 * the Google token check and the whole sync run server-side after the response, and the page polls
 * GET /api/portfolio, which reports progress, errors and "Google is not connected" in its normal
 * answer. A sync already running is joined (`started: false`). `force` refetches fresh assets and the
 * inventory too (once a minute at most). `wait` (scripts, tests) returns the finished sync with its
 * Google call counts, and answers 400 at once when Google is not connected.
 */
export async function POST(req: NextRequest) {
    const identifier = await sessionIdentifier();
    if (!identifier) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { force?: unknown; wait?: unknown };
    const force = body.force === true;
    const wait = body.wait === true;

    const running = isSyncRunning(identifier);
    if (!running && force) {
        const lastForced = lastForcedAt.get(identifier) ?? 0;
        if (Date.now() - lastForced < MANUAL_COOLDOWN_MS) {
            return NextResponse.json({ started: false, syncing: false, error: 'Synced a moment ago. Try again in a minute.' }, { status: 429 });
        }
        lastForcedAt.set(identifier, Date.now());
        if (lastForcedAt.size > 5000) lastForcedAt.delete(lastForcedAt.keys().next().value as string);
    }

    const ensureUser = await sessionUserRegistrar(req);
    if (wait) {
        const access = await googleAccessFor(identifier, req);
        if (!access.ok) {
            return NextResponse.json({ error: 'Google is not connected', code: 'GOOGLE_NOT_CONNECTED' }, { status: 400 });
        }
        const result = await startSync({ identifier, accessToken: access.token, reason: 'manual', force, refreshInventory: force, ensureUser });
        return NextResponse.json({ started: !running, syncing: false, result });
    }

    // Registered as running right away; the token is fetched inside the sync (a failure ends it with a
    // "Google access expired" result that GET /api/portfolio reports).
    void startSync({
        identifier,
        accessToken: async () => {
            const access = await googleAccessFor(identifier, req);
            return access.ok ? access.token : null;
        },
        reason: 'manual', force, refreshInventory: force, ensureUser,
    });
    return NextResponse.json({ started: !running, syncing: true }, { status: 202 });
}
