/**
 * End-to-end test of the hosted MCP server against a running dev instance.
 *
 *   MCP_BASE=http://localhost:3102 MCP_STATE=/root/.trafficclaw-dev/mcp/state.json \
 *     node --test web/tests/mcp/flow.test.mjs
 *
 * Needs: TC_MCP_ENABLED=1 and TC_MCP_DEV_CIMD_LOOPBACK=1 on the server, demo
 * data (TC_DEMO_DATA=1, the dev kit sets it) and a signed-in demo session
 * (scripts/dev/login.mjs writes MCP_STATE). See web/tests/mcp/README.md.
 *
 * Covers: discovery, 401 challenge, DCR, CIMD (loopback document served by
 * this test), PKCE, consent decision with CSRF, token, refresh rotation and
 * reuse detection, revocation, demo grants without sign-in, site filter,
 * exclude-queries, API keys, both protocol eras, all 13 tools (with the data
 * in structuredContent, which is what Claude reads) and the negative cases of
 * MCP.md 12.2.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

const BASE = (process.env.MCP_BASE || 'http://localhost:3102').replace(/\/$/, '');
const STATE = process.env.MCP_STATE || '/root/.trafficclaw-dev/mcp/state.json';
const SLOW = process.env.MCP_SLOW !== '0';
const RESOURCE = `${BASE}/mcp`;
const MODERN = '2026-07-28';
const META = { 'io.modelcontextprotocol/protocolVersion': MODERN, 'io.modelcontextprotocol/clientInfo': { name: 'tc-flow-test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };

const sessionCookie = (() => {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const c = state.cookies.find((x) => x.name.endsWith('next-auth.session-token'));
    if (!c) throw new Error(`no session cookie in ${STATE}`);
    return `${c.name}=${c.value}`;
})();

const b64url = (buf) => Buffer.from(buf).toString('base64url');
function pkce() {
    const verifier = b64url(randomBytes(48));
    return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

async function req(path, init = {}) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    return fetch(url, { redirect: 'manual', ...init, signal: AbortSignal.timeout(120_000) });
}

function form(obj) {
    return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

async function register(redirectUris = ['http://127.0.0.1:8976/callback'], extra = {}) {
    const res = await req('/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_name: 'Flow Test', redirect_uris: redirectUris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], ...extra }),
    });
    assert.equal(res.status, 201, await res.clone().text());
    return res.json();
}

function authorizeUrl(clientId, redirectUri, challenge, extra = {}) {
    const p = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', scope: 'mcp:read offline_access', state: 'st-123', resource: RESOURCE, ...extra });
    return `/oauth/authorize?${p}`;
}

/** Run authorize + consent decision. Returns the redirect URL with code. */
async function approve({ clientId, redirectUri, challenge, action = 'allow', signedIn = true, sites = null, excludeQueries = false, extra = {} }) {
    const headers = signedIn ? { cookie: sessionCookie } : {};
    const a = await req(authorizeUrl(clientId, redirectUri, challenge, extra), { headers });
    assert.equal(a.status, 302, `authorize: ${a.status} ${await a.clone().text().catch(() => '')}`);
    const loc = a.headers.get('location');
    if (!loc.startsWith('/oauth/consent')) return new URL(loc); // existing grant: straight back to the client
    const setCookie = a.headers.get('set-cookie') || '';
    const m = /(?:__Host-)?tc_oauth_csrf=([^;]+)/.exec(setCookie);
    assert.ok(m, 'csrf cookie set');
    const csrf = m[1];
    const txn = new URL(loc, BASE).searchParams.get('txn');
    const cookie = [signedIn ? sessionCookie : null, `tc_oauth_csrf=${csrf}`].filter(Boolean).join('; ');
    const page = await req(loc, { headers: { cookie } });
    assert.equal(page.status, 200, 'consent page renders');
    const html = await page.text();
    assert.match(html, /TrafficClaw/);
    const body = form({ txn, csrf, action, sites: sites ? 'selected' : 'all', exclude_queries: excludeQueries ? '1' : undefined });
    for (const s of sites || []) body.append('site', s);
    const d = await req('/oauth/authorize/decision', { method: 'POST', headers: { cookie, origin: BASE, 'content-type': 'application/x-www-form-urlencoded' }, body });
    assert.equal(d.status, 303, `decision: ${d.status} ${await d.clone().text()}`);
    return new URL(d.headers.get('location'));
}

