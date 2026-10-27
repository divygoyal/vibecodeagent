// Daily leaderboard refresh: which listings are due, when the scheduler looks again, the
// one-run-at-a-time guard, and how the board shows freshness.
// Run: cd web && node --test tests/leaderboardRefresh.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const plan = await import('../src/lib/leaderboard/refreshPlan.ts');
const { startLeaderboardScheduler } = await import('../src/lib/leaderboard/scheduledRefresh.ts');
const all = await import('../src/lib/leaderboard/refreshAll.ts');

const NOW = Date.parse('2026-10-27T12:00:00Z');
const H = 3_600_000;
const entry = (id, ageH) => ({
    user_id: id, entry_id: id, ga_property_id: `properties/${id}`, website_url: `https://s${id}.test`,
    access_token: 't', refresh_token: 'r',
    last_refreshed: ageH === null ? null : new Date(NOW - ageH * H).toISOString(),
});

test('planRefresh: minAge 0 refreshes every entry, oldest first, never-refreshed first', () => {
    const p = plan.planRefresh([entry(1, 3), entry(2, null), entry(3, 70)], NOW, 0);
    assert.deepEqual(p.due.map((e) => e.entry_id), [2, 3, 1]);
    assert.equal(p.fresh, 0);
    assert.equal(p.nextDueMs, null);
});

test('planRefresh: entries younger than minAge are left alone and tell when the first one is due', () => {
    const p = plan.planRefresh([entry(1, 3), entry(2, 30), entry(3, 19)], NOW, plan.SCHEDULER_MIN_AGE_MS);
    assert.deepEqual(p.due.map((e) => e.entry_id), [2]);
    assert.equal(p.fresh, 2);
    assert.equal(p.nextDueMs, 1 * H); // entry 3 turns 20 h old in one hour
});

test('planRefresh: an older admin API (no last_refreshed) or a bad date means due', () => {
    const noField = { ...entry(1, 1), last_refreshed: undefined };
    const bad = { ...entry(2, 1), last_refreshed: 'not a date' };
    const p = plan.planRefresh([noField, bad], NOW, plan.SCHEDULER_MIN_AGE_MS);
    assert.equal(p.due.length, 2);
});

test('nextRunDelayMs: a run that did work is followed by one a day later (jitter only adds)', () => {
    const lo = plan.nextRunDelayMs({ attempted: 5, nextDueMs: null }, () => 0);
    const hi = plan.nextRunDelayMs({ attempted: 5, nextDueMs: 3 * H }, () => 0.999999);
    assert.equal(lo, plan.RUN_INTERVAL_MS);
    assert.ok(hi >= plan.RUN_INTERVAL_MS && hi < plan.RUN_INTERVAL_MS + plan.RUN_JITTER_MS);
});

test('nextRunDelayMs: everything was fresh -> wake when the first entry becomes due, never sooner than 30 min', () => {
    assert.equal(plan.nextRunDelayMs({ attempted: 0, nextDueMs: 6 * H }, () => 0), 6 * H);
    assert.equal(plan.nextRunDelayMs({ attempted: 0, nextDueMs: 60_000 }, () => 0), plan.MIN_RECHECK_MS);
    assert.equal(plan.nextRunDelayMs({ attempted: 0, nextDueMs: 90 * H }, () => 0), plan.RUN_INTERVAL_MS);
    assert.equal(plan.nextRunDelayMs({ attempted: 0, nextDueMs: null }, () => 0), plan.RUN_INTERVAL_MS);
});

test('nextRunDelayMs: time budget ran out -> the rest soon', () => {
    assert.equal(plan.nextRunDelayMs({ attempted: 40, skippedBudget: 12, nextDueMs: null }, () => 0), plan.MIN_RECHECK_MS);
});

test('first run is 8-13 minutes after boot', () => {
    assert.equal(plan.firstRunDelayMs(() => 0), 8 * 60_000);
    assert.ok(plan.firstRunDelayMs(() => 0.999) < 13 * 60_000);
});

test('scheduler: starts once, looks after the first delay, then reschedules by the run summary', async () => {
    delete globalThis.__tcLeaderboardScheduler;
    const timers = [];
    let calls = 0;
    const summary = { attempted: 3, successCount: 3, failCount: 0, skippedFresh: 0, skippedBudget: 0, nextDueMs: null, ms: 5 };
    const hooks = {
        run: () => { calls += 1; return Promise.resolve(summary); },
        setTimer: (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; },
        rand: () => 0,
        firstDelayMs: 1234,
    };
    assert.equal(startLeaderboardScheduler(hooks), true);
    assert.equal(startLeaderboardScheduler(hooks), false, 'second start is a no-op');
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 1234);
    assert.equal(calls, 0);
    await timers[0].fn();
    assert.equal(calls, 1);
    assert.equal(timers.length, 2);
    assert.equal(timers[1].ms, plan.RUN_INTERVAL_MS);
    delete globalThis.__tcLeaderboardScheduler;
});

test('scheduler: a run in progress (cron route) or a failed run is retried later, not dropped', async () => {
    delete globalThis.__tcLeaderboardScheduler;
    const timers = [];
    const outcomes = [null, Promise.reject(new Error('admin down'))];
    const origError = console.error;
    console.error = () => {};
    try {
        startLeaderboardScheduler({
            run: () => outcomes.shift(),
            setTimer: (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; },
            rand: () => 0,
            firstDelayMs: 1,
        });
        await timers[0].fn(); // busy
        assert.equal(timers.length, 2);
        assert.ok(timers[1].ms > 0 && timers[1].ms < 60 * 60_000);
        await timers[1].fn(); // rejects
        assert.equal(timers.length, 3);
        assert.equal(timers[2].ms, 60 * 60_000);
    } finally {
        console.error = origError;
        delete globalThis.__tcLeaderboardScheduler;
    }
});

