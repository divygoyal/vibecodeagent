// First portfolio sync: a transient Google failure (a 502 Bad Gateway page, a dropped connection) is retried
// silently and never stored as "HTTP 502"; a real, repeated failure ends as a plain message.
// Google and the admin store are faked at fetch level. Run: cd web && node --test tests/portfolioFirstSync.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = await import('../src/lib/portfolio/sync.ts');
const { inventoryRetry } = await import('../src/lib/sites/fetchInventory.ts');
const { adminStore, adminRetry } = await import('../src/lib/portfolio/adminStore.ts');

// Fast retries: the tuning objects are mutable on purpose.
sync.retryTuning.call = [1, 1, 1];
sync.retryTuning.later = [1];
sync.retryTuning.rounds = [1, 1];
inventoryRetry.delays = [1, 1];
adminRetry.delays = [1, 1];

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const badGateway = () => new Response('<html><title>Error 502 (Server Error)!!1</title></html>', { status: 502, headers: { 'content-type': 'text/html' } });

/** In-memory admin store plus a Google that fails on demand. `fail(kind, url, n)` returns a Response to fail call n (1-based) of that URL, or null. */
function fakeWorld({ fail = () => null } = {}) {
    const store = new Map(); // identifier -> Map(kind|id -> asset)
    const seen = new Map();
    const log = { google: [], admin: [] };
    const assetsOf = (id) => store.get(id) ?? store.set(id, new Map()).get(id);
    const fresh = (u) => ({
        asset_kind: u.kind, asset_id: u.asset_id, display_name: u.display_name ?? null, host: u.host ?? null, account_name: null,
        permission_level: u.permission_level ?? null, paired_with: u.paired_with ?? null, pairing_override: null, starred: false, hidden: false,
        missing: false, status: 'pending', last_error: null, last_synced_at: null, sync_started_at: null, data_start: null, data_end: null, backfill_done: false,
    });
    const real = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const u = new URL(url);
        const body = init.body ? JSON.parse(init.body) : undefined;
        if (u.hostname === 'admin-api') {
            log.admin.push(`${init.method ?? 'GET'} ${u.pathname}`);
            const m = /^\/api\/portfolio\/users\/([^/]+)\/(assets(?:\/status)?|metrics|snapshot)$/.exec(u.pathname);
            if (!m) return jsonRes({ detail: 'nope' }, 404);
            const id = decodeURIComponent(m[1]);
            const n = (seen.get(`admin ${m[2]}`) ?? 0) + 1;
            seen.set(`admin ${m[2]}`, n);
            const failed = fail('admin', `${init.method} ${m[2]}`, n);
            if (failed) return failed;
            if (m[2] === 'assets' && (init.method ?? 'GET') === 'GET') return jsonRes({ assets: [...assetsOf(id).values()] });
            if (m[2] === 'assets') {
                for (const up of body.assets) {
                    const k = `${up.kind}|${up.asset_id}`;
                    if (!assetsOf(id).has(k)) assetsOf(id).set(k, fresh(up));
                }
                return jsonRes({ assets: [...assetsOf(id).values()] });
            }
            if (m[2] === 'assets/status') {
                for (const up of body.updates) {
                    const a = assetsOf(id).get(`${up.kind}|${up.asset_id}`);
                    const rest = { ...up };
                    delete rest.kind;
                    delete rest.asset_id;
                    Object.assign(a, rest);
                }
                return jsonRes({ ok: true });
            }
            return jsonRes({ ok: true });
        }
        if (!/googleapis\.com$/.test(u.hostname)) throw new Error(`unexpected request ${url}`);
        const key = `${init.method ?? 'GET'} ${u.hostname}${u.pathname}`;
        const bodyKey = init.body ? String(init.body).slice(0, 200) : '';
        const n = (seen.get(`${key}|${bodyKey}`) ?? 0) + 1;
        seen.set(`${key}|${bodyKey}`, n);
        log.google.push(key);
        const failed = fail('google', key, n);
        if (failed) return failed;
        if (u.pathname.endsWith('/accountSummaries')) {
            return jsonRes({ accountSummaries: [{ account: 'accounts/1', displayName: 'Acme', propertySummaries: [{ property: 'properties/1', displayName: 'Acme' }] }] });
        }
        if (u.pathname.endsWith('/dataStreams')) return jsonRes({ dataStreams: [{ type: 'WEB_DATA_STREAM', webStreamData: { defaultUri: 'https://acme.test' } }] });
        if (u.pathname === '/webmasters/v3/sites') return jsonRes({ siteEntry: [{ siteUrl: 'sc-domain:acme.test', permissionLevel: 'siteOwner' }] });
        if (u.pathname.endsWith(':runReport')) {
            return jsonRes({ rows: [{ dimensionValues: [{ value: '20261001' }], metricValues: ['10', '12', '30', '1', '0.5'].map((value) => ({ value })) }] });
        }
        if (u.pathname.includes('/searchAnalytics/')) return jsonRes({ rows: [{ keys: ['2026-10-01'], clicks: 3, impressions: 40, ctr: 0.07, position: 8 }] });
        return jsonRes({ error: { code: 404, message: `fake google: ${key}` } }, 404);
    };
    return { store, log, assetsOf, restore: () => { globalThis.fetch = real; } };
}

