#!/usr/bin/env node
/**
 * Real-browser test of the MCP OAuth consent page (/oauth/consent).
 *
 *   node web/tests/mcp/browser-consent.mjs <webPort> [--out <dir>] [--user demo]
 *
 * Why it exists: flow.test.mjs posts the decision form with fetch(), so it never saw the bug where the
 * form disabled its buttons on submit and the browser then left the clicked button's name/value out of the
 * form data ("Bad request: Unknown action"). Here Chromium clicks the real buttons.
 *
 * Steps (a fresh public client with a loopback redirect_uri, registered by DCR, for each one):
 *   c) signed out: click "Use demo data instead"  -> redirect with code + iss; token exchange; tools/list; a tool call
 *   d) signed in as the demo user (state.json written by scripts/dev/login.mjs): click "Allow" -> code; token; a tool call
 *   e) click "Cancel" -> redirect with error=access_denied and the state
 *
 * Needs a running dev instance with demo data (scripts/dev/up.sh, or worker1.sh up) whose login.mjs state exists, and
 * the Playwright/Chrome settings of the dev kit (TC_PLAYWRIGHT_DIR, TC_CHROME). worker1.sh check <name> mcp runs it.
 * Output: <out>/report.json and one screenshot per step; exit code 1 if any step failed.
 */
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.resolve(HERE, '../../../scripts/dev');
const { launchBrowser, newContext } = await import(path.join(KIT, 'pw.mjs'));
const { findInstance } = await import(path.join(KIT, 'routes.mjs'));

const argv = process.argv.slice(2);
const opts = { port: null, out: null, user: 'demo' };
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = argv[++i];
    else if (argv[i] === '--user') opts.user = argv[++i];
    else if (/^\d+$/.test(argv[i]) && !opts.port) opts.port = Number(argv[i]);
    else { console.error('usage: node web/tests/mcp/browser-consent.mjs <webPort> [--out dir] [--user demo]'); process.exit(2); }
}
if (!opts.port) { console.error('missing <webPort>'); process.exit(2); }

const inst = findInstance(opts.port);
if (!inst) { console.error(`no dev instance with web port ${opts.port} (TC_DEV_HOME?)`); process.exit(2); }
const stateFile = path.join(inst.dir, opts.user === 'demo' ? 'state.json' : `state-${opts.user}.json`);
if (!fs.existsSync(stateFile)) { console.error(`missing ${stateFile}; run scripts/dev/login.mjs ${opts.port} --user ${opts.user}`); process.exit(2); }
const OUT = opts.out || path.join(inst.dir, 'mcp-browser');
fs.mkdirSync(OUT, { recursive: true });

const BASE = `http://localhost:${opts.port}`;
const RESOURCE = `${BASE}/mcp`;
const STATE_PARAM = 'st-browser-1';
const MODERN = '2026-07-28';
const META = { 'io.modelcontextprotocol/protocolVersion': MODERN, 'io.modelcontextprotocol/clientInfo': { name: 'tc-browser-consent', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };

// ── a loopback "client app": the redirect_uri target. It records every hit so the test can read the callback URL.
const hits = [];
const cbServer = http.createServer((req, res) => {
    hits.push(`http://127.0.0.1:${cbServer.address().port}${req.url}`);
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>client callback</title><p>client app received the redirect</p>');
});
await new Promise((r) => cbServer.listen(0, '127.0.0.1', r));
const CB_PORT = cbServer.address().port;
const REDIRECT_URI = `http://127.0.0.1:${CB_PORT}/cb`;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
function pkce() {
    const verifier = b64url(randomBytes(48));
    return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}
async function register(name) {
    const res = await fetch(`${BASE}/oauth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_name: name, redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
        signal: AbortSignal.timeout(60_000),
    });
    if (res.status !== 201) throw new Error(`DCR ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).client_id;
}
async function exchange(code, clientId, verifier) {
    const res = await fetch(`${BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: clientId, code_verifier: verifier, resource: RESOURCE }),
        signal: AbortSignal.timeout(60_000),
    });
    const body = await res.json().catch(() => null);
    if (res.status !== 200 || !body?.access_token) throw new Error(`token ${res.status}: ${JSON.stringify(body)}`);
    return body.access_token;
}
let rpcId = 0;
async function mcp(token, method, params = {}) {
    const res = await fetch(RESOURCE, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}`, 'mcp-protocol-version': MODERN, 'mcp-method': method, ...(method === 'tools/call' ? { 'mcp-name': params.name } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params: { ...params, _meta: META } }),
        signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let json = null;
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
        const line = text.split('\n').find((l) => l.startsWith('data: '));
        json = line ? JSON.parse(line.slice(6)) : null;
    } else {
        try { json = JSON.parse(text); } catch { json = null; }
    }
    if (res.status !== 200 || !json?.result) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return json.result;
}

function must(cond, msg) { if (!cond) throw new Error(msg); }

