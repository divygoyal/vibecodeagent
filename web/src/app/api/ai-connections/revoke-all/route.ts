import { adminStore } from '@/lib/mcp/adminStore';
import { evictTokenHashes } from '@/lib/mcp/auth';
import { json, requireUser } from '@/lib/mcp/dashboardApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Revoke every connected app (and API keys when include_keys is true). */
export async function POST(req: Request) {
    const auth = await requireUser(req, { mutation: true });
    if (auth instanceof Response) return auth;
    const body = await req.json().catch(() => ({})) as { include_keys?: unknown };
    try {
        const res = await adminStore.revokeAll(auth.user.id, body.include_keys === true);
        evictTokenHashes(res.revoked_hashes);
        return json({ revoked_grants: res.revoked_grants });
    } catch {
        return json({ error: 'server_error' }, 502);
    }
}
