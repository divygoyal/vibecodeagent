import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { refreshEntry } from '@/lib/leaderboard/refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
// Entries refreshed in parallel. Each is a different GA4 property, so this stays far
// under the per-property limit (10 concurrent) while keeping the daily run short.
const CONCURRENCY = 3;

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

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RefreshListEntry {
    user_id: number;
    entry_id: number;
    ga_property_id: string | null;
    website_url: string | null;
    access_token: string;
    refresh_token: string | null;
    gsc_site_url?: string | null;
}

/**
 * Daily refresh. For every active, unpaused listing: re-check Search Console
 * ownership (and the GA4 stream), pull GA4 + Search Console numbers for 7d / 28d / 3m
 * and the daily series, and refresh the audience breakdowns. Works unchanged in demo
 * mode (TC_DEMO_DATA=1), where Google is answered by the demo generator.
 */
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
            signal: AbortSignal.timeout(15_000),
        });
        if (!refreshRes.ok) {
            console.error('[CRON] Failed to get refresh list:', await refreshRes.text());
            return NextResponse.json({ error: 'Failed to get refresh list' }, { status: 500 });
        }

        const { entries, total } = (await refreshRes.json()) as { entries: RefreshListEntry[]; total: number };
        console.log(`[CRON] Refreshing ${total} leaderboard entries`);

        const demo = process.env.TC_DEMO_DATA === '1';
        const counts = { successCount: 0, failCount: 0, ownerCount: 0, ga4OnlyCount: 0, unverifiedCount: 0, checkFailedCount: 0, audienceCount: 0 };
        let next = 0;

        const worker = async () => {
            while (next < entries.length) {
                const entry = entries[next++];
                if (!entry.ga_property_id) {
                    console.log(`[CRON] Skipping entry ${entry.entry_id}: no GA property ID`);
                    counts.failCount++;
                    continue;
                }
                try {
                    const result = await refreshEntry({
                        entryId: entry.entry_id,
                        gaPropertyId: entry.ga_property_id,
                        websiteUrl: entry.website_url,
                        accessToken: entry.access_token,
                        refreshToken: entry.refresh_token || undefined,
                        gscSiteUrl: entry.gsc_site_url ?? null,
                    });
                    if (result.ok) counts.successCount++;
                    else counts.failCount++;
                    if (result.audience) counts.audienceCount++;
                    const v = result.verification;
                    if (v?.transient) counts.checkFailedCount++;
                    else if (v?.level === 'owner') counts.ownerCount++;
                    else if (v?.level === 'ga4') counts.ga4OnlyCount++;
                    else if (v) counts.unverifiedCount++;
                    console.log(
                        `[CRON] ${result.ok ? '✓' : '✗'} entry ${entry.entry_id}: ${v ? v.level : 'unchecked'}, ${result.days} days${result.gsc ? ', GSC' : ''}${result.error ? `, ${result.error}` : ''}`,
                    );
                } catch (err) {
                    counts.failCount++;
                    console.error(`[CRON] ✗ Error processing entry ${entry.entry_id}:`, err);
                }
                // Jitter so a big run does not burst Google quota. Skipped in demo mode.
                if (!demo) await sleep(Math.floor(Math.random() * 1500));
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));

        const summary = { success: true, timestamp, total, ...counts };
        console.log('[CRON] Leaderboard refresh complete:', summary);
        return NextResponse.json(summary);
    } catch (err) {
        console.error('[CRON] Leaderboard refresh error:', err);
        return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
    }
}
