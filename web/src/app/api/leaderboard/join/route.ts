import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/googleApi';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

export const dynamic = 'force-dynamic';

function cleanPropertyId(id: string): string {
    if (!id.startsWith('properties/') && /^\d+$/.test(id)) {
        return `properties/${id}`;
    }
    return id;
}

/**
 * Fetch GA4 stats and update the leaderboard entry in the background.
 * This runs fire-and-forget after a successful join so the user sees real data immediately.
 */
async function refreshEntryStats(entryId: number, gaPropertyId: string, userId: number) {
    try {
        // 1. Get the user's OAuth tokens from admin API
        const oauthRes = await fetch(`${ADMIN_API_URL}/api/leaderboard/refresh`, {
            method: 'POST',
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(10000),
        });

        if (!oauthRes.ok) {
            console.error('[Leaderboard Instant] Failed to get refresh list');
            return null;
        }

        const { entries } = await oauthRes.json();
        const entry = entries.find((e: { user_id: number }) => e.user_id === userId);
        if (!entry || !entry.access_token) {
            console.log('[Leaderboard Instant] No OAuth token found for user, skipping stats fetch');
            return null;
        }

        // 2. Get a valid access token
        const token = await getValidAccessToken(entry.access_token, entry.refresh_token);
        const pid = cleanPropertyId(gaPropertyId);

        // 3. Fetch current + previous month stats from GA4
        const [currentRes, prevRes] = await Promise.all([
            fetch(`${GA_DATA_BASE}/${pid}:runReport`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
                    metrics: [
                        { name: 'activeUsers' },
                        { name: 'screenPageViews' },
                        { name: 'engagementRate' },
                        { name: 'bounceRate' },
                        { name: 'averageSessionDuration' },
                    ],
                }),
                signal: AbortSignal.timeout(15000),
            }),
            fetch(`${GA_DATA_BASE}/${pid}:runReport`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRanges: [{ startDate: '56daysAgo', endDate: '29daysAgo' }],
                    metrics: [{ name: 'activeUsers' }],
                }),
                signal: AbortSignal.timeout(15000),
            }),
        ]);

        if (!currentRes.ok) {
            console.error('[Leaderboard Instant] GA4 API error:', await currentRes.text());
            return null;
        }

        const currentData = await currentRes.json();
        const prevData = prevRes.ok ? await prevRes.json() : null;
        const row = currentData.rows?.[0];

        if (!row) {
            console.log('[Leaderboard Instant] No GA4 data found for property');
            return null;
        }

        const mv = row.metricValues;
        const currentUsers = parseInt(mv[0].value) || 0;
        const prevUsers = prevData?.rows?.[0]?.metricValues?.[0]?.value
            ? parseInt(prevData.rows[0].metricValues[0].value)
            : 0;
        const trend = prevUsers > 0
            ? +((currentUsers - prevUsers) / prevUsers * 100).toFixed(1)
            : 0;

        const stats = {
            monthly_visitors: currentUsers,
            monthly_pageviews: parseInt(mv[1].value) || 0,
            engagement_rate: +((parseFloat(mv[2].value) || 0) * 100).toFixed(1),
            bounce_rate: +((parseFloat(mv[3].value) || 0) * 100).toFixed(1),
            avg_session_duration: Math.round(parseFloat(mv[4].value) || 0),
            visitor_trend: trend,
        };

        // 4. Update the entry with real stats
        const updateRes = await fetch(`${ADMIN_API_URL}/api/leaderboard/${entryId}/stats`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify(stats),
        });

        if (updateRes.ok) {
            console.log(`[Leaderboard Instant] ✓ Entry ${entryId} updated: ${stats.monthly_visitors} visitors, ${stats.engagement_rate}% engagement`);
            return stats;
        } else {
            console.error(`[Leaderboard Instant] ✗ Failed to update entry ${entryId}`);
            return stats; // Still return stats even if DB update failed
        }
    } catch (err) {
        console.error('[Leaderboard Instant] Stats refresh failed:', err);
        return null;
    }
}

/**
 * Join the leaderboard (opt-in). Requires authentication.
 */
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;
    if (!userId) {
        return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    try {
        const body = await req.json();

        const adminUrl = `${ADMIN_API_URL}/api/leaderboard/${userId}/join`;
        console.log(`[Leaderboard Join] POST ${adminUrl} for user ${userId}`);

        const res = await fetch(adminUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });

        const responseText = await res.text();
        console.log(`[Leaderboard Join] Admin API response: ${res.status} ${responseText.substring(0, 500)}`);

        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            console.error('[Leaderboard Join] Non-JSON response from admin API:', responseText.substring(0, 200));
            return NextResponse.json({ error: 'Admin API returned non-JSON response', detail: responseText.substring(0, 200) }, { status: 502 });
        }

        if (!res.ok) {
            return NextResponse.json(data, { status: res.status });
        }

        // Fetch GA4 stats synchronously so data is ready instantly
        let stats = null;
        if (data.success && data.id && body.ga_property_id) {
            try {
                stats = await refreshEntryStats(data.id, body.ga_property_id, userId);
            } catch {
                // Stats fetch failed, join still succeeded — stats will be updated by daily cron
                console.log('[Leaderboard Join] Stats fetch failed, will retry via cron');
            }
        }

        return NextResponse.json({ ...data, stats });
    } catch (err) {
        console.error('Leaderboard join error:', err);
        return NextResponse.json({ error: 'Failed to join leaderboard', detail: String(err) }, { status: 500 });
    }
}

/**
 * Get current user's leaderboard status.
 */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;
    if (!userId) {
        return NextResponse.json({ joined: false });
    }

    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${userId}/status`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(10000),
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            console.error('Leaderboard status: non-JSON response:', text.slice(0, 200));
            return NextResponse.json({ joined: false });
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error('Leaderboard status error:', err);
        return NextResponse.json({ joined: false });
    }
}

/**
 * Update leaderboard profile.
 */
export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;

    try {
        const body = await req.json();

        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ADMIN_API_KEY,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            console.error('Leaderboard update: non-JSON response:', text.slice(0, 200));
            return NextResponse.json({ error: 'Admin API returned invalid response' }, { status: 502 });
        }

        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error('Leaderboard update error:', err);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

/**
 * Leave the leaderboard (opt-out).
 */
export async function DELETE() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;

    try {
        const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/${userId}`, {
            method: 'DELETE',
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(10000),
        });

        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch {
            console.error('Leaderboard leave: non-JSON response:', text.slice(0, 200));
            return NextResponse.json({ error: 'Admin API returned invalid response' }, { status: 502 });
        }

        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error('Leaderboard leave error:', err);
        return NextResponse.json({ error: 'Failed to leave leaderboard' }, { status: 500 });
    }
}
