import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { cachedFetch, CACHE_TTL } from '@/lib/apiCache';
import { getAnalyticsOverviewContext } from '@/lib/analyticsOverviewServer';
import { buildGoalSuggestions } from '@/lib/analyticsSubpageServer';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

type Session = { user?: { id: string } } | null;

export async function GET(req: Request) {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = new URL(req.url).searchParams;
    const propertyId = searchParams.get('propertyId') || '';

    let definitions: unknown[] = [];
    if (ADMIN_API_KEY) {
        const url = `${ADMIN_API_URL}/api/analytics/goals/definitions?user_identifier=${encodeURIComponent(session.user.id)}${propertyId ? `&property_id=${encodeURIComponent(propertyId)}` : ''}`;
        const response = await fetch(url, { headers: { 'X-API-Key': ADMIN_API_KEY } });
        if (response.ok) {
            const body = await response.json();
            definitions = Array.isArray(body) ? body : body.definitions || [];
        }
    }

    let suggestions: unknown[] = [];
    if (propertyId) {
        const context = await getAnalyticsOverviewContext(req);
        if (!context.error && context.accessToken && context.propertyId && context.userId) {
            const range = searchParams.get('range') || '30d';
            suggestions = await cachedFetch(
                `ga:goal-suggestions:${context.userId}:${context.propertyId}:${range}`,
                CACHE_TTL.DASHBOARD_DATA,
                () => buildGoalSuggestions(context.accessToken!, context.propertyId!, range),
            );
        }
    }

    return NextResponse.json({ definitions, suggestions });
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Admin API unavailable' }, { status: 503 });
    }

    const body = await req.json();
    const { propertyId, name, description, type, target } = body as {
        propertyId?: string;
        name?: string;
        description?: string;
        type?: string;
        target?: string;
    };

    if (!propertyId || !name || !type || !target) {
        return NextResponse.json({ error: 'propertyId, name, type, and target are required' }, { status: 400 });
    }

    const response = await fetch(`${ADMIN_API_URL}/api/analytics/goals/definitions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ADMIN_API_KEY,
        },
        body: JSON.stringify({
            user_identifier: session.user.id,
            property_id: propertyId,
            name,
            description: description || '',
            goal_type: type,
            rule_json: JSON.stringify({ target }),
            is_active: true,
        }),
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
        return NextResponse.json({ error: responseBody.detail || responseBody.error || 'Failed to create goal definition' }, { status: response.status });
    }

    return NextResponse.json(responseBody);
}
