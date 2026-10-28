// "Users (sum of sites)" stayed a skeleton forever (owner, batch 3). Cause: a Search Console site the user is not
// verified for was "due" in needsSync() but skipped by runSync(), so every page poll started an empty sync,
// `syncing` never cleared and the exact-users job (which waits for the sync) never ran.
// Run: cd web && node --test tests/portfolioUsersTotal.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = await import('../src/lib/portfolio/sync.ts');
const { usersTotalTile, usersLoadState, USERS_WAIT_MS } = await import('../src/lib/portfolio/view.ts');
const { adminRetry } = await import('../src/lib/portfolio/adminStore.ts');
adminRetry.delays = [1, 1];
sync.retryTuning.call = [1];

const NOW = 1_800_000_000;
const asset = (over) => ({
    asset_kind: 'ga4', asset_id: 'properties/1', status: 'synced', missing: false, hidden: false, permission_level: null,
    backfill_done: true, last_synced_at: NOW - 600, sync_started_at: NOW - 600, ...over,
});
// The preview account's rows: synced GA4 and GSC, plus unverified GSC sites marked "no access" long ago.
const unverified = asset({
    asset_kind: 'gsc', asset_id: 'https://unverified.example/', status: 'no_access', permission_level: 'siteUnverifiedUser',
    backfill_done: false, last_synced_at: null, sync_started_at: NOW - 70_000,
});

test('an unverified Search Console site never makes the portfolio sync again', () => {
    const assets = [asset({}), asset({ asset_kind: 'gsc', asset_id: 'sc-domain:ok.example', permission_level: 'siteOwner' }), unverified];
    assert.equal(sync.needsSync(assets, NOW), false);
    assert.deepEqual(sync.dueAssets(assets, NOW), []);
    assert.deepEqual(sync.dueAssets(assets, NOW, true).map((a) => a.asset_id).includes(unverified.asset_id), false, 'not even a forced sync fetches it');
});

test('page check and sync agree: whatever needsSync() sees as due, the sync fetches', () => {
    const verifiedNoAccess = asset({ asset_kind: 'gsc', asset_id: 'sc-domain:lost.example', status: 'no_access', permission_level: 'siteFullUser', backfill_done: false, last_synced_at: null, sync_started_at: NOW - 70_000 });
    const stale = asset({ last_synced_at: NOW - 7 * 3600 });
    for (const list of [[verifiedNoAccess], [stale], [unverified, stale], [unverified]]) {
        assert.equal(sync.needsSync(list, NOW), sync.dueAssets(list, NOW).length > 0);
    }
});

test('the users total: skeleton while exact users load, then a labelled estimate, exact once every site has it', () => {
    const traffic = (exact) => ({ cur: { users: 1200, usersExact: exact, sessions: 2000, pageviews: 3000, keyEvents: 0, engagementRate: null }, prev: null });
    const pending = usersTotalTile(traffic(false), { usersPending: true, siteCount: 5 });
    assert.deepEqual({ approx: pending.approx, loading: pending.loading, label: pending.label }, { approx: false, loading: true, label: 'Users (sum of sites)' });
    assert.match(pending.hint, /loading/);
    // Past the wait (or when the job could not run) the number is an estimate and says so in the label.
    const late = usersTotalTile(traffic(false), { usersPending: true, siteCount: 5, waitedOut: true });
    assert.deepEqual({ approx: late.approx, loading: late.loading, label: late.label }, { approx: true, loading: false, label: 'Users (sum, est.)' });
    assert.match(late.hint, /taking longer/);
    const partial = usersTotalTile(traffic(false), { usersPending: false, siteCount: 5 });
    assert.equal(partial.approx, true);
    assert.equal(partial.label, 'Users (sum, est.)');
    assert.match(partial.hint, /An estimate/);
    assert.equal(usersTotalTile(traffic(false), { usersPending: false, siteCount: 1 }).label, 'Users (est.)');
    const exact = usersTotalTile(traffic(true), { usersPending: true, siteCount: 1 });
    assert.deepEqual(exact, { label: 'Users', approx: false, loading: false, hint: undefined });
});

test('usersLoadState: exact wins, a skeleton only within the wait', () => {
    assert.equal(usersLoadState({ exact: true, pending: true, waitedOut: false }), 'exact');
    assert.equal(usersLoadState({ exact: false, pending: true, waitedOut: false }), 'loading');
    assert.equal(usersLoadState({ exact: false, pending: true, waitedOut: true }), 'estimate');
    assert.equal(usersLoadState({ exact: false, pending: false, waitedOut: false }), 'estimate');
    assert.ok(USERS_WAIT_MS >= 5000 && USERS_WAIT_MS <= 30000);
});

test('a range-users run that Google ends with 401 backs off instead of restarting on every poll', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Request had invalid authentication credentials.' } }), { status: 401 });
    const errors = console.error;
    console.error = () => {};
    try {
        const window = { cur_start: '2026-09-30', cur_end: '2026-10-27', prev_start: '2026-09-02', prev_end: '2026-09-29' };
        assert.equal(sync.rangeUsersFailedRecently('u401', '28d'), false);
        await sync.startRangeUsers({ identifier: 'u401', accessToken: 't', rangeKey: '28d', window, properties: ['properties/1', 'properties/2'] });
        assert.equal(sync.isRangeUsersRunning('u401', '28d'), false);
        assert.equal(sync.rangeUsersFailedRecently('u401', '28d'), true);
    } finally {
        globalThis.fetch = real;
        console.error = errors;
    }
});
