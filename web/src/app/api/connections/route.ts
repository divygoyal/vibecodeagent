import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

/**
 * GET /api/connections -> { connectedProviders: [{ provider }] }
 * The signed-in user's connected OAuth providers from the admin DB. A user
 * whose admin row does not exist yet gets an empty list (the client also
 * looks at the session's own tokens). Replaces the old /api/container poll.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    const id = (session?.user as { id?: string } | undefined)?.id;
    if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ADMIN_API_KEY) return NextResponse.json({ connectedProviders: [] });
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(String(id))}/connections`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
        });
        if (res.status === 404) return NextResponse.json({ connectedProviders: [] });
        if (!res.ok) throw new Error(`admin ${res.status}`);
        const data = (await res.json()) as { connected_providers?: { provider: string }[] };
        return NextResponse.json(
            { connectedProviders: (data.connected_providers ?? []).map((c) => ({ provider: c.provider })) },
            { headers: { 'Cache-Control': 'private, no-store' } },
        );
    } catch (err) {
        console.error('[connections] lookup failed:', err instanceof Error ? err.message : err);
        // The client also reads the session's own tokens, so an empty list degrades cleanly (no 5xx in the console).
        return NextResponse.json({ connectedProviders: [], degraded: true }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
}
