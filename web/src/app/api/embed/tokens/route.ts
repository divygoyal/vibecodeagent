import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

/**
 * POST /api/embed/tokens — Create a new embed token
 * Body: { propertyId, label? }
 */
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { propertyId, label } = body;

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
        }

        const res = await fetch(`${ADMIN_API_URL}/api/embed-tokens`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify({
                user_identifier: session.user.id,
                property_id: propertyId,
                label: label || undefined,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return NextResponse.json(
                { error: err.detail || 'Failed to create token' },
                { status: res.status }
            );
        }

        return NextResponse.json(await res.json());
    } catch (err) {
        console.error('Create embed token error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * GET /api/embed/tokens — List user's embed tokens
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const res = await fetch(
            `${ADMIN_API_URL}/api/embed-tokens?user_identifier=${encodeURIComponent(session.user.id)}`,
            { headers: { 'X-API-Key': ADMIN_API_KEY } }
        );

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to list tokens' }, { status: res.status });
        }

        return NextResponse.json(await res.json());
    } catch (err) {
        console.error('List embed tokens error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/embed/tokens?token={token} — Revoke an embed token
 */
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ error: 'token parameter required' }, { status: 400 });
        }

        const res = await fetch(
            `${ADMIN_API_URL}/api/embed-tokens/${encodeURIComponent(token)}?user_identifier=${encodeURIComponent(session.user.id)}`,
            {
                method: 'DELETE',
                headers: { 'X-API-Key': ADMIN_API_KEY },
            }
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return NextResponse.json(
                { error: err.detail || 'Failed to revoke token' },
                { status: res.status }
            );
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Revoke embed token error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
