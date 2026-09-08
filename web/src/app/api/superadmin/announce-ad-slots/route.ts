import { NextRequest, NextResponse } from 'next/server';
import { verifySuperadminToken } from '@/lib/superadminToken';
import { sendTransactional, isBrevoConfigured } from '@/lib/brevo';
import { buildAdSlotsAnnouncement, type AnnouncementSite } from '@/lib/adSlotsAnnouncementEmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

type Publisher = {
    user_id: number;
    email: string;
    name: string | null;
    sites: Array<AnnouncementSite & { entry_id: number; website_url: string | null }>;
};

async function fetchPublishers(): Promise<Publisher[]> {
    const res = await fetch(`${ADMIN_API_URL}/api/leaderboard/publishers`, {
        headers: { 'X-API-Key': ADMIN_API_KEY },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Admin API ${res.status}`);
    const data = (await res.json()) as { publishers: Publisher[] };
    return data.publishers || [];
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * GET ?token=…&email=… — render the announcement for one publisher as HTML so
 * a superadmin can eyeball it in a browser tab before sending anything.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    if (!verifySuperadminToken(searchParams.get('token') || '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const publishers = await fetchPublishers();
    const wanted = (searchParams.get('email') || '').toLowerCase();
    const target = wanted ? publishers.find((p) => p.email === wanted) : publishers[0];
    if (!target) return NextResponse.json({ error: 'No matching publisher' }, { status: 404 });
    const rendered = buildAdSlotsAnnouncement({ name: target.name, sites: target.sites });
    return new NextResponse(rendered.html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/**
 * POST { token, dryRun = true, includeExisting = false, onlyEmails?: string[] }
 *
 * One-time announcement to verified publishers that they can list ad slots at
 * their own price. Defaults are deliberately safe: dryRun=true returns the
 * recipient list and does not send; publishers who already listed a slot are
 * skipped unless includeExisting=true. Pass onlyEmails to send a test to
 * yourself first.
 */
export async function POST(req: NextRequest) {
    let body: {
        token?: string;
        dryRun?: boolean;
        includeExisting?: boolean;
        onlyEmails?: string[];
    };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!verifySuperadminToken(body.token || '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const dryRun = body.dryRun !== false;
    const includeExisting = body.includeExisting === true;
    const only = new Set((body.onlyEmails || []).map((e) => e.trim().toLowerCase()).filter(Boolean));

    let publishers: Publisher[];
    try {
        publishers = await fetchPublishers();
    } catch (err) {
        return NextResponse.json({ error: `Could not load publishers: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
    }

    const recipients = publishers.filter((p) => {
        if (only.size > 0 && !only.has(p.email)) return false;
        if (!includeExisting && p.sites.every((s) => s.ad_slot_count > 0)) return false;
        return true;
    });

    const preview = recipients.map((p) => ({
        email: p.email,
        name: p.name,
        sites: p.sites.map((s) => s.startup_name),
        alreadySelling: p.sites.some((s) => s.ad_slot_count > 0),
        subject: buildAdSlotsAnnouncement({ name: p.name, sites: p.sites }).subject,
    }));

    if (dryRun) {
        return NextResponse.json({
            dryRun: true,
            brevoConfigured: isBrevoConfigured(),
            totalPublishers: publishers.length,
            wouldSend: recipients.length,
            skipped: publishers.length - recipients.length,
            recipients: preview,
        });
    }

    if (!isBrevoConfigured()) {
        return NextResponse.json({ error: 'Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)' }, { status: 503 });
    }

    const results: Array<{ email: string; ok: boolean; error?: string; messageId?: string }> = [];
    for (const p of recipients) {
        const rendered = buildAdSlotsAnnouncement({ name: p.name, sites: p.sites });
        const r = await sendTransactional({
            toEmail: p.email,
            toName: p.name || undefined,
            subject: rendered.subject,
            htmlContent: rendered.html,
        });
        results.push({ email: p.email, ok: r.ok, error: r.error, messageId: r.messageId });
        await sleep(250);
    }

    const sent = results.filter((r) => r.ok).length;
    console.info('[announce-ad-slots] done', { sent, failed: results.length - sent });
    return NextResponse.json({ dryRun: false, sent, failed: results.length - sent, results });
}
