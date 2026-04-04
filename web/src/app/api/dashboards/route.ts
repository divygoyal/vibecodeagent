import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

/**
 * GET /api/dashboards — List current user's custom dashboards
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const res = await fetch(
      `${ADMIN_API_URL}/api/custom-dashboards?user_identifier=${userId}`,
      { headers: { 'X-API-Key': ADMIN_API_KEY } },
    );

    if (!res.ok) {
      console.error('Admin API list dashboards error:', res.status, await res.text());
      return NextResponse.json({ dashboards: [] });
    }

    const data = await res.json();
    return NextResponse.json({ dashboards: Array.isArray(data) ? data : data.dashboards || [] });
  } catch (err) {
    console.error('List dashboards error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/dashboards — Create a new custom dashboard
 * Body: { name, description?, propertyId, siteUrl?, widgets, gridLayouts, theme, isTemplate? }
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, propertyId, siteUrl, widgets, gridLayouts, theme, isTemplate } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!propertyId || typeof propertyId !== 'string') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const userId = session.user.id;

    const res = await fetch(`${ADMIN_API_URL}/api/custom-dashboards`, {
      method: 'POST',
      headers: { 'X-API-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_identifier: userId,
        name,
        description: description || '',
        property_id: propertyId,
        site_url: siteUrl || '',
        widgets: widgets || [],
        grid_layouts: gridLayouts || { lg: [], md: [], sm: [] },
        theme: theme || {},
        is_template: isTemplate || false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Admin API create dashboard error:', res.status, errText);
      return NextResponse.json({ error: 'Failed to create dashboard' }, { status: res.status });
    }

    const dashboard = await res.json();
    return NextResponse.json({ dashboard });
  } catch (err) {
    console.error('Create dashboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
