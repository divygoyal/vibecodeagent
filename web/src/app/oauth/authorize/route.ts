import { adminStore } from '@/lib/mcp/adminStore';
import { mcpEnabled, notFoundResponse } from '@/lib/mcp/config';
import { clientIp, hitLimit } from '@/lib/mcp/rateLimit';
import { getSessionUser } from '@/lib/mcp/session';
import { errorPage, issueCodeRedirect, validateAuthorizeParams } from '@/lib/oauth/authorize';
import { csrfBinding, csrfCookieHeader, csrfCookieName, encodeTxn, newCsrfToken, readCookie } from '@/lib/oauth/txn';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function redirect(location: string, extraHeaders: Record<string, string> = {}): Response {
    return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store', ...extraHeaders } });
}

/**
 * OAuth 2.1 authorization endpoint (MCP.md 3.5). Validates the request, then
 * either re-issues a code for an existing grant or hands a signed transaction
 * to the consent page at /oauth/consent.
 */
export async function GET(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    const limit = hitLimit(`authorize:${clientIp(req)}`, 60, 60_000);
    if (!limit.ok) return errorPage('Too many requests', 'Please wait a minute and try again.', 429);

    const url = new URL(req.url);
    const v = await validateAuthorizeParams(url.searchParams);
    if (!v.ok) return 'page' in v ? errorPage(v.page.title, v.page.message) : redirect(v.redirect);
    const r = v.request;

    // A returning user who already approved this exact client skips the screen.
    const signedIn = await getSessionUser();
    if (signedIn && !r.promptConsent) {
        try {
            const grant = await adminStore.findActiveGrant(signedIn.user.id, r.client.client_id);
            const scopeCovered = grant && r.scope.split(' ').every((s) => grant.scope.split(' ').includes(s));
            if (grant && scopeCovered) {
                const location = await issueCodeRedirect({
                    grantId: grant.id, userId: grant.user_id, clientId: r.client.client_id, redirectUri: r.redirectUri,
                    codeChallenge: r.codeChallenge, scope: grant.scope, resource: r.resource, state: r.state,
                });
                return redirect(location);
            }
        } catch (err) {
            // Fall through to the consent screen; the user can still approve.
            console.warn('[mcp] grant lookup failed:', err instanceof Error ? err.message : err);
        }
    }

    let csrf = readCookie(req, csrfCookieName());
    const headers: Record<string, string> = {};
    if (!csrf || csrf.length < 20) {
        csrf = newCsrfToken();
        headers['set-cookie'] = csrfCookieHeader(csrf);
    }
    const txn = encodeTxn({
        c: r.client.client_id,
        r: r.redirectUri,
        ch: r.codeChallenge,
        s: r.scope,
        res: r.resource,
        st: r.state,
        pc: r.promptConsent || undefined,
        n: csrfBinding(csrf),
    });
    return redirect(`/oauth/consent?txn=${encodeURIComponent(txn)}`, headers);
}
