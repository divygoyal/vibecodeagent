import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

function verifyCronSecret(header: string | null): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || !header) return false;
    const expected = `Bearer ${secret}`;
    if (header.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(req: NextRequest) {
    if (!verifyCronSecret(req.headers.get('authorization'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const timestamp = new Date().toISOString();
    console.log(`[CRON] Weekly digest job started at ${timestamp}`);

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

        for (const user of Array.isArray(users) ? users : []) {
            // Check user notification preferences (stored in their profile or default to enabled)
            const hasEmail = user.email;
            if (!hasEmail) {
                skipped++;
                continue;
            }

            // Build digest content for this user
            const digest = {
                userId: user.id,
                email: user.email,
                name: user.name || 'TrafficClaw User',
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

        console.log(`[CRON] Weekly digest completed: ${processed} sent, ${skipped} skipped`);
        return NextResponse.json({
            success: true,
            timestamp,
            processed,
            skipped,
        });
    } catch (err) {
        console.error('[WEEKLY-DIGEST] Error:', err);
        return NextResponse.json({ success: false, error: 'Digest job failed' }, { status: 500 });
    }
}
