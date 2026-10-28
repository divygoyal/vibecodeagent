// Narrow production shim for the public demo (lib/demo/fetchShim.ts, mode 'publicDemo'):
// demo tokens -> generator, real tokens and everything else -> untouched, model hosts never answered.
// Run: cd web && node --test tests/publicDemoShim.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { publicDemoGoogleFetch, installDemoGoogleFetch } = await import('../src/lib/demo/fetchShim.ts');

const GA = 'https://analyticsdata.googleapis.com/v1beta/properties/412300101:runReport';
const REPORT = JSON.stringify({ dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }] });
const notDemo = { isDemoRequest: async () => false };
const inDemo = { isDemoRequest: async () => true };
const network = async () => { throw new Error('network must not be called'); };

const call = (url, init, deps = notDemo) => publicDemoGoogleFetch(url, init, network, deps);
const bearer = (t) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

test('demo bearer token -> answered by the generator', async () => {
    const res = await call(GA, { method: 'POST', headers: bearer('demo-access:main'), body: REPORT });
    assert.ok(res, 'expected a demo response');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-tc-demo-data'), '1');
    const body = await res.json();
    assert.ok(Array.isArray(body.rows) && body.rows.length > 0);
});

test('demo token as a Request object, and Search Console', async () => {
    const req = new Request('https://www.googleapis.com/webmasters/v3/sites', { headers: bearer('demo-access:main') });
    const res = await call(req, undefined);
    assert.ok(res);
    assert.ok((await res.json()).siteEntry.length >= 10);
});

test('real token -> passed through (null)', async () => {
    assert.equal(await call(GA, { method: 'POST', headers: bearer('ya29.a0AfH6SMreal'), body: REPORT }), null);
    assert.equal(await call('https://www.googleapis.com/webmasters/v3/sites', { headers: bearer('ya29.real') }), null);
});

test('no token, other hosts, non-http -> passed through', async () => {
    assert.equal(await call(GA, { method: 'POST', body: REPORT }), null);
    assert.equal(await call('https://api.example.org/x', { headers: bearer('demo-access:main') }), null);
    assert.equal(await call('http://admin-api:8000/api/users/123/workspace', {}), null);
    assert.equal(await call('data:text/plain,hi', {}), null);
    assert.equal(await call('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Freal-site.com&key=K', {}), null);
});

test('token refresh: demo refresh token -> demo access token; real refresh and code exchange -> passed through', async () => {
    const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
    const res = await call('https://oauth2.googleapis.com/token', form({ grant_type: 'refresh_token', refresh_token: 'demo-refresh:main', client_id: 'c', client_secret: 's' }));
    assert.ok(res);
    assert.equal((await res.json()).access_token, 'demo-access:main');
    // URLSearchParams body as well
    const res2 = await call('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'demo-refresh:main' }) });
    assert.equal((await res2.json()).access_token, 'demo-access:main');
    assert.equal(await call('https://oauth2.googleapis.com/token', form({ grant_type: 'refresh_token', refresh_token: '1//0real' })), null);
    assert.equal(await call('https://oauth2.googleapis.com/token', form({ grant_type: 'authorization_code', code: 'demo-code:main', code_verifier: 'v' })), null);
});

test('during a demo request every Google call stays local, even an odd one', async () => {
    const res = await call(GA, { method: 'POST', headers: bearer('ya29.real'), body: REPORT }, inDemo);
    assert.ok(res, 'must not reach the network');
    assert.equal(res.status, 401);
    const code = await call('https://oauth2.googleapis.com/token', { method: 'POST', body: 'grant_type=authorization_code&code=x' }, inDemo);
    assert.equal(code.status, 400);
    const psi = await call('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Freal-site.com', {}, inDemo);
    assert.equal(psi.status, 200);
});

test('PageSpeed / CrUX for *.example -> demo, without a token', async () => {
    const res = await call('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Facmeanalytics.example%2F&strategy=mobile', {});
    assert.ok(res);
    assert.equal(res.status, 200);
    const crux = await call('https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=K', { method: 'POST', body: JSON.stringify({ origin: 'https://acmeanalytics.example' }) });
    assert.ok(crux);
    assert.equal(await call('https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=K', { method: 'POST', body: JSON.stringify({ origin: 'https://real-site.com' }) }), null);
});

test('model hosts: never answered from demo data; refused inside a demo request', async () => {
    const gemini = 'https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent';
    const vertex = 'https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/l/publishers/google/models/m:generateContent';
    assert.equal(await call(gemini, { method: 'POST', headers: bearer('demo-access:main') }), null);
    assert.equal(await call(vertex, { method: 'POST' }), null);
    for (const url of [gemini, vertex, 'https://api.openai.com/v1/chat/completions', 'https://api.anthropic.com/v1/messages']) {
        const res = await call(url, { method: 'POST' }, inDemo);
        assert.equal(res?.status, 403, url);
    }
});

test("the demo user's admin plugin commands are answered, other users' pass through", async () => {
    const admin = 'http://admin-api:8000';
    const deps = { ...notDemo, adminBase: admin };
    // handleAdminExec looks the demo user's token up on the admin API: fake that one call.
    const fakeNetwork = async (url) => {
        assert.match(String(url), /\/api\/users\/tc-public-demo\/oauth\/google$/);
        return new Response(JSON.stringify({ access_token: 'demo-access:main' }), { status: 200 });
    };
    const body = JSON.stringify({ plugin: 'google-analytics', command: 'list-properties-json', args: [] });
    const res = await publicDemoGoogleFetch(`${admin}/api/users/tc-public-demo/exec`, { method: 'POST', body }, fakeNetwork, deps);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.ok(data.data.length >= 8);
    const other = await publicDemoGoogleFetch(`${admin}/api/users/tc-public-demo/exec`, { method: 'POST', body: JSON.stringify({ plugin: 'x', command: 'rm' }) }, fakeNetwork, deps);
    assert.equal((await other.json()).data.error, 'Not available in the demo');
    assert.equal(await publicDemoGoogleFetch(`${admin}/api/users/1234/exec`, { method: 'POST', body }, network, deps), null);
});

test('installed wrapper passes non-demo requests through with the identical arguments', async () => {
    const seen = [];
    const original = globalThis.fetch;
    const spy = async (input, init) => {
        seen.push([input, init]);
        return new Response('net');
    };
    globalThis.fetch = spy;
    try {
        assert.equal(installDemoGoogleFetch('publicDemo'), true);
        const init = { method: 'POST', headers: bearer('ya29.real'), body: REPORT };
        const r1 = await globalThis.fetch(GA, init);
        assert.equal(await r1.text(), 'net');
        assert.equal(seen.length, 1);
        assert.equal(seen[0][0], GA);
        assert.equal(seen[0][1], init, 'same init object');
        const req = new Request('https://example.org/x', { method: 'POST', body: 'hello' });
        await globalThis.fetch(req);
        assert.equal(seen[1][0], req, 'same Request object');
        assert.equal(seen[1][1], undefined);
        assert.equal(await req.text(), 'hello', 'body not consumed');
        const demo = await globalThis.fetch(GA, { method: 'POST', headers: bearer('demo-access:main'), body: REPORT });
        assert.equal(demo.headers.get('x-tc-demo-data'), '1');
        assert.equal(seen.length, 2, 'demo request never reached the network');
    } finally {
        Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: original });
    }
});
