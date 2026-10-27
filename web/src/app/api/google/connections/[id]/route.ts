import { NextResponse, type NextRequest } from 'next/server';

import { invalidateGoogleConnections, PRIMARY_CONNECTION } from '@/lib/googleAccounts';
import { appOrigin } from '@/lib/googleLink';
import { invalidatePairingOverrides } from '@/lib/sites/pairingStore';
import { getServerAuthUser } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

const adminUrl = () => (process.env.ADMIN_API_URL || 'http://admin-api:8000').replace(/\/+$/, '');

/**
 * DELETE /api/google/connections/<sub>: disconnect an extra Google account. Its stored tokens are
 * deleted and its sites stop showing (their portfolio rows are kept, hidden, and come back if the
 * account is connected again). The sign-in account cannot be disconnected here.
 *
 * The token is not revoked at Google: the same Google account may be another TrafficClaw user's
 * sign-in (one grant per Google account and app), and revoking would sign that user out of Google
 * data too. People remove the app's access in their Google account permissions.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const user = await getServerAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // State change: same-origin requests only (SameSite=Lax cookies already block cross-site DELETEs).
    const origin = req.headers.get('origin');
    if (origin && origin !== appOrigin() && origin !== req.nextUrl.origin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await ctx.params;
    if (!id || id === PRIMARY_CONNECTION || id.length > 255) {
        return NextResponse.json({ error: 'Only an extra Google account can be disconnected here.' }, { status: 400 });
    }
    try {
        const res = await fetch(`${adminUrl()}/api/users/${encodeURIComponent(user.id)}/google/linked/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'X-API-Key': process.env.ADMIN_API_KEY || '' },
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
        });
        invalidateGoogleConnections();
        invalidatePairingOverrides();
        if (res.status === 404) return NextResponse.json({ error: 'That Google account is not connected.' }, { status: 404 });
        if (!res.ok) return NextResponse.json({ error: 'Could not disconnect it. Try again.' }, { status: 502 });
        const data = await res.json().catch(() => ({})) as { hidden_assets?: number };
        return NextResponse.json({ ok: true, hiddenAssets: data.hidden_assets ?? 0 });
    } catch {
        return NextResponse.json({ error: 'Could not disconnect it. Try again.' }, { status: 502 });
    }
}
