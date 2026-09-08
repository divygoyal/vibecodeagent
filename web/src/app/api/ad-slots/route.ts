/**
 * Publisher-owned ad slots for one leaderboard entry.
 *
 *   GET  /api/ad-slots?entry_id=N   — the owner's slots (including paused)
 *   PUT  /api/ad-slots              — replace the entry's slot set
 *
 * Ownership is enforced on the admin side by passing the session user as
 * `user_identifier`; a 403 comes back if the entry belongs to someone else.
 *
 * No price is computed here. `price_cents` is passed through exactly as the
 * publisher entered it.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isBlockedUrl } from '@/lib/urlValidation';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

type SessionUser = { id?: string | number } | undefined;

async function requireUserId(): Promise<{ userId: string } | { error: NextResponse }> {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    const userId = (session.user as SessionUser)?.id;
    if (!userId) {
        return { error: NextResponse.json({ error: 'User ID not found' }, { status: 400 }) };
    }
    return { userId: String(userId) };
}

export async function GET(req: Request) {
    const auth = await requireUserId();
    if ('error' in auth) return auth.error;

    const entryId = Number(new URL(req.url).searchParams.get('entry_id'));
    if (!Number.isFinite(entryId) || entryId <= 0) {
        return NextResponse.json({ error: 'entry_id query param is required' }, { status: 400 });
    }

    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/ad-slots/entry/${entryId}?include_paused=true`,
            { headers: { 'X-API-Key': ADMIN_API_KEY }, signal: AbortSignal.timeout(10000), cache: 'no-store' },
        );
        const text = await res.text();
        try {
            return NextResponse.json(JSON.parse(text), { status: res.status });
        } catch {
            return NextResponse.json({ slots: [] });
        }
    } catch (err) {
        console.error('[ad-slots] list failed:', err);
        return NextResponse.json({ slots: [] });
    }
}

type SlotBody = {
    id?: number;
    name?: string;
    price_cents?: number;
    billing_period?: string;
    quantity_total?: number;
    quantity_taken?: number;
    preview_image_url?: string | null;
    preview_note?: string | null;
    is_active?: boolean;
};

const VALID_PERIODS = new Set(['month', 'week', 'newsletter_send', 'one_off']);

/**
 * Normalize one inbound slot. The only arithmetic is clamping — the price is
 * taken verbatim from the client, which took it verbatim from the publisher.
 */
function normalizeSlot(raw: SlotBody): Record<string, unknown> | { error: string } {
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : '';
    if (!name) return { error: 'Every ad slot needs a name.' };

    const priceCents = Number(raw.price_cents);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
        return { error: `Invalid price for "${name}".` };
    }

    const previewUrl = typeof raw.preview_image_url === 'string' ? raw.preview_image_url.trim() : '';
    if (previewUrl) {
        const withScheme = /^https?:\/\//i.test(previewUrl) ? previewUrl : `https://${previewUrl}`;
        if (isBlockedUrl(withScheme)) {
            return { error: `Preview image URL for "${name}" must be a public http(s) URL.` };
        }
    }

    const total = Math.min(Math.max(Math.trunc(Number(raw.quantity_total) || 1), 1), 999);
    const taken = Math.min(Math.max(Math.trunc(Number(raw.quantity_taken) || 0), 0), total);

    return {
        ...(Number.isFinite(Number(raw.id)) && Number(raw.id) > 0 ? { id: Number(raw.id) } : {}),
        name,
        price_cents: Math.min(Math.round(priceCents), 100_000_000),
        billing_period: VALID_PERIODS.has(String(raw.billing_period)) ? raw.billing_period : 'month',
        quantity_total: total,
        quantity_taken: taken,
        preview_image_url: previewUrl
            ? (/^https?:\/\//i.test(previewUrl) ? previewUrl : `https://${previewUrl}`).slice(0, 500)
            : null,
        preview_note: typeof raw.preview_note === 'string' ? raw.preview_note.trim().slice(0, 500) || null : null,
        is_active: raw.is_active !== false,
    };
}

export async function PUT(req: Request) {
    const auth = await requireUserId();
    if ('error' in auth) return auth.error;

    let body: { entry_id?: number; slots?: SlotBody[] };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const entryId = Number(body.entry_id);
    if (!Number.isFinite(entryId) || entryId <= 0) {
        return NextResponse.json({ error: 'entry_id is required' }, { status: 400 });
    }

    const incoming = Array.isArray(body.slots) ? body.slots : [];
    if (incoming.length > 20) {
        return NextResponse.json({ error: 'A site can list at most 20 ad slots.' }, { status: 400 });
    }

    const slots: Record<string, unknown>[] = [];
    for (const raw of incoming) {
        const normalized = normalizeSlot(raw);
        if ('error' in normalized) {
            return NextResponse.json({ error: normalized.error }, { status: 400 });
        }
        slots.push(normalized);
    }

    try {
        const params = new URLSearchParams({ user_identifier: auth.userId });
        const res = await fetch(`${ADMIN_API_URL}/api/ad-slots/entry/${entryId}?${params}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            body: JSON.stringify({ slots }),
            signal: AbortSignal.timeout(15000),
        });
        const text = await res.text();
        let data: unknown;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            console.error('[ad-slots] admin returned non-JSON:', res.status, text.slice(0, 300));
            return NextResponse.json({ error: 'Could not save ad slots right now.' }, { status: 502 });
        }
        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error('[ad-slots] sync failed:', err);
        return NextResponse.json({ error: 'Failed to save ad slots' }, { status: 500 });
    }
}
