/**
 * Scheduled email delivery of a dashboard (round 9): the schedule a dashboard owner sets, its
 * validation, and the due-time calculation. Isomorphic and dependency free (Intl only), so the
 * dialog, the cron route and the tests share one definition.
 *
 * Time model: the owner picks a wall-clock time in their time zone ("09:00 Europe/London"). The
 * instant of an occurrence is computed per calendar day, so daylight saving never shifts it by an
 * hour and a time that does not exist (spring forward) runs right after the gap. An occurrence is
 * identified by its UTC instant (`windowKey`), which sorts as text: the admin claims a window once.
 */

export type Frequency = 'daily' | 'weekly' | 'monthly';
export type RangeChoice = 'default' | '7d' | '28d';

export interface EmailScheduleConfig {
    enabled: boolean;
    /** Lower case, validated, at most MAX_RECIPIENTS. The owner's own address is the default. */
    recipients: string[];
    frequency: Frequency;
    /** weekly: 0 = Sunday ... 6 = Saturday. */
    weekday: number;
    /** monthly: 1-31; months with fewer days send on their last day. */
    monthDay: number;
    /** 'HH:MM' on a quarter hour (the cron runs every 15 minutes). */
    time: string;
    /** IANA time zone, the owner's. */
    timezone: string;
    /** 'all' = every visible page, or page ids (at most MAX_PAGES). */
    pages: 'all' | string[];
    range: RangeChoice;
    /** Optional note shown above the numbers (plain text, max 300). */
    message: string;
    /** Set by the server when the schedule is saved: occurrences before it are never sent. */
    since: string;
}

export const MAX_RECIPIENTS = 10;
export const MAX_PAGES = 5;
export const MAX_MESSAGE = 300;
/** An occurrence this long after its instant is skipped (the cron was down; an old report is noise). */
export const GRACE_MS = 6 * 3600_000;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const DEFAULT_CONFIG: EmailScheduleConfig = {
    enabled: true,
    recipients: [],
    frequency: 'weekly',
    weekday: 1,
    monthDay: 1,
    time: '08:00',
    timezone: 'UTC',
    pages: 'all',
    range: 'default',
    message: '',
    since: '',
};

// ── validation ───────────────────────────────────────────────────────────

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Lower-cased address when it is a plausible single mailbox, else null. No names, no lists, no control characters. */
export function normalizeEmail(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const v = raw.trim().toLowerCase();
    if (v.length < 6 || v.length > 254) return null;
    const at = v.lastIndexOf('@');
    if (at < 1 || at > 64) return null;
    return EMAIL_RE.test(v) ? v : null;
}

export function isValidTimeZone(tz: unknown): tz is string {
    if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

export type ValidationResult = { ok: true; value: EmailScheduleConfig } | { ok: false; error: string };

/**
 * Cleans what a client sent. `knownPageIds` are the dashboard's pages. `since` is never taken from
 * the client: pass the server's value.
 */
export function validateSchedule(input: unknown, opts: { knownPageIds: string[]; since: string }): ValidationResult {
    if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid schedule' };
    const b = input as Record<string, unknown>;

    const seen = new Set<string>();
    const recipients: string[] = [];
    for (const r of Array.isArray(b.recipients) ? b.recipients : []) {
        const e = normalizeEmail(r);
        if (!e) return { ok: false, error: `"${String(r).slice(0, 60)}" is not a valid email address.` };
        if (!seen.has(e)) { seen.add(e); recipients.push(e); }
    }
    if (recipients.length > MAX_RECIPIENTS) return { ok: false, error: `Up to ${MAX_RECIPIENTS} recipients.` };

    const enabled = b.enabled !== false;
    if (enabled && recipients.length === 0) return { ok: false, error: 'Add at least one recipient.' };

    const frequency: Frequency = b.frequency === 'daily' || b.frequency === 'monthly' ? b.frequency : 'weekly';
    const weekday = Number.isInteger(b.weekday) && (b.weekday as number) >= 0 && (b.weekday as number) <= 6 ? (b.weekday as number) : 1;
    const monthDay = Number.isInteger(b.monthDay) && (b.monthDay as number) >= 1 && (b.monthDay as number) <= 31 ? (b.monthDay as number) : 1;

    const time = typeof b.time === 'string' ? b.time : '';
    const tm = /^([01]\d|2[0-3]):(00|15|30|45)$/.exec(time);
    if (!tm) return { ok: false, error: 'Pick a time on the quarter hour.' };

    if (!isValidTimeZone(b.timezone)) return { ok: false, error: 'Unknown time zone.' };

    let pages: 'all' | string[] = 'all';
    if (Array.isArray(b.pages)) {
        const known = new Set(opts.knownPageIds);
        const picked = [...new Set(b.pages.filter((p): p is string => typeof p === 'string' && known.has(p)))];
        if (picked.length === 0) return { ok: false, error: 'Pick at least one page.' };
        if (picked.length > MAX_PAGES) return { ok: false, error: `Up to ${MAX_PAGES} pages per email.` };
        pages = picked.length === known.size && known.size <= MAX_PAGES ? 'all' : picked;
    }

    const range: RangeChoice = b.range === '7d' || b.range === '28d' ? b.range : 'default';
    const message = typeof b.message === 'string' ? b.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, MAX_MESSAGE) : '';

    return { ok: true, value: { enabled, recipients, frequency, weekday, monthDay, time, timezone: b.timezone as string, pages, range, message, since: opts.since } };
}

