/**
 * The scheduled-email runner (round 9). Everything that decides WHETHER and TO WHOM an email goes,
 * with its collaborators injected (store, transport, digest builder, clock) so the tests run it
 * against memory. Server only in practice (tokens), but free of Next and Google imports.
 *
 * Abuse rules, all enforced here:
 *   - a window is sent at most once: `store.claim` is one atomic step in the admin;
 *   - recipients other than the owner's own address get ONE confirmation email and receive reports
 *     only after they click Yes (declined / unsubscribed addresses are never mailed again);
 *   - every report carries a signed unsubscribe link (and List-Unsubscribe one-click headers);
 *   - a per-owner daily cap on report emails and on confirmation emails;
 *   - nothing is sent for a disabled schedule, with no recipients, or when the data could not be read.
 */
import { dueWindow, describeSchedule, lowerFirst, readConfig, utcDay, type EmailScheduleConfig } from './schedule';
import { confirmSubject, renderConfirmHtml, renderConfirmText, renderReportHtml, renderReportText, reportSubject } from './render';
import type { ScheduleStore } from './store';
import { linkToken, verifyToken } from './tokens';
import type { DigestModel, EmailMessage, EmailTransport, RecipientState, ScheduleRow, ScheduleState } from './types';

export const DEFAULT_DAILY_CAP = 50;
export const DEFAULT_CONFIRM_CAP = 10;

export interface RunnerDeps {
    now: number;
    store: ScheduleStore;
    transport: EmailTransport;
    /** App origin for links (no trailing slash). */
    origin: string;
    buildDigest: (row: ScheduleRow, config: EmailScheduleConfig) => Promise<DigestModel>;
    /** Report emails per owner per UTC day. */
    dailyCap?: number;
    /** Confirmation emails per owner per UTC day. */
    confirmCap?: number;
    secret?: string | null;
}

const capsOf = (d: RunnerDeps) => ({ daily: d.dailyCap ?? DEFAULT_DAILY_CAP, confirm: d.confirmCap ?? DEFAULT_CONFIRM_CAP });

export const respondUrl = (origin: string, token: string) => `${origin}/api/email-schedule/respond?t=${encodeURIComponent(token)}`;

export function unsubscribeUrl(d: Pick<RunnerDeps, 'origin' | 'now' | 'secret'>, dashboardId: string, email: string): string {
    return respondUrl(d.origin, linkToken('unsub', dashboardId, email, d.now, d.secret));
}

// ── pure decisions ───────────────────────────────────────────────────────

export interface Classified {
    /** Get the report now: the owner's own address, or confirmed. */
    eligible: string[];
    /** Never asked: needs a confirmation email first. */
    ask: string[];
    /** Asked, no answer yet. */
    waiting: string[];
    /** Said no or unsubscribed: never mailed. */
    blocked: string[];
}

export function classifyRecipients(recipients: string[], ownerEmail: string | null | undefined, state: ScheduleState, declinedByOwner: ReadonlySet<string> = new Set()): Classified {
    const owner = ownerEmail?.trim().toLowerCase();
    const out: Classified = { eligible: [], ask: [], waiting: [], blocked: [] };
    for (const r of recipients) {
        const e = r.toLowerCase();
        const st: RecipientState | undefined = state.recipients?.[e];
        if (st?.status === 'unsubscribed' || st?.status === 'declined') out.blocked.push(e);
        else if (declinedByOwner.has(e) && e !== owner && st?.status !== 'confirmed') out.blocked.push(e);
        else if (owner && e === owner) out.eligible.push(e);
        else if (st?.status === 'confirmed') out.eligible.push(e);
        else if (st?.status === 'pending') out.waiting.push(e);
        else out.ask.push(e);
    }
    return out;
}

/** How many of `want` may still go out today under a cap. */
export const allowedByCap = (want: number, alreadyToday: number, cap: number): number => Math.max(0, Math.min(want, cap - alreadyToday));

const sentOn = (rows: ScheduleRow[], ownerUserId: number, day: string) =>
    rows.filter((r) => r.ownerUserId === ownerUserId).reduce((n, r) => n + (r.schedule.state.sent?.[day] ?? 0), 0);

