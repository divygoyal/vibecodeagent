import { NextResponse, type NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';

import { demoAuthCode } from '@/lib/demo';
import { demoDataAllowed } from '@/lib/demo/gate';
import { listLinkedGoogleConnections } from '@/lib/googleAccounts';
import { LINK_COOKIE, LINK_COOKIE_PATH, LINK_TTL_S, appOrigin, authorizeUrl, linkRedirectUri, newFlowState, resultUrl } from '@/lib/googleLink';
import { getServerAuthUser } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const DEMO_ACCOUNT_RE = /^[a-z0-9-]{1,40}$/;

/**
 * GET /api/google/link/start[?reconnect=<linked sub>][&return=<path>]
 *
 * "Add another Google account" / "Reconnect" (an extra account): starts Google's OAuth consent for a
 * read-only DATA connection (lib/googleLink.ts). Not the NextAuth sign-in: who is signed in never
 * changes. Demo servers (TC_DEMO_DATA) skip Google and come straight back with a demo code
 * (`demo_account=<key>`, default `multi2`).
 */
export async function GET(req: NextRequest) {
    const origin = appOrigin();
    const user = await getServerAuthUser(req);
    if (!user) {
        const signIn = new URL('/', origin);
        signIn.searchParams.set('callbackUrl', '/dashboard/settings?tab=google');
        return NextResponse.redirect(signIn, 303);
    }
    const secret = process.env.NEXTAUTH_SECRET;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!secret || !clientId) {
        console.error('[google-link] NEXTAUTH_SECRET or GOOGLE_CLIENT_ID is not set');
        return NextResponse.redirect(resultUrl(origin, null, 'failed'), 303);
    }

    const sp = req.nextUrl.searchParams;
    const reconnect = sp.get('reconnect');
    let loginHint: string | null = null;
    if (reconnect) {
        const conn = (await listLinkedGoogleConnections(user.id, { fresh: true })).find((c) => c.sub === reconnect);
        loginHint = conn?.email ?? null;
    }
    const flow = newFlowState(user.id, sp.get('return'), reconnect && loginHint ? reconnect : null);
    const sealed = await encode({ token: { ...flow }, secret, maxAge: LINK_TTL_S, salt: LINK_COOKIE });

    const redirectUri = linkRedirectUri();
    let target: string;
    if (demoDataAllowed()) {
        const key = sp.get('demo_account') ?? 'multi2';
        const back = new URL(redirectUri);
        back.searchParams.set('state', flow.state);
        if (key === 'cancel') back.searchParams.set('error', 'access_denied');
        else back.searchParams.set('code', demoAuthCode(DEMO_ACCOUNT_RE.test(key) ? key : 'multi2'));
        target = back.toString();
    } else {
        target = authorizeUrl(flow, { clientId, redirectUri, loginHint });
    }

    const res = NextResponse.redirect(target, 303);
    res.cookies.set(LINK_COOKIE, sealed, {
        httpOnly: true,
        secure: origin.startsWith('https://'),
        sameSite: 'lax', // sent on Google's top-level redirect back to the callback
        path: LINK_COOKIE_PATH,
        maxAge: LINK_TTL_S,
    });
    res.headers.set('Cache-Control', 'no-store');
    return res;
}