/** Open /oauth/authorize in `context`, click the button called `label`, wait for the client callback. */
async function clickThrough(context, step, label) {
    const clientId = await register(`Browser consent ${step}`);
    const { verifier, challenge } = pkce();
    const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT_URI, code_challenge: challenge, code_challenge_method: 'S256', scope: 'mcp:read offline_access', state: STATE_PARAM, resource: RESOURCE });
    const page = await context.newPage();
    const info = { step, clicked: String(label), consoleErrors: [] };
    page.on('request', (r) => {
        // What the browser really sent (txn and csrf are left out).
        if (r.method() === 'POST' && r.url().endsWith('/oauth/authorize/decision')) {
            info.decisionPost = [...new URLSearchParams(r.postData() || '')].filter(([k]) => k !== 'txn' && k !== 'csrf').map(([k, v]) => `${k}=${v}`).join('&');
        }
    });
    page.on('console', (m) => { if (m.type() === 'error') info.consoleErrors.push(m.text().slice(0, 300)); });
    try {
        await page.goto(`${BASE}/oauth/authorize?${q}`, { waitUntil: 'load', timeout: 60_000 });
        must(/\/oauth\/consent/.test(page.url()), `expected the consent page, got ${page.url()}`);
        const button = page.getByRole('button', { name: label });
        await button.waitFor({ state: 'visible', timeout: 30_000 });
        must(await button.isEnabled(), `"${label}" is disabled`);
        await page.screenshot({ path: path.join(OUT, `${step}-1-consent.png`) });
        hits.length = 0;
        await button.click();
        try {
            await page.waitForURL((u) => u.origin === `http://127.0.0.1:${CB_PORT}`, { timeout: 30_000 });
        } catch {
            const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
            throw new Error(`no redirect to the client after clicking "${label}"; browser posted [${info.decisionPost}]; page is ${page.url()}: ${text}`);
        }
        info.callback = page.url();
        must(info.decisionPost !== undefined, 'the browser never posted the decision form');
        await page.screenshot({ path: path.join(OUT, `${step}-2-callback.png`) });
        must(hits.some((h) => h === info.callback), 'the client app server did not receive the callback request');
    } finally {
        await page.close();
    }
    return { info, clientId, verifier, url: new URL(info.callback) };
}

async function expectCode({ url, clientId, verifier, info }) {
    const code = url.searchParams.get('code');
    must(/^tcac_/.test(code || ''), `no code in ${info.callback}`);
    must(url.searchParams.get('iss') === BASE, `iss is ${url.searchParams.get('iss')}, expected ${BASE}`);
    must(url.searchParams.get('state') === STATE_PARAM, 'state not echoed');
    info.code = `${code.slice(0, 9)}...`;
    info.iss = url.searchParams.get('iss');
    const token = await exchange(code, clientId, verifier);
    info.tokenExchange = 'ok';
    return token;
}

const steps = [];
async function step(name, fn) {
    const t0 = Date.now();
    const rec = { step: name, ok: false };
    try {
        Object.assign(rec, await fn());
        rec.ok = true;
    } catch (err) {
        rec.error = String(err?.message || err).split('\n')[0];
    }
    rec.ms = Date.now() - t0;
    steps.push(rec);
    console.log(`${rec.ok ? 'PASS' : 'FAIL'}  ${name}${rec.ok ? '' : `: ${rec.error}`}  (${rec.ms} ms)`);
    if (rec.ok) console.log(`      ${JSON.stringify({ ...rec, step: undefined, ok: undefined, ms: undefined })}`);
}

const browser = await launchBrowser();
try {
    await step('c) signed out, "Use demo data instead"', async () => {
        const context = await newContext(browser);
        try {
            const r = await clickThrough(context, 'c-demo', /Use demo data instead/);
            const token = await expectCode(r);
            const list = await mcp(token, 'tools/list');
            must(Array.isArray(list.tools) && list.tools.length >= 10, `tools/list returned ${list.tools?.length} tools`);
            r.info.tools = list.tools.length;
            const sites = await mcp(token, 'tools/call', { name: 'list_sites', arguments: {} });
            must(!sites.isError, `list_sites errored: ${JSON.stringify(sites.content).slice(0, 200)}`);
            r.info.toolCall = 'list_sites ok';
            return r.info;
        } finally { await context.close(); }
    });

    await step('d) signed in as demo, "Allow"', async () => {
        const context = await newContext(browser, { stateFile });
        try {
            const r = await clickThrough(context, 'd-allow', /^Allow$/);
            const token = await expectCode(r);
            const sites = await mcp(token, 'tools/call', { name: 'list_sites', arguments: {} });
            must(!sites.isError, `list_sites errored: ${JSON.stringify(sites.content).slice(0, 200)}`);
            r.info.toolCall = 'list_sites ok';
            return r.info;
        } finally { await context.close(); }
    });

    await step('e) "Cancel"', async () => {
        const context = await newContext(browser);
        try {
            const r = await clickThrough(context, 'e-cancel', /^Cancel$/);
            must(r.url.searchParams.get('error') === 'access_denied', `error is ${r.url.searchParams.get('error')} in ${r.info.callback}`);
            must(r.url.searchParams.get('state') === STATE_PARAM, 'state not echoed');
            must(!r.url.searchParams.get('code'), 'a code was issued on Cancel');
            r.info.error = 'access_denied';
            return r.info;
        } finally { await context.close(); }
    });
} finally {
    await browser.close();
    cbServer.close();
}

const failed = steps.filter((s) => !s.ok).length;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, redirectUri: REDIRECT_URI, failed, steps }, null, 2));
console.log(`\n${failed ? 'FAILED' : 'PASSED'}: ${steps.length - failed}/${steps.length} steps (report and screenshots in ${OUT})`);
process.exit(failed ? 1 : 0);