let n = 0;
const run = (identifier, extra = {}) => sync.startSync({ identifier, accessToken: 'tok', reason: 'page', ...extra });
const quiet = async (fn) => {
    const { log, warn, error } = console;
    console.log = console.warn = console.error = () => {};
    try { return await fn(); } finally { Object.assign(console, { log, warn, error }); }
};

test('a first sync survives transient 502s on every data request: all synced, nothing says "HTTP 502"', async () => {
    const w = fakeWorld({ fail: (kind, key, count) => (kind === 'google' && /runReport|searchAnalytics/.test(key) && count <= 2 ? badGateway() : null) });
    try {
        const id = `first-${++n}`;
        const res = await quiet(() => run(id));
        assert.equal(res.synced, 2);
        assert.equal(res.failed, 0);
        assert.equal(res.googleError, null);
        const assets = [...w.assetsOf(id).values()];
        assert.deepEqual(assets.map((a) => a.status), ['synced', 'synced']);
        assert.ok(assets.every((a) => !a.last_error), 'no error text is stored for a failure that cleared');
        assert.ok(w.log.google.filter((g) => /runReport/.test(g)).length >= 3, 'the request was repeated');
    } finally { w.restore(); }
});

test('the extra rounds: a failure that outlasts the per-request retries keeps the asset "syncing" until a later round works', async () => {
    // 5 failures in a row: the 4 attempts of round 0 fail, round 1 fails once more, then a retry gets through.
    let ga4Failures = 0;
    const w = fakeWorld({ fail: (kind, key) => (kind === 'google' && /runReport/.test(key) && ga4Failures < 5 && ++ga4Failures ? badGateway() : null) });
    try {
        const id = `rounds-${++n}`;
        const statuses = [];
        const res = await quiet(async () => {
            const p = run(id);
            const timer = setInterval(() => statuses.push(...[...w.assetsOf(id).values()].filter((a) => a.asset_kind === 'ga4').map((a) => a.status)), 1);
            try { return await p; } finally { clearInterval(timer); }
        });
        assert.equal(res.failed, 0);
        assert.equal(res.synced, 2);
        assert.ok(!statuses.includes('error'), `the GA4 asset was never shown as an error (saw ${[...new Set(statuses)]})`);
    } finally { w.restore(); }
});

test('a real, repeated failure ends as a plain message, never "HTTP 502"', async () => {
    const w = fakeWorld({ fail: (kind, key) => (kind === 'google' && /runReport|searchAnalytics/.test(key) ? badGateway() : null) });
    try {
        const id = `down-${++n}`;
        const res = await quiet(() => run(id));
        assert.equal(res.synced, 0);
        assert.equal(res.failed, 2);
        const assets = [...w.assetsOf(id).values()];
        assert.deepEqual(assets.map((a) => a.status), ['error', 'error']);
        for (const a of assets) {
            assert.equal(a.last_error, 'Google had a temporary problem. Will retry shortly.');
            assert.doesNotMatch(a.last_error, /HTTP|502/);
        }
    } finally { w.restore(); }
});

test('quota (429) and "no access" (403) are not retried: they will not clear in seconds', async () => {
    const w = fakeWorld({ fail: (kind, key) => (kind === 'google' && /runReport/.test(key) ? jsonRes({ error: { code: 429, message: 'quota' } }, 429) : kind === 'google' && /searchAnalytics/.test(key) ? jsonRes({ error: { code: 403, message: 'denied' } }, 403) : null) });
    try {
        const id = `quota-${++n}`;
        const res = await quiet(() => run(id));
        assert.equal(res.failed, 1);
        assert.equal(res.noAccess, 1);
        assert.equal(w.log.google.filter((g) => /runReport/.test(g)).length, 1, 'one GA4 request, no retries');
        assert.equal(w.log.google.filter((g) => /searchAnalytics/.test(g)).length, 1);
        const byKind = Object.fromEntries([...w.assetsOf(id).values()].map((a) => [a.asset_kind, a]));
        assert.equal(byKind.ga4.last_error, 'Google quota reached; will retry later');
        assert.equal(byKind.gsc.status, 'no_access');
    } finally { w.restore(); }
});

