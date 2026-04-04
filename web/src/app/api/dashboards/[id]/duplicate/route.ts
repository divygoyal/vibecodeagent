import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

/**
 * POST /api/dashboards/[id]/duplicate — Clone a dashboard
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

    const res = await fetch(`${ADMIN_API_URL}/api/custom-dashboards/${id}/duplicate`, {
      method: 'POST',
      headers: { 'X-API-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_identifier: userId }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Admin API duplicate dashboard error:', res.status, errText);
      return NextResponse.json({ error: 'Failed to duplicate dashboard' }, { status: res.status });
    }

    const dashboard = await res.json();
    return NextResponse.json({ dashboard });
  } catch (err) {
    console.error('Duplicate dashboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
