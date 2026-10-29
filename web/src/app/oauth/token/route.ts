import { adminStore } from '@/lib/mcp/adminStore';
import { evictTokenHashes } from '@/lib/mcp/auth';
import {
    ACCESS_TOKEN_PREFIX, accessTokenTtlS, mcpEnabled, notFoundResponse, REFRESH_FAMILY_TTL_S, REFRESH_TOKEN_PREFIX,
    REFRESH_TTL_S, resourceUrl, SCOPE_OFFLINE, SUPPORTED_SCOPES,
} from '@/lib/mcp/config';
import { clientIp, hitLimit, perIpLimit } from '@/lib/mcp/rateLimit';
import { authenticateClient } from '@/lib/oauth/clientAuth';
import { oauthError, oauthJson, publicPreflight, readFormOrJson } from '@/lib/oauth/metadata';
import { normalizeResource, parseScope, randomToken, sha256Hex, verifyPkce } from '@/lib/oauth/primitives';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** OAuth 2.1 token endpoint: authorization_code (PKCE S256) and refresh_token with rotation. MCP.md 3.6. */
export async function POST(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    const ip = clientIp(req);
    const perIp = hitLimit(`token:${ip}`, perIpLimit(ip, 120), 60_000);
    if (!perIp.ok) return oauthError('slow_down', 'Too many token requests.', 429, { 'retry-after': String(perIp.retryAfterS) });

    const form = await readFormOrJson(req);
    if (!form) return oauthError('invalid_request', 'Body must be application/x-www-form-urlencoded.');

    const auth = await authenticateClient(req, form);
    if (!auth.ok) return oauthError(auth.error, auth.description, auth.status, auth.status === 401 ? { 'www-authenticate': 'Basic realm="trafficclaw"' } : {});
    const client = auth.client;

    const failKey = `tokenfail:${client.client_id}:${ip}`;
    const failure = (description: string, error = 'invalid_grant') => {
        const f = hitLimit(failKey, 20, 600_000);
        if (!f.ok) return oauthError('slow_down', 'Too many failed attempts.', 429, { 'retry-after': String(f.retryAfterS) });
        return oauthError(error, description);
    };

    const grantType = form.get('grant_type');
    const audience = resourceUrl();

    if (grantType === 'authorization_code') {
        const code = form.get('code');
        if (!code) return oauthError('invalid_request', 'code is required');
        const codeHash = sha256Hex(code);
        const consumed = await adminStore.consumeCode(codeHash, client.client_id).catch(() => null);
        if (!consumed) return oauthError('server_error', 'Could not redeem the code.', 500);
        if (!consumed.ok || !consumed.code) {
            evictTokenHashes(consumed.revoked_hashes);
            return failure('The authorization code is invalid, expired or already used');
        }
        const c = consumed.code;
        const redirectUri = form.get('redirect_uri');
        if (redirectUri !== null && redirectUri !== c.redirect_uri) return failure('redirect_uri does not match the authorization request');
        if (!verifyPkce(form.get('code_verifier'), c.code_challenge)) return failure('code_verifier does not match the code_challenge');
        const resource = form.has('resource') ? normalizeResource(form.get('resource'), audience) : c.resource;
        if (!resource || resource !== c.resource) return oauthError('invalid_target', 'resource does not match the authorization request');

        const scopes = parseScope(c.scope);
        const wantsRefresh = scopes.includes(SCOPE_OFFLINE) || client.grant_types.includes('refresh_token');
        const accessToken = randomToken(ACCESS_TOKEN_PREFIX);
        const refreshToken = wantsRefresh ? randomToken(REFRESH_TOKEN_PREFIX) : undefined;
        const ttl = accessTokenTtlS();
        try {
            await adminStore.issueTokens({
                grant_id: c.grant_id, client_id: client.client_id, scope: c.scope, audience,
                access_hash: sha256Hex(accessToken), access_ttl_s: ttl,
                refresh_hash: refreshToken ? sha256Hex(refreshToken) : undefined,
                refresh_ttl_s: REFRESH_TTL_S, family_ttl_s: REFRESH_FAMILY_TTL_S, source_code_hash: codeHash,
            });
        } catch (err) {
            console.error('[mcp] token issue failed:', err instanceof Error ? err.message : err);
            return oauthError('invalid_grant', 'The approval was revoked. Connect again.');
        }
        return oauthJson({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: ttl,
            ...(refreshToken ? { refresh_token: refreshToken } : {}),
            scope: c.scope,
        });
    }

    if (grantType === 'refresh_token') {
        const refresh = form.get('refresh_token');
        if (!refresh || !refresh.startsWith(REFRESH_TOKEN_PREFIX)) return failure('The refresh token is invalid');
        if (form.has('resource') && !normalizeResource(form.get('resource'), audience)) return oauthError('invalid_target', 'resource must be this server\'s MCP endpoint');
        if (parseScope(form.get('scope')).some((s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s))) {
            return oauthError('invalid_scope', 'Requested scope exceeds the original grant');
        }
        const accessToken = randomToken(ACCESS_TOKEN_PREFIX);
        const newRefresh = randomToken(REFRESH_TOKEN_PREFIX);
        const ttl = accessTokenTtlS();
        const result = await adminStore.refreshTokens({
            refresh_hash: sha256Hex(refresh), client_id: client.client_id,
            new_access_hash: sha256Hex(accessToken), new_refresh_hash: sha256Hex(newRefresh),
            access_ttl_s: ttl, refresh_ttl_s: REFRESH_TTL_S,
        }).catch(() => null);
        if (!result) return oauthError('server_error', 'Could not refresh the token.', 500);
        if (!result.ok) {
            evictTokenHashes(result.revoked_hashes);
            return failure('The refresh token is invalid, expired, revoked or already used');
        }
        return oauthJson({ access_token: accessToken, token_type: 'Bearer', expires_in: ttl, refresh_token: newRefresh, scope: result.scope });
    }

    return oauthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
}

export const OPTIONS = publicPreflight;
