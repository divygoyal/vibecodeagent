// Server caches never serve one user's Google data to another (security review F3), and stay bounded (F4).
// Run: cd web && node --test tests/cacheScope.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const { installDemoGoogleFetch } = await import('../src/lib/demo/fetchShim.ts');
installDemoGoogleFetch('full'); // Google answered by the demo generator, with its per-account permissions
const { fetchShareOverviewTopConversions } = await import('../src/lib/shareOverviewData.ts');
const { cachedFetch, apiCacheStats, API_CACHE_MAX_ENTRIES, API_CACHE_MAX_BYTES } = await import('../src/lib/apiCache.ts');

test('overview data cache is scoped to the credential: another account gets no cached rows for a property it cannot read', async () => {
    const input = { propertyId: 'properties/412300101', range: '28d', filters: [] };
    const owner = await fetchShareOverviewTopConversions({ ...input, accessToken: 'demo-access:main' });
    assert.ok(owner.items.length > 0, 'the owner sees conversions');
    // Account "alt" (Puzzle Hub, Creative Prints) has no access to Acme: it must reach Google (403 → empty), never the
    // owner's cached rows. Before the fix this returned the owner's items.
    const other = await fetchShareOverviewTopConversions({ ...input, accessToken: 'demo-access:alt' });
    assert.deepEqual(other.items, []);
    // The owner's own repeat is still served (same credential, same scope).
    assert.deepEqual(await fetchShareOverviewTopConversions({ ...input, accessToken: 'demo-access:main' }), owner);
});

test('realtime and AI snapshot caches are keyed by user, and realtime checks the property', () => {
    const rt = fs.readFileSync(new URL('../src/app/api/analytics/realtime/route.ts', import.meta.url), 'utf8');
    assert.match(rt, /`realtime:\$\{userId\}:/);
    assert.doesNotMatch(rt, /`realtime:\$\{realtimePropertyId\}`/);
    assert.match(rt, /canReadProperty\(req, String\(userId\)/);
    assert.match(rt, /canReadGa4Property\(/);
    const snap = fs.readFileSync(new URL('../src/lib/chatSnapshot.ts', import.meta.url), 'utf8');
    for (const kind of ['cohort', 'journey', 'events', 'geoConv', 'timePat']) assert.match(snap, new RegExp(`chatSnapshot:${kind}:\\$\\{userId\\}:`));
});

test('apiCache stays within its entry bound', async () => {
    for (let i = 0; i < API_CACHE_MAX_ENTRIES + 300; i++) await cachedFetch(`bound-test:${i}`, 60_000, async () => ({ i }));
    assert.ok(apiCacheStats().entries <= API_CACHE_MAX_ENTRIES, JSON.stringify(apiCacheStats()));
    // the newest entries survive, the oldest went first
    let hits = 0;
    await cachedFetch(`bound-test:${API_CACHE_MAX_ENTRIES + 299}`, 60_000, async () => { hits++; return {}; });
    assert.equal(hits, 0, 'newest entry was evicted');
    await cachedFetch('bound-test:0', 60_000, async () => { hits++; return {}; });
    assert.equal(hits, 1, 'oldest entry should have been evicted');
});

test('apiCache stays within its byte bound', async () => {
    const big = 'x'.repeat(3 * 1024 * 1024);
    for (let i = 0; i < 30; i++) await cachedFetch(`bytes-test:${i}`, 60_000, async () => ({ big, i }));
    assert.ok(apiCacheStats().bytes <= API_CACHE_MAX_BYTES, JSON.stringify(apiCacheStats()));
});

test('N2: demo requests use their own small bucket and cannot evict real users\' entries', async () => {
    const { cachedFetchIn, DEMO_CACHE_MAX_ENTRIES } = await import('../src/lib/apiCache.ts');
    let calls = 0;
    await cachedFetchIn('main', 'real-user:1:dash', 60_000, async () => { calls++; return { real: true }; });
    for (let i = 0; i < DEMO_CACHE_MAX_ENTRIES * 3; i++) await cachedFetchIn('demo', `demo-flood:${i}`, 60_000, async () => ({ i }));
    assert.ok(apiCacheStats('demo').entries <= DEMO_CACHE_MAX_ENTRIES, JSON.stringify(apiCacheStats('demo')));
    await cachedFetchIn('main', 'real-user:1:dash', 60_000, async () => { calls++; return { real: true }; });
    assert.equal(calls, 1, 'the real user\'s entry survived the demo flood');
    // and the buckets do not read each other
    let demoCalls = 0;
    await cachedFetchIn('demo', 'real-user:1:dash', 60_000, async () => { demoCalls++; return { demo: true }; });
    assert.equal(demoCalls, 1, 'a demo request never reads a real user\'s entry');
});

test('N4: realtime access reloads the inventory once before refusing a new property', async () => {
    const { canReadGa4Property } = await import('../src/lib/realtimeAccess.ts');
    const calls = [];
    let googleHasNew = false;
    const load = async (opts) => {
        calls.push(Boolean(opts.refresh));
        return { properties: [{ property: 'properties/111' }, ...(opts.refresh && googleHasNew ? [{ property: 'properties/222' }] : [])] };
    };
    const t = 9_000_000;
    assert.equal(await canReadGa4Property('u1', 'properties/111', load, t), true);
    googleHasNew = true;
    assert.equal(await canReadGa4Property('u1', 'properties/222', load, t), true, 'a property added since the cache works at once');
    assert.deepEqual(calls, [false, false, true]);
    googleHasNew = false;
    calls.length = 0;
    assert.equal(await canReadGa4Property('u2', 'properties/999', load, t), false);
    assert.equal(await canReadGa4Property('u2', 'properties/999', load, t + 1000), false);
    assert.deepEqual(calls, [false, true, false], 'at most one reload a minute per user');
    // the public demo user: catalogue only, no inventory
    assert.equal(await canReadGa4Property('tc-public-demo', 'properties/412300101', async () => { throw new Error('no'); }, t), true);
    assert.equal(await canReadGa4Property('tc-public-demo', 'properties/123', async () => { throw new Error('no'); }, t), false);
});
