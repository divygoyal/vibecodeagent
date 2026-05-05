/**
 * Web proxy for the user's workspace selection (active GA4 property + GSC site).
 *
 * Mirrors the admin endpoints at /api/users/{identifier}/workspace and injects
 * session.user.id as the user_identifier so the client never needs to know
 * about admin auth or its user-resolution scheme.
 *
 * GET   /api/user/workspace          → load the user's active workspace
 * PATCH /api/user/workspace          → save (one or more of property / site / range)
 *
 * Body shape (PATCH):
 *   {
 *     selected_property_id?: string | null,   // string = set, null = unchanged
 *     selected_site_url?:    string | null,
 *     selected_range?:       string | null,
 *     clear_property?: boolean,               // true = explicitly null the field
 *     clear_site?:     boolean,
 *   }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

async function requireUserId(): Promise<string | NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Admin API not configured' }, { status: 503 });
    }
    // @ts-expect-error - id added in NextAuth callbacks
    return String(session.user.id);
}

export async function GET() {
    const userId = await requireUserId();
    if (typeof userId !== 'string') return userId;

    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/workspace`,
            {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
                signal: AbortSignal.timeout(8000),
            }
        );
        if (!res.ok) {
            return NextResponse.json(
                {
                    selected_property_id: null,
                    selected_site_url: null,
                    selected_range: '30d',
                    workspace_setup_completed: false,
                    welcome_seen: false,
                    exists: false,
                },
                { status: 200 }
            );
        }
        return NextResponse.json(await res.json());
    } catch {
        // Don't fail the request — let the client fall back to localStorage.
        return NextResponse.json(
            {
                selected_property_id: null,
                selected_site_url: null,
                selected_range: '30d',
                workspace_setup_completed: false,
                welcome_seen: false,
                exists: false,
                degraded: true,
            },
            { status: 200 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    const userId = await requireUserId();
    if (typeof userId !== 'string') return userId;

    let body: Record<string, unknown> = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const payload = {
        selected_property_id: typeof body.selected_property_id === 'string' ? body.selected_property_id : undefined,
        selected_site_url: typeof body.selected_site_url === 'string' ? body.selected_site_url : undefined,
        selected_range: typeof body.selected_range === 'string' ? body.selected_range : undefined,
        clear_property: body.clear_property === true,
        clear_site: body.clear_site === true,
        mark_setup_completed: body.mark_setup_completed === true,
        mark_welcome_seen: body.mark_welcome_seen === true,
    };

    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/workspace`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY,
                },
                body: JSON.stringify(payload),
                cache: 'no-store',
                signal: AbortSignal.timeout(8000),
            }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return NextResponse.json(
                { error: data.detail || 'Failed to save workspace', status: res.status },
                { status: res.status }
            );
        }
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Network error saving workspace' },
            { status: 502 }
        );
    }
}
