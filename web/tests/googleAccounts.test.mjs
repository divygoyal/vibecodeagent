// Extra Google accounts ("Connect another Google account"): the union inventory (tagging + dedupe,
// primary first), per-asset token routing, a revoked extra account, disconnect, the portfolio sync
// reading each asset with its own account's token, and the link flow's PKCE / state / id_token checks.
// Google is the demo generator (lib/demo: it refuses a property or site the token's account cannot
// read), the admin is faked at fetch level. Run: cd web && node --test tests/googleAccounts.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ADMIN_API_URL = 'http://admin-api:8000';
process.env.ADMIN_API_KEY = 'test-key';

const union = await import('../src/lib/sites/unionInventory.ts');
const accounts = await import('../src/lib/googleAccounts.ts');
const link = await import('../src/lib/googleLink.ts');
const sync = await import('../src/lib/portfolio/sync.ts');
const { adminRetry } = await import('../src/lib/portfolio/adminStore.ts');
const { inventoryRetry } = await import('../src/lib/sites/fetchInventory.ts');
const { demoGoogleFetch } = await import('../src/lib/demo/fetchShim.ts');
const { demoAccountSub } = await import('../src/lib/demo/catalog.ts');

sync.retryTuning.call = [1, 1, 1];
sync.retryTuning.later = [1];
sync.retryTuning.rounds = [1, 1];
inventoryRetry.delays = [1, 1];
adminRetry.delays = [1, 1];

const SUB2 = demoAccountSub('multi2');
const PRIMARY = { refreshToken: 'demo-refresh:multi' };
const linkedConn = (refresh = 'demo-refresh:multi2') => ({ sub: SUB2, email: 'multi.agency@trafficclaw.example', name: 'Agency', status: 'connected', access_token: null, refresh_token: refresh, created_at: '2026-10-27T00:00:00Z' });

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const quiet = async (fn) => {
    const { log, warn, error } = console;
    console.log = console.warn = console.error = () => {};
    try { return await fn(); } finally { Object.assign(console, { log, warn, error }); }
};

/** The admin (linked accounts + portfolio store) faked in memory, Google answered by the demo generator. */
function world({ linked = [] } = {}) {
    const state = { linked: new Map(), patches: [], store: new Map(), google: [] };
    const real = globalThis.fetch;
    const refuse = () => Promise.reject(new Error('network disabled in tests'));
    const assetsOf = (id) => state.store.get(id) ?? state.store.set(id, new Map()).get(id);
    globalThis.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const u = new URL(url);
        const method = init.method ?? 'GET';
        if (u.hostname === 'admin-api') {
            let m = /^\/api\/users\/([^/]+)\/google\/linked(?:\/([^/]+))?$/.exec(u.pathname);
            if (m) {
                const id = decodeURIComponent(m[1]);
                if (method === 'GET') return jsonRes({ linked: state.linked.get(id) ?? linked });
                if (method === 'PATCH') {
                    const body = JSON.parse(init.body);
                    state.patches.push({ id, sub: decodeURIComponent(m[2]), status: body.status });
                    const list = (state.linked.get(id) ?? linked).map((c) => (c.sub === decodeURIComponent(m[2]) ? { ...c, status: body.status } : c));
                    state.linked.set(id, list);
                    return jsonRes({ ok: true });
                }
            }
            m = /^\/api\/portfolio\/users\/([^/]+)\/(assets(?:\/status)?|metrics)$/.exec(u.pathname);
            if (m) {
                const id = decodeURIComponent(m[1]);
                const body = init.body ? JSON.parse(init.body) : undefined;
                if (m[2] === 'assets' && method === 'GET') return jsonRes({ assets: [...assetsOf(id).values()] });
                if (m[2] === 'assets') {
                    const keep = new Set(body.assets.map((a) => `${a.kind}|${a.asset_id}`));
                    for (const up of body.assets) {
                        const k = `${up.kind}|${up.asset_id}`;
                        const prev = assetsOf(id).get(k);
                        assetsOf(id).set(k, {
                            status: 'pending', last_error: null, last_synced_at: null, sync_started_at: null, data_start: null, data_end: null, backfill_done: false,
                            starred: false, hidden: false, pairing_override: null, ...prev,
                            asset_kind: up.kind, asset_id: up.asset_id, display_name: up.display_name ?? null, host: up.host ?? null, account_name: up.account_name ?? null,
                            permission_level: up.permission_level ?? null, paired_with: up.paired_with ?? null, connection_id: up.connection_id ?? null, missing: false,
                        });
                    }
                    for (const kind of body.complete_kinds) {
                        for (const [k, a] of assetsOf(id)) if (a.asset_kind === kind && !keep.has(k)) a.missing = true;
                    }
                    return jsonRes({ assets: [...assetsOf(id).values()] });
                }
                if (m[2] === 'assets/status') {
                    for (const up of body.updates) {
                        const a = assetsOf(id).get(`${up.kind}|${up.asset_id}`);
                        if (!a) continue;
                        const rest = { ...up };
                        delete rest.kind;
                        delete rest.asset_id;
                        Object.assign(a, rest);
                    }
                }
                return jsonRes({ ok: true });
            }
            return jsonRes({ detail: 'not faked' }, 404);
        }
        const res = await demoGoogleFetch(input, init, refuse);
        if (!res) throw new Error(`unexpected request ${url}`);
        const auth = new Headers(init.headers).get('authorization') ?? '';
        state.google.push({ path: `${u.hostname}${decodeURIComponent(u.pathname)}`, token: auth.replace(/^Bearer\s+/i, ''), status: res.status });
        return res;
    };
    accounts.invalidateGoogleConnections();
    return { state, assetsOf, restore: () => { globalThis.fetch = real; } };
}

