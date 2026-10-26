/**
 * OAuth client identification for the MCP authorization server:
 * Client ID Metadata Documents (CIMD, an https URL as client_id) first,
 * Dynamic Client Registration rows (tcc_...) second. MCP.md 4.2.
 */
import { adminStore } from '@/lib/mcp/adminStore';
import { classifyRedirectUri } from './primitives';
import { safeFetchJsonDocument, SafeFetchError } from './ssrf';
import { shared } from '@/lib/mcp/shared';

export interface ClientInfo {
    client_id: string;
    kind: 'cimd' | 'dcr';
    /** Self-asserted display name (never trusted for identity). */
    client_name: string;
    /** What the consent screen shows as the app's identity: CIMD host, or "unverified". */
    client_host: string;
    redirect_uris: string[];
    token_endpoint_auth_method: 'none' | 'client_secret_basic' | 'client_secret_post';
    secret_hash: string | null;
    grant_types: string[];
}

export class ClientError extends Error {
    constructor(public code: 'invalid_client' | 'invalid_client_metadata', message: string) {
        super(message);
        this.name = 'ClientError';
    }
}

/** Known first-party clients: exact (client_id, redirect) pairs get a "Verified app" badge. */
const VERIFIED: { clientId: string; name: string; redirect: (uri: string) => boolean }[] = [
    { clientId: 'https://claude.ai/oauth/mcp-oauth-client-metadata', name: 'Claude', redirect: (u) => u === 'https://claude.ai/api/mcp/auth_callback' },
    { clientId: 'https://claude.ai/oauth/claude-code-client-metadata', name: 'Claude Code', redirect: (u) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/callback$/.test(u) },
    { clientId: 'https://chatgpt.com/oauth/client.json', name: 'ChatGPT', redirect: (u) => u === 'https://chatgpt.com/connector_platform_oauth_redirect' || /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(u) },
];

export function verifiedClientName(clientId: string, redirectUri: string): string | null {
    const hit = VERIFIED.find((v) => v.clientId === clientId && v.redirect(redirectUri));
    return hit ? hit.name : null;
}

export function isCimdClientId(clientId: string): boolean {
    if (!clientId || clientId.length > 600 || clientId.includes('#')) return false;
    try {
        const u = new URL(clientId);
        if (u.username || u.password) return false;
        if (u.protocol === 'https:') return u.pathname.length > 1;
        return devLoopbackCimd() && u.protocol === 'http:' && u.hostname === '127.0.0.1' && u.pathname.length > 1;
    } catch {
        return false;
    }
}

/** Dev/test only: accept http://127.0.0.1 metadata documents. Never in production. */
function devLoopbackCimd(): boolean {
    return process.env.TC_MCP_DEV_CIMD_LOOPBACK === '1' && process.env.NODE_ENV !== 'production';
}

const MIN_TTL_MS = 5 * 60_000;
const MAX_TTL_MS = 24 * 3600_000;
const STALE_MS = 24 * 3600_000;
const cimdCache = shared('cimdCache', () => new Map<string, { info: ClientInfo; freshUntil: number; staleUntil: number }>());
const cimdInflight = shared('cimdInflight', () => new Map<string, Promise<ClientInfo>>());

function ttlFromHeaders(headers: Record<string, string>): number {
    const cc = headers['cache-control'] || '';
    const m = /max-age=(\d+)/i.exec(cc);
    const ms = m ? Number(m[1]) * 1000 : MIN_TTL_MS;
    if (/no-store|no-cache/i.test(cc)) return MIN_TTL_MS;
    return Math.max(MIN_TTL_MS, Math.min(MAX_TTL_MS, ms));
}

export function parseCimdDocument(url: string, doc: unknown): ClientInfo {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new ClientError('invalid_client_metadata', 'client metadata is not a JSON object');
    const d = doc as Record<string, unknown>;
    if (d.client_id !== url) throw new ClientError('invalid_client_metadata', 'client_id in the document does not match its URL');
    const name = typeof d.client_name === 'string' ? d.client_name.trim().slice(0, 60) : '';
    if (!name) throw new ClientError('invalid_client_metadata', 'client_name is required');
    const uris = Array.isArray(d.redirect_uris) ? d.redirect_uris : [];
    if (uris.length < 1 || uris.length > 10) throw new ClientError('invalid_client_metadata', 'redirect_uris must list 1 to 10 URIs');
    for (const u of uris) {
        const c = classifyRedirectUri(u);
        if (!c.ok) throw new ClientError('invalid_client_metadata', `redirect_uri rejected: ${c.reason}`);
    }
    const plural = Array.isArray(d.token_endpoint_auth_methods_supported) ? d.token_endpoint_auth_methods_supported.map(String) : null;
    const methods = plural ?? [typeof d.token_endpoint_auth_method === 'string' ? d.token_endpoint_auth_method : 'none'];
    if (!methods.includes('none')) throw new ClientError('invalid_client_metadata', 'this server supports public clients (token_endpoint_auth_method none) only for metadata-document clients');
    const grantTypes = Array.isArray(d.grant_types) ? d.grant_types.map(String) : ['authorization_code'];
    return {
        client_id: url,
        kind: 'cimd',
        client_name: name,
        client_host: new URL(url).host,
        redirect_uris: uris as string[],
        token_endpoint_auth_method: 'none',
        secret_hash: null,
        grant_types: grantTypes,
    };
}