test('the site listing retries a 502 as well (the first call of the first sync)', async () => {
    const w = fakeWorld({ fail: (kind, key, count) => (kind === 'google' && /accountSummaries|\/webmasters\/v3\/sites$/.test(key) && count <= 2 ? badGateway() : null) });
    try {
        const id = `inv-${++n}`;
        const res = await quiet(() => run(id));
        assert.equal(res.googleError, null);
        assert.equal(res.properties, 1);
        assert.equal(res.sites, 1);
        assert.equal(res.synced, 2);
    } finally { w.restore(); }
});

test('a listing that stays down says so in words, not "HTTP 502"', async () => {
    const w = fakeWorld({ fail: (kind, key) => (kind === 'google' && /accountSummaries|\/webmasters\/v3\/sites$/.test(key) ? badGateway() : null) });
    try {
        const res = await quiet(() => run(`inv-down-${++n}`));
        assert.equal(res.synced, 0);
        assert.ok(res.googleError);
        assert.equal(res.googleError.status, 502);
        assert.doesNotMatch(res.googleError.message, /HTTP/);
    } finally { w.restore(); }
});

test('the token can be fetched inside the sync (so the route answers at once); no token ends it with "access expired"', async () => {
    const w = fakeWorld();
    try {
        const id = `lazy-${++n}`;
        let asked = 0;
        const p = run(id, { accessToken: async () => { asked += 1; await new Promise((r) => setTimeout(r, 20)); return 'tok'; } });
        assert.equal(sync.isSyncRunning(id), true, 'registered as running before the token arrived');
        assert.equal(asked, 1);
        const res = await quiet(() => p);
        assert.equal(res.synced, 2);

        const id2 = `lazy-none-${++n}`;
        const before = w.log.admin.length;
        const none = await quiet(() => run(id2, { accessToken: async () => null }));
        assert.deepEqual(none.googleError, { status: 401, message: 'Google access expired. Reconnect Google.' });
        assert.equal(w.log.admin.length, before, 'nothing was written');
    } finally { w.restore(); }
});

test('the store retries a 500 ("database is locked") and a dropped connection before giving up', async () => {
    let calls = 0;
    const real = globalThis.fetch;
    globalThis.fetch = async () => {
        calls += 1;
        if (calls === 1) return jsonRes({ detail: 'database is locked' }, 500);
        if (calls === 2) throw new TypeError('fetch failed');
        return jsonRes({ assets: [], windows: {}, totals: [], series: {}, recent: {}, bucket_days: 1 });
    };
    try {
        const snap = await adminStore.snapshot('u1', { windows: [], bucket_days: 1, recent_days: 7, range_key: '28d' });
        assert.deepEqual(snap.assets, []);
        assert.equal(calls, 3);
        calls = 0;
        globalThis.fetch = async () => { calls += 1; return jsonRes({ detail: 'no such user' }, 404); };
        await assert.rejects(adminStore.getAssets('nobody'), (e) => e.status === 404);
        assert.equal(calls, 1, 'a 404 is an answer, not a failure to retry');
        calls = 0;
        globalThis.fetch = async () => { calls += 1; return jsonRes({ detail: 'boom' }, 500); };
        await assert.rejects(adminStore.getAssets('u1'), (e) => e.status === 500);
        assert.equal(calls, 3, 'two retries, then the error');
    } finally { globalThis.fetch = real; }
});

test('plainGoogleMessage and isTransientGoogleError', () => {
    const t = sync.isTransientGoogleError;
    assert.equal(t(new TypeError('fetch failed')), true);
    assert.equal(t(Object.assign(new Error('x'), { name: 'TimeoutError' })), true);
    assert.equal(t(new Error('plain')), false);
    assert.match(sync.plainGoogleMessage(Object.assign(new Error('x'), { name: 'TimeoutError' })), /did not answer in time/);
    assert.match(sync.plainGoogleMessage(new TypeError('fetch failed')), /temporary problem/);
});
