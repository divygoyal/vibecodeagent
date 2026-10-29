import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkSitePicks, rateLimited, sessionUserId } from '@/lib/builder/server/access';
import { directoryFor, jsonError, ownerDeps } from '@/lib/builder/server/service';
import { evaluateRealtime, realtimeDeps } from '@/lib/builder/server/realtime';
import { controlStateSchema, sourceRefSchema, validateWidgets } from '@/lib/builder/schema';
import type { ControlDef, ControlState, RealtimeWidget, SourceRef } from '@/lib/builder/types';

export const dynamic = 'force-dynamic';

const controlDefsSchema = z.array(z.union([
    z.object({ id: z.string().min(1).max(32).regex(/^[a-z0-9_]+$/), type: z.literal('variable'), label: z.string().max(60), kind: z.enum(['text', 'regex', 'number']), default: z.string().max(300), viewerCanChange: z.boolean() }),
    z.looseObject({ id: z.string().max(64), type: z.enum(['date', 'filter', 'site', 'metric', 'grain', 'searchType']) }),
])).max(30);

/**
 * POST /api/dashboards/realtime: who is online now, for the signed-in owner (dashboard view, TV mode, editor).
 * Body: { widget, defaultSource, controlDefs?, controls }. The widget is validated like an inline query widget; its
 * source resolves against the caller's own site directory, so a forged source can only name sites the caller can read.
 * The widget refreshes about once a minute while visible; Google is asked at most every 20 s per user + property.
 */
export async function POST(req: Request) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    if (rateLimited(`rt:${userId}`, 120)) return jsonError(429, 'Too many requests. Slow down a little.');
    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return jsonError(400, 'Invalid JSON');
    }
    const cs = controlStateSchema.safeParse(body.controls);
    if (!cs.success) return jsonError(422, 'controls are invalid');
    const v = validateWidgets([body.widget]);
    if (!v.ok) return jsonError(422, v.error);
    const widget = v.value[0];
    if (widget.type !== 'realtime') return jsonError(422, 'widget must be a realtime widget');
    const src = sourceRefSchema.safeParse(body.defaultSource);
    if (!src.success || src.data.type === 'default') return jsonError(422, 'defaultSource is required');
    const defs = controlDefsSchema.safeParse(body.controlDefs ?? []);
    if (!defs.success) return jsonError(422, 'controlDefs are invalid');
    const controlDefs = defs.data as unknown as ControlDef[];
    let controls = cs.data as ControlState;
    try {
        // Site switcher picks: only sites of the control's list that this user can read.
        if (controls.site && Object.keys(controls.site).length) controls = checkSitePicks(controlDefs, controls, await directoryFor(userId));
        const res = await evaluateRealtime({ widget: widget as RealtimeWidget, defaultSource: src.data as SourceRef, controlDefs, controls, pageId: controls.pageId }, realtimeDeps(ownerDeps(userId, 'owner'), 'owner'));
        return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        console.error('[dashboards] realtime failed', err);
        return jsonError(500, 'Realtime data is temporarily unavailable.');
    }
}