/** Reads a stored config back, tolerating missing fields (never throws). */
export function readConfig(raw: unknown): EmailScheduleConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const b = raw as Record<string, unknown>;
    const recipients = (Array.isArray(b.recipients) ? b.recipients : []).map(normalizeEmail).filter((e): e is string => Boolean(e)).slice(0, MAX_RECIPIENTS);
    const time = typeof b.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.time) ? b.time : '08:00';
    return {
        ...DEFAULT_CONFIG,
        enabled: b.enabled !== false,
        recipients,
        frequency: b.frequency === 'daily' || b.frequency === 'monthly' ? b.frequency : 'weekly',
        weekday: Number.isInteger(b.weekday) && (b.weekday as number) >= 0 && (b.weekday as number) <= 6 ? (b.weekday as number) : 1,
        monthDay: Number.isInteger(b.monthDay) && (b.monthDay as number) >= 1 && (b.monthDay as number) <= 31 ? (b.monthDay as number) : 1,
        time,
        timezone: isValidTimeZone(b.timezone) ? b.timezone : 'UTC',
        pages: Array.isArray(b.pages) ? b.pages.filter((p): p is string => typeof p === 'string') : 'all',
        range: b.range === '7d' || b.range === '28d' ? b.range : 'default',
        message: typeof b.message === 'string' ? b.message.slice(0, MAX_MESSAGE) : '',
        since: typeof b.since === 'string' ? b.since : '',
    };
}

// ── time zones ───────────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
    let f = fmtCache.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        fmtCache.set(tz, f);
    }
    return f;
}

export interface Wall { y: number; mo: number; d: number; h: number; mi: number }

/** The wall clock of an instant in a time zone. */
export function wallClock(utcMs: number, tz: string): Wall {
    const parts = formatter(tz).formatToParts(new Date(utcMs));
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return { y: n('year'), mo: n('month'), d: n('day'), h: n('hour') % 24, mi: n('minute') };
}

/** Offset of a time zone from UTC at an instant, in ms (positive east). */
export function offsetAt(utcMs: number, tz: string): number {
    const w = wallClock(utcMs, tz);
    const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, 0);
    return asUtc - Math.floor(utcMs / 60_000) * 60_000;
}

const same = (a: Wall, b: Wall) => a.y === b.y && a.mo === b.mo && a.d === b.d && a.h === b.h && a.mi === b.mi;

/**
 * The instant whose wall clock in `tz` reads y-mo-d h:mi. A time that happens twice (clocks go back)
 * gives the first; a time that does not exist (clocks go forward) gives the moment the gap ends.
 */
