/**
 * Shared pieces of the authorization endpoint: request validation, code
 * issuing and the on-page error (used when the client or redirect URI is
 * invalid, where redirecting would be an open redirect). MCP.md 3.5.
 */
import { adminStore } from '@/lib/mcp/adminStore';
import { AUTH_CODE_PREFIX, AUTH_CODE_TTL_S, resourceUrl, SCOPE_READ, SUPPORTED_SCOPES } from '@/lib/mcp/config';
import { ClientError, getClient, type ClientInfo } from './clients';
import { isValidCodeChallenge, matchRedirectUri, normalizeResource, randomToken, resolveScopes, sha256Hex } from './primitives';
import { clientRedirect } from './txn';

export interface AuthorizeRequest {
    client: ClientInfo;
    redirectUri: string;
    codeChallenge: string;
    scope: string;
    resource: string;
    state: string | null;
    promptConsent: boolean;
}

export type AuthorizeValidation =
    | { ok: true; request: AuthorizeRequest }
    /** Client or redirect problem: show an error page, never redirect. */
    | { ok: false; page: { title: string; message: string } }
    /** Request problem with a trusted redirect: send the error back to the client. */
    | { ok: false; redirect: string };

export async function validateAuthorizeParams(params: URLSearchParams): Promise<AuthorizeValidation> {
    const clientId = params.get('client_id');
    let client: ClientInfo;
    try {
        client = await getClient(clientId);
    } catch (err) {
        const message = err instanceof ClientError ? err.message : 'The app could not be identified.';
        return { ok: false, page: { title: 'This app could not be identified', message: `${message}. Start the connection again from your AI app.` } };
    }

    let redirectUri = params.get('redirect_uri');
    if (!redirectUri && client.redirect_uris.length === 1) redirectUri = client.redirect_uris[0];
    if (!redirectUri || !matchRedirectUri(client.redirect_uris, redirectUri)) {
        return { ok: false, page: { title: 'Redirect address not allowed', message: 'The app asked to send you to an address it has not registered, so TrafficClaw stopped here. Start the connection again from your AI app.' } };
    }

    const state = params.get('state');
    const fail = (error: string, description: string) => ({
        ok: false as const,
        redirect: clientRedirect(redirectUri as string, { error, error_description: description, state }),
    });

    if (params.get('response_type') !== 'code') return fail('unsupported_response_type', 'response_type must be code');
    const challenge = params.get('code_challenge');
    if (params.get('code_challenge_method') !== 'S256' || !isValidCodeChallenge(challenge)) {
        return fail('invalid_request', 'PKCE with code_challenge_method=S256 and a 43-character code_challenge is required');
    }
    const scopes = resolveScopes(params.get('scope'), SUPPORTED_SCOPES, SCOPE_READ);
    if (!scopes.ok) return fail('invalid_scope', `unsupported scope: ${scopes.invalid.join(' ')}`);
    const resource = normalizeResource(params.get('resource'), resourceUrl());
    if (!resource) return fail('invalid_target', 'resource must be this server\'s MCP endpoint');
    if (state && state.length > 2000) return fail('invalid_request', 'state is too long');

    return {
        ok: true,
        request: {
            client,
            redirectUri,
            codeChallenge: challenge as string,
            scope: scopes.scopes.join(' '),
            resource,
            state,
            promptConsent: (params.get('prompt') || '').split(' ').includes('consent'),
        },
    };
}

/** Create a single-use code for a grant and return the client redirect URL. */
export async function issueCodeRedirect(input: { grantId: number; userId: number; clientId: string; redirectUri: string; codeChallenge: string; scope: string; resource: string; state: string | null }): Promise<string> {
    const code = randomToken(AUTH_CODE_PREFIX, 32);
    await adminStore.createCode({
        code_hash: sha256Hex(code),
        client_id: input.clientId,
        user_id: input.userId,
        grant_id: input.grantId,
        redirect_uri: input.redirectUri,
        code_challenge: input.codeChallenge,
        scope: input.scope,
        resource: input.resource,
        ttl_s: AUTH_CODE_TTL_S,
    });
    return clientRedirect(input.redirectUri, { code, state: input.state });
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function errorPage(title: string, message: string, status = 400): Response {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · TrafficClaw</title>
<style>:root{color-scheme:light dark;--bg:#fafafa;--fg:#18181b;--muted:#52525b;--card:#fff;--line:#e4e4e7}@media (prefers-color-scheme:dark){:root{--bg:#09090b;--fg:#f4f4f5;--muted:#a1a1aa;--card:#18181b;--line:#27272a}}
body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--fg);display:grid;min-height:100vh;place-items:center;padding:16px;box-sizing:border-box}
main{max-width:440px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}h1{font-size:18px;margin:0 0 8px}p{margin:0;color:var(--muted)}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
    return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