let n = 0;
const uid = (tag) => `${tag}-${++n}-${Date.now()}`;

// ─── pure union ───

test('mergeInventories: union of every connection, each asset tagged, a shared asset credited to the primary', () => {
    const inv = (props, sites, errors = {}) => ({ properties: props.map((p) => ({ property: p, displayName: p, streamUris: [] })), sites: sites.map((s) => ({ siteUrl: s })), errors, fetchedAt: 1 });
    const u = union.mergeInventories([
        { connectionId: 'L1', primary: false, email: 'b@x', state: 'ok', inventory: inv(['properties/2', 'properties/1'], ['https://b.test/', 'sc-domain:a.test']) },
        { connectionId: 'primary', primary: true, state: 'ok', inventory: inv(['properties/1'], ['sc-domain:a.test']) },
    ]);
    assert.deepEqual(u.properties.map((p) => [p.property, p.connectionId]), [['properties/1', 'primary'], ['properties/2', 'L1']]);
    assert.deepEqual(u.sites.map((s) => [s.siteUrl, s.connectionId]), [['sc-domain:a.test', 'primary'], ['https://b.test/', 'L1']]);
    const l1 = u.connections.find((c) => c.connectionId === 'L1');
    assert.deepEqual([l1.properties, l1.ownProperties, l1.sites, l1.ownSites], [2, 1, 2, 1]);
    // Lookups tolerate "123" vs "properties/123" and a trailing slash.
    assert.equal(union.connectionOf(u, { kind: 'ga4', id: '2' }), 'L1');
    assert.equal(union.connectionOf(u, { kind: 'gsc', id: 'https://B.test' }), 'L1');
    assert.equal(union.connectionOf(u, { kind: 'gsc', id: 'sc-domain:nope.test' }), null);
    // errors stay the primary's (what "Reconnect Google" keys on); a linked failure does not leak into them.
    const e = union.mergeInventories([
        { connectionId: 'primary', primary: true, state: 'ok', inventory: inv(['properties/1'], []) },
        { connectionId: 'L1', primary: false, state: 'needs_reconnect' },
    ]);
    assert.deepEqual(e.errors, {});
    assert.equal(e.connections[1].state, 'needs_reconnect');
});

// ─── routing ───

test('without linked accounts every asset uses the primary credentials and no inventory is fetched', async () => {
    const w = world();
    try {
        const id = uid('single');
        const c = await accounts.credentialsForAsset(id, { kind: 'ga4', id: 'properties/412300104' }, async () => PRIMARY);
        assert.equal(c.connectionId, 'primary');
        assert.equal(c.refreshToken, PRIMARY.refreshToken);
        assert.equal(w.state.google.length, 0);
    } finally { w.restore(); }
});

