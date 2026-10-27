import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/googleApi';
import { loadUserInventory } from '@/lib/googleAccounts';
import { pairSites, siteKind } from '@/lib/sites/pairing';
import { digits, loadMine, requireUser } from '@/lib/leaderboard/owner';
import type { SiteChoice } from '@/lib/leaderboard/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/leaderboard/me/sites: the Google account's sites (GA4 properties paired
 * with Search Console sites by hostname) with whether each is already listed.
 */
export async function GET() {
    const auth = await requireUser();
    if ('error' in auth) return auth.error;
    const { user } = auth;
    // The session's access token may be an hour old: always go through the refresh logic.
    const token = await getValidAccessToken(user.accessToken, user.refreshToken).catch(() => null);
    if (!token) {
        return NextResponse.json({ sites: [], errors: { ga4: { status: 401, message: 'Reconnect Google.' } } });
    }
    const [inv, mine] = await Promise.all([
        // Every Google connection of the user (sign-in account + linked accounts).
        loadUserInventory(user.userId, { primary: { ok: true, token } }).catch(() => null),
        loadMine(user.userId),
    ]);
    if (!inv) return NextResponse.json({ sites: [], errors: { ga4: { status: 502, message: 'Could not read your Google account.' } } });

    const pairs = pairSites(inv.properties, inv.sites);
    const sites: SiteChoice[] = pairs.map((p) => {
        const listed = p.ga4 ? mine.find((e) => digits(e.ga_property_id) === digits(p.ga4!.property)) : undefined;
        const ownerLevel = p.gsc && ['siteOwner', 'siteFullUser'].includes(p.gsc.permissionLevel || '');
        let note: string | undefined;
        if (!p.ga4) note = 'No Google Analytics property found for this site. Visitors come from GA4.';
        else if (!p.gsc) note = 'Not in Search Console yet. You can join, but you stay pending until you verify it there.';
        else if (!ownerLevel) note = 'You only have limited access in Search Console. Ownership needs Owner or Full user.';
        return {
            key: p.key,
            host: p.host,
            ga4: p.ga4 ? { property: p.ga4.property, displayName: p.ga4.displayName } : null,
            gsc: p.gsc ? { siteUrl: p.gsc.siteUrl, permissionLevel: p.gsc.permissionLevel, kind: siteKind(p.gsc.siteUrl) } : null,
            listedAs: listed?.id ?? null,
            canJoin: Boolean(p.ga4) && !listed,
            note,
        };
    });
    sites.sort((a, b) => Number(Boolean(b.ga4 && b.gsc)) - Number(Boolean(a.ga4 && a.gsc)) || a.host.localeCompare(b.host));
    return NextResponse.json({ sites, errors: inv.errors });
}
