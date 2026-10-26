/**
 * Bearer authentication for POST /mcp (MCP.md 4.4): OAuth access tokens
 * (tcat_) and personal API keys (tcak_), looked up by SHA-256 hash with a
 * 15-second cache, plus the RFC 9728 challenges, Origin check and CORS.
 */
import type { AuthInfo } from '@modelcontextprotocol/server';
import { adminStore } from './adminStore';
import { ACCESS_TOKEN_PREFIX, API_KEY_PREFIX, protectedResourceMetadataUrl, resourceUrl, SCOPE_READ, servedHosts } from './config';
import { sha256Hex } from '@/lib/oauth/primitives';
import { shared } from './shared';

export interface McpPrincipal {
    tokenId: number;
    kind: 'access' | 'api_key';
    userId: number;
    userIdentifier: string | null;
    grantId: number | null;
    clientId: string | null;
    clientName: string | null;
    scopes: string[];
    expiresAt: number;
    siteFilter: string[] | null;
    excludeQueries: boolean;
    demo: boolean;
    /** First 12 hex chars of the token hash: safe to log, never the token. */
    tokenRef: string;
}

export type AuthResult =
    | { ok: true; principal: McpPrincipal }
    | { ok: false; status: 401 | 403; error?: 'invalid_token' | 'insufficient_scope' | 'invalid_request'; description: string };

const POSITIVE_TTL_MS = 15_000;
const NEGATIVE_TTL_MS = 5_000;
const cache = shared('authCache', () => new Map<string, { value: McpPrincipal | null; reason: string; until: number }>());

export function evictTokenHashes(hashes: readonly string[] | undefined): void {
    for (const h of hashes || []) cache.delete(h);
}

/** Drop cached lookups for a grant so changed settings apply on the next call. */
export function evictGrant(grantId: number): void {
    for (const [k, v] of cache) if (v.value?.grantId === grantId) cache.delete(k);
}

export async function authenticate(req: Request): Promise<AuthResult> {
    const url = new URL(req.url);
    if (url.searchParams.has('access_token')) {
        return { ok: false, status: 401, error: 'invalid_request', description: 'Send the token in the Authorization header, not the URL' };
    }
    const header = req.headers.get('authorization') || '';
    const m = /^Bearer\s+([A-Za-z0-9._~+/=-]+)\s*$/i.exec(header);
    if (!m) return { ok: false, status: 401, description: 'Sign-in required' };
    const raw = m[1];
    if (!raw.startsWith(ACCESS_TOKEN_PREFIX) && !raw.startsWith(API_KEY_PREFIX)) {
        return { ok: false, status: 401, error: 'invalid_token', description: 'Unrecognised token' };
    }
    const hash = sha256Hex(raw);
    const now = Date.now();
    let entry = cache.get(hash);
    if (!entry || entry.until <= now) {
        let looked;
        try {
            looked = await adminStore.lookupToken(hash);
        } catch (err) {
            console.error('[mcp] token lookup failed:', err instanceof Error ? err.message : err);
            return { ok: false, status: 401, error: 'invalid_token', description: 'Token could not be verified, try again' };
        }
        const principal: McpPrincipal | null = looked.active
            ? {
                tokenId: looked.token_id as number,
                kind: looked.kind as 'access' | 'api_key',
                userId: looked.user_id as number,
                userIdentifier: looked.user_identifier ?? null,
                grantId: looked.grant_id ?? null,
                clientId: looked.client_id ?? null,
                clientName: looked.client_name ?? null,
                scopes: (looked.scope || '').split(' ').filter(Boolean),
                expiresAt: looked.expires_at as number,
                siteFilter: looked.site_filter ?? null,
                excludeQueries: Boolean(looked.exclude_queries),
                demo: Boolean(looked.demo),
                tokenRef: hash.slice(0, 12),
            }
            : null;
        if (principal && looked.audience !== resourceUrl()) {
            entry = { value: null, reason: 'audience', until: now + NEGATIVE_TTL_MS };
        } else {
            entry = { value: principal, reason: looked.reason || 'inactive', until: now + (principal ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) };
        }
        cache.set(hash, entry);
        if (cache.size > 5000) for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
    }
    const p = entry.value;
    if (!p) {
        const why = entry.reason === 'expired' ? 'The access token expired' : entry.reason === 'audience' ? 'The token was issued for another resource' : 'The access token is not valid';
        return { ok: false, status: 401, error: 'invalid_token', description: why };
    }
    if (p.expiresAt * 1000 <= now) {
        cache.delete(hash);
        return { ok: false, status: 401, error: 'invalid_token', description: 'The access token expired' };
    }
    if (!p.scopes.includes(SCOPE_READ)) {
        return { ok: false, status: 403, error: 'insufficient_scope', description: 'The token lacks the mcp:read scope' };
    }
    return { ok: true, principal: p };
}

export function toAuthInfo(p: McpPrincipal): AuthInfo {
    return {
        token: p.tokenRef,
        clientId: p.clientId ?? 'api-key',
        scopes: p.scopes,
        expiresAt: p.expiresAt,
        resource: new URL(resourceUrl()),
        resourceMetadataUrl: protectedResourceMetadataUrl(),
        extra: { principal: p },
    };
}

function quote(s: string): string {
    return s.replace(/["\\]/g, '');
}

/** 401/403 with the RFC 6750 / RFC 9728 challenge. A real 401 is what starts every OAuth flow. */
export function challengeResponse(req: Request, failure: Extract<AuthResult, { ok: false }>): Response {
    const parts = [`Bearer realm="trafficclaw"`, `resource_metadata="${protectedResourceMetadataUrl()}"`, `scope="${SCOPE_READ}"`];
    if (failure.error) parts.push(`error="${failure.error}"`, `error_description="${quote(failure.description)}"`);
    const body = failure.error
        ? { error: failure.error, error_description: failure.description }
        : { error: 'unauthorized', error_description: 'Sign-in required. Connect TrafficClaw from your AI app, or send \'Authorization: Bearer <token>\'.' };
    return withMcpCors(req, new Response(JSON.stringify(body), {
        status: failure.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'www-authenticate': parts.join(', ') },
    }));
}

const STATIC_ALLOWED = ['https://claude.ai', 'https://chatgpt.com', 'https://chat.openai.com'];

export function originAllowed(origin: string): boolean {
    if (STATIC_ALLOWED.includes(origin)) return true;
    let u: URL;
    try {
        u = new URL(origin);
    } catch {
        return false;
    }
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    return servedHosts().includes(u.host);
}

/** 403 when an Origin header is present and not allowed (DNS-rebinding guard). */
export function checkOrigin(req: Request): Response | null {
    const origin = req.headers.get('origin');
    if (!origin || originAllowed(origin)) return null;
    return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Origin not allowed' } }), {
        status: 403,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
}

export function withMcpCors(req: Request, res: Response): Response {
    const origin = req.headers.get('origin');
    if (origin && originAllowed(origin)) {
        res.headers.set('access-control-allow-origin', origin);
        res.headers.set('vary', 'Origin');
        res.headers.set('access-control-allow-methods', 'POST, GET, DELETE, OPTIONS');
        res.headers.set('access-control-allow-headers', 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Last-Event-ID');
        res.headers.set('access-control-expose-headers', 'WWW-Authenticate, MCP-Protocol-Version');
        res.headers.set('access-control-max-age', '86400');
    }
    return res;
}
