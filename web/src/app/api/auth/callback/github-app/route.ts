import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/**
 * GET /api/auth/callback/github-app
 * GitHub redirects here after the user finishes the App install flow.
 * Query params: installation_id, setup_action ("install" | "update"), state.
 * We verify the CSRF state cookie, post the installation_id to admin so
 * the row gets created, then redirect back to the chat page with a flag.
 */
export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const installationIdParam = url.searchParams.get('installation_id');
    const stateParam = url.searchParams.get('state');
    const setupAction = url.searchParams.get('setup_action') || 'install';

    if (!installationIdParam) {
        return NextResponse.redirect(new URL('/dashboard/ai-chat?installed=error', req.url));
    }

    const stateCookie = req.cookies.get('gh_app_install_state')?.value;
    // Compare in constant-ish time. (Strings are short, full-equality compare is fine here.)
    if (!stateParam || !stateCookie || stateParam !== stateCookie) {
        return NextResponse.redirect(new URL('/dashboard/ai-chat?installed=invalid_state', req.url));
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.redirect(new URL('/', req.url));
    }
    if (!ADMIN_API_KEY) {
        return NextResponse.redirect(new URL('/dashboard/ai-chat?installed=admin_misconfigured', req.url));
    }

    // @ts-expect-error — id added in NextAuth callbacks
    const userId = String(session.user.id);
    const installationId = parseInt(installationIdParam, 10);
    if (Number.isNaN(installationId)) {
        return NextResponse.redirect(new URL('/dashboard/ai-chat?installed=error', req.url));
    }

    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/github-app/install`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY,
                },
                body: JSON.stringify({ installation_id: installationId }),
                cache: 'no-store',
            }
        );
        const target = res.ok
            ? `/dashboard/ai-chat?installed=ok&action=${encodeURIComponent(setupAction)}`
            : `/dashboard/ai-chat?installed=admin_failed`;
        const out = NextResponse.redirect(new URL(target, req.url));
        out.cookies.delete('gh_app_install_state');
        return out;
    } catch {
        const out = NextResponse.redirect(new URL('/dashboard/ai-chat?installed=admin_failed', req.url));
        out.cookies.delete('gh_app_install_state');
        return out;
    }
}
