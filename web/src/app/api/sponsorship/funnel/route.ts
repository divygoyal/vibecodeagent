/**
 * GET  /api/sponsorship/funnel?token=<superadmin>&days=30   read the gate
 * PATCH /api/sponsorship/funnel?token=<superadmin>          advance one item
 *
 * The whole 30-day experiment has one pass condition — 3 paid sponsorships at
 * any price — and this route is where it is read. It exists from the first
 * deploy rather than being added later, because a demand test you cannot
 * measure is not a test.
 *
 * PATCH is how a deal gets marked paid. Fulfilment is manual (the operator
 * invoices by hand and the publisher places the creative themselves), so the
 * status transition is a human action, not a webhook. Body:
 *
 *     { "itemId": 12, "status": "paid", "paidAmountCents": 4500, "note": "..." }
 *
 * Guarded by the existing superadmin HMAC token, same as `/api/superadmin`.
 */

import { NextResponse } from 'next/server';
import { verifySuperadminToken } from '@/lib/superadminToken';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    if (!verifySuperadminToken(searchParams.get('token') || '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const days = Number(searchParams.get('days') || '30');
    const withRequests = searchParams.get('requests') === '1';

    try {
        const [funnelRes, requestsRes] = await Promise.all([
            fetch(`${ADMIN_API_URL}/api/sponsorship/funnel?days=${Number.isFinite(days) ? days : 30}`, {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
                signal: AbortSignal.timeout(10_000),
            }),
            withRequests
                ? fetch(`${ADMIN_API_URL}/api/sponsorship/requests?limit=200`, {
                      headers: { 'X-API-Key': ADMIN_API_KEY },
                      cache: 'no-store',
                      signal: AbortSignal.timeout(10_000),
                  })
                : Promise.resolve(null),
        ]);

        if (!funnelRes.ok) throw new Error(`Admin API returned ${funnelRes.status}`);
        const funnel = await funnelRes.json();
        const requests = requestsRes?.ok ? await requestsRes.json() : null;
        return NextResponse.json({ funnel, ...(requests ? { requests: requests.requests } : {}) });
    } catch (err) {
        console.error('[sponsorship] funnel read failed', err);
        return NextResponse.json({ error: 'Could not load the funnel' }, { status: 502 });
    }
}

export async function PATCH(req: Request) {
    const { searchParams } = new URL(req.url);
    let body: { itemId?: unknown; status?: unknown; paidAmountCents?: unknown; note?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const token = searchParams.get('token') || '';
    if (!verifySuperadminToken(token)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const itemId = Number(body.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
        return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {};
    if (typeof body.status === 'string') payload.status = body.status;
    if (typeof body.paidAmountCents === 'number' && Number.isFinite(body.paidAmountCents)) {
        payload.paid_amount_cents = Math.round(body.paidAmountCents);
    }
    if (typeof body.note === 'string') payload.operator_note = body.note.slice(0, 2000);
    if (Object.keys(payload).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    try {
        const res = await fetch(`${ADMIN_API_URL}/api/sponsorship/request-items/${itemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10_000),
        });
        const text = await res.text();
        let data: unknown;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            return NextResponse.json({ error: 'Admin API returned an invalid response' }, { status: 502 });
        }
        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error('[sponsorship] item update failed', err);
        return NextResponse.json({ error: 'Could not update that item' }, { status: 502 });
    }
}
