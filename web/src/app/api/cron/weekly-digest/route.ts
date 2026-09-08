import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getCompletedIsoWeekRange } from '@/lib/chatSnapshot';
import { runWeeklyDigestForUser } from '@/lib/weeklyDigestRunner';
import { BRAND_NAME } from '@/lib/brand';

export const dynamic = 'force-dynamic';
// The snapshot pipeline does a lot of upstream calls (GSC + GA4 + schema + PSI).
// Per-user we Promise.allSettled, but iterating users sequentially can take a
// while on production. Give the route the full Vercel/Coolify max execution
// budget. Defaults are too low if there's >5 users with data.
export const maxDuration = 300;

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

function verifyCronSecret(header: string | null): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || !header) return false;
    const expected = `Bearer ${secret}`;
    if (header.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// ─── Route handler ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    if (!verifyCronSecret(req.headers.get('authorization'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const timestamp = new Date().toISOString();
    console.log(`[CRON] Weekly digest job started at ${timestamp}`);

    // The ISO-week range we're persisting is the same for every user — compute
    // it once. Mon 00:00 UTC → Sun 23:59:59 UTC of the last fully-completed
    // week. If today is Monday this is the Mon-Sun that just ended.
    const range = getCompletedIsoWeekRange(new Date());
    console.log(`[CRON] Weekly digest covering Week ${range.isoWeek} of ${range.year} (${range.startDate.toISOString().slice(0,10)} → ${range.endDate.toISOString().slice(0,10)})`);

    try {
        // Fetch all users from admin API
        const usersRes = await fetch(`${ADMIN_API_URL}/api/users`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            cache: 'no-store',
        });

        if (!usersRes.ok) {
            console.error('[WEEKLY-DIGEST] Failed to fetch users:', usersRes.status);
            return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 });
        }

        const users = await usersRes.json();
        let processed = 0;
        let skipped = 0;
        // Track snapshot+persist outcomes separately from the email step so we
        // can tell at a glance whether the new pipeline is producing rows.
        let snapshotsPersisted = 0;
        let snapshotsFailed = 0;

        for (const user of Array.isArray(users) ? users : []) {
            // Check user notification preferences (stored in their profile or default to enabled)
            const hasEmail = user.email;
            if (!hasEmail) {
                skipped++;
                continue;
            }

            // ── (Wave 2 / Track 1c): build the weekly snapshot, ask Gemini
            //    for headline + action items, persist to admin. Logic lives in
            //    `lib/weeklyDigestRunner.ts` so the superadmin "regenerate
            //    digest" button can invoke the same code path. The runner is
            //    catch-all internally — any failure surfaces in the result and
            //    NEVER throws, so the existing email send below is safe.
            const digestResult = await runWeeklyDigestForUser(user, { range });
            if (digestResult.persisted) {
                snapshotsPersisted++;
            } else {
                snapshotsFailed++;
                if (digestResult.error) {
                    console.error(`[WEEKLY-DIGEST] runner reported error for user.id=${user.id}: ${digestResult.error}`);
                }
            }
            // ── END NEW PIPELINE — existing email flow below is UNCHANGED ──

            // Build digest content for this user
            const digest = {
                userId: user.id,
                email: user.email,
                name: user.name || `${BRAND_NAME} User`,
                timestamp,
                // The actual email sending would be handled by an email service
                // (e.g., Resend, SendGrid, Postmark) integrated in the admin API
                type: 'weekly_digest',
            };

            // Send digest via admin API (admin API would handle actual email delivery)
            try {
                await fetch(`${ADMIN_API_URL}/api/notifications/send`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': ADMIN_API_KEY,
                    },
                    body: JSON.stringify(digest),
                });
                processed++;
            } catch {
                console.error(`[WEEKLY-DIGEST] Failed to send digest to user ${user.id}`);
                skipped++;
            }
        }

        console.log(`[CRON] Weekly digest completed: ${processed} sent, ${skipped} skipped, ${snapshotsPersisted} snapshots persisted, ${snapshotsFailed} snapshot failures`);
        return NextResponse.json({
            success: true,
            timestamp,
            processed,
            skipped,
            // New counters — exposed so cron run logs surface whether Track 1c
            // is producing rows. Doesn't change the legacy { success, processed,
            // skipped } shape that any external monitor might be parsing.
            snapshotsPersisted,
            snapshotsFailed,
            week: { year: range.year, isoWeek: range.isoWeek },
        });
    } catch (err) {
        console.error('[WEEKLY-DIGEST] Error:', err);
        return NextResponse.json({ success: false, error: 'Digest job failed' }, { status: 500 });
    }
}
