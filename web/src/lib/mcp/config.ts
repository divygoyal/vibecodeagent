/**
 * Hosted MCP server (Connect AI): feature flag, origin and constants.
 *
 * TrafficClaw is both the OAuth authorization server and the MCP resource
 * server on one origin. The issuer comes from TC_MCP_ISSUER, else the origin
 * of NEXTAUTH_URL, so a dev server shows http://localhost URLs.
 */
import { createHmac } from 'node:crypto';

export const SCOPE_READ = 'mcp:read';
export const SCOPE_OFFLINE = 'offline_access';
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_OFFLINE] as const;

export const ACCESS_TOKEN_PREFIX = 'tcat_';
export const REFRESH_TOKEN_PREFIX = 'tcrt_';
export const API_KEY_PREFIX = 'tcak_';
export const AUTH_CODE_PREFIX = 'tcac_';
export const DCR_CLIENT_PREFIX = 'tcc_';

export const AUTH_CODE_TTL_S = 60;
export const REFRESH_TTL_S = 30 * 86400;
export const REFRESH_FAMILY_TTL_S = 180 * 86400;

export const SERVER_NAME = 'trafficclaw';
export const SERVER_VERSION = '1.0.0';

/** The hosted MCP server and Connect AI. On unless TC_MCP_ENABLED=0. */
export function mcpEnabled(): boolean {
    return process.env.TC_MCP_ENABLED !== '0';
}

/** Anonymous "Use demo data" grants (reviewer path). On unless TC_MCP_DEMO=0. */
export function demoGrantsEnabled(): boolean {
    return process.env.TC_MCP_DEMO !== '0';
}

export function accessTokenTtlS(): number {
    const v = Number(process.env.TC_MCP_ACCESS_TTL);
    return Number.isFinite(v) && v >= 5 && v <= 86400 ? Math.floor(v) : 3600;
}

/** Issuer and canonical origin, without a trailing slash. */
export function issuer(): string {
    const raw = process.env.TC_MCP_ISSUER || process.env.NEXTAUTH_URL || 'https://trafficclaw.com';
    try {
        return new URL(raw).origin;
    } catch {
        return 'https://trafficclaw.com';
    }
}

/** RFC 8707 / RFC 9728 canonical resource identifier. */
export function resourceUrl(): string {
    return `${issuer()}/mcp`;
}

export function protectedResourceMetadataUrl(): string {
    return `${issuer()}/.well-known/oauth-protected-resource/mcp`;
}

/** Hosts that serve this resource: the issuer host and its www twin. */
export function servedHosts(): string[] {
    const host = new URL(issuer()).host;
    const bare = host.replace(/^www\./, '');
    return Array.from(new Set([host, bare, `www.${bare}`]));
}

/**
 * Origin the client actually used (apex or www), for RFC 9728's rule that
 * `resource` matches the URL the user typed. Falls back to the issuer.
 */
export function requestOrigin(req: Request): string {
    const iss = new URL(issuer());
    const fwdHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const host = (fwdHost || req.headers.get('host') || '').toLowerCase();
    if (host && servedHosts().includes(host)) return `${iss.protocol}//${host}`;
    return iss.origin;
}

/** Secret for consent transactions and CSRF tokens. */
export function txnSecret(): string {
    const explicit = process.env.TC_MCP_TXN_SECRET;
    if (explicit && explicit.length >= 32) return explicit;
    const base = process.env.NEXTAUTH_SECRET || '';
    if (!base) {
        if (process.env.NODE_ENV === 'production') throw new Error('NEXTAUTH_SECRET or TC_MCP_TXN_SECRET is required');
        return 'tc-mcp-dev-only-secret-not-for-production';
    }
    return createHmac('sha256', base).update('trafficclaw-mcp-consent-v1').digest('base64url');
}

export function dashboardConnectPath(): string {
    return '/dashboard/connect-ai';
}

export function notFoundResponse(): Response {
    return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', pragma: 'no-cache', ...headers },
    });
}