test('startLeaderboardRefresh: one run at a time; a second caller gets null until the first finishes', async () => {
    const realFetch = globalThis.fetch;
    let release;
    const gate = new Promise((r) => { release = r; });
    let listCalls = 0;
    globalThis.fetch = async () => {
        listCalls += 1;
        await gate;
        return new Response(JSON.stringify({ entries: [], total: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const log = console.log;
    console.log = () => {};
    try {
        const first = all.startLeaderboardRefresh({ reason: 'scheduler', minAgeMs: plan.SCHEDULER_MIN_AGE_MS });
        assert.ok(first);
        assert.equal(all.isLeaderboardRefreshRunning(), true);
        assert.equal(all.startLeaderboardRefresh({ reason: 'cron' }), null);
        release();
        const summary = await first;
        assert.equal(summary.total, 0);
        assert.equal(summary.attempted, 0);
        assert.equal(all.isLeaderboardRefreshRunning(), false);
        const again = all.startLeaderboardRefresh({ reason: 'cron' });
        assert.ok(again, 'a new run can start after the first finished');
        await again;
        assert.equal(listCalls, 2);
    } finally {
        globalThis.fetch = realFetch;
        console.log = log;
    }
});

test('startLeaderboardRefresh: an admin API failure rejects with RefreshListError and frees the guard', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('boom', { status: 500 });
    const err = console.error;
    const log = console.log;
    console.error = () => {};
    console.log = () => {};
    try {
        await assert.rejects(all.startLeaderboardRefresh({ reason: 'cron' }), (e) => e instanceof all.RefreshListError && e.status === 500);
        assert.equal(all.isLeaderboardRefreshRunning(), false);
    } finally {
        globalThis.fetch = realFetch;
        console.error = err;
        console.log = log;
    }
});

// ── board display: freshness line and optional columns ──

const { freshness } = await import('../src/lib/leaderboard/format.ts');
const { boardColumns, hasTrend, hasOffer } = await import('../src/lib/leaderboard/columns.ts');

const ago = (ms) => new Date(NOW - ms).toISOString();

test('freshness: under 36 h is "Updated N h ago" and the only level where "checked daily" holds', () => {
    assert.deepEqual(freshness(ago(30_000), NOW), { level: 'fresh', text: 'Updated just now' });
    assert.deepEqual(freshness(ago(17 * 60_000), NOW), { level: 'fresh', text: 'Updated 17 min ago' });
    assert.deepEqual(freshness(ago(3 * H + 20 * 60_000), NOW), { level: 'fresh', text: 'Updated 3 h ago' });
    assert.deepEqual(freshness(ago(35 * H), NOW), { level: 'fresh', text: 'Updated 35 h ago' });
});

test('freshness: a few days old is an absolute date, a week or more is stale and says so', () => {
    assert.deepEqual(freshness('2026-10-25T08:00:00Z', NOW), { level: 'recent', text: 'Updated Oct 25' });
    assert.deepEqual(freshness('2026-08-23T08:00:00Z', NOW), { level: 'stale', text: 'Last updated Aug 23' });
    assert.deepEqual(freshness('2025-12-30T08:00:00Z', NOW), { level: 'stale', text: 'Last updated Dec 30, 2025' });
});

test('freshness: no stamp, a bad stamp and a stamp in the future', () => {
    assert.deepEqual(freshness(null, NOW), { level: 'unknown', text: '' });
    assert.deepEqual(freshness('nope', NOW), { level: 'unknown', text: '' });
    assert.equal(freshness(new Date(NOW + 5 * H).toISOString(), NOW).level, 'fresh');
});

const row = (over = {}) => ({ spark: null, open_to: [], min_slot_price_cents: null, ad_slot_count: 0, ...over });
const spark = (values) => ({ metric: 'visitors', mode: 'exact', values });

test('boardColumns: nothing in a column for any row drops it', () => {
    assert.deepEqual(boardColumns([row(), row({ spark: spark([1]) }), row({ spark: spark([null, null]) })]), { trend: false, openTo: false });
});

test('boardColumns: one row with a trend (two real points) or an offer brings the column back', () => {
    assert.equal(hasTrend(row({ spark: spark([3, null, 5]) })), true);
    assert.equal(hasTrend(row({ spark: spark([3, null]) })), false);
    assert.equal(hasOffer(row({ open_to: ['acquisition'] })), true);
    assert.equal(hasOffer(row({ min_slot_price_cents: 5000, ad_slot_count: 2 })), true);
    assert.equal(hasOffer(row({ min_slot_price_cents: 5000, ad_slot_count: 0 })), false);
    assert.deepEqual(boardColumns([row(), row({ spark: spark([1, 2, 3]), open_to: ['sponsorships'] })]), { trend: true, openTo: true });
});

test('boardColumns: the offers tab always keeps its Open to column', () => {
    assert.equal(boardColumns([row()], 'offers').openTo, true);
    assert.equal(boardColumns([row()], 'top').openTo, false);
});
