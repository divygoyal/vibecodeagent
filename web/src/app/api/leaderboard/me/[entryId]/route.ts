import { NextResponse } from 'next/server';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { cleanOpenTo, cleanPrivacy, cleanProfileFields, findMine, parseEntryId, requireUser } from '@/lib/leaderboard/owner';
import { refreshEntry } from '@/lib/leaderboard/refresh';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/leaderboard/me/[entryId]: edit the profile, privacy, "open to" flags, or
 * pause / publish. The website and GA4 property cannot be changed (they are what was
 * verified); remove the profile and add the site again instead.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ entryId: string }> }) {
    const auth = await requireUser();
    if ('error' in auth) return auth.error;
    const { user } = auth;
    const entryId = parseEntryId((await params).entryId);
    if (!entryId) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 });
    const before = await findMine(user.userId, entryId);
    if (!before) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const fields = cleanProfileFields(body);
    if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });
    if (Object.keys(fields.value).length > 0) {
        const res = await lbAdmin(`/api/leaderboard/entry/${entryId}`, {
            method: 'PUT',
            query: { user_identifier: user.userId },
            body: fields.value,
        });
        if (!res.ok) return NextResponse.json({ error: res.error || 'Could not save the profile.' }, { status: res.status >= 400 && res.status < 500 ? res.status : 502 });
    }

    const privacy = cleanPrivacy(body.privacy);
    const open = cleanOpenTo(body.open_to);
    const paused = typeof body.is_paused === 'boolean' ? body.is_paused : undefined;
    if (privacy || open || paused !== undefined) {
        const res = await lbAdmin(`/api/lb/entry/${entryId}/settings`, {
            method: 'PUT',
            query: { user_identifier: user.userId },
            body: { ...(privacy ? { privacy } : {}), ...(open ? { open_to: open } : {}), ...(paused !== undefined ? { is_paused: paused } : {}) },
        });
        if (!res.ok) return NextResponse.json({ error: res.error || 'Could not save the settings.' }, { status: res.status >= 400 && res.status < 500 ? res.status : 502 });
    }

    // Paused listings skip the daily refresh, so catch up as soon as one goes live again.
    if (before.is_paused && paused === false && before.ga_property_id) {
        void refreshEntry({
            entryId,
            gaPropertyId: before.ga_property_id,
            websiteUrl: before.website_url,
            accessToken: user.accessToken,
            refreshToken: user.refreshToken,
            skipVerify: before.verification.level === 'owner' && !before.verification.grace,
            gscSiteUrl: before.gsc_site_url,
        }).catch((err) => console.error('[Leaderboard] refresh on publish failed:', err));
    }

    const entry = await findMine(user.userId, entryId);
    return NextResponse.json({ entry });
}

/** DELETE /api/leaderboard/me/[entryId]: delete the profile and everything stored about it. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ entryId: string }> }) {
    const auth = await requireUser();
    if ('error' in auth) return auth.error;
    const entryId = parseEntryId((await params).entryId);
    if (!entryId) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 });
    const res = await lbAdmin(`/api/lb/entry/${entryId}`, { method: 'DELETE', query: { user_identifier: auth.user.userId } });
    if (!res.ok) return NextResponse.json({ error: res.error || 'Could not delete the profile.' }, { status: res.status >= 400 && res.status < 500 ? res.status : 502 });
    return NextResponse.json({ success: true });
}
