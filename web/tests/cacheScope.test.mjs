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
