import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getValidAccessToken } from '@/lib/googleApi';
import { verifyPropertyDomain } from '@/lib/leaderboardVerify';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

// Country lookups: GA4 returns full country names. Map a small set to ISO-2 for the country filter.
const COUNTRY_TO_ISO2: Record<string, string> = {
    'United States': 'US', 'United Kingdom': 'GB', 'India': 'IN', 'Canada': 'CA',
    'Germany': 'DE', 'France': 'FR', 'Australia': 'AU', 'Brazil': 'BR',
    'Japan': 'JP', 'Spain': 'ES', 'Italy': 'IT', 'Netherlands': 'NL',
    'Mexico': 'MX', 'Indonesia': 'ID', 'Pakistan': 'PK', 'Bangladesh': 'BD',
    'Nigeria': 'NG', 'South Africa': 'ZA', 'Vietnam': 'VN', 'Philippines': 'PH',
    'Singapore': 'SG', 'Sweden': 'SE', 'Norway': 'NO', 'Poland': 'PL',
    'Ukraine': 'UA', 'Russia': 'RU', 'Turkey': 'TR', 'Argentina': 'AR',
};

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

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(input: string, init: RequestInit): Promise<Response> {
    const first = await fetch(input, init);
    if (first.ok || first.status < 500) return first;
    await sleep(500);
    return fetch(input, init);
}

type LeaderboardStats = {
    monthly_visitors: number;
    monthly_pageviews: number;
    engagement_rate: number;
    bounce_rate: number;
    avg_session_duration: number;
    visitor_trend: number;
    primary_country?: string;
};

async function fetchLeaderboardStats(token: string, propertyId: string): Promise<LeaderboardStats> {
    const pid = cleanPropertyId(propertyId);

    const [currentRes, prevRes, countryRes] = await Promise.all([
        fetchWithRetry(`${GA_DATA_BASE}/${pid}:runReport`, {
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
        fetchWithRetry(`${GA_DATA_BASE}/${pid}:runReport`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dateRanges: [{ startDate: '56daysAgo', endDate: '29daysAgo' }],
                metrics: [{ name: 'activeUsers' }],
            }),
            signal: AbortSignal.timeout(15000),
        }),
        fetchWithRetry(`${GA_DATA_BASE}/${pid}:runReport`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
                dimensions: [{ name: 'country' }],
                metrics: [{ name: 'activeUsers' }],
                orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
                limit: 1,
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
    const countryData = countryRes.ok ? await countryRes.json() : null;

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

    const topCountryName: string | undefined = countryData?.rows?.[0]?.dimensionValues?.[0]?.value;
    const primaryCountry = topCountryName ? COUNTRY_TO_ISO2[topCountryName] : undefined;

    return {
        monthly_visitors: currentUsers,
        monthly_pageviews: parseInt(mv[1].value) || 0,
        engagement_rate: +((parseFloat(mv[2].value) || 0) * 100).toFixed(1),
        bounce_rate: +((parseFloat(mv[3].value) || 0) * 100).toFixed(1),
        avg_session_duration: Math.round(parseFloat(mv[4].value) || 0),
        visitor_trend: trend,
        primary_country: primaryCountry,
    };
}

export async function GET(req: NextRequest) {
    if (!verifyCronSecret(req.headers.get('authorization'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const timestamp = new Date().toISOString();
    console.log(`[CRON] Leaderboard refresh job started at ${timestamp}`);

    try {
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
        let verifiedCount = 0;
        let mismatchCount = 0;

        for (const entry of entries) {
            try {
                if (!entry.ga_property_id) {
                    console.log(`[CRON] Skipping entry ${entry.entry_id}: no GA property ID`);
                    failCount++;
                    continue;
                }

                const token = await getValidAccessToken(entry.access_token, entry.refresh_token);

                const stats = await fetchLeaderboardStats(token, entry.ga_property_id);

                // Recheck domain ownership while we already have a token + property handle.
                let verificationStatus: string | undefined;
                let verifiedHost: string | undefined;
                if (entry.website_url) {
                    try {
                        const verify = await verifyPropertyDomain(
                            entry.ga_property_id,
                            entry.website_url,
                            entry.access_token,
                            entry.refresh_token,
                        );
                        verificationStatus = verify.status;
                        if (verify.ok) {
                            verifiedHost = verify.matchedHost;
                            verifiedCount++;
                        } else if (verify.status === 'host_mismatch' || verify.status === 'no_web_stream') {
                            mismatchCount++;
                        }
                    } catch (verifyErr) {
                        console.warn(`[CRON] Verification recheck failed for entry ${entry.entry_id}:`, verifyErr);
                    }
                }

                const patchBody: Record<string, unknown> = { ...stats };
                if (verificationStatus) patchBody.verification_status = verificationStatus;
                if (verifiedHost) patchBody.verified_host = verifiedHost;

                const updateRes = await fetchWithRetry(
                    `${ADMIN_API_URL}/api/leaderboard/${entry.entry_id}/stats`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
                        body: JSON.stringify(patchBody),
                    },
                );

                if (updateRes.ok) {
                    successCount++;
                    console.log(`[CRON] ✓ Updated entry ${entry.entry_id}: ${stats.monthly_visitors} visitors${stats.primary_country ? ` (${stats.primary_country})` : ''}${verificationStatus ? `, ${verificationStatus}` : ''}`);
                } else {
                    failCount++;
                    console.error(`[CRON] ✗ Failed to update entry ${entry.entry_id}: ${updateRes.status}`);
                }

                // Jitter between entries so we don't burst GA4 quota.
                await sleep(Math.floor(Math.random() * 2000));
            } catch (err) {
                failCount++;
                console.error(`[CRON] ✗ Error processing entry ${entry.entry_id}:`, err);
            }
        }

        const summary = {
            success: true,
            timestamp,
            total,
            successCount,
            failCount,
            verifiedCount,
            mismatchCount,
        };
        console.log(`[CRON] Leaderboard refresh complete:`, summary);
        return NextResponse.json(summary);
    } catch (err) {
        console.error('[CRON] Leaderboard refresh error:', err);
        return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
    }
}
