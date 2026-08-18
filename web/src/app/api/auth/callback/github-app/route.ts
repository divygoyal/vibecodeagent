import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/**
 * Resolve the public base URL of the site. Behind a reverse proxy (Coolify,
 * Vercel, etc.) `req.url` can come back as `http://localhost:3000/...` because
 * Next.js builds it from the internal `host` header. That makes any
 * `new URL(target, req.url)` redirect land on localhost.
 *
 * Order of preference:
 *   1. NEXTAUTH_URL env (always points at the public site)
 *   2. x-forwarded-host + x-forwarded-proto headers (most reverse proxies set these)
 *   3. fallback to req.url (dev mode, no proxy)
 */
function publicBaseUrl(req: NextRequest): string {
    const fromEnv = process.env.NEXTAUTH_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    const forwardedHost = req.headers.get('x-forwarded-host');
    const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
    if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
    return new URL(req.url).origin;
}

/**
 * GET /api/auth/callback/github-app
 * GitHub redirects here after the user finishes the App install flow.
 * Query params: installation_id, setup_action ("install" | "update"), state.
 * We verify the CSRF state cookie, post the installation_id to admin so
 * the row gets created, then redirect back to the chat page with a flag.
 */
export async function GET(req: NextRequest) {
    const base = publicBaseUrl(req);
    const url = new URL(req.url);
    const installationIdParam = url.searchParams.get('installation_id');
    const stateParam = url.searchParams.get('state');
    const setupAction = url.searchParams.get('setup_action') || 'install';

    if (!installationIdParam) {
        return NextResponse.redirect(new URL('/dashboard/ai-chat?installed=error', base));
    }

    const stateCookie = req.cookies.get('gh_app_install_state')?.value;
    // The Setup URL flow does NOT carry our CSRF state — only the OAuth-during-install
    // flow does. So we only enforce the state check when GitHub actually sent one back.
    if (stateParam && (!stateCookie || stateParam !== stateCookie)) {
        return NextResponse.redirect(new URL('/dashboard/ai-chat?installed=invalid_state', base));
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.redirect(new URL('/', base));
    }
    if (!ADMIN_API_KEY) {
        return NextResponse.redirect(new URL('/dashboard/ai-chat?installed=admin_misconfigured', base));
    }

    // @ts-expect-error — id added in NextAuth callbacks
    const userId = String(session.user.id);
    const installationId = parseInt(installationIdParam, 10);
    if (Number.isNaN(installationId)) {
        return NextResponse.redirect(new URL('/dashboard/ai-chat?installed=error', base));
    }

    let adminFailReason = '';
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
        if (res.ok) {
            const out = NextResponse.redirect(
                new URL(`/dashboard/ai-chat?installed=ok&action=${encodeURIComponent(setupAction)}`, base)
            );
            out.cookies.delete('gh_app_install_state');
            return out;
        }
        try {
            const body = await res.json();
            adminFailReason = String(body?.detail || body?.error || res.status);
        } catch {
            adminFailReason = `http_${res.status}`;
        }
    } catch (e: any) {
        adminFailReason = e?.message || 'fetch_failed';
    }
    const out = NextResponse.redirect(
        new URL(`/dashboard/ai-chat?installed=admin_failed&why=${encodeURIComponent(adminFailReason.slice(0, 120))}`, base)
    );
    out.cookies.delete('gh_app_install_state');
    return out;
}
