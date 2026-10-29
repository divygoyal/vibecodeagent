import { ensureAdminUserSynced } from '@/lib/adminUserSync';
import { adminStore, AdminStoreError } from '@/lib/mcp/adminStore';
import { demoGrantsEnabled, issuer, mcpEnabled, notFoundResponse, requestOrigin } from '@/lib/mcp/config';
import { hitLimit } from '@/lib/mcp/rateLimit';
import { getSessionUser } from '@/lib/mcp/session';
import { errorPage, issueCodeRedirect } from '@/lib/oauth/authorize';
import { ClientError, getClient, verifiedClientName } from '@/lib/oauth/clients';
import { matchRedirectUri, redirectHostLabel, safeEqual } from '@/lib/oauth/primitives';
import { mcpEventSetCookie } from '@/lib/growth/events';
import { clientRedirect, csrfBinding, csrfCookieName, decodeTxn, readCookie } from '@/lib/oauth/txn';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function seeOther(location: string, setCookie?: string): Response {
    const headers = new Headers({ location, 'cache-control': 'no-store' });
    if (setCookie) headers.append('set-cookie', setCookie);
    return new Response(null, { status: 303, headers });
}

function sameOrigin(req: Request): boolean {
    const site = req.headers.get('sec-fetch-site');
    if (site) return site === 'same-origin';
    const origin = req.headers.get('origin');
    return !!origin && (origin === issuer() || origin === requestOrigin(req));
}

/** Consent form target: approve, approve with demo data, or cancel. MCP.md 6.1. */
export async function POST(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    if (!sameOrigin(req)) return errorPage('Request blocked', 'This approval did not come from the TrafficClaw consent page.', 403);

    const form = await req.formData().catch(() => null);
    if (!form) return errorPage('Bad request', 'The approval form could not be read.');
    const txn = decodeTxn(String(form.get('txn') || ''));
    const csrfCookie = readCookie(req, csrfCookieName());
    const csrfField = String(form.get('csrf') || '');
    if (!txn || !csrfCookie || !csrfField || !safeEqual(csrfCookie, csrfField) || !safeEqual(csrfBinding(csrfCookie), txn.n)) {
        return errorPage('This approval link expired', 'Start the connection again from your AI app.');
    }

    let client;
    try {
        client = await getClient(txn.c);
    } catch (err) {
        return errorPage('This app could not be identified', err instanceof ClientError ? err.message : 'Start again from your AI app.');
    }
    if (!matchRedirectUri(client.redirect_uris, txn.r)) {
        return errorPage('Redirect address not allowed', 'The app changed its registered addresses. Start again from your AI app.');
    }

    const action = String(form.get('action_choice') || form.get('action') || '');
    if (action === 'deny') {
        return seeOther(clientRedirect(txn.r, { error: 'access_denied', error_description: 'The user declined the connection', state: txn.st }));
    }
    if (action !== 'allow' && action !== 'demo') return errorPage('Bad request', 'Unknown action.');

    const signedIn = await getSessionUser();
    if (signedIn && !hitLimit(`consent:${signedIn.user.id}`, 20, 60_000).ok) {
        return errorPage('Too many requests', 'Please wait a minute and try again.', 429);
    }
    const verifiedName = verifiedClientName(client.client_id, txn.r);
    const grantBase = {
        client_id: client.client_id,
        client_name: verifiedName || client.client_name,
        client_host: client.kind === 'cimd' ? client.client_host : 'unverified',
        redirect_host: redirectHostLabel(txn.r),
        verified: Boolean(verifiedName),
        scope: txn.s,
    };

    let grant: { id: number; user_id: number };
    // First approval of an AI app for this account: the browser sends GA4 mcp_connected on its next app load (lib/growth/events.ts).
    let firstConnection = false;
    try {
        if (action === 'demo') {
            if (!demoGrantsEnabled()) return errorPage('Demo data is off', 'Demo connections are disabled on this server.');
            grant = await adminStore.upsertGrant({ ...grantBase, user: signedIn ? signedIn.user.id : null, demo: true });
        } else {
            if (!signedIn) return errorPage('Sign in first', 'Sign in to TrafficClaw, then approve the connection.');
            const mode = String(form.get('sites') || 'all');
            const picked = form.getAll('site').map(String).filter((s) => s.length > 0 && s.length <= 255).slice(0, 200);
            if (mode === 'selected' && picked.length === 0) return errorPage('No sites chosen', 'Pick at least one site, or choose "All my sites". Go back and try again.');
            const payload = {
                ...grantBase,
                user: signedIn.user.id,
                site_filter: mode === 'selected' ? picked : null,
                exclude_queries: form.get('exclude_queries') === '1',
                demo: false,
            };
            firstConnection = await adminStore.listGrants(String(signedIn.user.id)).then((r) => r.grants.length === 0, () => true);
            try {
                grant = await adminStore.upsertGrant(payload);
            } catch (err) {
                if (!(err instanceof AdminStoreError && err.status === 404)) throw err;
                // First visit: the admin row for this user does not exist yet.
                await ensureAdminUserSynced(signedIn.session, 'google');
                grant = await adminStore.upsertGrant(payload);
            }
        }
        const location = await issueCodeRedirect({
            grantId: grant.id, userId: grant.user_id, clientId: client.client_id, redirectUri: txn.r,
            codeChallenge: txn.ch, scope: txn.s, resource: txn.res, state: txn.st,
        });
        return seeOther(location, firstConnection ? mcpEventSetCookie(requestOrigin(req).startsWith('https://')) : undefined);
    } catch (err) {
        console.error('[mcp] consent failed:', err instanceof Error ? err.message : err);
        return seeOther(clientRedirect(txn.r, { error: 'server_error', error_description: 'TrafficClaw could not save the approval', state: txn.st }));
    }
}
