import { adminStore } from '@/lib/mcp/adminStore';
import { evictTokenHashes } from '@/lib/mcp/auth';
import { mcpEnabled, notFoundResponse } from '@/lib/mcp/config';
import { clientIp, hitLimit } from '@/lib/mcp/rateLimit';
import { authenticateClient } from '@/lib/oauth/clientAuth';
import { oauthError, publicPreflight, readFormOrJson, withPublicCors } from '@/lib/oauth/metadata';
import { sha256Hex } from '@/lib/oauth/primitives';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * RFC 7009 revocation. Always 200 for well-formed requests (even unknown
 * tokens). Revoking a refresh token revokes its whole family.
 */
export async function POST(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    const limit = hitLimit(`revoke:${clientIp(req)}`, 120, 60_000);
    if (!limit.ok) return oauthError('slow_down', 'Too many requests.', 429, { 'retry-after': String(limit.retryAfterS) });
    const form = await readFormOrJson(req);
    if (!form) return oauthError('invalid_request', 'Body must be application/x-www-form-urlencoded.');
    const token = form.get('token');
    if (!token) return oauthError('invalid_request', 'token is required');

    let clientId: string | null = null;
    if (form.get('client_id') || req.headers.get('authorization')) {
        const auth = await authenticateClient(req, form);
        if (!auth.ok) return oauthError(auth.error, auth.description, auth.status);
        clientId = auth.client.client_id;
    }
    try {
        const res = await adminStore.revokeToken(sha256Hex(token), clientId);
        evictTokenHashes(res.revoked_hashes);
    } catch (err) {
        console.error('[mcp] revoke failed:', err instanceof Error ? err.message : err);
        return oauthError('server_error', 'Could not revoke the token.', 503);
    }
    return withPublicCors(new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } }));
}

export const OPTIONS = publicPreflight;
