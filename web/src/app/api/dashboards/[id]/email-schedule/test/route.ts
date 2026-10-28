import { NextResponse } from 'next/server';
import { clientIp, rateLimited, sessionUserId } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { getDashboard, toRecord } from '@/lib/builder/server/store';
import { emailOrigin, loadDigest } from '@/lib/builder/email/digest';
import { sendTestNow } from '@/lib/builder/email/runner';
import { DEFAULT_CONFIG, readConfig, validateSchedule } from '@/lib/builder/email/schedule';
import { AdminScheduleStore } from '@/lib/builder/email/store';
import { chooseTransport, MockTransport } from '@/lib/builder/email/transport';
import type { ScheduleRow } from '@/lib/builder/email/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/dashboards/[id]/email-schedule/test: "Send a test now". Goes to the owner's own address ONLY
 * (whatever recipients are set), builds the real email from the settings in the body (or the saved ones),
 * counts toward the owner's daily cap and never touches the schedule's window. In demo/mock mode nothing
 * leaves the machine: the email is written to the outbox and the answer says so.
 */
export async function POST(req: Request, { params }: Ctx) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    if (rateLimited(`email-test:${userId}`, 5, 10 * 60_000) || rateLimited(`email-test-ip:${clientIp(req)}`, 20, 10 * 60_000)) {
        return jsonError(429, 'Test emails are limited to 5 every 10 minutes.');
    }
    const { id } = await params;
    let body: Record<string, unknown> = {};
    try { body = (await req.json()) as Record<string, unknown>; } catch { /* body is optional */ }
    try {
        const dash = await getDashboard(userId, id);
        if (!dash) return jsonError(404, 'Dashboard not found');
        const doc = toRecord(dash).doc;
        const store = new AdminScheduleStore();
        const info = await store.get(userId, id);
        if (!info) return jsonError(404, 'Dashboard not found');

        if (!info.ownerEmail) return jsonError(409, 'Your account has no email address to send the test to.');
        let config = info.schedule ? readConfig(info.schedule.config) : null;
        if (body.config) {
            const v = validateSchedule({ ...(body.config as object), enabled: true, recipients: info.ownerEmail ? [info.ownerEmail] : [] }, { knownPageIds: doc.pages.filter((p) => !p.hidden).map((p) => p.id), since: new Date().toISOString() });
            if (!v.ok) return jsonError(422, v.error);
            config = v.value;
        }
        config ??= { ...DEFAULT_CONFIG, recipients: info.ownerEmail ? [info.ownerEmail] : [] };
        const row: ScheduleRow = { dashboardId: id, name: info.name, ownerUserId: info.ownerUserId, ownerIdentifier: userId, ownerEmail: info.ownerEmail, shareToken: info.shareToken, schedule: { config, state: info.schedule?.state ?? {} } };

        const origin = emailOrigin();
        const transport = chooseTransport();
        const r = await sendTestNow({ now: Date.now(), store, transport, origin, buildDigest: (rw, c) => loadDigest(rw, c, { origin }) }, row, config);
        if (!r.ok) return jsonError(r.status, r.error);
        const file = transport instanceof MockTransport ? transport.sent[transport.sent.length - 1]?.file : undefined;
        return NextResponse.json({ ok: true, to: r.to, subject: r.subject, mock: transport.name === 'mock', file });
    } catch (err) {
        console.error('[email-schedule] test failed', err);
        return jsonError(502, 'Could not send the test email');
    }
}
