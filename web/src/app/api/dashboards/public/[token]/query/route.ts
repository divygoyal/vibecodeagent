import { NextResponse } from 'next/server';
import { checkUnlockKey, clientIp, rateLimited, sitePicksFromKeys, unlockKeyFrom } from '@/lib/builder/server/access';
import { directoryFor, evaluateDoc, jsonError, ownerDeps } from '@/lib/builder/server/service';
import { getPublicRow, isShareToken, toRecord } from '@/lib/builder/server/store';
import { publicControlsFromQuery } from '@/lib/builder/publicDoc';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/public/[token]/query?page=&range=&compare=&f.<controlId>=&s.<id>=&m.<id>=&g.<id>=
 * Evaluates every widget of one page with the owner's Google access, server side and cached.
 * The query string can only move the controls the owner allowed (date, compare, filters);
 * metrics, dimensions, sources and widget ids can never be named. Responses carry no ids.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!isShareToken(token)) return jsonError(404, 'This dashboard is no longer shared.');
    if (rateLimited(`pubq:${token}:${clientIp(req)}`, 120)) return jsonError(429, 'Too many requests. Please try again later.');
    const row = await getPublicRow(token, false).catch(() => null);
    if (!row || !row.ownerIdentifier) return jsonError(404, 'This dashboard is no longer shared.');
    const rec = toRecord(row);
    if (rec.share.hasPassword && !checkUnlockKey(token, unlockKeyFrom(req, token))) {
        return jsonError(401, 'This dashboard needs a password.', { requiresPassword: true });
    }
    const sp = new URL(req.url).searchParams;
    // Site switcher (round 7): s.<id> carries an opaque key; it maps to a site id only when the owner lets
    // viewers switch and the key is one of the allowed sites in the owner's own directory.
    const wantsSite = rec.doc.controls.some((c) => c.type === 'site' && c.viewerCanChange && sp.has(`s.${c.id}`));
    const dir = wantsSite ? await directoryFor(row.ownerIdentifier) : null;
    const controls = publicControlsFromQuery(sp, rec.doc, rec.share, (picks) => sitePicksFromKeys(rec.doc.controls, picks, dir, token));
    try {
        const res = await evaluateDoc(rec.doc, controls, ownerDeps(row.ownerIdentifier, 'public'), { pageId: controls.pageId });
        return NextResponse.json(res, {
            headers: {
                'Cache-Control': rec.share.hasPassword ? 'private, no-store' : 'public, s-maxage=300, stale-while-revalidate=3600',
                'X-Robots-Tag': 'noindex',
            },
        });
    } catch (err) {
        console.error('[dashboards] public query failed', err);
        return jsonError(500, 'Data is temporarily unavailable.');
    }
}
