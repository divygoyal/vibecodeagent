import { NextResponse } from 'next/server';
import { checkOwnership } from '@/lib/leaderboardVerify';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { cleanOpenTo, cleanProfileFields, digits, loadMine, requireUser } from '@/lib/leaderboard/owner';
import { allow } from '@/lib/leaderboard/rateLimit';
import { refreshEntry, storeVerification } from '@/lib/leaderboard/refresh';
import { faviconUrl } from '@/lib/leaderboard/constants';
import { normalizeHost } from '@/lib/sites/pairing';
import { isBlockedUrl } from '@/lib/urlValidation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/leaderboard/me: my leaderboard profiles with verification, privacy and numbers. */
export async function GET() {
    const auth = await requireUser();
    if ('error' in auth) return auth.error;
    return NextResponse.json({ entries: await loadMine(auth.user.userId) });
}

/**
 * POST /api/leaderboard/me: start a listing for one of my sites.
 *
 * Creates the profile as an unlisted draft (nothing is public yet), checks
 * ownership (Search Console owner / full user, plus the GA4 stream as a second
 * signal), reads the first numbers, and returns the entry so the editor can show
 * the preview and the verification result. The owner publishes from the editor.
 */
export async function POST(req: Request) {
    const auth = await requireUser();
    if ('error' in auth) return auth.error;
    const { user } = auth;
    if (!user.accessToken && !user.refreshToken) {
        return NextResponse.json({ error: 'Reconnect Google so we can check your site.' }, { status: 400 });
    }
    const rate = allow(`lb-join:${user.userId}`, 20, 60 * 60 * 1000);
    if (!rate.ok) {
        return NextResponse.json({ error: 'Too many new listings. Try again in a bit.', retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    }

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const gaPropertyId = typeof body.ga_property_id === 'string' ? body.ga_property_id.trim() : '';
    if (!digits(gaPropertyId)) {
        return NextResponse.json({ error: 'Pick a site that has a Google Analytics property. Visitors come from GA4.' }, { status: 400 });
    }
    const gscSiteUrl = typeof body.gsc_site_url === 'string' && body.gsc_site_url.trim() ? body.gsc_site_url.trim() : null;
    const rawWebsite = typeof body.website_url === 'string' ? body.website_url.trim() : '';
    const host = normalizeHost(rawWebsite || gscSiteUrl || '');
    if (!host || !host.includes('.')) {
        return NextResponse.json({ error: 'We could not tell which website this is. Pick a site from the list.' }, { status: 400 });
    }
    const websiteUrl = `https://${host}`;
    if (isBlockedUrl(websiteUrl)) {
        return NextResponse.json({ error: 'Website must be a public address.' }, { status: 400 });
    }

    const existing = (await loadMine(user.userId)).find((e) => digits(e.ga_property_id) === digits(gaPropertyId));
    if (existing) {
        return NextResponse.json({ error: 'This site is already on your list.', entryId: existing.id }, { status: 409 });
    }

    const fields = cleanProfileFields({
        startup_name: body.startup_name || host,
        description: body.description,
        category: body.category,
        mrr_range: body.mrr_range,
        twitter_handle: body.twitter_handle,
        founder_name: body.founder_name,
        contact_email: body.contact_email,
        logo_url: body.logo_url,
    });
    if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });
    const f = fields.value;

    const outcome = await checkOwnership({ websiteUrl, gaPropertyId, accessToken: user.accessToken, refreshToken: user.refreshToken, userIdentifier: user.userId });

    const join = await lbAdmin<{ success: boolean; id: number }>(`/api/leaderboard/${encodeURIComponent(user.userId)}/join`, {
        method: 'POST',
        body: {
            startup_name: f.startup_name,
            description: f.description ?? null,
            website_url: websiteUrl,
            logo_url: f.logo_url ?? faviconUrl(host, 128),
            category: f.category ?? 'Other',
            mrr_range: f.mrr_range ?? null,
            looking_for: [],
            twitter_handle: f.twitter_handle ?? null,
            founder_name: f.founder_name ?? null,
            contact_email: f.contact_email ?? null,
            ga_property_id: gaPropertyId,
            verification_status: outcome.level === 'owner' ? 'verified' : 'pending',
            verified_host: outcome.verifiedHost,
        },
        timeoutMs: 30_000,
    });
    if (!join.ok || !join.data?.id) {
        return NextResponse.json({ error: join.error || 'Could not save the listing right now.' }, { status: join.status >= 400 && join.status < 500 ? join.status : 502 });
    }
    const entryId = join.data.id;

    const open = cleanOpenTo(body.open_to);
    await lbAdmin(`/api/lb/entry/${entryId}/settings`, {
        method: 'PUT',
        query: { user_identifier: user.userId },
        body: { is_paused: true, gsc_site_url: outcome.gscSiteUrl ?? gscSiteUrl ?? undefined, ...(open ? { open_to: open } : {}) },
    });
    await storeVerification(entryId, outcome);

    // First numbers, so the preview is real. Capped so a slow Google call cannot hang the page.
    await Promise.race([
        refreshEntry({
            entryId,
            gaPropertyId,
            websiteUrl,
            accessToken: user.accessToken,
            refreshToken: user.refreshToken,
            userIdentifier: user.userId,
            skipVerify: true,
            gscSiteUrl: outcome.gscSiteUrl ?? gscSiteUrl,
        }).catch((err) => console.error('[Leaderboard join] first refresh failed:', err)),
        new Promise((resolve) => setTimeout(resolve, 40_000)),
    ]);

    const entry = (await loadMine(user.userId)).find((e) => e.id === entryId) ?? null;
    return NextResponse.json({ entry, verification: { level: outcome.level, message: outcome.message, fix: outcome.fix, transient: outcome.transient } }, { status: 201 });
}
