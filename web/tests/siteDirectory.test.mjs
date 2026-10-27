// The site directory endpoint (lib/sites/directoryServer.ts): the Google lists load in parallel, are cached per user,
// share the caches of the existing list routes, a failure is remembered only briefly, and the fast variant answers
// from the portfolio store alone. Google and the admin store are faked at fetch level.
// Run: cd web && node --test tests/siteDirectory.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const dir = await import('../src/lib/sites/directoryServer.ts');
const { cachedFetch } = await import('../src/lib/apiCache.ts');
const { adminRetry } = await import('../src/lib/portfolio/adminStore.ts');
adminRetry.delays = [1, 1];

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const asset = (kind, id, over = {}) => ({
    asset_kind: kind, asset_id: id, display_name: kind === 'ga4' ? `Name of ${id}` : id, host: null, account_name: null, permission_level: kind === 'gsc' ? 'siteOwner' : null,
    paired_with: null, pairing_override: null, starred: false, hidden: false, missing: false, status: 'synced', last_error: null, last_synced_at: 1, sync_started_at: 1,
    data_start: null, data_end: null, backfill_done: true, ...over,
});

function world({ assets = [], gaDelay = 0, gscDelay = 0, ga = null, gsc = null } = {}) {
    const calls = { ga: 0, gsc: 0, admin: 0 };
    const real = globalThis.fetch;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    globalThis.fetch = async (input) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('analyticsadmin.googleapis.com')) {
            calls.ga += 1;
            await wait(gaDelay);
            return ga ? ga() : jsonRes({ accountSummaries: [{ propertySummaries: [{ property: 'properties/1', displayName: 'Acme', parent: 'accounts/1' }] }] });
        }
        if (url.includes('www.googleapis.com/webmasters/v3/sites')) {
            calls.gsc += 1;
            await wait(gscDelay);
            return gsc ? gsc() : jsonRes({ siteEntry: [{ siteUrl: 'sc-domain:acme.test', permissionLevel: 'siteOwner' }] });
        }
        if (url.includes('/api/portfolio/users/')) {
            calls.admin += 1;
            return jsonRes({ assets });
        }
        throw new Error(`unexpected request ${url}`);
    };
    return { calls, restore: () => { globalThis.fetch = real; } };
}

const ok = () => Promise.resolve({ ok: true, token: 'tok' });
let n = 0;
const user = () => `dir-user-${++n}`;
const quiet = async (fn) => {
    const { warn, error } = console;
    console.warn = console.error = () => {};
    try { return await fn(); } finally { Object.assign(console, { warn, error }); }
};

test('the two Google lists load in parallel, and the stored pairing comes with them', async () => {
    const w = world({ gaDelay: 300, gscDelay: 300, assets: [asset('gsc', 'sc-domain:acme.test'), asset('ga4', 'properties/1', { paired_with: 'sc-domain:acme.test' })] });
    try {
        const t0 = Date.now();
        const d = await dir.loadLiveDirectory(user(), ok);
        const took = Date.now() - t0;
        assert.ok(took < 550, `parallel: ${took} ms for two 300 ms lists`);
        assert.equal(d.source, 'live');
        assert.equal(d.connected, true);
        assert.deepEqual(d.sites, [{ siteUrl: 'sc-domain:acme.test', permissionLevel: 'siteOwner' }]);
        assert.equal(d.properties[0].property, 'properties/1');
        assert.deepEqual(d.pairs, { 'properties/1': 'sc-domain:acme.test' });
        assert.deepEqual(d.errors, {});
    } finally { w.restore(); }
});

test('the lists are cached per user (the second call makes no Google request) and shared with the list routes', async () => {
    const w = world();
    try {
        const id = user();
        await dir.loadLiveDirectory(id, ok);
        await dir.loadLiveDirectory(id, ok);
        assert.equal(w.calls.ga, 1);
        assert.equal(w.calls.gsc, 1);
        assert.equal(w.calls.admin, 2, 'the pairing is read fresh each time');
        // /api/seo?mode=list fills `gsc:sites:<user>` the same way: the directory finds it.
        const other = user();
        await cachedFetch(`gsc:sites:${other}`, 60_000, async () => [{ siteUrl: 'https://cached.test/', permissionLevel: 'siteFullUser' }]);
        const d = await dir.loadLiveDirectory(other, ok);
        assert.deepEqual(d.sites, [{ siteUrl: 'https://cached.test/', permissionLevel: 'siteFullUser' }]);
        assert.equal(w.calls.gsc, 1, 'no new Search Console request');
        assert.equal(w.calls.ga, 2, 'the property list was not cached for that user');
        // someone else's cache is not used
        await dir.loadLiveDirectory(user(), ok);
        assert.equal(w.calls.gsc, 2);
    } finally { w.restore(); }
});

test('refresh=1 skips the cached lists', async () => {
    const w = world();
    try {
        const id = user();
        await dir.loadLiveDirectory(id, ok);
        await dir.loadLiveDirectory(id, ok, { refresh: true });
        assert.equal(w.calls.ga, 2);
        assert.equal(w.calls.gsc, 2);
    } finally { w.restore(); }
});

