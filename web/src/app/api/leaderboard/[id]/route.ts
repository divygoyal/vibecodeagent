import { NextResponse } from 'next/server';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

/**
 * Public endpoint — get a single leaderboard entry's full details.
 * Proxies to admin API's GET /api/leaderboard/{id}/detail.
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${id}/detail`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
            if (res.status === 404) {
                return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
            }
            throw new Error(`Admin API returned ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch entry' }, { status: 500 });
    }
}
