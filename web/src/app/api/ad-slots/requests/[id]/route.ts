/**
 * PATCH /api/ad-slots/requests/[id] — publisher moves a request along the
 * pipeline: new -> accepted -> paid (or declined / cancelled).
 *
 * This is how a real closed deal gets counted: admin stamps `paid_at` when the
 * status becomes 'paid'. Fulfilment and payment happen off-platform.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['new', 'accepted', 'declined', 'paid', 'cancelled']);

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as { id?: string | number })?.id;
    if (!userId) {
        return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    const { id } = await params;
    const requestId = Number(id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
        return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
    }

    let body: { status?: string; publisher_note?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (body.status !== undefined && !VALID_STATUSES.has(String(body.status))) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    try {
        const search = new URLSearchParams({ user_identifier: String(userId) });
        const res = await fetch(`${ADMIN_API_URL}/api/ad-slot-requests/${requestId}?${search}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify({
                ...(body.status !== undefined ? { status: body.status } : {}),
                ...(body.publisher_note !== undefined
                    ? { publisher_note: String(body.publisher_note).slice(0, 2000) }
                    : {}),
            }),
            signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        try {
            return NextResponse.json(JSON.parse(text), { status: res.status });
        } catch {
            return NextResponse.json({ error: 'Admin API returned invalid response' }, { status: 502 });
        }
    } catch (err) {
        console.error('[ad-slot-requests] status update failed:', err);
        return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
    }
}
