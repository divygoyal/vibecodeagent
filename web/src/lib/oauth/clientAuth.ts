/**
 * Client authentication at the token and revocation endpoints:
 * `none` (public clients, PKCE only), `client_secret_basic`, `client_secret_post`.
 */
import { ClientError, getClient, type ClientInfo } from './clients';
import { safeEqual, sha256Hex } from './primitives';

export type ClientAuthResult = { ok: true; client: ClientInfo } | { ok: false; status: 400 | 401; error: string; description: string };

function parseBasic(header: string | null): { id: string; secret: string } | null {
    if (!header || !/^Basic\s+/i.test(header)) return null;
    try {
        const decoded = Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        if (idx < 0) return null;
        return { id: decodeURIComponent(decoded.slice(0, idx)), secret: decodeURIComponent(decoded.slice(idx + 1)) };
    } catch {
        return null;
    }
}

export async function authenticateClient(req: Request, form: URLSearchParams): Promise<ClientAuthResult> {
    const basic = parseBasic(req.headers.get('authorization'));
    const formId = form.get('client_id');
    if (basic && formId && formId !== basic.id) return { ok: false, status: 400, error: 'invalid_request', description: 'client_id does not match the Authorization header' };
    const clientId = basic?.id || formId;
    if (!clientId) return { ok: false, status: 401, error: 'invalid_client', description: 'client_id is required' };
    let client: ClientInfo;
    try {
        client = await getClient(clientId);
    } catch (err) {
        return { ok: false, status: 401, error: 'invalid_client', description: err instanceof ClientError ? err.message : 'unknown client' };
    }
    if (client.token_endpoint_auth_method === 'none') return { ok: true, client };
    const secret = client.token_endpoint_auth_method === 'client_secret_basic' ? basic?.secret : (form.get('client_secret') ?? basic?.secret);
    if (!secret || !client.secret_hash || !safeEqual(sha256Hex(secret), client.secret_hash)) {
        return { ok: false, status: 401, error: 'invalid_client', description: 'client authentication failed' };
    }
    return { ok: true, client };
}
