import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/**
 * GET /api/dashboards/public/[token] — Public view of a shared dashboard (no auth required)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!token || typeof token !== 'string' || token.length < 32) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const res = await fetch(
      `${ADMIN_API_URL}/api/custom-dashboards/public/${token}`,
      { headers: { 'X-API-Key': ADMIN_API_KEY } },
    );

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'Dashboard not found or not shared' }, { status: 404 });
      }
      console.error('Admin API public dashboard error:', res.status, await res.text());
      return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: res.status });
    }

    const dashboard = await res.json();
    const publicDashboard = { ...dashboard };
    delete publicDashboard.ownerIdentifier;
    delete publicDashboard.userId;
    return NextResponse.json({ dashboard: publicDashboard });
  } catch (err) {
    console.error('Public dashboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