test('one failing list is reported with a plain message and the other list still arrives; a failure is not cached for long', async () => {
    const w = world({ gsc: () => new Response('<html>502</html>', { status: 502 }) });
    try {
        const id = user();
        const d = await quiet(() => dir.loadLiveDirectory(id, ok));
        assert.deepEqual(d.sites, []);
        assert.equal(d.properties.length, 1, 'GA4 list unaffected');
        assert.equal(d.errors.sites.code, 'google_error');
        assert.doesNotMatch(d.errors.sites.message, /502|Google API error|<html/);
        assert.equal(d.errors.properties, undefined);
        await quiet(() => dir.loadLiveDirectory(id, ok));
        assert.equal(w.calls.gsc, 1, 'a polling client does not hammer Google during an outage (10 s memory)');
        await quiet(() => dir.loadLiveDirectory(id, ok, { refresh: true }));
        assert.equal(w.calls.gsc, 2, 'but "Check again" tries at once');
    } finally { w.restore(); }
});

test('revoked access, no Google at all, and a timeout', async () => {
    const w = world();
    try {
        const revoked = await dir.loadLiveDirectory(user(), () => Promise.resolve({ ok: false, reason: 'refresh_failed' }));
        assert.equal(revoked.connected, true);
        assert.equal(revoked.errors.sites.code, 'google_reauth');
        assert.equal(revoked.errors.properties.code, 'google_reauth');
        assert.equal(w.calls.ga + w.calls.gsc, 0, 'no Google request without a token');

        const none = await dir.loadLiveDirectory(user(), () => Promise.resolve({ ok: false, reason: 'not_connected' }));
        assert.equal(none.connected, false);
        assert.deepEqual(none.errors, {});
    } finally { w.restore(); }
    const slow = world({ ga: () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); } });
    try {
        const d = await quiet(() => dir.loadLiveDirectory(user(), ok));
        assert.equal(d.errors.properties.code, 'google_timeout');
    } finally { slow.restore(); }
});

test('source=store: the directory from the portfolio store alone, no Google request, missing assets left out', async () => {
    const w = world({ assets: [
        asset('gsc', 'sc-domain:acme.test'),
        asset('gsc', 'https://gone.test/', { missing: true }),
        asset('ga4', 'properties/1', { display_name: 'Acme – Web', paired_with: 'sc-domain:acme.test' }),
        asset('ga4', 'properties/2', { display_name: 'Only GA4' }),
    ] });
    try {
        const d = await dir.loadStoreDirectory(user());
        assert.equal(d.source, 'store');
        assert.deepEqual(d.sites, [{ siteUrl: 'sc-domain:acme.test', permissionLevel: 'siteOwner' }]);
        assert.deepEqual(d.properties.map((p) => [p.property, p.displayName]), [['properties/1', 'Acme – Web'], ['properties/2', 'Only GA4']]);
        assert.deepEqual(d.pairs, { 'properties/1': 'sc-domain:acme.test', 'properties/2': null });
        assert.equal(w.calls.ga + w.calls.gsc, 0);
    } finally { w.restore(); }
});

test('source=store with a user the store does not know yet (404) or an admin that is down: empty, not an error', async () => {
    const real = globalThis.fetch;
    try {
        globalThis.fetch = async () => jsonRes({ detail: 'no such user' }, 404);
        const d = await dir.loadStoreDirectory(user());
        assert.deepEqual([d.sites, d.properties, d.pairs], [[], [], {}]);
        globalThis.fetch = async () => jsonRes({ detail: 'database is locked' }, 500);
        const down = await quiet(() => dir.loadStoreDirectory(user()));
        assert.deepEqual([down.sites, down.properties], [[], []]);
    } finally { globalThis.fetch = real; }
});

test('the directory builder gives the store and the live answer the same route keys', async () => {
    const { buildSiteDirectory } = await import('../src/lib/sites/siteDirectory.ts');
    const assets = [asset('gsc', 'sc-domain:acme.test'), asset('ga4', 'properties/1', { paired_with: 'sc-domain:acme.test' }), asset('ga4', 'properties/9', { display_name: 'Solo' })];
    const w = world({ assets });
    try {
        const store = await dir.loadStoreDirectory(user());
        const live = await dir.loadLiveDirectory(user(), ok);
        const keys = (d) => buildSiteDirectory({ sites: d.sites, properties: d.properties, pairs: d.pairs }).map((e) => `${e.host}|${e.gscSiteUrl}|${e.ga4PropertyId}`).sort();
        assert.deepEqual(keys(store), ['acme.test|sc-domain:acme.test|properties/1', 'ga4-9|null|properties/9']);
        assert.deepEqual(keys(live).filter((k) => k.startsWith('acme.test')), ['acme.test|sc-domain:acme.test|properties/1']);
    } finally { w.restore(); }
});