test('per-asset token routing: an asset only the linked account lists gets its token; shared and unknown assets stay primary', async () => {
    const w = world({ linked: [linkedConn()] });
    try {
        const id = uid('route');
        const primary = async () => PRIMARY;
        const puzzle = await accounts.credentialsForAsset(id, { kind: 'ga4', id: 'properties/412300104' }, primary);
        assert.deepEqual([puzzle.connectionId, puzzle.refreshToken], [SUB2, 'demo-refresh:multi2']);
        const health = await accounts.credentialsForAsset(id, { kind: 'gsc', id: 'https://www.healthinsights.example/' }, primary);
        assert.equal(health.connectionId, SUB2);
        // Acme's Search Console site is in both accounts: the primary wins.
        const acme = await accounts.credentialsForAsset(id, { kind: 'gsc', id: 'sc-domain:acmeanalytics.example' }, primary);
        assert.equal(acme.connectionId, 'primary');
        const unknown = await accounts.credentialsForAsset(id, { kind: 'ga4', id: 'properties/999' }, primary);
        assert.equal(unknown.connectionId, 'primary');

        // The token actually reads the data: the demo Google refuses a property the token's account cannot see.
        const access = await accounts.accessForAsset(id, { kind: 'ga4', id: 'properties/412300104' }, primary);
        assert.deepEqual(access, { ok: true, token: 'demo-access:multi2', connectionId: SUB2 });
        const res = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/412300104:runReport', {
            method: 'POST', headers: { Authorization: `Bearer ${access.token}` }, body: JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'activeUsers' }] }),
        });
        assert.equal(res.status, 200);
        const wrong = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/412300104:runReport', {
            method: 'POST', headers: { Authorization: 'Bearer demo-access:multi' }, body: JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'activeUsers' }] }),
        });
        assert.equal(wrong.status, 403, 'the primary token cannot read the linked account\'s property');

        const inv = await accounts.loadUserInventory(id, { primary });
        assert.deepEqual(inv.connections.map((c) => [c.connectionId, c.state, c.ownProperties, c.ownSites]), [['primary', 'ok', 2, 2], [SUB2, 'ok', 3, 3]]);
        assert.equal(inv.sites.length, 5, 'acme is listed once');
    } finally { w.restore(); }
});

test('a revoked extra account: marked "needs reconnect", its assets drop out, the primary keeps working', async () => {
    const w = world({ linked: [linkedConn('demo-refresh:multi2~revoked')] });
    try {
        const id = uid('revoked');
        const inv = await quiet(() => accounts.loadUserInventory(id, { primary: async () => PRIMARY }));
        const extra = inv.connections.find((c) => !c.primary);
        assert.equal(extra.state, 'needs_reconnect');
        assert.deepEqual(w.state.patches, [{ id, sub: SUB2, status: 'needs_reconnect' }]);
        assert.deepEqual(inv.properties.map((p) => p.property).sort(), ['properties/412300101', 'properties/412300103']);
        assert.deepEqual(inv.errors, {}, 'no page-wide Google error for a linked account');
        // Marked accounts are not called again until reconnected.
        w.state.google.length = 0;
        accounts.invalidateGoogleConnections();
        const again = await accounts.loadUserInventory(id, { primary: async () => PRIMARY });
        assert.equal(again.connections.find((c) => !c.primary).state, 'needs_reconnect');
        assert.ok(!w.state.google.some((g) => g.token.includes('multi2')), 'no Google call with the revoked account');
    } finally { w.restore(); }
});

test('disconnect: once the linked row is gone, its sites leave the union', async () => {
    const w = world({ linked: [linkedConn()] });
    try {
        const id = uid('disc');
        const before = await accounts.loadUserInventory(id, { primary: async () => PRIMARY });
        assert.ok(before.properties.some((p) => p.property === 'properties/412300104'));
        w.state.linked.set(id, []);
        accounts.invalidateGoogleConnections();
        const after = await accounts.loadUserInventory(id, { primary: async () => PRIMARY });
        assert.ok(!after.properties.some((p) => p.property === 'properties/412300104'));
        assert.deepEqual(after.connections.map((c) => c.connectionId), ['primary']);
    } finally { w.restore(); }
});

// ─── portfolio sync ───

test('portfolio sync: every asset is read with its own account\'s token and stored with its connection', async () => {
    const w = world({ linked: [linkedConn()] });
    try {
        const id = uid('sync');
        const res = await quiet(() => sync.startSync({ identifier: id, accessToken: 'demo-access:multi', reason: 'page' }));
        assert.equal(res.failed, 0);
        assert.equal(res.noAccess, 0);
        assert.equal(res.googleError, null);
        const assets = [...w.assetsOf(id).values()];
        assert.equal(assets.length, 10);
        assert.ok(assets.every((a) => a.status === 'synced'), JSON.stringify(assets.map((a) => [a.asset_id, a.status, a.last_error])));
        const byId = Object.fromEntries(assets.map((a) => [a.asset_id, a.connection_id]));
        assert.equal(byId['properties/412300104'], SUB2);
        assert.equal(byId['sc-domain:acmeanalytics.example'], null);
        assert.equal(byId['properties/412300101'], null);
        for (const g of w.state.google.filter((x) => x.path.includes(':runReport') || x.path.includes('/searchAnalytics/'))) {
            assert.equal(g.status, 200, `${g.path} with ${g.token}`);
        }
    } finally { w.restore(); }
});

