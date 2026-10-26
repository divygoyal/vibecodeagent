/**
 * Discovery documents (RFC 9728 protected resource, RFC 8414 authorization
 * server) and the CORS helpers shared by the OAuth endpoints. MCP.md 3.2-3.3.
 */
import { issuer, mcpEnabled, notFoundResponse, requestOrigin, SCOPE_OFFLINE, SCOPE_READ } from '@/lib/mcp/config';

const PUBLIC_CORS: Record<string, string> = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type, MCP-Protocol-Version',
    'access-control-max-age': '86400',
};

export function withPublicCors(res: Response): Response {
    for (const [k, v] of Object.entries(PUBLIC_CORS)) res.headers.set(k, v);
    return res;
}

export function publicPreflight(): Response {
    if (!mcpEnabled()) return notFoundResponse();
    return new Response(null, { status: 204, headers: PUBLIC_CORS });
}

export function protectedResourceMetadata(req: Request) {
    const origin = requestOrigin(req);
    return {
        resource: `${origin}/mcp`,
        authorization_servers: [issuer()],
        scopes_supported: [SCOPE_READ],
        bearer_methods_supported: ['header'],
        resource_name: 'TrafficClaw: Google Analytics 4 and Search Console',
        resource_documentation: `${issuer()}/ai`,
    };
}

export function authorizationServerMetadata() {
    const iss = issuer();
    return {
        issuer: iss,
        authorization_endpoint: `${iss}/oauth/authorize`,
        token_endpoint: `${iss}/oauth/token`,
        registration_endpoint: `${iss}/oauth/register`,
        revocation_endpoint: `${iss}/oauth/revoke`,
        scopes_supported: [SCOPE_READ, SCOPE_OFFLINE],
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
        revocation_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
        code_challenge_methods_supported: ['S256'],
        client_id_metadata_document_supported: true,
        authorization_response_iss_parameter_supported: true,
        service_documentation: `${iss}/ai`,
    };
}

export function metadataResponse(body: unknown): Response {
    return withPublicCors(new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
    }));
}

/** OAuth error JSON with no-store headers and public CORS. */
export function oauthError(error: string, description: string, status = 400, extra: Record<string, string> = {}): Response {
    return withPublicCors(new Response(JSON.stringify({ error, error_description: description }), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', pragma: 'no-cache', ...extra },
    }));
}

export function oauthJson(body: unknown, status = 200): Response {
    return withPublicCors(new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', pragma: 'no-cache' },
    }));
}

/** Read an x-www-form-urlencoded or JSON body into URLSearchParams. */
export async function readFormOrJson(req: Request, maxBytes = 16 * 1024): Promise<URLSearchParams | null> {
    const ct = (req.headers.get('content-type') || '').toLowerCase();
    const text = await req.text();
    if (text.length > maxBytes) return null;
    if (ct.includes('application/json')) {
        try {
            const obj = JSON.parse(text) as Record<string, unknown>;
            const p = new URLSearchParams();
            for (const [k, v] of Object.entries(obj || {})) if (v !== null && v !== undefined) p.set(k, String(v));
            return p;
        } catch {
            return null;
        }
    }
    return new URLSearchParams(text);
}
