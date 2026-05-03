import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/** GET /api/github-app/installations — list the current user's installations. */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ADMIN_API_KEY) {
        return NextResponse.json({ installations: [] });
    }
    // @ts-expect-error — id added in NextAuth callbacks
    const userId = String(session.user.id);
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/github-app/installations`,
            { headers: { 'X-API-Key': ADMIN_API_KEY }, cache: 'no-store' }
        );
        if (!res.ok) {
            return NextResponse.json({ installations: [] });
        }
        return NextResponse.json(await res.json());
    } catch {
        return NextResponse.json({ installations: [] });
    }
}
