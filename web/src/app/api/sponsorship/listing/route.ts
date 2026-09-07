/**
 * Publisher-side pricing control for one leaderboard entry.
 *
 *   GET  /api/sponsorship/listing?entry_id=N   read my override (if any)
 *   PUT  /api/sponsorship/listing              set price / floor / availability
 *
 * Auth follows the existing leaderboard pattern exactly: next-auth session in
 * the web layer, `user_identifier` forwarded to the admin API, which proves
 * ownership of the entry before writing (`_resolve_user_entry`). The browser
 * never holds the admin key.
 *
 * The important contract: NOT having a row is the normal state and means "use
 * the computed price". `price_cents: null` therefore has to be a settable
 * value, not an omission — a publisher clearing the field is asking to go back
 * to the suggestion, which is different from never having set one.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

/** Sanity bound on a monthly sponsorship price: $0-$1,000,000. */
const MAX_PRICE_CENTS = 100_000_000;

async function resolveUserId(): Promise<string | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    // @ts-expect-error - id added in next-auth callbacks
    const userId = session.user.id;
    return userId ? String(userId) : null;
}

export async function GET(req: Request) {
    const userId = await resolveUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const entryId = Number(new URL(req.url).searchParams.get('entry_id'));
    if (!Number.isInteger(entryId) || entryId <= 0) {
        return NextResponse.json({ error: 'entry_id is required' }, { status: 400 });
    }

    try {
        const params = new URLSearchParams({ user_identifier: userId });
        const res = await fetch(
            `${ADMIN_API_URL}/api/sponsorship/listing/${entryId}?${params}`,
            { headers: { 'X-API-Key': ADMIN_API_KEY }, cache: 'no-store', signal: AbortSignal.timeout(10_000) },
        );
        if (res.status === 404) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }
        if (!res.ok) throw new Error(`Admin API returned ${res.status}`);
        return NextResponse.json(await res.json());
    } catch (err) {
        console.error('[sponsorship] listing read failed', err);
        return NextResponse.json({ error: 'Could not load your pricing' }, { status: 502 });
    }
}

interface ListingBody {
    entry_id?: unknown;
    /** null is meaningful: "go back to the computed suggestion". */
    price_cents?: unknown;
    floor_cents?: unknown;
    accepting_requests?: unknown;
    placement_note?: unknown;
    /** What the model suggested when the publisher hit save, for later
     *  comparison against what they actually chose. */
    auto_price_cents_at_save?: unknown;
}

function normalizeCents(value: unknown): number | null | undefined {
    if (value === null) return null;
    if (value === undefined) return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE_CENTS) return undefined;
    return Math.round(n) || null;
}

export async function PUT(req: Request) {
    const userId = await resolveUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: ListingBody;
    try {
        body = (await req.json()) as ListingBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const entryId = Number(body.entry_id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
        return NextResponse.json({ error: 'entry_id is required' }, { status: 400 });
    }

    // Only forward keys the caller actually sent, so a partial save cannot
    // blank out a field the form did not render.
    const payload: Record<string, unknown> = {};
    if ('price_cents' in body) {
        const v = normalizeCents(body.price_cents);
        if (v !== undefined) payload.price_cents = v;
    }
    if ('floor_cents' in body) {
        const v = normalizeCents(body.floor_cents);
        if (v !== undefined) payload.floor_cents = v;
    }
    if ('auto_price_cents_at_save' in body) {
        const v = normalizeCents(body.auto_price_cents_at_save);
        if (v !== undefined) payload.auto_price_cents_at_save = v;
    }
    if (typeof body.accepting_requests === 'boolean') {
        payload.accepting_requests = body.accepting_requests;
    }
    if (typeof body.placement_note === 'string') {
        payload.placement_note = body.placement_note.trim().slice(0, 500);
    }

    if (Object.keys(payload).length === 0) {
        return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    if (
        typeof payload.price_cents === 'number' &&
        typeof payload.floor_cents === 'number' &&
        payload.floor_cents > payload.price_cents
    ) {
        return NextResponse.json(
            { error: 'Your minimum cannot be higher than your asking price.' },
            { status: 400 },
        );
    }

    try {
        const params = new URLSearchParams({ user_identifier: userId });
        const res = await fetch(`${ADMIN_API_URL}/api/sponsorship/listing/${entryId}?${params}`, {
            method: 'PUT',
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
        console.error('[sponsorship] listing write failed', err);
        return NextResponse.json({ error: 'Could not save your pricing' }, { status: 502 });
    }
}
