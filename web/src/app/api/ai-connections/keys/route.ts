import { ensureAdminUserSynced } from '@/lib/adminUserSync';
import { adminStore, AdminStoreError } from '@/lib/mcp/adminStore';
import { API_KEY_PREFIX, resourceUrl } from '@/lib/mcp/config';
import { json, requireUser } from '@/lib/mcp/dashboardApi';
import { randomToken, sha256Hex } from '@/lib/oauth/primitives';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { keys } = await adminStore.listKeys(auth.user.id).catch(() => ({ keys: [] }));
    return json({ keys });
}

/** Create a personal API key. The raw key is returned once and stored only as a hash. */
export async function POST(req: Request) {
    const auth = await requireUser(req, { mutation: true });
    if (auth instanceof Response) return auth;
    const body = await req.json().catch(() => null) as { name?: unknown; expires_in_days?: unknown; exclude_queries?: unknown; site_filter?: unknown } | null;
    if (!body) return json({ error: 'invalid_request' }, 400);
    const name = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) : '';
    const days = Number(body.expires_in_days ?? 90);
    if (!Number.isInteger(days) || days < 1 || days > 365) return json({ error: 'invalid_request', message: 'expires_in_days must be 1-365' }, 400);
    const siteFilter = Array.isArray(body.site_filter) ? body.site_filter.map(String).filter((s) => s && s.length <= 255).slice(0, 200) : null;

    const raw = randomToken(API_KEY_PREFIX, 32);
    const payload = {
        token_hash: sha256Hex(raw),
        prefix: raw.slice(0, 12),
        name: name || 'API key',
        expires_in_days: days,
        site_filter: siteFilter && siteFilter.length ? siteFilter : null,
        exclude_queries: body.exclude_queries === true,
        audience: resourceUrl(),
    };
    try {
        let created;
        try {
            created = await adminStore.createKey(auth.user.id, payload);
        } catch (err) {
            if (!(err instanceof AdminStoreError && err.status === 404)) throw err;
            await ensureAdminUserSynced(auth.session);
            created = await adminStore.createKey(auth.user.id, payload);
        }
        return json({ id: created.id, key: raw, prefix: payload.prefix, name: payload.name, expires_at: created.expires_at }, 201);
    } catch (err) {
        if (err instanceof AdminStoreError && err.status === 409) return json({ error: 'limit_reached', message: err.message }, 409);
        return json({ error: 'server_error' }, 502);
    }
}