async function token(params) {
    const res = await req('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form(params) });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

async function connect(opts) {
    const { verifier, challenge } = pkce();
    const cb = await approve({ ...opts, challenge });
    assert.equal(cb.searchParams.get('iss'), BASE, 'RFC 9207 iss');
    assert.equal(cb.searchParams.get('state'), 'st-123');
    const code = cb.searchParams.get('code');
    assert.match(code, /^tcac_/);
    const t = await token({ grant_type: 'authorization_code', code, redirect_uri: opts.redirectUri, client_id: opts.clientId, code_verifier: verifier, resource: RESOURCE });
    assert.equal(t.status, 200, JSON.stringify(t.body));
    assert.equal(t.headers.get('cache-control'), 'no-store');
    return t.body;
}

let rpcId = 0;
async function mcp(tokenValue, method, params = {}, { era = 'modern', headers = {} } = {}) {
    const id = ++rpcId;
    const h = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(tokenValue ? { authorization: `Bearer ${tokenValue}` } : {}), ...headers };
    let body;
    if (era === 'modern') {
        h['mcp-protocol-version'] = h['mcp-protocol-version'] || MODERN;
        h['mcp-method'] = h['mcp-method'] || method;
        if (method === 'tools/call' && !h['mcp-name']) h['mcp-name'] = params.name;
        body = { jsonrpc: '2.0', id, method, params: { ...params, _meta: META } };
    } else {
        body = { jsonrpc: '2.0', id, method, params };
    }
    const res = await req('/mcp', { method: 'POST', headers: h, body: JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
        const line = text.split('\n').find((l) => l.startsWith('data: '));
        json = line ? JSON.parse(line.slice(6)) : null;
    } else {
        try { json = JSON.parse(text); } catch { json = null; }
    }
    return { status: res.status, json, headers: res.headers, text };
}

async function call(tokenValue, name, args = {}, era = 'modern') {
    let r = await mcp(tokenValue, 'tools/call', { name, arguments: args }, { era });
    // The per-user cost budget (about 120 units a minute) is part of the design; wait it out.
    for (let i = 0; i < 3 && /^rate_limited/.test(r.json?.result?.content?.[0]?.text ?? ''); i++) {
        const wait = Number(/retry_after_s=(\d+)/.exec(r.json.result.content[0].text)?.[1] ?? 5);
        await new Promise((res) => setTimeout(res, (wait + 1) * 1000));
        r = await mcp(tokenValue, 'tools/call', { name, arguments: args }, { era });
    }
    assert.equal(r.status, 200, `${name}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
    assert.ok(r.json?.result, `${name}: ${r.text.slice(0, 300)}`);
    return r.json.result;
}

/**
 * What the model sees. MCP clients such as Claude use structuredContent when a tool returns it (every tool here
 * declares an outputSchema) and do not show the text content, so read results that way: structuredContent first.
 */
function modelView(result) {
    return result.structuredContent ?? { text: result.content?.[0]?.text ?? '' };
}

/**
 * Data rows a model can read from a view: JSON `rows`, or the TSV lines of `table` without the # lines and the
 * column-name line that follows a # line (each section is: # title, column names, rows, # notes).
 */
function dataRows(view) {
    if (Array.isArray(view.rows)) return view.rows.map((r) => r.map((c) => (c === null ? '' : String(c))));
    if (typeof view.table !== 'string') return [];
    const rows = [];
    let afterComment = true;
    for (const line of view.table.split('\n')) {
        if (line.startsWith('#')) { afterComment = true; continue; }
        if (!afterComment && line !== '(no rows)') rows.push(line.split('\t'));
        afterComment = false;
    }
    return rows;
}

/** Checks a result against the outputSchema's required keys (and anyOf branches) from tools/list. */
function assertRequired(schema, sc, label) {
    for (const k of schema.required || []) assert.ok(k in sc, `${label}: structuredContent.${k} is required`);
    if (schema.anyOf) assert.ok(schema.anyOf.some((b) => (b.required || []).every((k) => k in sc)), `${label}: none of ${JSON.stringify(schema.anyOf)}`);
}

// ───────────── a loopback CIMD document (needs TC_MCP_DEV_CIMD_LOOPBACK=1) ─────────────
let cimdServer;
let cimdUrl;
before(async () => {
    cimdServer = http.createServer((rq, rs) => {
        if (rq.url === '/client.json') {
            rs.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=300' });
            rs.end(JSON.stringify({ client_id: cimdUrl, client_name: 'CIMD Test App', redirect_uris: ['http://127.0.0.1/callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] }));
        } else {
            rs.writeHead(404).end();
        }
    });
    await new Promise((r) => cimdServer.listen(0, '127.0.0.1', r));
    cimdUrl = `http://127.0.0.1:${cimdServer.address().port}/client.json`;
});
after(() => cimdServer?.close());

describe('discovery and challenges', () => {
    test('protected resource metadata (both locations)', async () => {
        for (const p of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
            const r = await req(p);
            assert.equal(r.status, 200);
            const j = await r.json();
            assert.equal(j.resource, RESOURCE);
            assert.deepEqual(j.authorization_servers, [BASE]);
            assert.deepEqual(j.scopes_supported, ['mcp:read']);
        }
    });
    test('authorization server metadata', async () => {
        const j = await (await req('/.well-known/oauth-authorization-server')).json();
        assert.equal(j.issuer, BASE);
        assert.deepEqual(j.code_challenge_methods_supported, ['S256']);
        assert.equal(j.client_id_metadata_document_supported, true);
        assert.equal(j.authorization_response_iss_parameter_supported, true);
        assert.ok(j.token_endpoint_auth_methods_supported.includes('none'));
        assert.ok(j.scopes_supported.includes('offline_access'));
    });
    test('no OIDC document', async () => {
        assert.equal((await req('/.well-known/openid-configuration')).status, 404);
    });
    test('unauthenticated POST /mcp is a real 401 with resource_metadata', async () => {
        const r = await mcp(null, 'tools/list');
        assert.equal(r.status, 401);
        const www = r.headers.get('www-authenticate');
        assert.match(www, /^Bearer /);
        assert.match(www, new RegExp(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`));
        assert.match(www, /scope="mcp:read"/);
    });
    test('bad and query-string tokens are 401 invalid_token / invalid_request', async () => {
        const r = await mcp('tcat_not-a-real-token-at-all-000000000000', 'tools/list');
        assert.equal(r.status, 401);
        assert.match(r.headers.get('www-authenticate'), /error="invalid_token"/);
        const q = await req('/mcp?access_token=tcat_x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        assert.equal(q.status, 401);
    });
    test('transport edges: Origin, GET, DELETE, content type', async () => {
        const evil = await mcp(null, 'tools/list', {}, { headers: { origin: 'https://evil.example' } });
        assert.equal(evil.status, 403);
        assert.equal((await req('/mcp', { headers: { accept: 'text/event-stream' } })).status, 405);
        assert.equal((await req('/mcp', { method: 'DELETE' })).status, 405);
        const html = await req('/mcp', { headers: { accept: 'text/html,application/xhtml+xml' } });
        assert.equal(html.status, 302);
        assert.equal(html.headers.get('location'), '/ai');
        assert.equal((await req('/mcp', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415);
        const pre = await req('/mcp', { method: 'OPTIONS', headers: { origin: 'https://claude.ai', 'access-control-request-method': 'POST' } });
        assert.equal(pre.status, 204);
        assert.equal(pre.headers.get('access-control-allow-origin'), 'https://claude.ai');
    });
});

describe('OAuth with a DCR client', () => {
    const redirectUri = 'http://127.0.0.1:8976/callback';
    let client;
    let tokens;

    test('register rejects bad redirect URIs', async () => {
        for (const bad of ['http://evil.example/cb', 'javascript:alert(1)', 'https://x.example/cb#frag', 'https://user@x.example/cb']) {
            const r = await req('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: [bad] }) });
            assert.equal(r.status, 400, bad);
            assert.equal((await r.json()).error, 'invalid_redirect_uri');
        }
    });

    test('register + authorize errors', async () => {
        client = await register([redirectUri, 'http://localhost:8976/callback']);
        assert.match(client.client_id, /^tcc_/);
        const { challenge } = pkce();
        // Unregistered redirect: on-page error, never a redirect.
        const bad = await req(authorizeUrl(client.client_id, 'https://evil.example/cb', challenge), { headers: { cookie: sessionCookie } });
        assert.equal(bad.status, 400);
        // Plain PKCE: error back to the client with iss and state.
        const plain = await req(authorizeUrl(client.client_id, redirectUri, challenge, { code_challenge_method: 'plain' }), { headers: { cookie: sessionCookie } });
        assert.equal(plain.status, 302);
        const loc = new URL(plain.headers.get('location'));
        assert.equal(loc.searchParams.get('error'), 'invalid_request');
        assert.equal(loc.searchParams.get('iss'), BASE);
        assert.equal(loc.searchParams.get('state'), 'st-123');
        const target = new URL((await req(authorizeUrl(client.client_id, redirectUri, challenge, { resource: 'https://evil.example/mcp' }), { headers: { cookie: sessionCookie } })).headers.get('location'));
        assert.equal(target.searchParams.get('error'), 'invalid_target');
        const scope = new URL((await req(authorizeUrl(client.client_id, redirectUri, challenge, { scope: 'mcp:write' }), { headers: { cookie: sessionCookie } })).headers.get('location'));
        assert.equal(scope.searchParams.get('error'), 'invalid_scope');
    });

    test('decision rejects a missing CSRF cookie and an edited txn', async () => {
        const { challenge } = pkce();
        const a = await req(authorizeUrl(client.client_id, redirectUri, challenge), { headers: { cookie: sessionCookie } });
        const txn = new URL(a.headers.get('location'), BASE).searchParams.get('txn');
        const csrf = /tc_oauth_csrf=([^;]+)/.exec(a.headers.get('set-cookie'))[1];
        const noCookie = await req('/oauth/authorize/decision', { method: 'POST', headers: { cookie: sessionCookie, origin: BASE, 'content-type': 'application/x-www-form-urlencoded' }, body: form({ txn, csrf, action: 'allow' }) });
        assert.equal(noCookie.status, 400);
        const edited = `${txn.slice(0, -3)}AAA`;
        const bad = await req('/oauth/authorize/decision', { method: 'POST', headers: { cookie: `${sessionCookie}; tc_oauth_csrf=${csrf}`, origin: BASE, 'content-type': 'application/x-www-form-urlencoded' }, body: form({ txn: edited, csrf, action: 'allow' }) });
        assert.equal(bad.status, 400);
        const cross = await req('/oauth/authorize/decision', { method: 'POST', headers: { cookie: `${sessionCookie}; tc_oauth_csrf=${csrf}`, origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: form({ txn, csrf, action: 'allow' }) });
        assert.equal(cross.status, 403);
    });

    test('cancel returns access_denied with iss', async () => {
        const { challenge } = pkce();
        const cb = await approve({ clientId: client.client_id, redirectUri, challenge, action: 'deny' });
        assert.equal(cb.searchParams.get('error'), 'access_denied');
        assert.equal(cb.searchParams.get('iss'), BASE);
    });

    test('wrong verifier, code reuse, then a good exchange', async () => {
        const { challenge } = pkce();
        const cb = await approve({ clientId: client.client_id, redirectUri, challenge });
        const code = cb.searchParams.get('code');
        const wrong = await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: client.client_id, code_verifier: pkce().verifier });
        assert.equal(wrong.status, 400);
        assert.equal(wrong.body.error, 'invalid_grant');
        const reuse = await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: client.client_id, code_verifier: pkce().verifier });
        assert.equal(reuse.body.error, 'invalid_grant');
        tokens = await connect({ clientId: client.client_id, redirectUri: 'http://127.0.0.1:41234/callback' }).catch(() => null);
        // Port-agnostic loopback match: the registered URI used port 8976.
        assert.ok(tokens, 'loopback port is ignored');
        assert.match(tokens.access_token, /^tcat_/);
        assert.match(tokens.refresh_token, /^tcrt_/);
        assert.equal(tokens.token_type, 'Bearer');
    });

    test('existing grant skips the consent screen', async () => {
        const { challenge } = pkce();
        const a = await req(authorizeUrl(client.client_id, redirectUri, challenge), { headers: { cookie: sessionCookie } });
        assert.equal(a.status, 302);
        assert.match(a.headers.get('location'), /^http:\/\/127\.0\.0\.1:8976\/callback\?code=tcac_/);
        const p = await req(authorizeUrl(client.client_id, redirectUri, challenge, { prompt: 'consent' }), { headers: { cookie: sessionCookie } });
        assert.match(p.headers.get('location'), /^\/oauth\/consent/);
    });

    test('tools/list (modern): 13 tools, stable order, annotations, no $ref', async () => {
        const r = await mcp(tokens.access_token, 'tools/list');
        assert.equal(r.status, 200, r.text);
        const tools = r.json.result.tools;
        assert.deepEqual(tools.map((t) => t.name), ['list_sites', 'portfolio_summary', 'site_health', 'seo_opportunities', 'top_movers', 'compare_periods', 'page_detail', 'gsc_search_analytics', 'gsc_inspect_url', 'ga4_run_report', 'ga4_realtime', 'ga4_metadata', 'trafficclaw_help']);
        for (const t of tools) {
            assert.ok(t.title && t.description, t.name);
            assert.deepEqual([t.annotations.readOnlyHint, t.annotations.destructiveHint, t.annotations.openWorldHint], [true, false, false], t.name);
            assert.match(t.name, /^[A-Za-z0-9_.-]{1,64}$/);
        }
        const raw = JSON.stringify(tools);
        assert.ok(!raw.includes('$ref') && !raw.includes('$defs'), 'no $ref in schemas');
        assert.ok(raw.length < 36_000, `tools/list is ${raw.length} chars (budget about 9,000 tokens)`);
        assert.equal(r.json.result.ttlMs, 300000);
    });

    test('protocol header mismatch and unsupported version', async () => {
        const mismatch = await mcp(tokens.access_token, 'tools/list', {}, { headers: { 'mcp-method': 'tools/call' } });
        assert.equal(mismatch.status, 400);
        assert.equal(mismatch.json.error.code, -32020);
        const old = await req('/mcp', { method: 'POST', headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '1900-01-01', 'mcp-method': 'tools/list' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { ...META, 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } } }) });
        assert.equal(old.status, 400);
    });

    test('every tool answers with demo data (modern era)', async () => {
        const sites = await call(tokens.access_token, 'list_sites');
        assert.ok(!sites.isError, sites.content[0].text);
        assert.match(sites.content[0].text, /^# list_sites \| \d+ sites/m);
        assert.match(sites.content[0].text, /acmeanalytics\.example/);
        assert.equal(typeof sites.structuredContent.counts.total, 'number');
        assert.match(modelView(sites).table, /^acmeanalytics\.example\tproperties\//m, 'the site rows are in structuredContent');
        const site = 'acmeanalytics.example';
        const calls = [
            ['portfolio_summary', {}],
            ['portfolio_summary', { site_ids: [site, 'puzzlehub.example'], compare_to: 'previous_year', sort_by: 'ga4_sessions', format: 'json' }],
            ['site_health', { site }],
            ['site_health', {}],
            ['seo_opportunities', { site, types: ['striking_distance', 'low_ctr', 'decaying_pages', 'cannibalization', 'new_queries'] }],
            ['top_movers', { site }],
            ['top_movers', { site, source: 'ga4', dimension: 'channel' }],
            ['top_movers', { site, dimension: 'query', metric: 'position' }],
            ['compare_periods', { site }],
            ['compare_periods', { site, source: 'gsc', by: 'country', compare_to: 'previous_year' }],
            ['compare_periods', { site, source: 'ga4', by: 'sessionDefaultChannelGroup', metrics: ['sessions', 'keyEvents'] }],
            ['page_detail', { site, page: '/' }],
            ['gsc_search_analytics', { site, dimensions: ['query', 'device'], limit: 10 }],
            ['gsc_search_analytics', { site, dimensions: ['page'], sort_by: 'impressions', filters: [{ dimension: 'country', operator: 'equals', expression: 'USA' }], date_range: { preset: 'last_90d' } }],
            ['gsc_inspect_url', { site, urls: ['https://acmeanalytics.example/'] }],
            ['ga4_run_report', { site, metrics: ['sessions', 'activeUsers'], dimensions: ['sessionDefaultChannelGroup'], order_by: [{ field: 'sessions' }], limit: 5 }],
            ['ga4_run_report', { site, metrics: ['sessions'], dimensions: ['date'], date_ranges: [{ preset: 'last_7d' }, { preset: 'last_14d', name: 'two_weeks' }] }],
            ['ga4_run_report', { site, metrics: ['sessions'], dimensions: ['pagePath'], filters: [{ field: 'pagePath', op: 'begins_with', value: '/' }], metric_filters: [{ field: 'sessions', op: 'gt', value: 1 }], format: 'json' }],
            ['ga4_realtime', { site, dimensions: ['country'] }],
            ['ga4_metadata', { site, search: 'session' }],
            ['trafficclaw_help', { topic: 'limits' }],
        ];
        for (const [name, args] of calls) {
            const res = await call(tokens.access_token, name, args);
            const text = res.content?.[0]?.text ?? '';
            assert.ok(!res.isError, `${name} ${JSON.stringify(args)} -> ${text.slice(0, 400)}`);
            assert.ok(text.length > 20 && text.length < 22_000, `${name}: ${text.length} chars`);
            assert.ok(res.structuredContent, `${name}: structuredContent`);
            const view = modelView(res);
            assert.ok(typeof view.table === 'string' || Array.isArray(view.rows) || typeof view.text === 'string', `${name}: data in structuredContent, not only metadata: ${JSON.stringify(view).slice(0, 300)}`);
            assert.ok(!/tcat_|tcrt_|ya29\./.test(JSON.stringify(res)), `${name}: no tokens in output`);
        }
    });

    test('structuredContent carries the data (read the way Claude reads results)', async () => {
        const list = await mcp(tokens.access_token, 'tools/list');
        const schemas = Object.fromEntries(list.json.result.tools.map((t) => [t.name, t.outputSchema]));
        const site = 'acmeanalytics.example';
        // [tool, args, minimum data rows in structuredContent, rows must contain numbers]
        const calls = [
            ['list_sites', {}, 3, false],
            ['portfolio_summary', {}, 2, true],
            ['portfolio_summary', { format: 'json' }, 2, true],
            ['site_health', {}, 1, false],
            ['seo_opportunities', { site }, 1, true],
            ['top_movers', { site }, 1, true],
            ['compare_periods', { site }, 1, true],
            ['compare_periods', { site, format: 'json' }, 1, true],
            ['page_detail', { site, page: '/' }, 1, true],
            ['gsc_search_analytics', { site, dimensions: ['query'], limit: 5 }, 1, true],
            ['gsc_search_analytics', { site, dimensions: ['query'], limit: 5, format: 'json' }, 1, true],
            ['gsc_inspect_url', { site, urls: [`https://${site}/`] }, 1, false],
            ['ga4_run_report', { site, metrics: ['sessions'], dimensions: ['sessionDefaultChannelGroup'] }, 1, true],
            ['ga4_run_report', { site, metrics: ['sessions'], dimensions: ['sessionDefaultChannelGroup'], format: 'json' }, 1, true],
            ['ga4_realtime', { site, dimensions: ['country'] }, 1, true],
            ['ga4_metadata', { site, search: 'session' }, 1, false],
            ['trafficclaw_help', { topic: 'metrics' }, 0, false],
        ];
        const seen = new Set();
        for (const [name, args, minRows, numeric] of calls) {
            const label = `${name} ${JSON.stringify(args)}`;
            const res = await call(tokens.access_token, name, args);
            const text = res.content?.[0]?.text ?? '';
            assert.ok(!res.isError, `${label} -> ${text.slice(0, 300)}`);
            assert.ok(res.structuredContent, `${label}: structuredContent`);
            const view = modelView(res);
            assertRequired(schemas[name], view, label);
            assert.ok(Array.isArray(view.warnings), label);
            seen.add(name);
            if (name === 'trafficclaw_help') {
                assert.match(view.text, /## Metrics[\s\S]*ctr_pct/);
                assert.equal(view.text, text);
                continue;
            }
            const rows = dataRows(view);
            assert.ok(rows.length >= minRows, `${label}: ${rows.length} data rows in structuredContent: ${JSON.stringify(view).slice(0, 400)}`);
            if (numeric) assert.ok(rows.some((r) => r.some((c) => /^[+-]?\d/.test(c))), `${label}: no numbers in structuredContent`);
            if (args.format === 'json') {
                const parsed = JSON.parse(text);
                assert.deepEqual([view.columns, view.rows], [parsed.columns, parsed.rows], `${label}: text and structuredContent agree`);
                assert.equal(view.table, undefined, `${label}: no TSV copy in json format`);
                assert.ok(rows.every((r) => r.length === view.columns.length), `${label}: row width`);
            } else {
                assert.ok(text.startsWith(view.table), `${label}: the text content starts with structuredContent.table`);
            }
            assert.ok(JSON.stringify(view).length < 24_000, `${label}: structuredContent is ${JSON.stringify(view).length} chars`);
        }
        assert.equal(seen.size, 13, 'all 13 tools');

        // portfolio_summary, the call that once returned only metadata: the same rows in both formats, with numbers.
        const ids = [site, 'puzzlehub.example'];
        const pt = modelView(await call(tokens.access_token, 'portfolio_summary', { site_ids: ids }));
        const pj = modelView(await call(tokens.access_token, 'portfolio_summary', { site_ids: ids, format: 'json' }));
        assert.deepEqual(dataRows(pt), dataRows(pj), 'table and json give the same rows');
        assert.equal(pj.sites_returned, 2);
        const col = (n) => pj.columns.indexOf(n);
        const acme = pj.rows.find((r) => r[0] === site);
        assert.ok(acme, JSON.stringify(pj.rows));
        assert.ok(Number(acme[col('ga4_sessions')]) > 0 && Number(acme[col('gsc_clicks')]) > 0 && Number(acme[col('gsc_impr')]) > 0, JSON.stringify(acme));
        assert.equal(pj.rows.at(-1)[0], 'TOTAL');
        assert.match(pt.table, /^site\tga4_sessions\tga4_vs_prev\t/m);
    });

    test('tool errors are model-friendly', async () => {
        const nf = await call(tokens.access_token, 'gsc_search_analytics', { site: 'competitor.example' });
        assert.equal(nf.isError, true);
        assert.match(nf.content[0].text, /^site_not_found/);
        const bad = await call(tokens.access_token, 'ga4_run_report', { site: 'acmeanalytics.example', metrics: ['sesions'] });
        assert.equal(bad.isError, true);
        assert.match(bad.content[0].text, /invalid_argument.*sessions/);
        const noGa = await call(tokens.access_token, 'ga4_realtime', { site: 'recipenest.example' });
        assert.match(noGa.content[0].text, /^ga4_not_connected/);
        const outside = await call(tokens.access_token, 'gsc_inspect_url', { site: 'acmeanalytics.example', urls: ['https://evil.example/'] });
        assert.match(outside.content[0].text, /^invalid_argument/);
        const extra = await call(tokens.access_token, 'list_sites', { bogus: true });
        assert.equal(extra.isError, true);
    });

    test('legacy era: initialize, tools/list and tools/call without a session id', async () => {
        const init = await mcp(tokens.access_token, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'legacy', version: '0' } }, { era: 'legacy' });
        assert.equal(init.status, 200, init.text);
        assert.equal(init.json.result.protocolVersion, '2025-11-25');
        assert.equal(init.json.result.serverInfo.name, 'trafficclaw');
        assert.ok(init.json.result.instructions.startsWith('TrafficClaw gives read-only access'));
        assert.equal(init.headers.get('mcp-session-id'), null);
        const list = await mcp(tokens.access_token, 'tools/list', {}, { era: 'legacy', headers: { 'mcp-protocol-version': '2025-11-25' } });
        assert.equal(list.json.result.tools.length, 13);
        const res = await call(tokens.access_token, 'list_sites', {}, 'legacy');
        assert.ok(!res.isError, res.content?.[0]?.text);
        assert.match(modelView(res).table, /^acmeanalytics\.example\t/m, 'legacy era: rows in structuredContent');
        const prompts = await mcp(tokens.access_token, 'prompts/list', {}, { era: 'legacy', headers: { 'mcp-protocol-version': '2025-11-25' } });
        assert.deepEqual(prompts.json.result.prompts.map((p) => p.name).sort(), ['find_quick_wins', 'weekly_portfolio_review', 'why_did_traffic_drop']);
    });

    test('server/discover (modern)', async () => {
        const r = await mcp(tokens.access_token, 'server/discover');
        assert.equal(r.status, 200, r.text);
        assert.ok(r.json.result.supportedVersions.includes(MODERN));
    });

    test('refresh rotation and reuse detection', async () => {
        const r1 = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id });
        assert.equal(r1.status, 200, JSON.stringify(r1.body));
        assert.notEqual(r1.body.refresh_token, tokens.refresh_token);
        const again = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id });
        assert.equal(again.body.error, 'invalid_grant', 'old refresh token is single-use');
        const ok = await mcp(r1.body.access_token, 'tools/list');
        assert.equal(ok.status, 200);
        if (SLOW) {
            await new Promise((r) => setTimeout(r, 11_000));
            const reuse = await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id });
            assert.equal(reuse.body.error, 'invalid_grant');
            const family = await token({ grant_type: 'refresh_token', refresh_token: r1.body.refresh_token, client_id: client.client_id });
            assert.equal(family.body.error, 'invalid_grant', 'reuse after 10 s revokes the whole family');
            const dead = await mcp(r1.body.access_token, 'tools/list');
            assert.equal(dead.status, 401, 'access tokens of the family are revoked too');
        }
    });

    test('revocation (RFC 7009)', async () => {
        const fresh = await connect({ clientId: client.client_id, redirectUri, extra: { prompt: 'consent' } });
        assert.equal((await mcp(fresh.access_token, 'tools/list')).status, 200);
        const rv = await req('/oauth/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ token: fresh.refresh_token, token_type_hint: 'refresh_token', client_id: client.client_id }) });
        assert.equal(rv.status, 200);
        assert.equal((await mcp(fresh.access_token, 'tools/list')).status, 401, 'family access token revoked');
        const unknown = await req('/oauth/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ token: 'tcrt_unknown', client_id: client.client_id }) });
        assert.equal(unknown.status, 200);
    });
});

