import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

type Session = { user?: { id: string } } | null;

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Admin API unavailable' }, { status: 503 });
    }

    const { id } = await params;
    const body = await req.json();
    const response = await fetch(`${ADMIN_API_URL}/api/analytics/goals/definitions/${id}?user_identifier=${encodeURIComponent(session.user.id)}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ADMIN_API_KEY,
        },
        body: JSON.stringify({
            name: body.name,
            description: body.description,
            goal_type: body.type,
            rule_json: body.target ? JSON.stringify({ target: body.target }) : undefined,
            is_active: body.isActive,
        }),
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
        return NextResponse.json({ error: responseBody.detail || responseBody.error || 'Failed to update goal definition' }, { status: response.status });
    }

    return NextResponse.json(responseBody);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Admin API unavailable' }, { status: 503 });
    }

    const { id } = await params;
    const response = await fetch(`${ADMIN_API_URL}/api/analytics/goals/definitions/${id}?user_identifier=${encodeURIComponent(session.user.id)}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': ADMIN_API_KEY },
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
        return NextResponse.json({ error: responseBody.detail || responseBody.error || 'Failed to delete goal definition' }, { status: response.status });
    }

    return NextResponse.json(responseBody);
}
