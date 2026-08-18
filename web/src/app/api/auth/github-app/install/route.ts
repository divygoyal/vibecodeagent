import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG || '';

/**
 * GET /api/auth/github-app/install
 * Redirects the user to GitHub's App install page. After they pick repos and
 * confirm, GitHub redirects them back to /api/auth/callback/github-app with
 * an installation_id and our state CSRF token.
 */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.redirect(new URL('/', req.url));
    }
    if (!GITHUB_APP_SLUG) {
        return NextResponse.json(
            { error: 'GITHUB_APP_SLUG not configured on server' },
            { status: 503 }
        );
    }

    // CSRF token, set as a short-lived signed cookie; verified in the callback.
    const state = randomBytes(24).toString('base64url');
    const installUrl = new URL(`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`);
    installUrl.searchParams.set('state', state);

    const res = NextResponse.redirect(installUrl);
    res.cookies.set('gh_app_install_state', state, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 600, // 10 min — install flow shouldn't take longer
    });
    return res;
}
