/**
 * POST /api/sponsorship/request — public.
 *
 * An advertiser submits one request covering one or more verified sites. This
 * is the single most important route in the 30-day demand test: it is the only
 * place a buyer expresses intent, and the gate (3 paid sponsorships) is counted
 * from the rows it writes.
 *
 * Deliberately absent: payments, escrow, credits, cart persistence, accounts.
 * The advertiser does not need to sign up. Anything that adds a step between
 * "I want this" and "you have my email address" is measuring the wrong thing.
 *
 * PRICE IS RECOMPUTED SERVER-SIDE. The client sends entry ids and nothing else
 * about money; prices come from the admin API's verified entry data run through
 * `resolveSponsorshipPrice`. A client-supplied price would be trivially
 * forgeable and would poison the one dataset this experiment exists to collect.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveSponsorshipPrice, type PublisherListingOverride } from '@/lib/sponsorshipPricing';
import { sendSponsorshipRequestEmails, type SponsorshipEmailSite } from '@/lib/sponsorshipEmail';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

/** In-process limiter, same approach as `api/contact/route.ts`. Good enough for
 *  a demand test; Upstash exists in the repo if this ever needs to be real. */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateStore = new Map<string, number[]>();

function checkRate(ip: string): boolean {
    const now = Date.now();
    const recent = (rateStore.get(ip) || []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
        rateStore.set(ip, recent);
        return false;
    }
    recent.push(now);
    rateStore.set(ip, recent);
    return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SITES_PER_REQUEST = 25;

interface RequestBody {
    email?: unknown;
    name?: unknown;
    site?: unknown;
    message?: unknown;
    /** Cents. Informational only — recorded, never used to compute prices. */
    budgetCents?: unknown;
    entryIds?: unknown;
    /** 'profile' (one site) or 'budget' (the /advertise planner). */
    source?: unknown;
    sourcePath?: unknown;
}

/** Shape of an entry as returned by the admin list endpoint. */
interface AdminEntry {
    id: number;
    slug: string | null;
    startup_name: string;
    website_url: string | null;
    category: string | null;
    monthly_pageviews: number;
    engagement_rate: number;
    bounce_rate: number;
    avg_session_duration?: number;
    primary_country?: string | null;
    verification_status?: string;
    is_verified: boolean;
    sponsorship_listing?: PublisherListingOverride | null;
}

function bareHost(url: string | null): string | null {
    if (!url) return null;
    try {
        const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return new URL(withScheme).hostname.replace(/^www\./, '') || null;
    } catch {
        return null;
    }
}

/**
 * Fetch the requested entries from the admin API's public list endpoint.
 *
 * Uses the list endpoint (page_size=100) rather than N calls to `/detail`
 * because a budget request can name a dozen sites, and the list endpoint
 * already filters to active + verified + non-zero-traffic, which is exactly
 * the eligibility rule we want applied.
 */
async function fetchEntries(entryIds: number[]): Promise<AdminEntry[]> {
    const res = await fetch(`${ADMIN_API_URL}/api/leaderboard?page_size=100&sort=traffic`, {
        headers: { 'X-API-Key': ADMIN_API_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Admin API returned ${res.status}`);
    const data = (await res.json()) as { entries?: AdminEntry[] };
    const wanted = new Set(entryIds);
    return (data.entries || []).filter((e) => wanted.has(e.id));
}

export async function POST(req: NextRequest) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRate(ip)) {
        return NextResponse.json(
            { error: 'Too many requests. Give it ten minutes.' },
            { status: 429 },
        );
    }

    let body: RequestBody;
    try {
        body = (await req.json()) as RequestBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email) || email.length > 254) {
        return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    const rawIds = Array.isArray(body.entryIds) ? body.entryIds : [];
    const entryIds = Array.from(
        new Set(rawIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)),
    );
    if (entryIds.length === 0) {
        return NextResponse.json({ error: 'Pick at least one site.' }, { status: 400 });
    }
    if (entryIds.length > MAX_SITES_PER_REQUEST) {
        return NextResponse.json(
            { error: `Up to ${MAX_SITES_PER_REQUEST} sites per request.` },
            { status: 400 },
        );
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const site = typeof body.site === 'string' ? body.site.trim().slice(0, 500) : '';
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
    const budgetCents =
        typeof body.budgetCents === 'number' && Number.isFinite(body.budgetCents) && body.budgetCents > 0
            ? Math.round(Math.min(body.budgetCents, 100_000_000))
            : null;
    const source = body.source === 'budget' ? 'budget' : 'profile';
    const sourcePath = typeof body.sourcePath === 'string' ? body.sourcePath.slice(0, 255) : null;

    if (!ADMIN_API_KEY) {
        console.error('[sponsorship] ADMIN_API_KEY not configured — cannot record request');
        return NextResponse.json(
            { error: 'Sponsorship requests are not available right now.' },
            { status: 503 },
        );
    }

    let entries: AdminEntry[];
    try {
        entries = await fetchEntries(entryIds);
    } catch (err) {
        console.error('[sponsorship] could not load entries', err);
        return NextResponse.json({ error: 'Could not load those sites. Try again.' }, { status: 502 });
    }

    // Re-price server-side. A site whose publisher has paused, or which is no
    // longer sellable, is dropped rather than failing the whole submission —
    // the advertiser's other picks are still a real lead.
    const priced = entries
        .map((entry) => ({ entry, price: resolveSponsorshipPrice(entry, entry.sponsorship_listing ?? null) }))
        .filter(({ price }) => price.acceptingRequests && price.listPriceCents > 0);

    if (priced.length === 0) {
        return NextResponse.json(
            { error: 'None of those sites are accepting sponsorship requests right now.' },
            { status: 409 },
        );
    }

    let adminPayload: {
        success?: boolean;
        request?: { id: number; quoted_total_cents: number; site_count: number };
        items?: Array<{
            id: number;
            entry_id: number;
            entry_name: string | null;
            entry_domain: string | null;
            entry_slug: string | null;
            price_cents_at_request: number;
            estimated_impressions: number | null;
            publisher_email: string | null;
            publisher_name: string | null;
        }>;
        dropped_entry_ids?: number[];
    };
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/sponsorship/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({
                advertiser_email: email,
                advertiser_name: name || null,
                advertiser_site: site || null,
                source,
                source_path: sourcePath,
                budget_cents: budgetCents,
                message: message || null,
                ip_address: ip,
                items: priced.map(({ entry, price }) => ({
                    entry_id: entry.id,
                    price_cents_at_request: price.listPriceCents,
                    price_source: price.priceSource,
                    estimated_impressions: price.estimatedImpressions,
                })),
            }),
        });
        const text = await res.text();
        try {
            adminPayload = text ? JSON.parse(text) : {};
        } catch {
            console.error('[sponsorship] admin returned non-JSON', res.status, text.slice(0, 300));
            return NextResponse.json({ error: 'Could not save your request. Try again.' }, { status: 502 });
        }
        if (!res.ok || !adminPayload.success || !adminPayload.request) {
            return NextResponse.json(
                { error: 'Could not save your request. Try again.' },
                { status: res.ok ? 502 : res.status },
            );
        }
    } catch (err) {
        console.error('[sponsorship] admin write failed', err);
        return NextResponse.json({ error: 'Could not save your request. Try again.' }, { status: 502 });
    }

    const requestId = adminPayload.request.id;
    const items = adminPayload.items || [];

    // Email is best-effort and must not block the response: the row is already
    // durable, and the operator can see it even if Brevo is down.
    const emailSites: SponsorshipEmailSite[] = items.map((item) => ({
        entryId: item.entry_id,
        name: item.entry_name || 'a site',
        domain: item.entry_domain || bareHost(entries.find((e) => e.id === item.entry_id)?.website_url ?? null),
        slug: item.entry_slug,
        priceCents: item.price_cents_at_request,
        estimatedImpressions: item.estimated_impressions,
        publisherEmail: item.publisher_email,
        publisherName: item.publisher_name,
    }));

    void sendSponsorshipRequestEmails({
        requestId,
        advertiserEmail: email,
        advertiserName: name || null,
        advertiserSite: site || null,
        message: message || null,
        budgetCents,
        totalCents: adminPayload.request.quoted_total_cents,
        sites: emailSites,
    }).catch((err) => console.error('[sponsorship] email dispatch failed', err));

    return NextResponse.json({
        success: true,
        requestId,
        siteCount: adminPayload.request.site_count,
        totalCents: adminPayload.request.quoted_total_cents,
        // Sites the client asked for that we could not include, so the UI can
        // say so instead of silently quoting a different number.
        droppedEntryIds: [
            ...(adminPayload.dropped_entry_ids || []),
            ...entryIds.filter((id) => !items.some((i) => i.entry_id === id)),
        ].filter((id, i, arr) => arr.indexOf(id) === i),
    });
}
