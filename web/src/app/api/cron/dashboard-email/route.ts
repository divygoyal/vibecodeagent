import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { emailOrigin, loadDigest } from '@/lib/builder/email/digest';
import { runDueSchedules } from '@/lib/builder/email/runner';
import { AdminScheduleStore, DryRunStore } from '@/lib/builder/email/store';
import { chooseTransport, isMockMode, MockTransport } from '@/lib/builder/email/transport';

export const dynamic = 'force-dynamic';
// Charts and KPIs come from the normal query engine (Google), owner by owner.
export const maxDuration = 300;

function verifyCronSecret(header: string | null): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || !header) return false;
    const expected = `Bearer ${secret}`;
    const maxLen = Math.max(header.length, expected.length);
    const a = Buffer.alloc(maxLen);
    const b = Buffer.alloc(maxLen);
    Buffer.from(header).copy(a);
    Buffer.from(expected).copy(b);
    return header.length === expected.length && timingSafeEqual(a, b);
}

/**
 * GET|POST /api/cron/dashboard-email (Authorization: Bearer $CRON_SECRET), every 15 minutes.
 *
 * Finds the dashboards whose email schedule is due, claims each window once (idempotent), asks
 * outside recipients for confirmation, sends within the per-owner caps and records the result.
 *
 *   ?dryRun=1   changes nothing and sends nothing: same decisions, messages returned (add &html=1 for their HTML)
 *   ?now=<iso>  pretend it is that time (honoured only with dryRun=1 or in mock mode, never in a real send)
 *
 * Mock mode (TC_EMAIL_TRANSPORT=mock, and always in demo-data mode) never touches the network:
 * messages are written to TC_EMAIL_OUTBOX_DIR.
 */
async function handle(req: NextRequest) {
    if (!verifyCronSecret(req.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') === '1';
    const mock = isMockMode();
    let now = Date.now();
    const nowParam = url.searchParams.get('now');
    if (nowParam && (dryRun || mock)) {
        const t = Date.parse(nowParam);
        if (Number.isFinite(t)) now = t;
    }

    const origin = emailOrigin();
    const real = new AdminScheduleStore();
    const store = dryRun ? new DryRunStore(real) : real;
    const transport = chooseTransport({ dryRun });
    const dailyCap = Number(process.env.EMAIL_SCHEDULE_DAILY_CAP) > 0 ? Number(process.env.EMAIL_SCHEDULE_DAILY_CAP) : undefined;
    const confirmCap = Number(process.env.EMAIL_SCHEDULE_CONFIRM_CAP) > 0 ? Number(process.env.EMAIL_SCHEDULE_CONFIRM_CAP) : undefined;

    const before = transport instanceof MockTransport ? transport.sent.length : 0;
    try {
        const summary = await runDueSchedules({
            now, store, transport, origin, dailyCap, confirmCap,
            buildDigest: (row, config) => loadDigest(row, config, { origin }),
        });
        const body: Record<string, unknown> = { success: true, dryRun, transport: transport.name, now: new Date(now).toISOString(), ...summary };
        if ((dryRun || mock) && transport instanceof MockTransport) {
            const withHtml = url.searchParams.get('html') === '1';
            body.messages = transport.sent.slice(before).map((m) => ({ to: m.to, kind: m.kind, subject: m.subject, dashboardId: m.dashboardId, file: m.file, ...(withHtml ? { html: m.html } : {}) }));
        }
        console.info('[cron] dashboard-email', { dryRun, transport: transport.name, checked: summary.checked, due: summary.due, emailsSent: summary.emailsSent, confirmationsSent: summary.confirmationsSent });
        return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        console.error('[cron] dashboard-email failed', err);
        return NextResponse.json({ success: false, error: 'Scheduled email run failed' }, { status: 500 });
    }
}

export const GET = handle;
export const POST = handle;
