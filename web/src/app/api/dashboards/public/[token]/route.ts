import { madeWithVisible } from '@/lib/growth/madeWith';
import { NextResponse } from 'next/server';
import { checkUnlockKey, clientIp, publicSiteChoices, rateLimited, unlockKeyFrom } from '@/lib/builder/server/access';
import { directoryFor, jsonError, safeLabeler } from '@/lib/builder/server/service';
import { getPublicRow, isShareToken, toRecord } from '@/lib/builder/server/store';
import { publicDoc } from '@/lib/builder/publicDoc';
import type { PublicDashboard } from '@/lib/builder/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/public/[token]: the shared dashboard for /view/[token] and embeds.
 * Never returns the owner, property ids or site URLs (sources become labels). A password-
 * protected share returns only its name until the viewer unlocks it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!isShareToken(token)) return jsonError(404, 'This dashboard is no longer shared.');
    if (rateLimited(`pubdoc:${token}:${clientIp(req)}`, 60)) return jsonError(429, 'Too many requests. Please try again later.');
    const preview = new URL(req.url).searchParams.get('preview') === '1';
    const row = await getPublicRow(token, false).catch(() => null);
    if (!row) return jsonError(404, 'This dashboard is no longer shared.');
    const rec = toRecord(row);
    const unlocked = !rec.share.hasPassword || checkUnlockKey(token, unlockKeyFrom(req, token));
    const body: PublicDashboard = { name: rec.doc.name, requiresPassword: rec.share.hasPassword, unlocked };
    if (unlocked) {
        const dir = row.ownerIdentifier ? await directoryFor(row.ownerIdentifier) : null;
        // Site switcher (round 7): only the sites the owner allowed, as opaque keys and labels.
        body.doc = publicDoc(rec.doc, safeLabeler(dir), { siteChoices: (c) => publicSiteChoices(c, dir, token) });
        body.share = { allowCopy: rec.share.allowCopy, badge: madeWithVisible(rec.share.badge, rec.doc.theme.badge.show), viewerControls: rec.share.viewerControls };
        body.rev = rec.rev;
        if (!preview) void getPublicRow(token, true).catch(() => null); // count the view
    }
    return NextResponse.json({ dashboard: body }, { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
}
