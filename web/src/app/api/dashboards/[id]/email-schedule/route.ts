import { NextResponse } from 'next/server';
import { clientIp, rateLimited, sessionUserId } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { getDashboard, StoreError, toRecord } from '@/lib/builder/server/store';
import { emailOrigin } from '@/lib/builder/email/digest';
import { classifyRecipients, confirmNewRecipients, type ConfirmOutcome } from '@/lib/builder/email/runner';
import { nextOccurrence, readConfig, validateSchedule } from '@/lib/builder/email/schedule';
import { AdminScheduleStore } from '@/lib/builder/email/store';
import { chooseTransport } from '@/lib/builder/email/transport';
import type { ScheduleRow, ScheduleState } from '@/lib/builder/email/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export type RecipientView = 'owner' | 'confirmed' | 'pending' | 'declined' | 'unsubscribed' | 'not_asked';

function viewOf(recipients: string[], ownerEmail: string | null, state: ScheduleState): Record<string, RecipientView> {
    const owner = ownerEmail?.toLowerCase();
    const cls = classifyRecipients(recipients, ownerEmail, state);
    const out: Record<string, RecipientView> = {};
    for (const e of cls.eligible) out[e] = e === owner ? 'owner' : 'confirmed';
    for (const e of cls.waiting) out[e] = 'pending';
    for (const e of cls.ask) out[e] = 'not_asked';
    for (const e of cls.blocked) out[e] = state.recipients?.[e]?.status === 'declined' ? 'declined' : 'unsubscribed';
    return out;
}

/** GET /api/dashboards/[id]/email-schedule: the saved schedule (or null), recipient statuses, the next send. */
export async function GET(_req: Request, { params }: Ctx) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    try {
        const info = await new AdminScheduleStore().get(userId, id);
        if (!info) return jsonError(404, 'Dashboard not found');
        const config = info.schedule ? readConfig(info.schedule.config) : null;
        const state = info.schedule?.state ?? {};
        return NextResponse.json({
            config,
            ownerEmail: info.ownerEmail,
            recipients: config ? viewOf(config.recipients, info.ownerEmail, state) : {},
            last: state.last ?? null,
            next: config?.enabled ? nextOccurrence(config, Date.now())?.windowKey ?? null : null,
            shared: Boolean(info.shareToken),
            mock: chooseTransport().name === 'mock',
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        console.error('[email-schedule] get failed', err);
        return jsonError(502, 'Could not load the schedule');
    }
}

/**
 * PUT /api/dashboards/[id]/email-schedule: save. Body = the config (recipients, frequency, weekday, monthDay,
 * time, timezone, pages, range, message, enabled). Outside recipients get one confirmation email.
 */
export async function PUT(req: Request, { params }: Ctx) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    if (rateLimited(`email-save:${userId}`, 30) || rateLimited(`email-save-ip:${clientIp(req)}`, 60)) return jsonError(429, 'Too many changes. Try again in a minute.');
    const { id } = await params;
    let body: unknown;
    try { body = await req.json(); } catch { return jsonError(400, 'Invalid JSON'); }
    try {
        const dash = await getDashboard(userId, id);
        if (!dash) return jsonError(404, 'Dashboard not found');
        const doc = toRecord(dash).doc;
        const v = validateSchedule(body, { knownPageIds: doc.pages.filter((p) => !p.hidden).map((p) => p.id), since: new Date().toISOString() });
        if (!v.ok) return jsonError(422, v.error);

        const store = new AdminScheduleStore();
        const info = await store.get(userId, id);
        if (!info) return jsonError(404, 'Dashboard not found');
        await store.put(userId, id, v.value);

        // The owner adding their own address back after unsubscribing is the owner's own, explicit choice.
        const owner = info.ownerEmail?.toLowerCase();
        if (owner && v.value.recipients.includes(owner) && info.schedule?.state.recipients?.[owner]?.status === 'unsubscribed') {
            await store.setRecipient(id, owner, 'confirmed', { confirmedAt: new Date().toISOString() });
        }

        const fresh = await store.get(userId, id);
        const state = fresh?.schedule?.state ?? {};
        let confirmations: Record<string, ConfirmOutcome | 'waiting' | 'blocked'> = {};
        if (v.value.enabled) {
            const row: ScheduleRow = { dashboardId: id, name: info.name, ownerUserId: info.ownerUserId, ownerIdentifier: userId, ownerEmail: info.ownerEmail, shareToken: info.shareToken, schedule: { config: v.value, state } };
            confirmations = await confirmNewRecipients({ now: Date.now(), store, transport: chooseTransport(), origin: emailOrigin(), buildDigest: async () => { throw new Error('not used'); } }, row, v.value);
        }
        const after = (await store.get(userId, id))?.schedule?.state ?? state;
        return NextResponse.json({
            config: v.value,
            recipients: viewOf(v.value.recipients, info.ownerEmail, after),
            confirmations,
            next: v.value.enabled ? nextOccurrence(v.value, Date.now())?.windowKey ?? null : null,
        });
    } catch (err) {
        console.error('[email-schedule] save failed', err);
        return jsonError(err instanceof StoreError ? err.status : 502, 'Could not save the schedule');
    }
}

/** DELETE: remove the schedule (nothing is sent any more). */
export async function DELETE(_req: Request, { params }: Ctx) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    try {
        await new AdminScheduleStore().remove(userId, id);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[email-schedule] delete failed', err);
        return jsonError(502, 'Could not remove the schedule');
    }
}