test('portfolio sync with a revoked extra account: its rows are kept (not missing) and say which account to reconnect', async () => {
    const w = world({ linked: [linkedConn()] });
    try {
        const id = uid('sync-revoked');
        await quiet(() => sync.startSync({ identifier: id, accessToken: 'demo-access:multi', reason: 'page' }));
        w.state.linked.set(id, [linkedConn('demo-refresh:multi2~revoked')]);
        accounts.invalidateGoogleConnections();
        const res = await quiet(() => sync.startSync({ identifier: id, accessToken: 'demo-access:multi', reason: 'manual', force: true }));
        assert.equal(res.googleError, null, 'no page-wide "Reconnect Google" for a linked account');
        const assets = [...w.assetsOf(id).values()];
        const extra = assets.filter((a) => a.connection_id === SUB2);
        assert.equal(extra.length, 6);
        assert.ok(extra.every((a) => !a.missing), 'kept, not missing');
        assert.ok(extra.every((a) => a.status === 'error' && /Reconnect multi\.agency@trafficclaw\.example/.test(a.last_error)), JSON.stringify(extra.map((a) => a.last_error)));
        assert.ok(assets.filter((a) => !a.connection_id).every((a) => a.status === 'synced'), 'the primary account keeps syncing');
    } finally { w.restore(); }
});

// ─── link flow helpers ───

test('link flow: PKCE S256, state check, authorize URL, id_token checks', () => {
    const flow = link.newFlowState('user-1', '/dashboard/settings?tab=google');
    assert.ok(flow.verifier.length >= 43 && flow.verifier.length <= 128);
    assert.match(link.pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), /^E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM$/);
    assert.ok(link.stateMatches(flow.state, flow.state));
    assert.ok(!link.stateMatches(flow.state, `${flow.state}x`));
    assert.ok(!link.stateMatches(flow.state, null));
    assert.equal(link.newFlowState('u', 'https://evil.example/x').ret, '/dashboard');

    const u = new URL(link.authorizeUrl(flow, { clientId: 'cid', redirectUri: 'https://trafficclaw.com/api/google/link/callback', loginHint: 'b@x' }));
    const q = Object.fromEntries(u.searchParams);
    assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(q.prompt, 'select_account consent');
    assert.equal(q.access_type, 'offline');
    assert.equal(q.code_challenge_method, 'S256');
    assert.equal(q.code_challenge, link.pkceChallenge(flow.verifier));
    assert.equal(q.redirect_uri, 'https://trafficclaw.com/api/google/link/callback');
    assert.deepEqual(q.scope.split(' ').sort(), ['email', 'https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly', 'openid', 'profile']);
    assert.equal(q.login_hint, 'b@x');
    assert.ok(!('include_granted_scopes' in q));

    assert.equal(link.linkRedirectUri({ NEXTAUTH_URL: 'https://preview.trafficclaw.com/' }), 'https://preview.trafficclaw.com/api/google/link/callback');
    assert.equal(link.linkRedirectUri({ NEXTAUTH_URL: 'https://trafficclaw.com', GOOGLE_LINK_REDIRECT_URI: 'https://x.test/cb' }), 'https://x.test/cb');

    const now = Date.now();
    const tok = (payload, alg = 'RS256') => [{ alg, typ: 'JWT' }, payload].map((o) => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.sig';
    const good = { iss: 'https://accounts.google.com', aud: 'cid', sub: '123', email: 'b@x', email_verified: true, name: 'B', exp: Math.floor(now / 1000) + 600 };
    assert.deepEqual(link.parseIdToken(tok(good), 'cid', { now }), { sub: '123', email: 'b@x', emailVerified: true, name: 'B' });
    assert.throws(() => link.parseIdToken(tok({ ...good, aud: 'other' }), 'cid', { now }), /another app/);
    assert.throws(() => link.parseIdToken(tok({ ...good, iss: 'https://evil.example' }), 'cid', { now }), /not from Google/);
    assert.throws(() => link.parseIdToken(tok({ ...good, exp: Math.floor(now / 1000) - 3600 }), 'cid', { now }), /expired/);
    assert.throws(() => link.parseIdToken(tok(good, 'none'), 'cid', { now }), /Unsigned/);
    assert.equal(link.parseIdToken(tok(good, 'none'), 'cid', { now, allowUnsigned: true }).sub, '123');
    assert.deepEqual(link.missingDataScopes('openid email https://www.googleapis.com/auth/analytics.readonly'), ['https://www.googleapis.com/auth/webmasters.readonly']);
    assert.equal(new URL(link.resultUrl('https://trafficclaw.com', '//evil.example', 'added')).origin, 'https://trafficclaw.com');
});
