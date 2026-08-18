/**
 * PATCH /api/support/messages/read — mark every admin reply in this user's
 * thread as read. Called once when the support page mounts so the sidebar
 * unread badge clears.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export async function PATCH() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ADMIN_API_KEY) return NextResponse.json({ error: 'Admin API not configured' }, { status: 503 });
    // @ts-expect-error - id added in NextAuth callbacks
    const userId = String(session.user.id);

    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/support/messages/read`,
            {
                method: 'PATCH',
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
                signal: AbortSignal.timeout(8000),
            },
        );
        if (!res.ok) {
            return NextResponse.json({ updated: 0 }, { status: 200 });
        }
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ updated: 0, degraded: true }, { status: 200 });
    }
}
