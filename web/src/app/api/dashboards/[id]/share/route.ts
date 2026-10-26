import { NextResponse } from 'next/server';
import { sessionUserId } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { disableShare, enableShare, StoreError, updateShare, type ShareSettingsPatch } from '@/lib/builder/server/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// The admin reads user_identifier from the query string (the old body form returned 422).

/** POST /api/dashboards/[id]/share: turn the public link on. */
export async function POST(_req: Request, { params }: Ctx) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    try {
        const data = await enableShare(userId, id);
        return NextResponse.json({ shareToken: data.shareToken, share: data.share, id });
    } catch (err) {
        console.error('[dashboards] share failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to generate share link');
    }
}

/**
 * PUT /api/dashboards/[id]/share: settings.
 * Body: { enabled?, password? ('' removes), allowCopy?, badge?, viewerControls?, embedEnabled?, allowedOrigins?, expiresAt? ('' = never) }
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
    const patch: ShareSettingsPatch = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.password === 'string') {
        if (body.password && (body.password.length < 6 || body.password.length > 200)) return jsonError(422, 'Use at least 6 characters.');
        patch.password = body.password;
    }
    if (typeof body.allowCopy === 'boolean') patch.allowCopy = body.allowCopy;
    if (typeof body.badge === 'boolean') patch.badge = body.badge;
    if (body.viewerControls && typeof body.viewerControls === 'object') {
        const vc = body.viewerControls as Record<string, unknown>;
        patch.viewerControls = {};
        for (const k of ['date', 'compare', 'filters'] as const) if (typeof vc[k] === 'boolean') patch.viewerControls[k] = vc[k] as boolean;
    }
    if (typeof body.embedEnabled === 'boolean') patch.embedEnabled = body.embedEnabled;
    if (Array.isArray(body.allowedOrigins)) {
        patch.allowedOrigins = body.allowedOrigins.filter((o): o is string => typeof o === 'string' && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)).slice(0, 20);
    }
    if (typeof body.expiresAt === 'string') {
        if (body.expiresAt && Number.isNaN(Date.parse(body.expiresAt))) return jsonError(422, 'Invalid expiry date');
        patch.expiresAt = body.expiresAt;
    }
    try {
        const data = await updateShare(userId, id, patch);
        return NextResponse.json({ share: data.share, id });
    } catch (err) {
        console.error('[dashboards] share settings failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to update sharing');
    }
}

/** DELETE /api/dashboards/[id]/share: revoke (the old link shows "no longer shared"). */
export async function DELETE(_req: Request, { params }: Ctx) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    try {
        await disableShare(userId, id);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[dashboards] revoke failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to revoke share');
    }
}