/**
 * Addresses that answered "No" on any of this owner's dashboards: the owner is never allowed to ask them again,
 * on any dashboard (a stranger who said "I do not know this person" is not asked by the next dashboard).
 */
export function declinedByOwner(rows: ScheduleRow[], ownerUserId: number): Set<string> {
    const out = new Set<string>();
    for (const r of rows) {
        if (r.ownerUserId !== ownerUserId) continue;
        for (const [e, st] of Object.entries(r.schedule.state.recipients ?? {})) if (st.status === 'declined') out.add(e);
    }
    return out;
}

const confirmsOn = (rows: ScheduleRow[], ownerUserId: number, day: string) =>
    rows.filter((r) => r.ownerUserId === ownerUserId).reduce((n, r) => n + Object.values(r.schedule.state.recipients ?? {}).filter((x) => x.confirmSentAt?.startsWith(day)).length, 0);

// ── confirmation emails ──────────────────────────────────────────────────

export type ConfirmOutcome = 'sent' | 'capped' | 'failed';

/** Sends the one confirmation email to `email` (not the owner) and records it as pending. */
export async function sendConfirmation(deps: RunnerDeps, row: ScheduleRow, config: EmailScheduleConfig, email: string, confirmedToday: number): Promise<ConfirmOutcome> {
    if (confirmedToday >= capsOf(deps).confirm) return 'capped';
    const cm = {
        dashboardName: row.name,
        ownerEmail: row.ownerEmail ?? 'A TrafficClaw user',
        scheduleText: `They would like to send it ${lowerFirst(describeSchedule(config))}.`,
        confirmUrl: respondUrl(deps.origin, linkToken('confirm', row.dashboardId, email, deps.now, deps.secret)),
        declineUrl: respondUrl(deps.origin, linkToken('decline', row.dashboardId, email, deps.now, deps.secret)),
    };
    const msg: EmailMessage = { to: email, subject: confirmSubject(cm), html: renderConfirmHtml(cm), text: renderConfirmText(cm), kind: 'confirm', dashboardId: row.dashboardId };
    const r = await deps.transport.send(msg);
    if (!r.ok) return 'failed';
    await deps.store.setRecipient(row.dashboardId, email, 'pending', { confirmSentAt: new Date(deps.now).toISOString() });
    return 'sent';
}

/**
 * After the owner saves: ask every new outside recipient once. Returns what happened per address
 * (the dialog shows "confirmation sent to ..."). Uses the owner's other schedules to apply the cap.
 */
export async function confirmNewRecipients(deps: RunnerDeps, row: ScheduleRow, config: EmailScheduleConfig): Promise<Record<string, ConfirmOutcome | 'waiting' | 'blocked'>> {
    const all = await deps.store.listScheduled(row.ownerIdentifier ?? row.ownerEmail ?? undefined);
    const fresh = all.find((r) => r.dashboardId === row.dashboardId) ?? row;
    const cls = classifyRecipients(config.recipients, row.ownerEmail, fresh.schedule.state, declinedByOwner(all, row.ownerUserId));
    const today = utcDay(deps.now);
    let confirmed = confirmsOn(all, row.ownerUserId, today);
    const out: Record<string, ConfirmOutcome | 'waiting' | 'blocked'> = {};
    for (const e of cls.waiting) out[e] = 'waiting';
    for (const e of cls.blocked) out[e] = 'blocked';
    for (const e of cls.ask) {
        const o = await sendConfirmation(deps, fresh, config, e, confirmed);
        if (o === 'sent') confirmed++;
        out[e] = o;
    }
    return out;
}

// ── the cron run ─────────────────────────────────────────────────────────

export interface ItemResult {
    dashboardId: string;
    name: string;
    window?: string;
    status: 'sent' | 'not_due' | 'already_sent' | 'no_recipients' | 'error' | 'skipped';
    sent: number;
    skipped: string[];
    confirmationsSent: number;
    error?: string;
}

export interface RunSummary { checked: number; due: number; emailsSent: number; confirmationsSent: number; items: ItemResult[] }

