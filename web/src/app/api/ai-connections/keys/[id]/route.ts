import { adminStore, AdminStoreError } from '@/lib/mcp/adminStore';
import { evictTokenHashes } from '@/lib/mcp/auth';
import { json, requireUser } from '@/lib/mcp/dashboardApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireUser(req, { mutation: true });
    if (auth instanceof Response) return auth;
    const raw = (await params).id;
    if (!/^\d{1,12}$/.test(raw)) return json({ error: 'not_found' }, 404);
    try {
        const res = await adminStore.revokeKey(auth.user.id, Number(raw));
        evictTokenHashes(res.revoked_hashes);
        return json({ revoked: true });
    } catch (err) {
        if (err instanceof AdminStoreError && err.status === 404) return json({ error: 'not_found' }, 404);
        return json({ error: 'server_error' }, 502);
    }
}
