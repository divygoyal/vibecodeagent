/**
 * Scheduled dashboard email (round 9): validation, due-time calculation (time zones, daylight saving,
 * month ends) and the signed tokens.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/emailSchedule.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_CONFIG, GRACE_MS, dueWindow, lastOccurrence, nextOccurrence, normalizeEmail, validateSchedule, zonedToUtc, describeSchedule,
    type EmailScheduleConfig,
} from '@/lib/builder/email/schedule';
import { CONFIRM_TTL_MS, linkToken, signToken, verifyToken } from '@/lib/builder/email/tokens';

const cfg = (o: Partial<EmailScheduleConfig> = {}): EmailScheduleConfig => ({ ...DEFAULT_CONFIG, recipients: ['owner@example.com'], ...o });
const iso = (ms: number | undefined) => (ms === undefined ? undefined : new Date(ms).toISOString());
const Z = (s: string) => Date.parse(s);

// ── zonedToUtc ───────────────────────────────────────────────────────────

test('zonedToUtc: plain offsets, half-hour zones and the southern hemisphere', () => {
    assert.equal(iso(zonedToUtc({ y: 2026, mo: 1, d: 15, h: 9, mi: 0 }, 'Europe/London')), '2026-01-15T09:00:00.000Z');
    assert.equal(iso(zonedToUtc({ y: 2026, mo: 7, d: 15, h: 9, mi: 0 }, 'Europe/London')), '2026-07-15T08:00:00.000Z');
    assert.equal(iso(zonedToUtc({ y: 2026, mo: 10, d: 28, h: 9, mi: 0 }, 'Asia/Kolkata')), '2026-10-28T03:30:00.000Z');
    assert.equal(iso(zonedToUtc({ y: 2026, mo: 1, d: 15, h: 9, mi: 0 }, 'Pacific/Auckland')), '2026-01-14T20:00:00.000Z');
    assert.equal(iso(zonedToUtc({ y: 2026, mo: 10, d: 28, h: 23, mi: 45 }, 'America/Los_Angeles')), '2026-10-29T06:45:00.000Z');
});

test('zonedToUtc: spring forward gap runs right after the gap, fall back overlap takes the first time', () => {
    // New York 2026-03-08: 02:00 EST jumps to 03:00 EDT, so 02:30 does not exist.
    assert.equal(iso(zonedToUtc({ y: 2026, mo: 3, d: 8, h: 2, mi: 30 }, 'America/New_York')), '2026-03-08T07:30:00.000Z');
    assert.equal(iso(zonedToUtc({ y: 2026, mo: 3, d: 8, h: 3, mi: 0 }, 'America/New_York')), '2026-03-08T07:00:00.000Z');
    // New York 2026-11-01: 02:00 EDT goes back to 01:00 EST, so 01:30 happens twice; the first is EDT.
    assert.equal(iso(zonedToUtc({ y: 2026, mo: 11, d: 1, h: 1, mi: 30 }, 'America/New_York')), '2026-11-01T05:30:00.000Z');
    // The day after the change is back to a normal offset.
    assert.equal(iso(zonedToUtc({ y: 2026, mo: 11, d: 2, h: 9, mi: 0 }, 'America/New_York')), '2026-11-02T14:00:00.000Z');
});

test('daylight saving: a 09:00 daily email stays 09:00 local on both sides of the change', () => {
    const c = cfg({ frequency: 'daily', time: '09:00', timezone: 'Europe/London' });
    assert.equal(lastOccurrence(c, Z('2026-03-28T12:00:00Z'))?.windowKey, '2026-03-28T09:00:00.000Z'); // GMT
    assert.equal(lastOccurrence(c, Z('2026-03-29T12:00:00Z'))?.windowKey, '2026-03-29T08:00:00.000Z'); // BST from 01:00Z
    assert.equal(lastOccurrence(c, Z('2026-10-25T12:00:00Z'))?.windowKey, '2026-10-25T09:00:00.000Z'); // back to GMT on the 25th
    assert.equal(lastOccurrence(c, Z('2026-10-24T12:00:00Z'))?.windowKey, '2026-10-24T08:00:00.000Z');
});

test('daylight saving: the day with 23 hours and the day with 25 hours each get exactly one email', () => {
    const c = cfg({ frequency: 'daily', time: '02:30', timezone: 'America/New_York' });
    const keys = new Set<string>();
    for (let h = 0; h < 48; h++) {
        const o = lastOccurrence(c, Z('2026-03-07T12:00:00Z') + h * 3600_000);
        if (o) keys.add(o.windowKey);
    }
    // Mar 7 02:30 EST, Mar 8 (gap) 03:30 EDT, Mar 9 02:30 EDT
    assert.deepEqual([...keys].sort(), ['2026-03-07T07:30:00.000Z', '2026-03-08T07:30:00.000Z', '2026-03-09T06:30:00.000Z']);
    const fall = cfg({ frequency: 'daily', time: '01:30', timezone: 'America/New_York' });
    const fk = new Set<string>();
    for (let h = 0; h < 48; h++) {
        const o = lastOccurrence(fall, Z('2026-10-31T12:00:00Z') + h * 3600_000);
        if (o) fk.add(o.windowKey);
    }
    assert.deepEqual([...fk].sort(), ['2026-10-31T05:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-02T06:30:00.000Z']);
});

// ── weekly / monthly ─────────────────────────────────────────────────────

test('weekly: the weekday is the owner\'s local weekday, not the UTC one', () => {
    // Monday 09:00 in Auckland (UTC+13 in January) is Sunday 20:00 UTC.
    const c = cfg({ frequency: 'weekly', weekday: 1, time: '09:00', timezone: 'Pacific/Auckland' });
    assert.equal(lastOccurrence(c, Z('2026-01-20T00:00:00Z'))?.windowKey, '2026-01-18T20:00:00.000Z');
    // Sunday 23:30 in Los Angeles is Monday 07:30 UTC.
    const la = cfg({ frequency: 'weekly', weekday: 0, time: '23:30', timezone: 'America/Los_Angeles' });
    assert.equal(lastOccurrence(la, Z('2026-01-26T12:00:00Z'))?.windowKey, '2026-01-26T07:30:00.000Z');
});

test('monthly: a day that is not in the month runs on the last day (incl. leap years)', () => {
    const c = cfg({ frequency: 'monthly', monthDay: 31, time: '08:00', timezone: 'UTC' });
    assert.equal(lastOccurrence(c, Z('2026-02-28T09:00:00Z'))?.windowKey, '2026-02-28T08:00:00.000Z');
    assert.equal(lastOccurrence(c, Z('2026-02-27T09:00:00Z'))?.windowKey, '2026-01-31T08:00:00.000Z');
    assert.equal(lastOccurrence(c, Z('2028-02-29T09:00:00Z'))?.windowKey, '2028-02-29T08:00:00.000Z'); // leap year
    assert.equal(lastOccurrence(c, Z('2026-04-30T09:00:00Z'))?.windowKey, '2026-04-30T08:00:00.000Z');
    assert.equal(lastOccurrence(c, Z('2026-05-30T09:00:00Z'))?.windowKey, '2026-04-30T08:00:00.000Z'); // May has 31: the 31st is next
    const thirty = cfg({ frequency: 'monthly', monthDay: 30, time: '08:00', timezone: 'UTC' });
    assert.equal(lastOccurrence(thirty, Z('2026-02-28T09:00:00Z'))?.windowKey, '2026-02-28T08:00:00.000Z');
    const first = cfg({ frequency: 'monthly', monthDay: 1, time: '08:00', timezone: 'UTC' });
    assert.equal(nextOccurrence(first, Z('2026-12-15T00:00:00Z'))?.windowKey, '2027-01-01T08:00:00.000Z');
});

test('nextOccurrence is strictly after now and lastOccurrence at or before it', () => {
    const c = cfg({ frequency: 'daily', time: '09:00', timezone: 'UTC' });
    const at = Z('2026-10-28T09:00:00Z');
    assert.equal(lastOccurrence(c, at)?.windowKey, '2026-10-28T09:00:00.000Z');
    assert.equal(nextOccurrence(c, at)?.windowKey, '2026-10-29T09:00:00.000Z');
});

// ── dueWindow ────────────────────────────────────────────────────────────

test('dueWindow: sends once per window, only inside the grace period, never before the schedule was saved', () => {
    const c = cfg({ frequency: 'daily', time: '09:00', timezone: 'UTC', since: '2026-10-20T00:00:00Z' });
    const w = '2026-10-28T09:00:00.000Z';
    assert.equal(dueWindow(c, Z('2026-10-28T08:59:00Z'), '2026-10-27T09:00:00.000Z'), null, 'not yet');
    assert.equal(dueWindow(c, Z('2026-10-28T09:00:00Z'), '2026-10-27T09:00:00.000Z')?.windowKey, w, 'on the minute');
    assert.equal(dueWindow(c, Z('2026-10-28T09:14:00Z'), '2026-10-27T09:00:00.000Z')?.windowKey, w, 'a later cron run in the same window');
    assert.equal(dueWindow(c, Z('2026-10-28T09:14:00Z'), w), null, 'already claimed: no second send');
    assert.equal(dueWindow(c, Z('2026-10-28T09:14:00Z'), '2026-10-29T09:00:00.000Z'), null, 'a newer claim also blocks');
    assert.equal(dueWindow(c, Z('2026-10-28T09:00:00Z') + GRACE_MS + 60_000, '2026-10-27T09:00:00.000Z'), null, 'cron was down for hours: skip');
    const fresh = cfg({ frequency: 'daily', time: '09:00', timezone: 'UTC', since: '2026-10-28T10:00:00Z' });
    assert.equal(dueWindow(fresh, Z('2026-10-28T10:05:00Z'), null), null, 'saved after today\'s time: first email is tomorrow');
    assert.equal(dueWindow(fresh, Z('2026-10-29T09:05:00Z'), null)?.windowKey, '2026-10-29T09:00:00.000Z');
});

test('dueWindow: disabled or without recipients is never due', () => {
    assert.equal(dueWindow(cfg({ enabled: false, time: '09:00', frequency: 'daily', timezone: 'UTC' }), Z('2026-10-28T09:01:00Z'), null), null);
    assert.equal(dueWindow(cfg({ recipients: [], time: '09:00', frequency: 'daily', timezone: 'UTC' }), Z('2026-10-28T09:01:00Z'), null), null);
});

test('a 15-minute cron never misses and never doubles a daily window over a month incl. both DST changes', () => {
    const c = cfg({ frequency: 'daily', time: '09:00', timezone: 'Europe/London', since: '2026-03-01T00:00:00Z' });
    let claimed: string | null = null;
    const sent: string[] = [];
    for (let t = Z('2026-03-20T00:00:00Z'); t < Z('2026-04-05T00:00:00Z'); t += 15 * 60_000) {
        const due = dueWindow(c, t, claimed);
        if (due) { claimed = due.windowKey; sent.push(due.windowKey); }
    }
    assert.equal(sent.length, 16);
    assert.equal(new Set(sent).size, 16);
    assert.ok(sent.includes('2026-03-29T08:00:00.000Z'));
});

test('describeSchedule', () => {
    assert.equal(describeSchedule({ frequency: 'weekly', weekday: 1, monthDay: 1, time: '09:00', timezone: 'Europe/London' }), 'Every Monday at 09:00 (Europe/London)');
    assert.equal(describeSchedule({ frequency: 'monthly', weekday: 1, monthDay: 22, time: '18:15', timezone: 'UTC' }), 'Monthly on the 22nd at 18:15 (UTC)');
    assert.equal(describeSchedule({ frequency: 'monthly', weekday: 1, monthDay: 11, time: '18:15', timezone: 'UTC' }), 'Monthly on the 11th at 18:15 (UTC)');
});

// ── validation ───────────────────────────────────────────────────────────

const base = { enabled: true, recipients: ['Owner@Example.com'], frequency: 'weekly', weekday: 1, monthDay: 1, time: '09:00', timezone: 'Europe/London', pages: 'all', range: '7d', message: ' Hi ' };
const opts = { knownPageIds: ['p1', 'p2'], since: '2026-10-28T10:00:00.000Z' };

test('validateSchedule: lower-cases, dedupes, trims and stamps `since` from the server', () => {
    const r = validateSchedule({ ...base, recipients: ['Owner@Example.com', 'owner@example.com '], since: '1999-01-01' }, opts);
    assert.ok(r.ok);
    if (r.ok) {
        assert.deepEqual(r.value.recipients, ['owner@example.com']);
        assert.equal(r.value.since, opts.since);
        assert.equal(r.value.message, 'Hi');
        assert.equal(r.value.range, '7d');
    }
});

test('validateSchedule: recipient rules (max 10, valid addresses, no header injection, at least one)', () => {
    const many = Array.from({ length: 11 }, (_, i) => `u${i}@example.com`);
    assert.equal(validateSchedule({ ...base, recipients: many }, opts).ok, false);
    assert.equal(validateSchedule({ ...base, recipients: many.slice(0, 10) }, opts).ok, true);
    for (const bad of ['nope', 'a@b', 'a b@example.com', 'x@example.com, y@example.com', 'x@example.com\nbcc: y@example.com', '<x@example.com>', 'Name <x@example.com>', '@example.com', 'x@@example.com']) {
        assert.equal(validateSchedule({ ...base, recipients: [bad] }, opts).ok, false, bad);
        assert.equal(normalizeEmail(bad), null, bad);
    }
    assert.equal(validateSchedule({ ...base, recipients: [] }, opts).ok, false);
    assert.equal(validateSchedule({ ...base, recipients: [], enabled: false }, opts).ok, true, 'a paused schedule may have no recipients');
});

test('validateSchedule: time, zone, pages', () => {
    assert.equal(validateSchedule({ ...base, time: '09:07' }, opts).ok, false);
    assert.equal(validateSchedule({ ...base, time: '24:00' }, opts).ok, false);
    assert.equal(validateSchedule({ ...base, timezone: 'Mars/Base' }, opts).ok, false);
    assert.equal(validateSchedule({ ...base, pages: ['zzz'] }, opts).ok, false);
    const r = validateSchedule({ ...base, pages: ['p1'] }, opts);
    assert.ok(r.ok && Array.isArray(r.value.pages) && r.value.pages[0] === 'p1');
    const all = validateSchedule({ ...base, pages: ['p1', 'p2'] }, opts);
    assert.ok(all.ok && all.value.pages === 'all');
});

// ── tokens ───────────────────────────────────────────────────────────────

test('tokens: a signed link verifies, a changed one does not, and another secret does not', () => {
    const t = linkToken('unsub', 'dash-1', 'Fan@Example.com', 1000, 'secret-a');
    const p = verifyToken(t, 2000, 'secret-a');
    assert.deepEqual(p && { k: p.k, ...(p.k !== 'img' ? { d: p.d, e: p.e } : {}) }, { k: 'unsub', d: 'dash-1', e: 'fan@example.com' });
    const [body, sig] = t.split('.');
    const other = Buffer.from(JSON.stringify({ k: 'unsub', d: 'dash-1', e: 'victim@example.com' })).toString('base64url');
    assert.equal(verifyToken(`${other}.${sig}`, 2000, 'secret-a'), null, 'edited payload');
    assert.equal(verifyToken(`${body}.${sig.slice(0, -2)}xx`, 2000, 'secret-a'), null, 'edited signature');
    assert.equal(verifyToken(t, 2000, 'secret-b'), null, 'other secret');
    assert.equal(verifyToken('', 2000, 'secret-a'), null);
    assert.equal(verifyToken(undefined, 2000, 'secret-a'), null);
    assert.equal(verifyToken('abc', 2000, 'secret-a'), null);
});

test('tokens: unsubscribe never expires, the confirmation link lasts 14 days', () => {
    const u = linkToken('unsub', 'd', 'a@example.com', 0, 's');
    assert.ok(verifyToken(u, 5 * 365 * 86_400_000, 's'));
    const c = linkToken('confirm', 'd', 'a@example.com', 0, 's');
    assert.ok(verifyToken(c, CONFIRM_TTL_MS - 1, 's'));
    assert.equal(verifyToken(c, CONFIRM_TTL_MS + 1, 's'), null);
    const d = linkToken('decline', 'd', 'a@example.com', 0, 's');
    assert.ok(verifyToken(d, 5 * 365 * 86_400_000, 's'));
});

test('tokens: no secret in production signs and verifies nothing', () => {
    assert.throws(() => signToken({ k: 'img', c: {} }, null));
    assert.equal(verifyToken('x.y', 0, null), null);
});
