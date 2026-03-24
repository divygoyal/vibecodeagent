import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getValidAccessToken } from '@/lib/googleApi';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

function verifyCronSecret(header: string | null): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || !header) return false;
    const expected = `Bearer ${secret}`;
    const maxLen = Math.max(header.length, expected.length);
    const a = Buffer.alloc(maxLen);
    const b = Buffer.alloc(maxLen);
    Buffer.from(header).copy(a);
    Buffer.from(expected).copy(b);
    return header.length === expected.length && timingSafeEqual(a, b);
}

function cleanPropertyId(id: string): string {
    if (!id.startsWith('properties/') && /^\d+$/.test(id)) {
        return `properties/${id}`;
    }
    return id;
}

/**
 * Fetch 30-day GA4 stats for a single property (lightweight query for leaderboard).
 */
async function fetchLeaderboardStats(token: string, propertyId: string) {
    const pid = cleanPropertyId(propertyId);

    // Run current month + previous month in parallel
    const [currentRes, prevRes] = await Promise.all([
        fetch(`${GA_DATA_BASE}/${pid}:runReport`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
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
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                dateRanges: [{ startDate: '56daysAgo', endDate: '29daysAgo' }],
                metrics: [{ name: 'activeUsers' }],
            }),
            signal: AbortSignal.timeout(15000),
        }),
    ]);

    if (!currentRes.ok) {
        const err = await currentRes.text();
        throw new Error(`GA4 API error ${currentRes.status}: ${err}`);
    }

    const currentData = await currentRes.json();
    const prevData = prevRes.ok ? await prevRes.json() : null;

    const row = currentData.rows?.[0];
    if (!row) {
        return {
            monthly_visitors: 0,
            monthly_pageviews: 0,
            engagement_rate: 0,
            bounce_rate: 0,
            avg_session_duration: 0,
            visitor_trend: 0,
        };
    }

    const mv = row.metricValues;
    const currentUsers = parseInt(mv[0].value) || 0;
    const prevUsers = prevData?.rows?.[0]?.metricValues?.[0]?.value
        ? parseInt(prevData.rows[0].metricValues[0].value)
        : 0;

    const trend = prevUsers > 0
        ? +((currentUsers - prevUsers) / prevUsers * 100).toFixed(1)
        : 0;

    return {
        monthly_visitors: currentUsers,
        monthly_pageviews: parseInt(mv[1].value) || 0,
        engagement_rate: +((parseFloat(mv[2].value) || 0) * 100).toFixed(1),
        bounce_rate: +((parseFloat(mv[3].value) || 0) * 100).toFixed(1),
        avg_session_duration: Math.round(parseFloat(mv[4].value) || 0),
        visitor_trend: trend,
    };
}

export async function GET(req: NextRequest) {
    // Allow both cron secret and admin API key for manual triggering
    if (!verifyCronSecret(req.headers.get('authorization'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const timestamp = new Date().toISOString();
    console.log(`[CRON] Leaderboard refresh job started at ${timestamp}`);

    try {
        // 1. Get all active leaderboard entries with their OAuth tokens
        const refreshRes = await fetch(`${ADMIN_API_URL}/api/leaderboard/refresh`, {
            method: 'POST',
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(10000),
        });

        if (!refreshRes.ok) {
            console.error('[CRON] Failed to get refresh list:', await refreshRes.text());
            return NextResponse.json({ error: 'Failed to get refresh list' }, { status: 500 });
        }

        const { entries, total } = await refreshRes.json();
        console.log(`[CRON] Refreshing ${total} leaderboard entries`);

        let successCount = 0;
        let failCount = 0;

        // 2. For each entry, fetch GA4 stats and update
        for (const entry of entries) {
            try {
                if (!entry.ga_property_id) {
                    console.log(`[CRON] Skipping entry ${entry.entry_id}: no GA property ID`);
                    failCount++;
                    continue;
                }

                // Get valid access token (refreshes if needed)
                const token = await getValidAccessToken(
                    entry.access_token,
                    entry.refresh_token
                );

                // Fetch GA4 stats
                const stats = await fetchLeaderboardStats(token, entry.ga_property_id);

                // Update the entry in admin DB
                const updateRes = await fetch(
                    `${ADMIN_API_URL}/api/leaderboard/${entry.entry_id}/stats`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-API-Key': ADMIN_API_KEY,
                        },
                        body: JSON.stringify(stats),
                    }
                );

                if (updateRes.ok) {
                    successCount++;
                    console.log(`[CRON] ✓ Updated entry ${entry.entry_id}: ${stats.monthly_visitors} visitors`);
                } else {
                    failCount++;
                    console.error(`[CRON] ✗ Failed to update entry ${entry.entry_id}`);
                }
            } catch (err) {
                failCount++;
                console.error(`[CRON] ✗ Error processing entry ${entry.entry_id}:`, err);
            }
        }

        console.log(`[CRON] Leaderboard refresh complete: ${successCount} success, ${failCount} failed`);
        return NextResponse.json({
            success: true,
            timestamp,
            total,
            successCount,
            failCount,
        });
    } catch (err) {
        console.error('[CRON] Leaderboard refresh error:', err);
        return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
    }
}