describe('CIMD client (loopback metadata document)', () => {
    test('authorize, token and a tool call with a URL client_id', async () => {
        const t = await connect({ clientId: cimdUrl, redirectUri: 'http://127.0.0.1:53682/callback' });
        const res = await call(t.access_token, 'portfolio_summary', { limit: 3 });
        assert.ok(!res.isError, res.content[0].text);
    });
    test('redirect not in the document is refused on-page', async () => {
        const { challenge } = pkce();
        const r = await req(authorizeUrl(cimdUrl, 'https://evil.example/callback', challenge), { headers: { cookie: sessionCookie } });
        assert.equal(r.status, 400);
    });
});

describe('demo grant without sign-in', () => {
    test('anonymous "Use demo data" works and is labelled', async () => {
        const c = await register(['http://127.0.0.1:9999/cb']);
        const t = await connect({ clientId: c.client_id, redirectUri: 'http://127.0.0.1:9999/cb', action: 'demo', signedIn: false });
        const res = await call(t.access_token, 'list_sites');
        assert.match(res.content[0].text, /^# DEMO DATA/);
        assert.equal(res.structuredContent.demo, true);
        assert.match(modelView(res).table, /^# DEMO DATA/, 'the model sees the demo label too');
        const health = await call(t.access_token, 'site_health', { site: 'acmeanalytics.example' });
        assert.ok(!health.isError, health.content[0].text);
    });
    test('allow without sign-in is refused', async () => {
        const c = await register(['http://127.0.0.1:9998/cb']);
        const { challenge } = pkce();
        const a = await req(authorizeUrl(c.client_id, 'http://127.0.0.1:9998/cb', challenge));
        const txn = new URL(a.headers.get('location'), BASE).searchParams.get('txn');
        const csrf = /tc_oauth_csrf=([^;]+)/.exec(a.headers.get('set-cookie'))[1];
        const d = await req('/oauth/authorize/decision', { method: 'POST', headers: { cookie: `tc_oauth_csrf=${csrf}`, origin: BASE, 'content-type': 'application/x-www-form-urlencoded' }, body: form({ txn, csrf, action: 'allow' }) });
        assert.equal(d.status, 400);
    });
});

describe('per-connection controls', () => {
    test('site filter limits what the connection sees', async () => {
        const c = await register(['http://127.0.0.1:9997/cb']);
        const t = await connect({ clientId: c.client_id, redirectUri: 'http://127.0.0.1:9997/cb', sites: ['puzzlehub.example'] });
        const list = await call(t.access_token, 'list_sites');
        assert.match(list.content[0].text, /puzzlehub\.example/);
        assert.doesNotMatch(list.content[0].text, /acmeanalytics/);
        assert.match(modelView(list).table, /puzzlehub\.example/);
        assert.doesNotMatch(JSON.stringify(list.structuredContent), /acmeanalytics/);
        for (const s of ['acmeanalytics.example', 'https://acmeanalytics.example/', 'sc-domain:acmeanalytics.example', 'properties/412300101', 'nonexistent.example']) {
            const r = await call(t.access_token, 'compare_periods', { site: s });
            assert.match(r.content[0].text, /^site_not_in_grant/, s);
        }
    });

    test('exclude_queries hides search queries', async () => {
        const c = await register(['http://127.0.0.1:9996/cb']);
        const t = await connect({ clientId: c.client_id, redirectUri: 'http://127.0.0.1:9996/cb', excludeQueries: true });
        const r = await call(t.access_token, 'gsc_search_analytics', { site: 'acmeanalytics.example', dimensions: ['query'] });
        assert.match(r.content[0].text, /^queries_excluded/);
        const pages = await call(t.access_token, 'gsc_search_analytics', { site: 'acmeanalytics.example', dimensions: ['page'], format: 'json' });
        assert.ok(!pages.isError);
        assert.deepEqual(pages.structuredContent.columns, ['page', 'clicks', 'impressions', 'ctr_pct', 'position']);
        assert.ok(pages.structuredContent.rows.length > 0);
        const opp = await call(t.access_token, 'seo_opportunities', { site: 'acmeanalytics.example' });
        assert.match(opp.content[0].text, /by page: queries not shared/);
    });

    test('dashboard API lists, patches and revokes connections', async () => {
        const headers = { cookie: sessionCookie, origin: BASE, 'content-type': 'application/json' };
        const list = await (await req('/api/ai-connections', { headers: { cookie: sessionCookie } })).json();
        assert.equal(list.endpoint, RESOURCE);
        assert.ok(list.grants.length >= 1);
        assert.ok(list.google.connected);
        const g = list.grants[0];
        const blocked = await req(`/api/ai-connections/${g.id}`, { method: 'PATCH', headers: { ...headers, origin: 'https://evil.example' }, body: JSON.stringify({ exclude_queries: true }) });
        assert.equal(blocked.status, 403);
        const patched = await req(`/api/ai-connections/${g.id}`, { method: 'PATCH', headers, body: JSON.stringify({ exclude_queries: false }) });
        assert.equal(patched.status, 200);
        const act = await (await req('/api/ai-connections/activity?limit=5', { headers: { cookie: sessionCookie } })).json();
        assert.ok(Array.isArray(act.rows));
    });
});

describe('personal API keys', () => {
    test('create, use, revoke', async () => {
        const headers = { cookie: sessionCookie, origin: BASE, 'content-type': 'application/json' };
        const created = await req('/api/ai-connections/keys', { method: 'POST', headers, body: JSON.stringify({ name: 'flow test', expires_in_days: 7 }) });
        assert.equal(created.status, 201, await created.clone().text());
        const k = await created.json();
        assert.match(k.key, /^tcak_/);
        const list = await (await req('/api/ai-connections/keys', { headers: { cookie: sessionCookie } })).json();
        const row = list.keys.find((x) => x.id === k.id);
        assert.ok(row && !JSON.stringify(row).includes(k.key), 'raw key never listed');
        const tools = await mcp(k.key, 'tools/list');
        assert.equal(tools.status, 200);
        const res = await call(k.key, 'ga4_realtime', { site: 'acmeanalytics.example' });
        assert.ok(!res.isError, res.content[0].text);
        const del = await req(`/api/ai-connections/keys/${k.id}`, { method: 'DELETE', headers: { cookie: sessionCookie, origin: BASE } });
        assert.equal(del.status, 200);
        assert.equal((await mcp(k.key, 'tools/list')).status, 401);
    });
});
