import { NextResponse } from 'next/server';
import { clientIp, clientKey, makeUnlockKey, rateLimited, unlockCookieName } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { isShareToken, verifySharePassword } from '@/lib/builder/server/store';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboards/public/[token]/unlock { password }: a signed 24 h key. Top-level pages
 * also get an HttpOnly cookie; embeds keep the key in sessionStorage and send it as
 * `Authorization: Bearer <key>` (third-party cookies are blocked in iframes).
 * 5 attempts per minute per token and IP (here and in the admin).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!isShareToken(token)) return jsonError(404, 'This dashboard is no longer shared.');
    if (rateLimited(`unlock:${token}:${clientIp(req)}`, 5)) return jsonError(429, 'Too many attempts. Wait a minute and try again.');
    const body = (await req.json().catch(() => ({}))) as { password?: unknown };
    if (typeof body.password !== 'string' || !body.password || body.password.length > 200) return jsonError(422, 'Enter the password.');
    const r = await verifySharePassword(token, body.password, clientKey(req, token));
    if (r.status === 404) return jsonError(404, 'This dashboard is no longer shared.');
    if (r.status === 429) return jsonError(429, 'Too many attempts. Wait a minute and try again.');
    if (!r.ok) return jsonError(401, 'That password is not right.');
    const { key, expiresAt } = makeUnlockKey(token);
    const res = NextResponse.json({ key, expiresAt });
    res.cookies.set(unlockCookieName(token), key, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 24 * 3600,
    });
    return res;
}