export async function runDueSchedules(deps: RunnerDeps): Promise<RunSummary> {
    const rows = await deps.store.listScheduled();
    const today = utcDay(deps.now);
    const caps = capsOf(deps);
    const summary: RunSummary = { checked: rows.length, due: 0, emailsSent: 0, confirmationsSent: 0, items: [] };
    // Running tallies per owner (the list already holds today's counts from earlier runs).
    const sentTally = new Map<number, number>();
    const confirmTally = new Map<number, number>();
    const tally = (m: Map<number, number>, uid: number, f: () => number) => { if (!m.has(uid)) m.set(uid, f()); return m.get(uid)!; };

    for (const row of rows) {
        const item: ItemResult = { dashboardId: row.dashboardId, name: row.name, status: 'not_due', sent: 0, skipped: [], confirmationsSent: 0 };
        summary.items.push(item);
        try {
            const config = readConfig(row.schedule.config);
            if (!config) { item.status = 'skipped'; continue; }
            const due = dueWindow(config, deps.now, row.schedule.state.claimed);
            if (!due) {
                // Distinguish "already sent this window" from "not time yet" for the logs.
                item.status = 'not_due';
                continue;
            }
            item.window = due.windowKey;
            summary.due++;

            const cls = classifyRecipients(config.recipients, row.ownerEmail, row.schedule.state, declinedByOwner(rows, row.ownerUserId));
            item.skipped.push(...cls.blocked.map((e) => `${e}: unsubscribed or declined`), ...cls.waiting.map((e) => `${e}: waiting for confirmation`));

            // Claim first: from here two runs cannot both send this window.
            const previous = row.schedule.state.claimed ?? '';
            if (!(await deps.store.claim(row.dashboardId, due.windowKey))) { item.status = 'already_sent'; continue; }

            // Outside addresses never asked (e.g. added through an old client): ask now, within the cap.
            for (const e of cls.ask) {
                const used = tally(confirmTally, row.ownerUserId, () => confirmsOn(rows, row.ownerUserId, today));
                const o = await sendConfirmation(deps, row, config, e, used);
                if (o === 'sent') { confirmTally.set(row.ownerUserId, used + 1); item.confirmationsSent++; summary.confirmationsSent++; }
                else item.skipped.push(`${e}: confirmation ${o}`);
            }

            if (cls.eligible.length === 0) { item.status = 'no_recipients'; await deps.store.result(row.dashboardId, { ok: true, sent: 0, window: due.windowKey, note: 'no confirmed recipients' }); continue; }

            const already = tally(sentTally, row.ownerUserId, () => sentOn(rows, row.ownerUserId, today));
            const allowed = allowedByCap(cls.eligible.length, already, caps.daily);
            const targets = cls.eligible.slice(0, allowed);
            for (const e of cls.eligible.slice(allowed)) item.skipped.push(`${e}: daily limit of ${caps.daily} emails reached`);
            if (targets.length === 0) { item.status = 'skipped'; await deps.store.release(row.dashboardId, due.windowKey, previous); continue; }

            let digest: DigestModel;
            try {
                digest = await deps.buildDigest(row, config);
            } catch (err) {
                await deps.store.release(row.dashboardId, due.windowKey, previous);
                item.status = 'error';
                item.error = err instanceof Error ? err.message : String(err);
                await deps.store.result(row.dashboardId, { ok: false, error: item.error.slice(0, 200), window: due.windowKey });
                continue;
            }

            let ok = 0;
            for (const to of targets) {
                const unsub = unsubscribeUrl(deps, row.dashboardId, to);
                const msg: EmailMessage = {
                    to,
                    subject: reportSubject(digest),
                    html: renderReportHtml(digest, { unsubscribeUrl: unsub, ownerEmail: row.ownerEmail ?? undefined }),
                    text: renderReportText(digest, { unsubscribeUrl: unsub }),
                    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
                    kind: 'report',
                    dashboardId: row.dashboardId,
                };
                const r = await deps.transport.send(msg);
                if (r.ok) ok++;
                else item.skipped.push(`${to}: ${r.error ?? 'send failed'}`.slice(0, 160));
            }
            if (ok === 0) {
                // Nobody got it (Brevo down): give the window back, the next run inside the grace period retries.
                await deps.store.release(row.dashboardId, due.windowKey, previous);
                item.status = 'error';
                item.error = 'Every send failed';
                await deps.store.result(row.dashboardId, { ok: false, error: item.error, window: due.windowKey });
                continue;
            }
            await deps.store.count(row.dashboardId, today, ok);
            sentTally.set(row.ownerUserId, already + ok);
            await deps.store.result(row.dashboardId, { ok: true, sent: ok, skipped: item.skipped.length, window: due.windowKey });
            item.status = 'sent';
            item.sent = ok;
            summary.emailsSent += ok;
        } catch (err) {
            item.status = 'error';
            item.error = err instanceof Error ? err.message : String(err);
        }
    }
    return summary;
}

