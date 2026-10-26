import { adminStore } from '@/lib/mcp/adminStore';
import { json, requireUser } from '@/lib/mcp/dashboardApi';
import { resourceUrl } from '@/lib/mcp/config';
import { loadSessionSites } from '@/lib/mcp/sessionSites';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Connect AI page data: endpoint, connected apps, API keys, usage, Google health. */
export async function GET(req: Request) {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const id = auth.user.id;
    const settle = async <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
    const [grants, keys, usage, activity, google] = await Promise.all([
        settle(adminStore.listGrants(id).then((r) => r.grants), []),
        settle(adminStore.listKeys(id).then((r) => r.keys), []),
        settle(adminStore.usage(id), null),
        settle(adminStore.listAudit(id, 20).then((r) => r.rows), []),
        settle(loadSessionSites(auth.user), null),
    ]);
    return json({
        endpoint: resourceUrl(),
        grants: grants.map((g) => ({
            id: g.id,
            client_name: g.client_name,
            client_host: g.client_host,
            redirect_host: g.redirect_host,
            verified: Boolean(g.verified),
            demo: Boolean(g.demo),
            exclude_queries: Boolean(g.exclude_queries),
            site_filter: g.site_filter,
            created_at: g.created_at,
            last_used_at: g.last_used_at,
            calls_30d: g.calls_30d ?? 0,
        })),
        keys,
        usage,
        activity,
        google: google
            ? { connected: google.connected, reauth_required: google.reauthRequired, ga4: google.ga4Count, gsc: google.gscCount, sites: google.sites.length, errors: google.errors }
            : { connected: false, reauth_required: false, ga4: 0, gsc: 0, sites: 0, errors: {} },
    });
}