async function fetchCimd(url: string): Promise<{ info: ClientInfo; ttl: number }> {
    let res;
    try {
        res = await safeFetchJsonDocument(url, { allowLoopbackHttp: devLoopbackCimd() });
    } catch (err) {
        throw new ClientError('invalid_client', err instanceof SafeFetchError ? err.message : 'could not fetch the client metadata document');
    }
    if (res.status !== 200) throw new ClientError('invalid_client', `client metadata document returned HTTP ${res.status}`);
    const ct = res.headers['content-type'] || '';
    if (!/json/i.test(ct)) throw new ClientError('invalid_client_metadata', 'client metadata must be served as JSON');
    let doc: unknown;
    try {
        doc = JSON.parse(res.body);
    } catch {
        throw new ClientError('invalid_client_metadata', 'client metadata is not valid JSON');
    }
    return { info: parseCimdDocument(url, doc), ttl: ttlFromHeaders(res.headers) };
}

async function getCimdClient(url: string): Promise<ClientInfo> {
    const now = Date.now();
    const cached = cimdCache.get(url);
    if (cached && cached.freshUntil > now) return cached.info;
    const pending = cimdInflight.get(url);
    if (pending) return pending;
    const p = (async () => {
        try {
            const { info, ttl } = await fetchCimd(url);
            cimdCache.set(url, { info, freshUntil: Date.now() + ttl, staleUntil: Date.now() + ttl + STALE_MS });
            if (cimdCache.size > 500) {
                for (const [k, v] of cimdCache) if (v.staleUntil < Date.now()) cimdCache.delete(k);
            }
            adminStore.upsertClient({
                client_id: url, kind: 'cimd', client_name: info.client_name, redirect_uris: info.redirect_uris,
                token_endpoint_auth_method: 'none', grant_types: info.grant_types,
                doc_fetched_at: Math.floor(Date.now() / 1000), doc_expires_at: Math.floor((Date.now() + ttl) / 1000),
            }).catch(() => undefined);
            return info;
        } catch (err) {
            if (cached && cached.staleUntil > Date.now() && !(err instanceof ClientError && err.code === 'invalid_client_metadata')) return cached.info;
            throw err;
        } finally {
            cimdInflight.delete(url);
        }
    })();
    cimdInflight.set(url, p);
    return p;
}

const dcrCache = shared('dcrCache', () => new Map<string, { info: ClientInfo | null; until: number }>());

async function getDcrClient(clientId: string): Promise<ClientInfo> {
    const now = Date.now();
    const cached = dcrCache.get(clientId);
    let info: ClientInfo | null;
    if (cached && cached.until > now) {
        info = cached.info;
    } else {
        const row = await adminStore.getClient(clientId);
        info = row && row.kind === 'dcr'
            ? {
                client_id: row.client_id,
                kind: 'dcr',
                client_name: (row.client_name || 'Unnamed app').slice(0, 60),
                client_host: 'unverified',
                redirect_uris: row.redirect_uris,
                token_endpoint_auth_method: (['client_secret_basic', 'client_secret_post'].includes(row.token_endpoint_auth_method) ? row.token_endpoint_auth_method : 'none') as ClientInfo['token_endpoint_auth_method'],
                secret_hash: row.secret_hash,
                grant_types: row.grant_types,
            }
            : null;
        dcrCache.set(clientId, { info, until: now + 60_000 });
        if (dcrCache.size > 2000) dcrCache.clear();
    }
    if (!info) throw new ClientError('invalid_client', 'unknown client_id');
    return info;
}

export async function getClient(clientId: string | null | undefined): Promise<ClientInfo> {
    if (!clientId || typeof clientId !== 'string') throw new ClientError('invalid_client', 'client_id is required');
    if (isCimdClientId(clientId)) return getCimdClient(clientId);
    if (/^tcc_[A-Za-z0-9_-]{16,64}$/.test(clientId)) return getDcrClient(clientId);
    throw new ClientError('invalid_client', 'unknown client_id');
}

export function rememberDcrClient(info: ClientInfo): void {
    dcrCache.set(info.client_id, { info, until: Date.now() + 60_000 });
}