// ── send a test now (owner only) ─────────────────────────────────────────

export type TestOutcome = { ok: true; to: string; subject: string } | { ok: false; error: string; status: number };

/** The test goes to the owner's own address only, counts toward the daily cap, and never touches the schedule's window. */
export async function sendTestNow(deps: RunnerDeps, row: ScheduleRow, config: EmailScheduleConfig): Promise<TestOutcome> {
    const to = row.ownerEmail?.trim().toLowerCase();
    if (!to) return { ok: false, status: 409, error: 'Your account has no email address.' };
    const today = utcDay(deps.now);
    const all = await deps.store.listScheduled(row.ownerIdentifier ?? to);
    if (allowedByCap(1, sentOn(all, row.ownerUserId, today), capsOf(deps).daily) < 1) return { ok: false, status: 429, error: 'Daily email limit reached. Try again tomorrow.' };
    let digest: DigestModel;
    try {
        digest = await deps.buildDigest(row, config);
    } catch (err) {
        return { ok: false, status: 502, error: err instanceof Error ? err.message : 'Could not read the dashboard data.' };
    }
    const unsub = unsubscribeUrl(deps, row.dashboardId, to);
    const subject = reportSubject(digest, { isTest: true });
    const r = await deps.transport.send({
        to, subject, kind: 'test', dashboardId: row.dashboardId,
        html: renderReportHtml(digest, { unsubscribeUrl: unsub, isTest: true, ownerEmail: to }),
        text: renderReportText(digest, { unsubscribeUrl: unsub, isTest: true }),
    });
    if (!r.ok) return { ok: false, status: 502, error: r.error ?? 'The email could not be sent.' };
    await deps.store.count(row.dashboardId, today, 1);
    return { ok: true, to, subject };
}

// ── links in emails ──────────────────────────────────────────────────────

export type LinkOutcome =
    | { ok: true; action: 'confirm' | 'decline' | 'unsub'; dashboardId: string; email: string; changed: boolean }
    | { ok: false; reason: 'invalid' | 'gone' };

/** What a signed link does. Confirm only moves a pending address to confirmed (a later "unsubscribe" or "no" always wins). */
export async function applyLink(store: ScheduleStore, token: unknown, now: number, secret?: string | null): Promise<LinkOutcome> {
    const p = verifyToken(token, now, secret === undefined ? undefined : secret);
    if (!p || p.k === 'img') return { ok: false, reason: 'invalid' };
    const rows = await store.listScheduled();
    const row = rows.find((r) => r.dashboardId === p.d);
    if (!row) return { ok: false, reason: 'gone' };
    const current = row.schedule.state.recipients?.[p.e]?.status;
    const stamp = new Date(now).toISOString();
    if (p.k === 'confirm') {
        if (current !== 'pending') return { ok: true, action: 'confirm', dashboardId: p.d, email: p.e, changed: false };
        await store.setRecipient(p.d, p.e, 'confirmed', { confirmedAt: stamp });
        return { ok: true, action: 'confirm', dashboardId: p.d, email: p.e, changed: true };
    }
    const status = p.k === 'unsub' ? 'unsubscribed' : 'declined';
    if (current === status) return { ok: true, action: p.k, dashboardId: p.d, email: p.e, changed: false };
    await store.setRecipient(p.d, p.e, status);
    return { ok: true, action: p.k, dashboardId: p.d, email: p.e, changed: true };
}
