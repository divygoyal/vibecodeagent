/**
 * Typed client for the admin service's /api/mcp/* storage endpoints
 * (admin/mcp_api.py). Only hashes of secrets are ever sent.
 */

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const TIMEOUT_MS = 8000;

export class AdminStoreError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'AdminStoreError';
    }
}

async function call<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined> } = {}): Promise<T> {
    if (!ADMIN_API_KEY) throw new AdminStoreError(503, 'ADMIN_API_KEY is not configured');
    const url = new URL(`${ADMIN_API_URL}/api/mcp${path}`);
    for (const [k, v] of Object.entries(init.query || {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetch(url, {
        method: init.method || (init.body ? 'POST' : 'GET'),
        headers: { 'X-API-Key': ADMIN_API_KEY, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }
    if (!res.ok) {
        const detail = (data as { detail?: unknown } | null)?.detail;
        throw new AdminStoreError(res.status, typeof detail === 'string' ? detail : `admin ${res.status}`);
    }
    return data as T;
}

const enc = encodeURIComponent;

export interface StoredClient {
    client_id: string;
    kind: 'dcr' | 'cimd';
    client_name: string | null;
    client_uri: string | null;
    redirect_uris: string[];
    token_endpoint_auth_method: string;
    secret_hash: string | null;
    grant_types: string[];
    scope: string | null;
    application_type: string | null;
    created_at: number;
}

export interface GrantRow {
    id: number;
    user_id: number;
    client_id: string;
    client_name: string | null;
    client_host: string | null;
    redirect_host: string | null;
    verified: number;
    scope: string;
    site_filter: string[] | null;
    exclude_queries: number;
    demo: number;
    created_at: number;
    last_used_at: number | null;
    calls_30d?: number;
}

export interface TokenLookup {
    active: boolean;
    reason?: string;
    token_id?: number;
    kind?: 'access' | 'api_key';
    user_id?: number;
    user_identifier?: string | null;
    grant_id?: number | null;
    client_id?: string | null;
    client_name?: string | null;
    scope?: string;
    audience?: string;
    expires_at?: number;
    site_filter?: string[] | null;
    exclude_queries?: boolean;
    demo?: boolean;
}

export interface ApiKeyRow {
    id: number;
    name: string;
    prefix: string;
    scope: string;
    site_filter: string[] | null;
    exclude_queries: boolean;
    created_at: number;
    expires_at: number;
    last_used_at: number | null;
}

export interface AuditRowOut {
    ts: number;
    tool: string;
    site_host: string | null;
    status: string;
    duration_ms: number | null;
    rows: number | null;
    cache_hit: number | null;
    grant_id: number | null;
    client_name: string | null;
}

export interface AuditRowIn {
    ts: number;
    user_id: number;
    grant_id?: number | null;
    token_id?: number | null;
    client_id?: string | null;
    tool: string;
    site_host?: string | null;
    status: string;
    duration_ms?: number;
    rows?: number;
    cache_hit?: boolean;
    google_calls?: number;
    ip_prefix?: string | null;
}

export interface UsageSummary {
    calls_30d: number;
    calls_24h: number;
    errors_30d: number;
    cached_30d: number;
    by_tool: { tool: string; calls: number }[];
    by_day: { day: string; calls: number }[];
}

export const adminStore = {
    upsertClient: (client: Partial<StoredClient> & { client_id: string; kind: 'dcr' | 'cimd'; redirect_uris: string[]; created_ip_hash?: string; doc_fetched_at?: number; doc_expires_at?: number }) =>
        call<{ client_id: string }>('/clients', { body: client }),
    getClient: async (clientId: string): Promise<StoredClient | null> => {
        try {
            return await call<StoredClient>('/clients', { query: { client_id: clientId } });
        } catch (err) {
            if (err instanceof AdminStoreError && err.status === 404) return null;
            throw err;
        }
    },

    upsertGrant: (g: { user: string | null; client_id: string; client_name?: string; client_host?: string; redirect_host?: string; verified?: boolean; scope: string; site_filter?: string[] | null; exclude_queries?: boolean; demo?: boolean }) =>
        call<{ id: number; user_id: number }>('/grants', { body: g }),
    findActiveGrant: async (user: string, clientId: string): Promise<GrantRow | null> => {
        try {
            return await call<GrantRow>('/grants/active', { query: { user, client_id: clientId } });
        } catch (err) {
            if (err instanceof AdminStoreError && err.status === 404) return null;
            throw err;
        }
    },
    listGrants: (user: string) => call<{ grants: GrantRow[] }>(`/users/${enc(user)}/grants`),
    patchGrant: (grantId: number, body: { user: string; exclude_queries?: boolean; site_filter?: string[]; clear_site_filter?: boolean }) =>
        call<{ ok: boolean }>(`/grants/${grantId}`, { method: 'PATCH', body }),
    revokeGrant: (grantId: number, user: string) =>
        call<{ revoked: boolean; revoked_hashes: string[] }>(`/grants/${grantId}`, { method: 'DELETE', query: { user } }),
    revokeAll: (user: string, includeKeys: boolean) =>
        call<{ revoked_grants: number; revoked_hashes: string[] }>(`/users/${enc(user)}/revoke-all`, { method: 'POST', query: { include_keys: includeKeys } }),

    createCode: (c: { code_hash: string; client_id: string; user_id: number; grant_id: number; redirect_uri: string; code_challenge: string; scope: string; resource: string; ttl_s: number }) =>
        call<{ ok: boolean }>('/codes', { body: c }),
    consumeCode: (codeHash: string, clientId: string) =>
        call<{ ok: boolean; error?: string; reason?: string; revoked_hashes?: string[]; code?: { client_id: string; user_id: number; grant_id: number; redirect_uri: string; code_challenge: string; scope: string; resource: string } }>(
            '/codes/consume', { body: { code_hash: codeHash, client_id: clientId } }),

    issueTokens: (t: { grant_id: number; client_id: string; scope: string; audience: string; access_hash: string; access_ttl_s: number; refresh_hash?: string; refresh_ttl_s?: number; family_ttl_s?: number; source_code_hash?: string }) =>
        call<{ ok: boolean; refresh_expires_at: number | null }>('/tokens/issue', { body: t }),
    refreshTokens: (r: { refresh_hash: string; client_id: string; new_access_hash: string; new_refresh_hash: string; access_ttl_s: number; refresh_ttl_s: number }) =>
        call<{ ok: boolean; error?: string; reason?: string; scope?: string; audience?: string; revoked_hashes?: string[] }>('/tokens/refresh', { body: r }),
    lookupToken: (hash: string) => call<TokenLookup>('/tokens/lookup', { query: { hash } }),
    revokeToken: (hash: string, clientId?: string | null) =>
        call<{ revoked: boolean; revoked_hashes: string[] }>('/tokens/revoke', { body: { hash, client_id: clientId ?? null } }),

    listKeys: (user: string) => call<{ keys: ApiKeyRow[] }>(`/users/${enc(user)}/keys`),
    createKey: (user: string, k: { token_hash: string; prefix: string; name: string; expires_in_days: number; site_filter?: string[] | null; exclude_queries?: boolean; audience: string }) =>
        call<{ id: number; expires_at: number }>(`/users/${enc(user)}/keys`, { body: k }),
    revokeKey: (user: string, keyId: number) =>
        call<{ revoked: boolean; revoked_hashes: string[] }>(`/users/${enc(user)}/keys/${keyId}`, { method: 'DELETE' }),

    auditBatch: (rows: AuditRowIn[]) => call<{ inserted: number }>('/audit/batch', { body: { rows } }),
    listAudit: (user: string, limit = 50) => call<{ rows: AuditRowOut[] }>(`/users/${enc(user)}/audit`, { query: { limit } }),
    usage: (user: string) => call<UsageSummary>(`/users/${enc(user)}/usage`),
};
