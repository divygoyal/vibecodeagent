import { NextResponse } from 'next/server';
import { checkUnlockKey, clientIp, drillResolver, rateLimited, sitePicksFromKeys, unlockKeyFrom } from '@/lib/builder/server/access';
import { directoryFor, jsonError, ownerDeps } from '@/lib/builder/server/service';
import { evaluatePublicRealtime, publicRealtimeWidget, realtimeDeps } from '@/lib/builder/server/realtime';
import { getPublicRow, isShareToken, toRecord } from '@/lib/builder/server/store';
import { publicControlsFromQuery } from '@/lib/builder/publicDoc';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/public/[token]/realtime?w=<widgetId>&s.<id>=&f.<id>=
 * Who is online now for one realtime widget of a shared dashboard, read server side with the owner's Google
 * access (the owner's token never leaves the server). The widget, its source and its settings come from the saved
 * dashboard; the query string can only carry what the share allows (site switcher keys, filters). Rate limited per
 * viewer and per link, and cached: at most one Google read per 30 seconds per link + widget + picks.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!isShareToken(token)) return jsonError(404, 'This dashboard is no longer shared.');
    // Viewer limit first, then a limit for the whole link, so many viewers cannot widen the Google bill.
    if (rateLimited(`pubrt:${token}:${clientIp(req)}`, 60)) return jsonError(429, 'Too many requests. Please try again later.');
    if (rateLimited(`pubrt-all:${token}`, 240)) return jsonError(429, 'This shared dashboard is busy. Please try again later.');
    const row = await getPublicRow(token, false).catch(() => null);
    if (!row || !row.ownerIdentifier) return jsonError(404, 'This dashboard is no longer shared.');
    const rec = toRecord(row);
    if (rec.share.hasPassword && !checkUnlockKey(token, unlockKeyFrom(req, token))) {
        return jsonError(401, 'This dashboard needs a password.', { requiresPassword: true });
    }
    const sp = new URL(req.url).searchParams;
    const wid = sp.get('w') ?? '';
    // Only a realtime widget that sits on a visible page: hidden pages are not part of the share.
    const widget = publicRealtimeWidget(rec.doc, wid);
    if (!widget) return jsonError(404, 'Not found.');
    const wantsSite = rec.doc.controls.some((c) => c.type === 'site' && c.viewerCanChange && sp.has(`s.${c.id}`));
    const dir = wantsSite ? await directoryFor(row.ownerIdentifier) : null;
    const controls = publicControlsFromQuery(sp, rec.doc, rec.share, (picks) => sitePicksFromKeys(rec.doc.controls, picks, dir, token), drillResolver(token));
    try {
        const res = await evaluatePublicRealtime({
            shareToken: token, ownerId: row.ownerIdentifier, widget,
            defaultSource: rec.doc.defaultSource, controlDefs: rec.doc.controls, controls, pageId: controls.pageId,
        }, realtimeDeps(ownerDeps(row.ownerIdentifier, 'public'), 'public'));
        return NextResponse.json(res, {
            headers: {
                'Cache-Control': rec.share.hasPassword ? 'private, no-store' : 'public, max-age=0, s-maxage=30',
                'X-Robots-Tag': 'noindex',
            },
        });
    } catch (err) {
        console.error('[dashboards] public realtime failed', err);
        return jsonError(500, 'Realtime data is temporarily unavailable.');
    }
}
