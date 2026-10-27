// Stale "syncing" (portfolio) and Google error mapping (API routes). Run: cd web && node --test tests/robustErrors.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { needsSync } = await import('../src/lib/portfolio/sync.ts');
const { SYNC_STUCK_S } = await import('../src/lib/portfolio/ranges.ts');
const { describeGoogleError } = await import('../src/lib/googleErrors.ts');

const NOW = 1_800_000_000;
const asset = (over) => ({
    asset_kind: 'ga4', asset_id: 'properties/1', status: 'synced', missing: false, hidden: false,
    backfill_done: true, last_synced_at: NOW - 600, sync_started_at: NOW - 600, ...over,
});

test('a recent heartbeat means a live sync: not due', () => {
    assert.equal(needsSync([asset({ status: 'syncing', sync_started_at: NOW - 30 })], NOW), false);
});

test('syncing with no heartbeat for SYNC_STUCK_S is interrupted: due again, even with fresh data', () => {
    assert.equal(SYNC_STUCK_S <= 180, true);
    assert.equal(needsSync([asset({ status: 'syncing', sync_started_at: NOW - SYNC_STUCK_S - 5 })], NOW), true);
    assert.equal(needsSync([asset({ status: 'syncing', sync_started_at: NOW - SYNC_STUCK_S - 5, backfill_done: false, last_synced_at: null })], NOW), true);
});

test('google errors map to clean codes, never Google\'s body', () => {
    const raw = (status) => new Error(`Google API error ${status}: {"error":{"code":${status},"status":"X"}}`);
    assert.deepEqual(describeGoogleError(raw(401)), { status: 401, error: 'google_reauth', message: 'Google access expired or was revoked. Reconnect Google.' });
    assert.equal(describeGoogleError('Failed to refresh Google token').error, 'google_reauth');
    assert.equal(describeGoogleError(raw(429)).status, 502);
    assert.equal(describeGoogleError(raw(429)).error, 'google_rate_limited');
    assert.equal(describeGoogleError(raw(403)).error, 'google_forbidden');
    assert.equal(describeGoogleError(raw(500)).status, 502);
    assert.equal(describeGoogleError('Google Analytics property list request timed out').status, 504);
    for (const e of [raw(401), raw(403), raw(429), raw(500), 'weird']) assert.doesNotMatch(describeGoogleError(e).message, /\{|Google API error/);
});

test('shared pages: 502/503 only, no reconnect wording for viewers', () => {
    const raw = (status) => new Error(`Google API error ${status}: x`);
    assert.deepEqual(describeGoogleError(raw(401), { shared: true }), { status: 503, error: 'google_unavailable', message: 'Analytics data is temporarily unavailable.' });
    for (const s of [401, 403, 429, 500, 504]) assert.ok([502, 503].includes(describeGoogleError(raw(s), { shared: true }).status), String(s));
});
