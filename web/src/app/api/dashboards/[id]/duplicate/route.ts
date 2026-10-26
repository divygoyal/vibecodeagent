import { NextResponse } from 'next/server';
import { sessionUserId } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { createDashboard, duplicateDashboard, getDashboard, propertyIdFor, StoreError, toRecord } from '@/lib/builder/server/store';
import { resetSources } from '@/lib/builder/docOps';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboards/[id]/duplicate: "Make a copy" (sharing and views are not copied).
 * ?asTemplate=1 with body { name?, description? }: "Save as my template" - same layout and
 * config, every source reset to the dashboard default, listed under My templates.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    const asTemplate = new URL(req.url).searchParams.get('asTemplate') === '1';
    try {
        if (!asTemplate) {
            const row = await duplicateDashboard(userId, id);
            return NextResponse.json({ dashboard: toRecord(row) });
        }
        const body = (await req.json().catch(() => ({}))) as { name?: unknown; description?: unknown };
        const row = await getDashboard(userId, id);
        if (!row) return jsonError(404, 'Dashboard not found');
        const rec = toRecord(row);
        const doc = resetSources(rec.doc, rec.doc.defaultSource);
        doc.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 200) : `${rec.doc.name} template`;
        if (typeof body.description === 'string') doc.description = body.description.slice(0, 2000);
        doc.meta = { createdFrom: `dashboard:${id}` };
        const created = await createDashboard(userId, doc, { ...propertyIdFor(doc), isTemplate: true });
        return NextResponse.json({ dashboard: toRecord(created) });
    } catch (err) {
        console.error('[dashboards] duplicate failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to duplicate dashboard');
    }
}
