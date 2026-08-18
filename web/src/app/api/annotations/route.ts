import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

/**
 * GET /api/annotations — List annotations for the current user
 * Query params: propertyId?, startDate?, endDate?
 */
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const propertyId = searchParams.get('propertyId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        const params = new URLSearchParams({
            user_identifier: session.user.id,
        });
        if (propertyId) params.set('property_id', propertyId);
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);

        const res = await fetch(
            `${ADMIN_API_URL}/api/annotations?${params.toString()}`,
            { headers: { 'X-API-Key': ADMIN_API_KEY } }
        );

        if (!res.ok) {
            return NextResponse.json({ error: 'Failed to fetch annotations' }, { status: res.status });
        }

        return NextResponse.json(await res.json());
    } catch (err) {
        console.error('List annotations error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/annotations — Create a new annotation
 * Body: { date, category?, title, description?, color?, url?, propertyId? }
 */
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { date, category, title, description, color, url, propertyId } = body;

        if (!date || !title) {
            return NextResponse.json({ error: 'date and title are required' }, { status: 400 });
        }

        const res = await fetch(`${ADMIN_API_URL}/api/annotations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify({
                user_identifier: session.user.id,
                date,
                category: category || 'custom',
                title,
                description: description || undefined,
                color: color || undefined,
                url: url || undefined,
                property_id: propertyId || undefined,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return NextResponse.json(
                { error: err.detail || 'Failed to create annotation' },
                { status: res.status }
            );
        }

        return NextResponse.json(await res.json());
    } catch (err) {
        console.error('Create annotation error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PUT /api/annotations?id={id} — Update an annotation
 * Body: { date?, category?, title?, description?, color?, url?, propertyId? }
 */
export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id parameter required' }, { status: 400 });
        }

        const body = await req.json();

        const res = await fetch(
            `${ADMIN_API_URL}/api/annotations/${encodeURIComponent(id)}?user_identifier=${encodeURIComponent(session.user.id)}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY,
                },
                body: JSON.stringify({
                    date: body.date || undefined,
                    category: body.category || undefined,
                    title: body.title || undefined,
                    description: body.description ?? undefined,
                    color: body.color ?? undefined,
                    url: body.url ?? undefined,
                    property_id: body.propertyId ?? undefined,
                }),
            }
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return NextResponse.json(
                { error: err.detail || 'Failed to update annotation' },
                { status: res.status }
            );
        }

        return NextResponse.json(await res.json());
    } catch (err) {
        console.error('Update annotation error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/annotations?id={id} — Delete an annotation
 */
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions) as Session;
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id parameter required' }, { status: 400 });
        }

        const res = await fetch(
            `${ADMIN_API_URL}/api/annotations/${encodeURIComponent(id)}?user_identifier=${encodeURIComponent(session.user.id)}`,
            {
                method: 'DELETE',
                headers: { 'X-API-Key': ADMIN_API_KEY },
            }
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return NextResponse.json(
                { error: err.detail || 'Failed to delete annotation' },
                { status: res.status }
            );
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Delete annotation error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
