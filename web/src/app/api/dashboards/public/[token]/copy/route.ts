import { NextResponse } from 'next/server';
import { checkUnlockKey, sessionUserId, unlockKeyFrom } from '@/lib/builder/server/access';
import { directoryFor, jsonError } from '@/lib/builder/server/service';
import { createDashboard, getPublicRow, isShareToken, propertyIdFor, toRecord } from '@/lib/builder/server/store';
import { resetSources } from '@/lib/builder/docOps';
import type { DashboardDocV2 } from '@/lib/builder/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboards/public/[token]/copy { siteId?, name? }: "Use as template" for a signed-in
 * viewer when the owner allowed copies. Creates a private dashboard on the viewer's own site
 * with every source reset; nothing of the owner's data or ids is copied.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Sign in to copy this dashboard.');
    const { token } = await params;
    if (!isShareToken(token)) return jsonError(404, 'This dashboard is no longer shared.');
    const row = await getPublicRow(token, false).catch(() => null);
    if (!row) return jsonError(404, 'This dashboard is no longer shared.');
    const rec = toRecord(row);
    if (!rec.share.allowCopy) return jsonError(403, 'The owner has not allowed copies.');
    if (rec.share.hasPassword && !checkUnlockKey(token, unlockKeyFrom(req, token))) return jsonError(401, 'This dashboard needs a password.');
    const body = (await req.json().catch(() => ({}))) as { siteId?: unknown; name?: unknown };
    const isPortfolio = rec.doc.defaultSource.type === 'portfolio';
    let defaultSource: DashboardDocV2['defaultSource'] = { type: 'portfolio', include: 'all' };
    if (!isPortfolio) {
        const dir = await directoryFor(userId);
        const site = (typeof body.siteId === 'string' && dir?.byId.get(body.siteId)) || dir?.sites.find((s) => s.ga4 && s.gsc) || dir?.sites[0];
        if (!site) return jsonError(409, 'Connect Google first: no sites found.', { code: 'NOT_CONNECTED' });
        defaultSource = { type: 'site', siteId: site.siteId, ga4: site.ga4, gsc: site.gsc };
    }
    const doc = resetSources(rec.doc, defaultSource);
    doc.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 200) : `${rec.doc.name} (copy)`;
    doc.meta = { createdFrom: 'shared-copy' };
    const created = await createDashboard(userId, doc, propertyIdFor(doc));
    return NextResponse.json({ id: created.id });
}
