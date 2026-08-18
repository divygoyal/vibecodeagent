/**
 * Web proxy → admin's weekly-digests endpoint.
 *
 * Two modes (forwarded to admin):
 *   - List:   GET /api/weekly-digests?limit=N&site_url=…
 *             → admin returns { digests: [...summary], exists: bool }
 *   - Single: GET /api/weekly-digests?year=Y&iso_week=W&site_url=…
 *             → admin returns the full row including snapshot blob, or 404
 *
 * Auth: requires a NextAuth session. The `session.user.id` value is the
 * OAuth provider ID string (per CLAUDE.md) — admin's `get_user_by_identifier`
 * handles the OAuth-id → DB-user-id resolution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

// Whitelist the query params we forward to admin. Anything else is dropped
// so a caller can't smuggle arbitrary fields into the upstream URL.
const FORWARDABLE_PARAMS = ['year', 'iso_week', 'site_url', 'limit'] as const;

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-expect-error - id added in NextAuth callbacks (see lib/auth.ts)
        const userId = session.user.id as string | undefined;
        if (!userId) {
            return NextResponse.json({ digests: [], exists: false });
        }

        const url = new URL(req.url);
        const forwarded = new URLSearchParams();
        for (const key of FORWARDABLE_PARAMS) {
            const value = url.searchParams.get(key);
            if (value !== null && value !== '') {
                forwarded.set(key, value);
            }
        }

        const encodedId = encodeURIComponent(String(userId));
        const qs = forwarded.toString();
        const upstream = `${ADMIN_API_URL}/api/users/${encodedId}/weekly-digests${qs ? `?${qs}` : ''}`;

        const adminRes = await fetch(upstream, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
        });

        // Pass through the body + status so a 404 for "this week doesn't exist
        // yet" reaches the client unchanged, but never leak admin's raw payload
        // shape if it returns a non-JSON error.
        const contentType = adminRes.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await adminRes.text().catch(() => '');
            return NextResponse.json(
                { error: 'Upstream returned non-JSON', detail: text.slice(0, 200) },
                { status: adminRes.ok ? 502 : adminRes.status },
            );
        }

        const data = await adminRes.json();
        return NextResponse.json(data, { status: adminRes.status });
    } catch (err) {
        console.error('[WEEKLY-DIGESTS] Error:', err);
        return NextResponse.json(
            { error: 'Failed to load weekly digests' },
            { status: 500 },
        );
    }
}
