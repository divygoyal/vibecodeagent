import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

/**
 * GET /api/dashboards/[id] — Get a single dashboard by ID
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const res = await fetch(
      `${ADMIN_API_URL}/api/custom-dashboards/${id}?user_identifier=${userId}`,
      { headers: { 'X-API-Key': ADMIN_API_KEY } },
    );

    if (!res.ok) {
      const status = res.status;
      if (status === 404) {
        return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
      }
      console.error('Admin API get dashboard error:', status, await res.text());
      return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status });
    }

    const dashboard = await res.json();
    return NextResponse.json({ dashboard });
  } catch (err) {
    console.error('Get dashboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/dashboards/[id] — Update a dashboard
 * Body: { name?, description?, widgets?, gridLayouts?, theme?, isPublic?, embedEnabled? }
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const userId = session.user.id;

    const res = await fetch(`${ADMIN_API_URL}/api/custom-dashboards/${id}`, {
      method: 'PUT',
      headers: { 'X-API-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_identifier: userId,
        ...body,
        // Map camelCase to snake_case where needed
        grid_layouts: body.gridLayouts,
        is_public: body.isPublic,
        embed_enabled: body.embedEnabled,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Admin API update dashboard error:', res.status, errText);
      return NextResponse.json({ error: 'Failed to update dashboard' }, { status: res.status });
    }

    const dashboard = await res.json();
    return NextResponse.json({ dashboard });
  } catch (err) {
    console.error('Update dashboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboards/[id] — Soft-delete a dashboard
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const res = await fetch(
      `${ADMIN_API_URL}/api/custom-dashboards/${id}?user_identifier=${userId}`,
      {
        method: 'DELETE',
        headers: { 'X-API-Key': ADMIN_API_KEY },
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error('Admin API delete dashboard error:', res.status, errText);
      return NextResponse.json({ error: 'Failed to delete dashboard' }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete dashboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
