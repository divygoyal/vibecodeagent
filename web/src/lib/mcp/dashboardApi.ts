/**
 * Helpers for the signed-in "Connect AI" management APIs (/api/ai-connections/*):
 * session required, mutations must be same-origin JSON (CSRF-safe).
 */
import { issuer, mcpEnabled, requestOrigin } from './config';
import { getSessionUser, type SessionUser } from './session';

export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function requireUser(req: Request, opts: { mutation?: boolean } = {}): Promise<{ user: SessionUser; session: unknown } | Response> {
    if (!mcpEnabled()) return json({ error: 'not_found' }, 404);
    if (opts.mutation) {
        const site = req.headers.get('sec-fetch-site');
        const origin = req.headers.get('origin');
        const sameOrigin = site ? site === 'same-origin' : !!origin && (origin === issuer() || origin === requestOrigin(req));
        if (!sameOrigin) return json({ error: 'forbidden', message: 'Cross-site request blocked' }, 403);
        if (req.method !== 'DELETE' && !(req.headers.get('content-type') || '').includes('application/json')) {
            return json({ error: 'unsupported_media_type' }, 415);
        }
    }
    const s = await getSessionUser();
    if (!s) return json({ error: 'unauthorized' }, 401);
    return s;
}
