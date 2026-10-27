import { NextResponse, type NextRequest } from 'next/server';
import { decode } from 'next-auth/jwt';

import { demoDataAllowed } from '@/lib/demo/gate';
import { invalidateGoogleConnections } from '@/lib/googleAccounts';
import {
    GOOGLE_TOKEN_URL, LINK_COOKIE, LINK_COOKIE_PATH, LinkError, appOrigin, flowExpired, linkRedirectUri, missingDataScopes,
    parseIdToken, resultUrl, stateMatches, type LinkFlowState, type LinkResultCode,
} from '@/lib/googleLink';
import { googleAccessFor } from '@/lib/portfolio/auth';
import { startSync } from '@/lib/portfolio/sync';
import { getServerAuthUser } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const adminUrl = () => (process.env.ADMIN_API_URL || 'http://admin-api:8000').replace(/\/+$/, '');

/**
 * GET /api/google/link/callback?code=&state=  (Google's redirect back; see lib/googleLink.ts)
 *
 * Checks the state against the flow cookie and that the same user is still signed in, exchanges
 * the code with the PKCE verifier, reads which Google account was chosen from the id_token, and
 * stores it as a linked data connection (admin/google_accounts.py). The account the user signed in
 * with is refused ("same"); an account linked before gets its new tokens ("updated").
 * Tokens never reach the browser.
 */
export async function GET(req: NextRequest) {
    const origin = appOrigin();
    const sp = req.nextUrl.searchParams;
    let ret: string | null = null;
    const done = (result: LinkResultCode) => {
        const res = NextResponse.redirect(resultUrl(origin, ret, result), 303);
        res.cookies.set(LINK_COOKIE, '', { httpOnly: true, secure: origin.startsWith('https://'), sameSite: 'lax', path: LINK_COOKIE_PATH, maxAge: 0 });
        res.headers.set('Cache-Control', 'no-store');
        return res;
    };

    const secret = process.env.NEXTAUTH_SECRET;
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const raw = req.cookies.get(LINK_COOKIE)?.value;
    let flow: LinkFlowState | null = null;
    if (raw && secret) {
        try {
            flow = (await decode({ token: raw, secret, salt: LINK_COOKIE })) as unknown as LinkFlowState | null;
        } catch {
            flow = null;
        }
    }
    if (!flow || typeof flow.state !== 'string' || typeof flow.verifier !== 'string' || flowExpired(flow)) return done('expired');
    ret = typeof flow.ret === 'string' ? flow.ret : null;
    if (!stateMatches(flow.state, sp.get('state'))) {
        console.warn('[google-link] state mismatch');
        return done('expired');
    }
    const oauthError = sp.get('error');
    if (oauthError) return done(oauthError === 'access_denied' ? 'cancelled' : 'failed');

    const user = await getServerAuthUser(req);
    if (!user || user.id !== flow.uid) return done('signed_out');
    const code = sp.get('code');
    if (!code) return done('failed');

    try {
        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                redirect_uri: linkRedirectUri(),
                code_verifier: flow.verifier,
            }),
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
        });
        const tokens = await tokenRes.json().catch(() => null) as {
            access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string;
        } | null;
        if (!tokenRes.ok || !tokens?.access_token) {
            console.warn(`[google-link] code exchange failed: ${tokenRes.status} ${tokens?.error ?? ''}`);
            return done('failed');
        }

        const claims = parseIdToken(tokens.id_token, clientId, { allowUnsigned: demoDataAllowed() });
        // The sign-in Google account (or, for a GitHub sign-in, the Google account connected first) is
        // the primary connection already: nothing to add. The admin refuses it too (409 same_as_primary).
        if (claims.sub === user.googleAccountId || (user.provider === 'google' && claims.sub === user.id)) return done('same');
        if (missingDataScopes(tokens.scope).length > 0) return done('scopes');

        const res = await fetch(`${adminUrl()}/api/users/${encodeURIComponent(user.id)}/google/linked/${encodeURIComponent(claims.sub)}`, {
            method: 'PUT',
            headers: { 'X-API-Key': process.env.ADMIN_API_KEY || '', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: claims.email,
                name: claims.name,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token ?? null,
                expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
                scope: tokens.scope ?? null,
            }),
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
        });
        invalidateGoogleConnections();
        if (res.status === 409) {
            const detail = (await res.json().catch(() => null) as { detail?: string } | null)?.detail;
            return done(detail === 'limit' ? 'limit' : 'same');
        }
        if (!res.ok) {
            console.error(`[google-link] storing the connection failed: ${res.status}`);
            return done('failed');
        }
        const body = await res.json().catch(() => null) as { created?: boolean } | null;
        // List the new account's sites in the portfolio now, not at the next scheduled sync
        // (in the background: the redirect does not wait; a sync already running is joined).
        const identifier = user.id;
        void startSync({
            identifier,
            accessToken: async () => {
                const access = await googleAccessFor(identifier);
                return access.ok ? access.token : null;
            },
            reason: 'manual',
            refreshInventory: true,
        });
        return done(body?.created ? 'added' : 'updated');
    } catch (err) {
        if (err instanceof LinkError) console.warn(`[google-link] ${err.code}: ${err.message}`);
        else console.error('[google-link] failed:', err instanceof Error ? err.message : err);
        return done('failed');
    }
}
