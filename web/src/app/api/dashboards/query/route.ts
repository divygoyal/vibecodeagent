import { NextResponse } from 'next/server';
import { rateLimited, sessionUserId } from '@/lib/builder/server/access';
import { evaluateDoc, jsonError, ownerDeps } from '@/lib/builder/server/service';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { getDashboard, StoreError, toRecord } from '@/lib/builder/server/store';
import { controlStateSchema, sourceRefSchema, validateWidgets } from '@/lib/builder/schema';
import { z } from 'zod';
import type { ControlDef, ControlState, SourceRef } from '@/lib/builder/types';

export const dynamic = 'force-dynamic';

const controlDefsSchema = z.array(z.union([
    // Round 2 dashboard variables: strict, their values reach Google filters.
    z.object({ id: z.string().min(1).max(32).regex(/^[a-z0-9_]+$/), type: z.literal('variable'), label: z.string().max(60), kind: z.enum(['text', 'regex', 'number']), default: z.string().max(300), viewerCanChange: z.boolean() }),
    z.looseObject({ id: z.string().max(64), type: z.enum(['date', 'filter', 'site', 'metric']) }),
])).max(30);

/**
 * POST /api/dashboards/query: evaluate widgets (BUILDER.md 8.1-8.2).
 * Saved mode: { dashboardId, pageId? | widgetIds?, controls }.
 * Inline mode (editor preview of unsaved edits): { widgets (max 40), defaultSource, controlDefs?, controls }.
 * Failures are per widget; the response is 200 with one result per widget.
 */
export async function POST(req: Request) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    if (rateLimited(`dq:${userId}`, 240)) return jsonError(429, 'Too many requests. Slow down a little.');
    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return jsonError(400, 'Invalid JSON');
    }
    const cs = controlStateSchema.safeParse(body.controls);
    if (!cs.success) return jsonError(422, 'controls are invalid');
    const controls = cs.data as ControlState;
    const fresh = body.fresh === true && !rateLimited(`dqfresh:${userId}:${String(body.dashboardId ?? '')}`, 1, 30_000);
    const deps = ownerDeps(userId, 'owner', fresh);

    try {
        if (Array.isArray(body.widgets)) {
            const v = validateWidgets(body.widgets);
            if (!v.ok) return jsonError(422, v.error);
            const src = sourceRefSchema.safeParse(body.defaultSource);
            if (!src.success || src.data.type === 'default') return jsonError(422, 'defaultSource is required in inline mode');
            const defs = controlDefsSchema.safeParse(body.controlDefs ?? [{ id: 'date', type: 'date' }]);
            if (!defs.success) return jsonError(422, 'controlDefs are invalid');
            const res = await evaluateWidgets({
                widgets: v.value.map((widget) => ({ widget, pageId: controls.pageId })),
                defaultSource: src.data as SourceRef,
                controlDefs: defs.data as unknown as ControlDef[],
                controls,
                timezone: typeof body.timezone === 'string' ? body.timezone.slice(0, 64) : undefined,
            }, deps);
            return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } });
        }
        if (typeof body.dashboardId !== 'string') return jsonError(422, 'dashboardId or widgets is required');
        const row = await getDashboard(userId, body.dashboardId);
        if (!row) return jsonError(404, 'Dashboard not found');
        const rec = toRecord(row);
        const widgetIds = Array.isArray(body.widgetIds) ? body.widgetIds.filter((x): x is string => typeof x === 'string').slice(0, 200) : undefined;
        const res = await evaluateDoc(rec.doc, controls, deps, { pageId: typeof body.pageId === 'string' ? body.pageId : undefined, widgetIds });
        return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        console.error('[dashboards] query failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Query failed');
    }
}
