import { NextResponse } from 'next/server';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { resolveEntryId } from '@/lib/leaderboard/live';
import { sendInquiryEmails, sendSlotRequestEmails } from '@/lib/leaderboard/notify';
import { allow, clientIp } from '@/lib/leaderboard/rateLimit';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KINDS = new Set(['sponsorship', 'acquisition', 'partnership']);

interface AdminInquiryResponse {
    success: boolean;
    id: number;
    ad_slot_request_id: number | null;
    slot: { slot_name_at_request: string; price_cents_at_request: number; billing_period_at_request: string } | null;
    publisher: { startup_name: string; slug: string | null; contact_email: string | null; founder_name: string | null };
}

/**
 * POST /api/leaderboard/[id]/inquiry: the "Open to" contact form on a public profile.
 *
 * A sponsorship ask for a specific ad slot goes into the existing ad-slot request
 * pipeline (the admin API also keeps an inquiry row linked to it); everything else
 * is stored as an inquiry for the owner and the superadmin. Public, so it has a
 * honeypot field, a per-IP and per-site rate limit, and server-side validation. The
 * owner's email address is never returned.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ip = clientIp(req);
    const perIp = allow(`inquiry:ip:${ip}`, 5, 60 * 60 * 1000);
    if (!perIp.ok) {
        return NextResponse.json({ error: 'Too many offers from this network. Try again later.' }, { status: 429, headers: { 'Retry-After': String(perIp.retryAfterSeconds) } });
    }

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Honeypot: real people never fill the hidden "website" field. Pretend it worked.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
        return NextResponse.json({ success: true });
    }

    const { id } = await params;
    const entryId = await resolveEntryId(id);
    if (!entryId) return NextResponse.json({ error: 'This site is not accepting offers.' }, { status: 404 });
    const perSite = allow(`inquiry:site:${entryId}`, 30, 24 * 60 * 60 * 1000);
    if (!perSite.ok) {
        return NextResponse.json({ error: 'This site has received a lot of offers today. Try again tomorrow.' }, { status: 429 });
    }

    const kind = String(body.kind || '');
    const email = String(body.email || '').trim();
    const name = String(body.name || '').trim().slice(0, 120);
    const company = String(body.company || '').trim().slice(0, 160);
    const budget = String(body.budget || '').trim().slice(0, 80);
    const message = String(body.message || '').trim().slice(0, 2000);
    const slotId = Number(body.slot_id);

    if (!KINDS.has(kind)) return NextResponse.json({ error: 'Choose what kind of offer this is.' }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email so the owner can reply.' }, { status: 400 });
    if (message.length < 10) return NextResponse.json({ error: 'Add a short message (at least 10 characters).' }, { status: 400 });
    if ((message.match(/https?:\/\//gi) || []).length >= 3) {
        return NextResponse.json({ error: 'Too many links in the message.' }, { status: 400 });
    }

    const res = await lbAdmin<AdminInquiryResponse>(`/api/lb/entry/${entryId}/inquiries`, {
        method: 'POST',
        body: { kind, name, email, company, budget, message, slot_id: Number.isFinite(slotId) && slotId > 0 ? slotId : undefined },
        timeoutMs: 15_000,
    });
    if (!res.ok || !res.data) {
        const status = res.status >= 400 && res.status < 500 ? res.status : 502;
        return NextResponse.json({ error: res.error || 'Could not send your offer right now.' }, { status });
    }

    const { publisher, slot } = res.data;
    if (slot) {
        sendSlotRequestEmails({
            slotName: slot.slot_name_at_request,
            priceCents: slot.price_cents_at_request,
            billingPeriod: slot.billing_period_at_request,
            buyerName: name,
            buyerEmail: email,
            message,
            publisher,
        });
    } else {
        sendInquiryEmails({ kind, name, email, company, budget, message, publisher });
    }
    return NextResponse.json({ success: true });
}
