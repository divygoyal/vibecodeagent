import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

function verifyCronSecret(header: string | null): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || !header) return false;
    const expected = `Bearer ${secret}`;
    // Pad both buffers to same length to avoid leaking length info via timing
    const maxLen = Math.max(header.length, expected.length);
    const a = Buffer.alloc(maxLen);
    const b = Buffer.alloc(maxLen);
    Buffer.from(header).copy(a);
    Buffer.from(expected).copy(b);
    return header.length === expected.length && timingSafeEqual(a, b);
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