export function zonedToUtc(w: Wall, tz: string): number {
    const guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, 0);
    const offsets = [...new Set([offsetAt(guess - 86_400_000, tz), offsetAt(guess + 86_400_000, tz)])];
    const hits = offsets.map((o) => guess - o).filter((t) => same(wallClock(t, tz), w)).sort((a, b) => a - b);
    if (hits.length) return hits[0];
    // In the gap: the offset from before the jump puts the time just after it.
    return guess - Math.min(...offsets);
}

export const daysInMonth = (y: number, mo: number): number => new Date(Date.UTC(y, mo, 0)).getUTCDate();

// ── occurrences ──────────────────────────────────────────────────────────

/** Does the schedule run on this local calendar day? */
export function runsOn(c: Pick<EmailScheduleConfig, 'frequency' | 'weekday' | 'monthDay'>, y: number, mo: number, d: number): boolean {
    if (c.frequency === 'daily') return true;
    if (c.frequency === 'weekly') return new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === c.weekday;
    return d === Math.min(c.monthDay, daysInMonth(y, mo));
}

export interface Occurrence { at: number; windowKey: string }

function occurrenceOn(c: EmailScheduleConfig, y: number, mo: number, d: number): number {
    const [h, mi] = c.time.split(':').map(Number);
    return zonedToUtc({ y, mo, d, h, mi }, c.timezone);
}

/** The latest occurrence at or before `now` (looks back 40 local days), or null. */
export function lastOccurrence(c: EmailScheduleConfig, now: number): Occurrence | null {
    const today = wallClock(now, c.timezone);
    let cursor = Date.UTC(today.y, today.mo - 1, today.d);
    for (let i = 0; i < 40; i++, cursor -= 86_400_000) {
        const day = new Date(cursor);
        const y = day.getUTCFullYear(), mo = day.getUTCMonth() + 1, d = day.getUTCDate();
        if (!runsOn(c, y, mo, d)) continue;
        const at = occurrenceOn(c, y, mo, d);
        if (at <= now) return { at, windowKey: new Date(at).toISOString() };
    }
    return null;
}

/** The next occurrence strictly after `now` (for the dialog's "Next email: ..." line), or null. */
export function nextOccurrence(c: EmailScheduleConfig, now: number): Occurrence | null {
    const today = wallClock(now, c.timezone);
    let cursor = Date.UTC(today.y, today.mo - 1, today.d);
    for (let i = 0; i < 400; i++, cursor += 86_400_000) {
        const day = new Date(cursor);
        const y = day.getUTCFullYear(), mo = day.getUTCMonth() + 1, d = day.getUTCDate();
        if (!runsOn(c, y, mo, d)) continue;
        const at = occurrenceOn(c, y, mo, d);
        if (at > now) return { at, windowKey: new Date(at).toISOString() };
    }
    return null;
}

/**
 * The occurrence to send now, if any: the latest one at or before `now` that is not older than the
 * grace period, not older than the moment the schedule was saved, and newer than the window already
 * claimed. Sending is then "claim this windowKey" (admin: one claim per window), so two cron runs
 * or a retry never send twice.
 */
export function dueWindow(c: EmailScheduleConfig, now: number, claimed: string | undefined | null): Occurrence | null {
    if (!c.enabled || c.recipients.length === 0) return null;
    const occ = lastOccurrence(c, now);
    if (!occ) return null;
    if (now - occ.at > GRACE_MS) return null;
    const since = c.since ? Date.parse(c.since) : NaN;
    if (Number.isFinite(since) && occ.at < since) return null;
    if (claimed && occ.windowKey <= claimed) return null;
    return occ;
}

/** "Every Monday at 09:00 (Europe/London)" */
export function describeSchedule(c: Pick<EmailScheduleConfig, 'frequency' | 'weekday' | 'monthDay' | 'time' | 'timezone'>): string {
    const when = c.frequency === 'daily' ? 'Every day' : c.frequency === 'weekly' ? `Every ${WEEKDAYS[c.weekday]}` : `Monthly on the ${ordinal(c.monthDay)}`;
    return `${when} at ${c.time} (${c.timezone})`;
}

export function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** The UTC day 'YYYY-MM-DD' of an instant (daily caps count per UTC day). */
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
