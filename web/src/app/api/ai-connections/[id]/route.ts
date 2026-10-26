import { adminStore, AdminStoreError } from '@/lib/mcp/adminStore';
import { evictTokenHashes } from '@/lib/mcp/auth';
import { json, requireUser } from '@/lib/mcp/dashboardApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

function grantId(raw: string): number | null {
    return /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}

/** Revoke a connected app and every token under it. */
export async function DELETE(req: Request, { params }: Params) {
    const auth = await requireUser(req, { mutation: true });
    if (auth instanceof Response) return auth;
    const id = grantId((await params).id);
    if (!id) return json({ error: 'not_found' }, 404);
    try {
        const res = await adminStore.revokeGrant(id, auth.user.id);
        evictTokenHashes(res.revoked_hashes);
        return json({ revoked: true });
    } catch (err) {
        if (err instanceof AdminStoreError && err.status === 404) return json({ error: 'not_found' }, 404);
        return json({ error: 'server_error' }, 502);
    }
}

/** Change what a connection may see: { exclude_queries: boolean }. */
export async function PATCH(req: Request, { params }: Params) {
    const auth = await requireUser(req, { mutation: true });
    if (auth instanceof Response) return auth;
    const id = grantId((await params).id);
    if (!id) return json({ error: 'not_found' }, 404);
    const body = await req.json().catch(() => null) as { exclude_queries?: unknown } | null;
    if (!body || typeof body.exclude_queries !== 'boolean') return json({ error: 'invalid_request', message: 'exclude_queries (boolean) is required' }, 400);
    try {
        await adminStore.patchGrant(id, { user: auth.user.id, exclude_queries: body.exclude_queries });
        return json({ ok: true });
    } catch (err) {
        if (err instanceof AdminStoreError && err.status === 404) return json({ error: 'not_found' }, 404);
        return json({ error: 'server_error' }, 502);
    }
}
