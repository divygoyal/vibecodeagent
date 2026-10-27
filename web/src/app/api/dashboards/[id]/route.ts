import { NextResponse } from 'next/server';
import { sessionUserId } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { deleteDashboard, getDashboard, propertyIdFor, StoreError, toRecord, updateDashboard } from '@/lib/builder/server/store';
import { validateDoc } from '@/lib/builder/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/dashboards/[id]: the record with its v2 doc (v1 rows migrated in memory). */
export async function GET(_req: Request, { params }: Ctx) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    try {
        const row = await getDashboard(userId, id);
        if (!row) return jsonError(404, 'Dashboard not found');
        const rec = toRecord(row);
        return NextResponse.json({ dashboard: rec }, { headers: { 'Cache-Control': 'no-store', ETag: `"${rec.rev}"` } });
    } catch (err) {
        console.error('[dashboards] get failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to load dashboard');
    }
}

/**
 * PUT /api/dashboards/[id]: save the v2 doc. Optimistic concurrency: send the rev you edited
 * as `If-Match: <rev>` (or body.rev); a newer save elsewhere returns 412 with the current rev.
 * Body: { doc, rev?, versionLabel? } or { name } for a rename, { isTemplate }.
 */
export async function PUT(req: Request, { params }: Ctx) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return jsonError(400, 'Invalid JSON');
    }
    const ifMatch = req.headers.get('if-match')?.replace(/"/g, '');
    const expectedRev = ifMatch && /^\d+$/.test(ifMatch) ? Number(ifMatch) : typeof body.rev === 'number' ? body.rev : undefined;

    try {
        if (body.doc !== undefined) {
            const v = validateDoc(body.doc);
            if (!v.ok) return jsonError(422, v.error);
            const ids = propertyIdFor(v.value);
            const r = await updateDashboard(userId, id, { doc: v.value, ...ids, versionLabel: typeof body.versionLabel === 'string' ? body.versionLabel.slice(0, 80) : undefined }, expectedRev);
            if (!r.ok) return jsonError(412, 'This dashboard changed in another tab.', { rev: r.rev });
            return NextResponse.json({ dashboard: toRecord(r.row) });
        }
        if (typeof body.name === 'string' || typeof body.isTemplate === 'boolean') {
            const row = await getDashboard(userId, id);
            if (!row) return jsonError(404, 'Dashboard not found');
            const rec = toRecord(row);
            if (typeof body.name === 'string' && body.name.trim()) rec.doc.name = body.name.trim().slice(0, 200);
            const r = await updateDashboard(userId, id, {
                doc: rec.schemaVersion === 2 || typeof body.name === 'string' ? rec.doc : undefined,
                isTemplate: typeof body.isTemplate === 'boolean' ? body.isTemplate : undefined,
            }, expectedRev);
            if (!r.ok) return jsonError(412, 'This dashboard changed in another tab.', { rev: r.rev });
            return NextResponse.json({ dashboard: toRecord(r.row) });
        }
        return jsonError(422, 'Nothing to update');
    } catch (err) {
        console.error('[dashboards] update failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to save dashboard');
    }
}

/** DELETE /api/dashboards/[id]: soft delete. */
export async function DELETE(_req: Request, { params }: Ctx) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    try {
        await deleteDashboard(userId, id);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[dashboards] delete failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to delete dashboard');
    }
}
