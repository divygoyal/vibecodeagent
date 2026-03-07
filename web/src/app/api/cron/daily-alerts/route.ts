import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

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
    console.log(`[CRON] Daily alerts job executed at ${timestamp}`);

    // Future: iterate all users, compute alerts, send notifications
    return NextResponse.json({ success: true, timestamp });
}
