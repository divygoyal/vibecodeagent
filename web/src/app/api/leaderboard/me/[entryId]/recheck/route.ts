import { NextResponse } from 'next/server';
import { findMine, parseEntryId, requireUser } from '@/lib/leaderboard/owner';
import { allow } from '@/lib/leaderboard/rateLimit';
import { refreshEntry } from '@/lib/leaderboard/refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/leaderboard/me/[entryId]/recheck: re-run the ownership check and refresh the numbers now. */
export async function POST(_req: Request, { params }: { params: Promise<{ entryId: string }> }) {
    const auth = await requireUser();
    if ('error' in auth) return auth.error;
    const { user } = auth;
    const entryId = parseEntryId((await params).entryId);
    if (!entryId) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 });
    const entry = await findMine(user.userId, entryId);
    if (!entry || !entry.ga_property_id) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

    const rate = allow(`lb-recheck:${entryId}`, 6, 10 * 60 * 1000);
    if (!rate.ok) {
        return NextResponse.json({ error: 'Re-checked a few times already. Wait a few minutes and try again.', retryAfterSeconds: rate.retryAfterSeconds }, { status: 429 });
    }
    if (!user.accessToken && !user.refreshToken) {
        return NextResponse.json({ error: 'Reconnect Google so we can check your site.' }, { status: 400 });
    }

    const result = await refreshEntry({
        entryId,
        gaPropertyId: entry.ga_property_id,
        websiteUrl: entry.website_url,
        accessToken: user.accessToken,
        refreshToken: user.refreshToken,
        userIdentifier: user.userId,
    });
    const fresh = await findMine(user.userId, entryId);
    return NextResponse.json({
        ok: result.ok,
        error: result.error,
        verification: result.verification
            ? { level: result.verification.level, message: result.verification.message, fix: result.verification.fix, transient: result.verification.transient }
            : null,
        entry: fresh,
    });
}
