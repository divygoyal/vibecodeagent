import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

/**
 * POST /api/dashboards/[id]/share — Generate a public share token
 */
export async function POST(
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

    const res = await fetch(`${ADMIN_API_URL}/api/custom-dashboards/${id}/share`, {
      method: 'POST',
      headers: { 'X-API-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_identifier: userId }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Admin API share dashboard error:', res.status, errText);
      return NextResponse.json({ error: 'Failed to generate share link' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Share dashboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboards/[id]/share — Revoke public share token
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

    const res = await fetch(`${ADMIN_API_URL}/api/custom-dashboards/${id}/share`, {
      method: 'DELETE',
      headers: { 'X-API-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_identifier: userId }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Admin API revoke share error:', res.status, errText);
      return NextResponse.json({ error: 'Failed to revoke share' }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Revoke share error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
