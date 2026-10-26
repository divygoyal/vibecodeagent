// HTTP checks for the builder API against a running dev kit instance (TC_DEMO_DATA=1):
// share fix (no more 422), public doc + public query privacy, password unlock, v1 compat.
//
// Run: node web/tests/builder/public-api.mjs <webPort> [instanceName]
//   e.g. node web/tests/builder/public-api.mjs 3106 builder
// Needs scripts/dev/login.mjs to have run (state.json + seed.json in the instance dir).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const port = process.argv[2] || '3106';
const name = process.argv[3] || 'builder';
const base = `http://localhost:${port}`;
const dir = `/root/.trafficclaw-dev/${name}`;
const state = JSON.parse(readFileSync(`${dir}/state.json`, 'utf8'));
const seed = JSON.parse(readFileSync(`${dir}/seed.json`, 'utf8'));
const cookie = state.cookies.filter((c) => c.domain.includes('localhost')).map((c) => `${c.name}=${c.value}`).join('; ');

async function call(method, path, { body, auth = true, headers = {} } = {}) {
    const res = await fetch(base + path, {
        method,
        headers: { ...(auth ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual',
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, data, text, headers: res.headers };
}

const LEAKS = [/properties\/\d+/, /sc-domain:/, /ownerIdentifier/, /"userId"/, /"siteUrl"/, /"propertyId"/];
function noLeaks(label, text) {
    for (const re of LEAKS) assert.ok(!re.test(text), `${label} leaks ${re}: ${text.match(re)?.[0]}`);
}

let pass = 0;
async function step(label, fn) {
    await fn();
    pass++;
    console.log(`ok ${pass} - ${label}`);
}

const id = seed.dashboardId;
assert.ok(id, 'seed.json has dashboardId');

await step('seeded (v1) dashboard opens through the v2 API', async () => {
    const r = await call('GET', `/api/dashboards/${id}`);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.dashboard.doc.schemaVersion, 2);
    assert.ok(Object.keys(r.data.dashboard.doc.widgets).length > 0);
});

let token;
await step('POST /share works (was 422: user_identifier in the body)', async () => {
    const r = await call('POST', `/api/dashboards/${id}/share`);
    assert.equal(r.status, 200, r.text);
    token = r.data.shareToken;
    assert.match(token, /^[a-f0-9]{32}$/);
});

await step('public doc has no ids, owner or site URLs', async () => {
    const r = await call('GET', `/api/dashboards/public/${token}`, { auth: false });
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.dashboard.doc);
    noLeaks('public doc', r.text);
});

await step('public query ignores injected metrics, sources and widget ids', async () => {
    const r = await call('GET', `/api/dashboards/public/${token}/query?range=7d&metric=ga4:totalRevenue&source=properties/412300102&widgets=evil&dashboardId=x`, { auth: false });
    assert.equal(r.status, 200, r.text);
    assert.ok(!r.text.includes('totalRevenue'), 'no injected metric in the result');
    noLeaks('public query', r.text);
    const ok = Object.values(r.data.results).filter((x) => x.status === 'ok').length;
    assert.ok(ok > 0, 'widgets evaluated');
    assert.match(r.headers.get('cache-control') || '', /s-maxage=300/);
});

await step('bad and unknown tokens are 404 everywhere', async () => {
    for (const t of ['short', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', '0123456789abcdef0123456789abcdef']) {
        const a = await call('GET', `/api/dashboards/public/${t}`, { auth: false });
        const b = await call('GET', `/api/dashboards/public/${t}/query`, { auth: false });
        assert.equal(a.status, 404, `${t} doc`);
        assert.equal(b.status, 404, `${t} query`);
    }
});

await step('password: locked doc and query until unlocked, then a 24 h key works', async () => {
    let r = await call('PUT', `/api/dashboards/${id}/share`, { body: { password: 'demo-secret' } });
    assert.equal(r.status, 200, r.text);
    r = await call('GET', `/api/dashboards/public/${token}`, { auth: false });
    assert.equal(r.data.dashboard.requiresPassword, true);
    assert.equal(r.data.dashboard.doc, undefined);
    r = await call('GET', `/api/dashboards/public/${token}/query`, { auth: false });
    assert.equal(r.status, 401);
    r = await call('POST', `/api/dashboards/public/${token}/unlock`, { auth: false, body: { password: 'wrong-one' } });
    assert.equal(r.status, 401);
    r = await call('POST', `/api/dashboards/public/${token}/unlock`, { auth: false, body: { password: 'demo-secret' } });
    assert.equal(r.status, 200, r.text);
    const key = r.data.key;
    r = await call('GET', `/api/dashboards/public/${token}/query`, { auth: false, headers: { authorization: `Bearer ${key}` } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control') || '', /no-store/);
    r = await call('PUT', `/api/dashboards/${id}/share`, { body: { password: '' } });
    assert.equal(r.status, 200);
});

await step('v1 widget-data adapter answers through the v2 engine', async () => {
    const r = await call('GET', `/api/dashboards/public/${token}/widget-data?range=7d`, { auth: false });
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.widgetData && typeof r.data.widgetData === 'object');
    noLeaks('v1 public widget-data', r.text);
});

await step('owner query: saved mode + inline mode, failures per widget', async () => {
    const controls = { date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'previous_period' } }, filters: {} };
    let r = await call('POST', '/api/dashboards/query', { body: { dashboardId: id, controls } });
    assert.equal(r.status, 200, r.text);
    assert.ok(r.data.resolved.range.start);
    r = await call('POST', '/api/dashboards/query', { body: { widgets: [{ id: 'w_x', type: 'scorecard', source: { type: 'default' }, config: { metric: { id: 'gsc:clicks' }, comparison: { show: true, display: 'percent' }, sparkline: { show: true, kind: 'area' } } }], defaultSource: { type: 'site', siteId: 'acmeanalytics.example' }, controls } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.results.w_x.status, 'ok', r.text.slice(0, 300));
});

await step('rotate link: old token stops working', async () => {
    const r = await call('POST', `/api/dashboards/${id}/share/rotate`);
    assert.equal(r.status, 200, r.text);
    const old = await call('GET', `/api/dashboards/public/${token}`, { auth: false });
    assert.equal(old.status, 404);
    token = r.data.shareToken;
    console.log(`   new public token ${token}`);
});

console.log(`\n${pass} passed`);
