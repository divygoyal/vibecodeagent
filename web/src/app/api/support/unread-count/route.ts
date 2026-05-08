/**
 * GET /api/support/unread-count — number of admin replies the user hasn't
 * seen yet. Polled by the dashboard sidebar to drive the unread badge on
 * the Help & Support nav item.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ unread: 0 }, { status: 200 });
    if (!ADMIN_API_KEY) return NextResponse.json({ unread: 0 }, { status: 200 });
    // @ts-expect-error - id added in NextAuth callbacks
    const userId = String(session.user.id);

    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/support/unread-count`,
            {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
                signal: AbortSignal.timeout(5000),
            },
        );
        if (!res.ok) return NextResponse.json({ unread: 0 }, { status: 200 });
        return NextResponse.json(await res.json());
    } catch {
        // Sidebar badge is best-effort — never break the dashboard render on a fetch hiccup.
        return NextResponse.json({ unread: 0 }, { status: 200 });
    }
}
