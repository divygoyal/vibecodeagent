import { adminStore } from '@/lib/mcp/adminStore';
import { DCR_CLIENT_PREFIX, mcpEnabled, notFoundResponse, SUPPORTED_SCOPES } from '@/lib/mcp/config';
import { clientIp, hitLimit } from '@/lib/mcp/rateLimit';
import { rememberDcrClient } from '@/lib/oauth/clients';
import { oauthError, oauthJson, publicPreflight } from '@/lib/oauth/metadata';
import { classifyRedirectUri, randomToken, sha256Hex } from '@/lib/oauth/primitives';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AUTH_METHODS = ['none', 'client_secret_basic', 'client_secret_post'] as const;

/** RFC 7591 Dynamic Client Registration (MCP.md 3.4). Public, rate limited. */
export async function POST(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    const ip = clientIp(req);
    const perIpLimit = Number(process.env.TC_MCP_DCR_LIMIT) || 10;
    const perIp = hitLimit(`dcr:ip:${ip}`, perIpLimit, 3600_000);
    const global = hitLimit('dcr:global', Math.max(200, perIpLimit * 20), 86400_000);
    if (!perIp.ok || !global.ok) {
        const retry = String(Math.max(perIp.retryAfterS, global.retryAfterS));
        return oauthError('slow_down', 'Too many client registrations. Try again later.', 429, { 'retry-after': retry });
    }

    let body: Record<string, unknown>;
    try {
        const text = await req.text();
        if (text.length > 16 * 1024) return oauthError('invalid_client_metadata', 'Registration request is too large.');
        body = JSON.parse(text);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    } catch {
        return oauthError('invalid_client_metadata', 'Body must be a JSON object.');
    }

    const redirectUris = body.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length < 1 || redirectUris.length > 5) {
        return oauthError('invalid_redirect_uri', 'redirect_uris must list 1 to 5 URIs.');
    }
    for (const uri of redirectUris) {
        const c = classifyRedirectUri(uri);
        if (!c.ok) return oauthError('invalid_redirect_uri', c.reason);
    }

    const method = typeof body.token_endpoint_auth_method === 'string' ? body.token_endpoint_auth_method : 'none';
    if (!(AUTH_METHODS as readonly string[]).includes(method)) {
        return oauthError('invalid_client_metadata', `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}.`);
    }
    const grantTypes = Array.isArray(body.grant_types) ? body.grant_types.map(String) : ['authorization_code', 'refresh_token'];
    if (!grantTypes.includes('authorization_code') || grantTypes.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
        return oauthError('invalid_client_metadata', 'grant_types may only contain authorization_code and refresh_token.');
    }
    const responseTypes = Array.isArray(body.response_types) ? body.response_types.map(String) : ['code'];
    if (responseTypes.some((r) => r !== 'code')) return oauthError('invalid_client_metadata', 'response_types must be ["code"].');

    const rawName = typeof body.client_name === 'string' ? body.client_name : '';
    const clientName = rawName.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60) || 'Unnamed app';
    const requestedScopes = typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [];
    const scopes = requestedScopes.filter((s) => (SUPPORTED_SCOPES as readonly string[]).includes(s));
    const scope = (scopes.length ? scopes : ['mcp:read']).join(' ');
    const applicationType = body.application_type === 'native' ? 'native' : body.application_type === 'web' ? 'web' : null;
    const clientUri = typeof body.client_uri === 'string' && /^https:\/\//.test(body.client_uri) ? body.client_uri.slice(0, 500) : null;

    const clientId = randomToken(DCR_CLIENT_PREFIX, 16);
    const secret = method === 'none' ? null : randomToken('tccs_', 32);
    try {
        await adminStore.upsertClient({
            client_id: clientId,
            kind: 'dcr',
            client_name: clientName,
            client_uri: clientUri,
            redirect_uris: redirectUris as string[],
            token_endpoint_auth_method: method,
            secret_hash: secret ? sha256Hex(secret) : null,
            grant_types: grantTypes,
            scope,
            application_type: applicationType,
            created_ip_hash: sha256Hex(`ip:${ip}`).slice(0, 16),
        });
    } catch (err) {
        console.error('[mcp] client registration failed:', err instanceof Error ? err.message : err);
        return oauthError('server_error', 'Could not register the client.', 500);
    }
    rememberDcrClient({
        client_id: clientId, kind: 'dcr', client_name: clientName, client_host: 'unverified',
        redirect_uris: redirectUris as string[], token_endpoint_auth_method: method as 'none',
        secret_hash: secret ? sha256Hex(secret) : null, grant_types: grantTypes,
    });

    return oauthJson({
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
        client_name: clientName,
        redirect_uris: redirectUris,
        grant_types: grantTypes,
        response_types: ['code'],
        token_endpoint_auth_method: method,
        scope,
        ...(applicationType ? { application_type: applicationType } : {}),
    }, 201);
}

export const OPTIONS = publicPreflight;
