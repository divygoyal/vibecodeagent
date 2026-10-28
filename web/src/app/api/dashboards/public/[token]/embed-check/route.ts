import { NextResponse } from 'next/server';
import { checkUnlockKey, clientIp, rateLimited, unlockKeyFrom } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { appHostsFor, probeEmbeddableCached } from '@/lib/builder/server/embedProbe';
import { publicEmbedWidget } from '@/lib/builder/embed';
import { getPublicRow, isShareToken, toRecord } from '@/lib/builder/server/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/public/[token]/embed-check?w=<widgetId>: can the owner's embedded page be shown in a frame?
 * The viewer never names an address: the server reads the widget's own saved address, and only for a web embed
 * the owner opted in to show on share links. Rate limited, cached for an hour.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!isShareToken(token)) return jsonError(404, 'This dashboard is no longer shared.');
    if (rateLimited(`pubemb:${token}:${clientIp(req)}`, 30)) return jsonError(429, 'Too many requests. Please try again later.');
    const row = await getPublicRow(token, false).catch(() => null);
    if (!row) return jsonError(404, 'This dashboard is no longer shared.');
    const rec = toRecord(row);
    if (rec.share.hasPassword && !checkUnlockKey(token, unlockKeyFrom(req, token))) return jsonError(401, 'This dashboard needs a password.', { requiresPassword: true });
    const w = publicEmbedWidget(rec.doc, new URL(req.url).searchParams.get('w') ?? '');
    if (!w) return jsonError(404, 'Not found.');
    const verdict = await probeEmbeddableCached(w.config.url, appHostsFor(req));
    return NextResponse.json(verdict, { headers: { 'Cache-Control': rec.share.hasPassword ? 'private, no-store' : 'public, max-age=0, s-maxage=600', 'X-Robots-Tag': 'noindex' } });
}
