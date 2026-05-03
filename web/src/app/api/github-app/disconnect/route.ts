import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/**
 * POST /api/github-app/disconnect
 * Removes ALL of the user's GitHub App installation rows from our DB.
 * Note: this does NOT uninstall the App on GitHub — user must do that at
 * https://github.com/settings/installations for full repo-access revocation.
 */
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Admin API not configured' }, { status: 503 });
    }
    // @ts-expect-error — id added in NextAuth callbacks
    const userId = String(session.user.id);
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/github-app/installations`,
            {
                method: 'DELETE',
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
            }
        );
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return NextResponse.json({ error: data.detail || 'Failed to disconnect' }, { status: res.status });
        }
        return NextResponse.json(await res.json());
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Failed to disconnect' }, { status: 500 });
    }
}
