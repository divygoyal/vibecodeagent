/**
 * Buyer requests for a specific ad slot.
 *
 *   POST /api/ad-slots/requests  — public: a buyer asks for ONE slot
 *   GET  /api/ad-slots/requests  — session: the publisher's inbox
 *
 * Fulfilment is manual. This records the ask, snapshots the price as listed at
 * that moment (done server-side in admin, from the stored slot — the buyer
 * cannot send a price), and emails both parties. No payments, no escrow, no ad
 * server, no tag. Nothing here computes or suggests a price.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sendSlotRequestEmails } from '@/lib/leaderboard/notify';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public endpoint — throttle per IP so the publisher's inbox can't be flooded.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 10;
const rateStore = new Map<string, number[]>();

function checkRate(key: string): boolean {
    const now = Date.now();
    const recent = (rateStore.get(key) || []).filter((t) => t > now - RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX) {
        rateStore.set(key, recent);
        return false;
    }
    recent.push(now);
    rateStore.set(key, recent);
    return true;
}

function clientIp(req: Request): string {
    const fwd = req.headers.get('x-forwarded-for') || '';
    return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

type AdminRequestResponse = {
    success?: boolean;
    error?: string;
    detail?: string;
    request?: {
        id: number;
        slot_name_at_request: string | null;
        price_cents_at_request: number;
        billing_period_at_request: string | null;
        buyer_email: string;
        buyer_name: string | null;
        message: string | null;
    };
    publisher?: {
        startup_name: string;
        contact_email: string | null;
        founder_name: string | null;
        slug: string | null;
    };
};

export async function POST(req: Request) {
    if (!checkRate(clientIp(req))) {
        return NextResponse.json(
            { error: 'Too many requests from this network. Try again later.' },
            { status: 429 },
        );
    }

    let body: { slot_id?: number; buyer_email?: string; buyer_name?: string; message?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const slotId = Number(body.slot_id);
    if (!Number.isFinite(slotId) || slotId <= 0) {
        return NextResponse.json({ error: 'Pick a specific ad slot to request.' }, { status: 400 });
    }

    const buyerEmail = String(body.buyer_email || '').trim();
    if (!EMAIL_RE.test(buyerEmail)) {
        return NextResponse.json({ error: 'Enter a valid email so the publisher can reply.' }, { status: 400 });
    }

    const buyerName = String(body.buyer_name || '').trim().slice(0, 120);
    const message = String(body.message || '').trim().slice(0, 2000);

    let data: AdminRequestResponse;
    let upstreamStatus = 200;
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/ad-slot-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify({
                slot_id: slotId,
                buyer_email: buyerEmail,
                buyer_name: buyerName || null,
                message: message || null,
            }),
            signal: AbortSignal.timeout(15000),
        });
        upstreamStatus = res.status;
        const text = await res.text();
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            console.error('[ad-slot-requests] admin returned non-JSON:', res.status, text.slice(0, 300));
            return NextResponse.json({ error: 'Could not send your request right now.' }, { status: 502 });
        }
    } catch (err) {
        console.error('[ad-slot-requests] create failed:', err);
        return NextResponse.json({ error: 'Failed to send request' }, { status: 500 });
    }

    if (upstreamStatus >= 400 || !data.success) {
        return NextResponse.json(
            { error: data.error || data.detail || 'Could not send your request.' },
            { status: upstreamStatus >= 400 ? upstreamStatus : 502 },
        );
    }

    // Notify both parties (best effort; see lib/leaderboard/notify.ts).
    const record = data.request;
    const publisher = data.publisher;
    if (record && publisher) {
        sendSlotRequestEmails({
            slotName: record.slot_name_at_request || 'an ad slot',
            priceCents: record.price_cents_at_request,
            billingPeriod: record.billing_period_at_request,
            buyerName,
            buyerEmail,
            message,
            publisher: {
                startup_name: publisher.startup_name,
                contact_email: publisher.contact_email,
                founder_name: publisher.founder_name,
                slug: publisher.slug,
            },
        });
    }

    return NextResponse.json({ success: true, request: record });
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as { id?: string | number })?.id;
    if (!userId) {
        return NextResponse.json({ requests: [], paid_count: 0, paid_cents: 0 });
    }

    try {
        const res = await fetch(`${ADMIN_API_URL}/api/ad-slot-requests/${encodeURIComponent(String(userId))}`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(10000),
            cache: 'no-store',
        });
        const text = await res.text();
        try {
            return NextResponse.json(JSON.parse(text), { status: res.status });
        } catch {
            return NextResponse.json({ requests: [], paid_count: 0, paid_cents: 0 });
        }
    } catch (err) {
        console.error('[ad-slot-requests] list failed:', err);
        return NextResponse.json({ requests: [], paid_count: 0, paid_cents: 0 });
    }
}
