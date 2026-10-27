// Public live demo (src/lib/publicDemo): API guard completeness, ?to= validation, demo JWT and cookie handling.
// Run: cd web && node --test tests/publicDemo.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const { DEMO_API_RULES, demoApiDecision, demoApiRule } = await import('../src/lib/publicDemo/guard.ts');
const cfg = await import('../src/lib/publicDemo/config.ts');
const { mintDemoJwt, readDemoJwt, demoJwtClaims, mintProjectedSessionJwt, DEMO_COOKIE_SALT } = await import('../src/lib/publicDemo/token.ts');
const { demoMarker, isDemoMarker } = await import('../src/lib/publicDemo/marker.ts');
const { projectDemoCookieHeader, ownSessionCookie, isSessionCookieName } = await import('../src/lib/publicDemo/cookies.ts');
const { demoSessionJson } = await import('../src/lib/publicDemo/session.ts');
const { demoSlugTarget } = await import('../src/lib/publicDemo/sites.ts');
const { demoAccessToken, demoRefreshToken } = await import('../src/lib/demo/catalog.ts');
const shim = await import('../src/lib/demo/fetchShim.ts');
const { encode, decode, getToken } = await import('next-auth/jwt');

const API_DIR = new URL('../src/app/api', import.meta.url).pathname;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Every src/app/api route with the HTTP methods its route.ts exports. */
function apiRoutes() {
    const out = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name === 'route.ts') {
                const src = fs.readFileSync(p, 'utf8');
                const methods = METHODS.filter((m) => new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b[^}]*\\}`).test(src));
                const route = `/api${path.dirname(p).slice(API_DIR.length)}`;
                out.push({ route, methods });
            }
        }
    };
    walk(API_DIR);
    return out;
}

const concrete = (route) => route.replace(/\[\.\.\.[^\]]+\]/g, 'x/y').replace(/\[[^\]]+\]/g, 'sample-1');

test('every API route and method has an explicit demo decision (allowlist completeness)', () => {
    const missing = [];
    const routes = apiRoutes();
    assert.ok(routes.length > 100, `found only ${routes.length} routes`);
    for (const { route, methods } of routes) {
        const rule = demoApiRule(concrete(route));
        if (!rule || rule.route !== route) {
            missing.push(`${route} (no rule${rule ? `; matched ${rule.route}` : ''})`);
            continue;
        }
        for (const m of methods) {
            if (!(m in rule.methods) && !('*' in rule.methods)) missing.push(`${m} ${route}`);
        }
    }
    assert.deepEqual(missing, [], `Add these to src/lib/publicDemo/guard.ts (allow, deny, noop or public):\n${missing.join('\n')}`);
});

test('no stale guard rules (each names a real route)', () => {
    const known = new Set(apiRoutes().map((r) => r.route));
    const stale = DEMO_API_RULES.map((r) => r.route).filter((r) => !known.has(r));
    assert.deepEqual(stale, []);
});

test('money, account and admin routes are denied; reads are allowed', () => {
    const d = (p, m = 'GET') => demoApiDecision(p, m).decision;
    for (const [p, m] of [
        ['/api/ai-chat', 'POST'], ['/api/ai-chat/interrupt', 'POST'], ['/api/keyword-research', 'GET'], ['/api/domain-overview', 'POST'],
        ['/api/chart-annotations', 'POST'], ['/api/audit/synthesize', 'POST'], ['/api/report/generate', 'POST'], ['/api/report/user-generate', 'POST'],
        ['/api/subscription/cancel', 'POST'], ['/api/google/link/start', 'GET'], ['/api/google/connections/abc', 'DELETE'],
        ['/api/ai-connections/keys', 'POST'], ['/api/ai-connections/revoke-all', 'POST'], ['/api/aitraffic/authorize', 'GET'],
        ['/api/leaderboard/join', 'POST'], ['/api/leaderboard/me', 'POST'], ['/api/dashboards/12/share', 'POST'], ['/api/share', 'POST'],
        ['/api/cron/portfolio-sync', 'GET'], ['/api/admin', 'GET'], ['/api/superadmin', 'POST'], ['/api/provision', 'GET'],
        ['/api/dashboards', 'POST'], ['/api/dashboards/12', 'PUT'], ['/api/dashboards/12', 'DELETE'], ['/api/annotations', 'POST'],
        ['/api/portfolio/assets/gsc%3Ax', 'PATCH'], ['/api/seo/psi', 'POST'], ['/api/seo/schema-audit', 'POST'],
        ['/api/does-not-exist', 'GET'], ['/api/ai-chat', 'OPTIONS'],
    ]) {
        assert.equal(d(p, m), 'deny', `${m} ${p}`);
    }
    for (const [p, m] of [
        ['/api/portfolio', 'GET'], ['/api/portfolio/sync', 'POST'], ['/api/sites/directory', 'GET'], ['/api/dashboards', 'GET'],
        ['/api/dashboards/query', 'POST'], ['/api/dashboards/12', 'GET'], ['/api/dashboards/12/widget-data', 'GET'], ['/api/dashboards/options', 'GET'],
        ['/api/site/gsc', 'GET'], ['/api/analytics/realtime', 'GET'], ['/api/leaderboard/me', 'GET'], ['/api/ai-connections', 'GET'],
        ['/api/demo/ask', 'GET'], ['/api/portfolio', 'HEAD'],
    ]) {
        assert.equal(d(p, m), 'allow', `${m} ${p}`);
    }
    assert.deepEqual(demoApiDecision('/api/user/workspace', 'PATCH'), { decision: 'noop', noopBody: { ok: true, demo: true } });
    assert.equal(demoApiDecision('/api/auth/register-provider', 'POST').noopBody.synced, true);
    for (const p of ['/api/leaderboard', '/api/leaderboard/acme', '/api/dashboards/public/tok', '/api/share/tok/data', '/api/embed/realtime', '/api/contact', '/api/webhooks/dodo', '/api/auth/signin/google']) {
        assert.equal(d(p, p === '/api/contact' || p.includes('webhooks') ? 'POST' : 'GET'), 'public', p);
    }
    // Static segments win over dynamic ones.
    assert.equal(demoApiRule('/api/leaderboard/join').route, '/api/leaderboard/join');
    assert.equal(demoApiRule('/api/auth/register-provider').route, '/api/auth/register-provider');
    assert.equal(demoApiRule('/api/auth/callback/github-app').route, '/api/auth/callback/github-app');
});

test('?to= accepts only /dashboard paths (no open redirect)', () => {
    const t = cfg.safeDemoTarget;
    assert.equal(t('/dashboard'), '/dashboard');
    assert.equal(t('/dashboard/s/acmeanalytics.example'), '/dashboard/s/acmeanalytics.example');
    assert.equal(t('/dashboard/s/acmeanalytics.example/search?tab=queries#x'), '/dashboard/s/acmeanalytics.example/search?tab=queries#x');
    assert.equal(t('/dashboard/dashboards'), '/dashboard/dashboards');
    for (const bad of [
        null, undefined, '', 'dashboard', 'https://evil.com/dashboard', '//evil.com/dashboard', '/\\evil.com', '\\\\evil.com',
        '/dashboard/../admin', '/dashboard/%2e%2e/admin', '/dashboard%2f..%2fadmin', '/dashboardx', '/dashboards', '/admin',
        '/dashboard/setup', 'javascript:alert(1)', '/dashboard\n/x', `/${'a'.repeat(600)}`, '/%2F%2Fevil.com',
    ]) {
        const out = t(bad);
        assert.equal(out, '/dashboard', `${JSON.stringify(bad)} -> ${out}`);
    }
});

test('/demo/<slug> maps sample sites to their app page', () => {
    assert.equal(demoSlugTarget('acme'), '/dashboard/s/acmeanalytics.example');
    assert.equal(demoSlugTarget('acmeanalytics.example'), '/dashboard/s/acmeanalytics.example');
    assert.equal(demoSlugTarget('health'), '/dashboard/s/healthinsights.example');
    assert.equal(demoSlugTarget('www.healthinsights.example'), '/dashboard/s/healthinsights.example');
    assert.equal(demoSlugTarget('creativeprints'), '/dashboard/s/ga4-412300108');
    assert.equal(demoSlugTarget('nope'), '/dashboard');
    assert.equal(demoSlugTarget('../../admin'), '/dashboard');
});

test('demo tokens in config match the catalogue', () => {
    assert.equal(cfg.DEMO_ACCESS_TOKEN, demoAccessToken(cfg.DEMO_ACCOUNT_KEY));
    assert.equal(cfg.DEMO_REFRESH_TOKEN, demoRefreshToken(cfg.DEMO_ACCOUNT_KEY));
    assert.equal(cfg.DEMO_REQUEST_HEADER, shim.DEMO_REQUEST_HEADER);
});

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

test('demo JWT: mint, read, refuse forged / foreign / expired tokens', async () => {
    const jwt = await mintDemoJwt(SECRET);
    const tok = await readDemoJwt(jwt, SECRET);
    assert.ok(tok);
    assert.equal(tok.sub, cfg.DEMO_USER_ID);
    assert.equal(tok.demo, true);
    assert.equal(tok.email, null, 'F5: no email in the demo identity');
    assert.equal(tok.primaryEmail, null);
    assert.equal(tok.workspaceSetupCompleted, true);
    assert.ok(tok.exp - Math.floor(Date.now() / 1000) <= cfg.DEMO_MAX_AGE_S + 5);
    assert.equal(await readDemoJwt(jwt, 'another-secret-0123456789abcdef0123456789'), null);
    assert.equal(await readDemoJwt(`${jwt}x`, SECRET), null);
    assert.equal(await readDemoJwt('', SECRET), null);
    assert.equal(await readDemoJwt(jwt, undefined), null);
    // A real user's session JWT is not a demo token, even in the demo cookie.
    const real = await encode({ token: { sub: '1234567890', name: 'Real', googleAccessToken: 'ya29.x' }, secret: SECRET, maxAge: 3600 });
    assert.equal(await readDemoJwt(real, SECRET), null);
    // A session-format (default salt) demo token is not accepted as tc_demo either.
    const projected = await mintProjectedSessionJwt(demoJwtClaims(), SECRET);
    assert.equal(await readDemoJwt(projected, SECRET), null);
    const expired = await encode({ token: demoJwtClaims(), secret: SECRET, maxAge: -60, salt: DEMO_COOKIE_SALT });
    assert.equal(await readDemoJwt(expired, SECRET), null);
});

test('F1: the tc_demo value is not a NextAuth session token under any name or as Bearer', async () => {
    const jwt = await mintDemoJwt(SECRET);
    assert.equal(await decode({ token: jwt, secret: SECRET }).catch(() => null), null, 'default-salt decode must fail');
    for (const [label, req] of [
        ['next-auth.session-token', { headers: new Headers(), cookies: { 'next-auth.session-token': jwt } }],
        ['__Secure-next-auth.session-token', { headers: new Headers(), cookies: { '__Secure-next-auth.session-token': jwt } }],
        ['__Secure-next-auth.session-token.0', { headers: new Headers(), cookies: { '__Secure-next-auth.session-token.0': jwt } }],
        ['prefixed name __Secure-next-auth.session-tokenX', { headers: new Headers(), cookies: { '__Secure-next-auth.session-tokenX': jwt } }],
        ['Authorization: Bearer', { headers: new Headers({ authorization: `Bearer ${jwt}` }), cookies: {} }],
    ]) {
        for (const secureCookie of [false, true]) {
            const t = await getToken({ req, secret: SECRET, secureCookie });
            assert.equal(t, null, `${label} (secureCookie=${secureCookie}) decoded as a session`);
        }
    }
});

test('F1: a session-format demo token counts only with the middleware marker (getAuthJwt, every vector)', async () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    process.env.NEXTAUTH_URL = 'https://trafficclaw.test';
    delete process.env.TC_PUBLIC_DEMO;
    const { getAuthJwt, getServerAuthSession } = await import('../src/lib/serverAuth.ts');
    const projected = await mintProjectedSessionJwt(demoJwtClaims(), SECRET);
    const marker = await demoMarker(SECRET);
    const vectors = {
        cookie: { cookie: `__Secure-next-auth.session-token=${projected}` },
        chunk0: { cookie: `__Secure-next-auth.session-token.0=${projected}` },
        prefixed: { cookie: `__Secure-next-auth.session-tokenX=${projected}` },
        bearer: { authorization: `Bearer ${projected}` },
    };
    for (const [name, h] of Object.entries(vectors)) {
        assert.equal(await getAuthJwt(new Request('https://trafficclaw.test/api/x', { headers: h })), null, `${name} without marker`);
        assert.equal(await getServerAuthSession(new Request('https://trafficclaw.test/oauth/authorize/decision', { headers: h })), null, `${name}: oauth/MCP session helper`);
        const forged = await getAuthJwt(new Request('https://trafficclaw.test/api/x', { headers: { ...h, [cfg.DEMO_REQUEST_HEADER]: '1' } }));
        assert.equal(forged, null, `${name} with a forged marker`);
    }
    // The real projection: the cookie under the session name plus the HMAC marker.
    const ok = await getAuthJwt(new Request('https://trafficclaw.test/api/x', { headers: { ...vectors.cookie, [cfg.DEMO_REQUEST_HEADER]: marker } }));
    assert.equal(ok?.sub, cfg.DEMO_USER_ID);
    // Kill switch: nothing demo counts any more, marker or not.
    process.env.TC_PUBLIC_DEMO = '0';
    try {
        assert.equal(await getAuthJwt(new Request('https://trafficclaw.test/api/x', { headers: { ...vectors.cookie, [cfg.DEMO_REQUEST_HEADER]: marker } })), null);
    } finally {
        delete process.env.TC_PUBLIC_DEMO;
    }
    // A real user is unaffected, with or without the header.
    const real = await encode({ token: { sub: '1234567890', name: 'Real' }, secret: SECRET, maxAge: 3600 });
    assert.equal((await getAuthJwt(new Request('https://trafficclaw.test/api/x', { headers: { cookie: `__Secure-next-auth.session-token=${real}` } })))?.sub, '1234567890');
});

test('F1: NextAuth never renews a demo token (/api/auth/session) and the jwt callback refuses it', async () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    process.env.NEXTAUTH_URL = 'https://trafficclaw.test';
    // lib/auth.ts cannot be imported under plain node (CJS provider defaults); its jwt callback starts with
    // assertDemoSessionHere (checked in its source below), which is what runs here inside NextAuth's real handler.
    const authSrc = fs.readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');
    assert.match(authSrc, /async jwt\([^)]*\) \{[\s\S]{0,600}?await assertDemoSessionHere\(token\);/);
    const { assertDemoSessionHere } = await import('../src/lib/publicDemo/sessionGuard.ts');
    const { sessionCallback } = await import('../src/lib/authSession.ts');
    await assert.rejects(() => assertDemoSessionHere(demoJwtClaims()), /demo session/);
    await assertDemoSessionHere({ sub: '1234567890' });
    const authOptions = {
        providers: [],
        session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
        callbacks: { async jwt({ token }) { await assertDemoSessionHere(token); return token; }, session: sessionCallback },
    };
    const core = await import(new URL('../node_modules/next-auth/core/index.js', import.meta.url).href);
    const AuthHandler = core.AuthHandler ?? core.default.AuthHandler;
    const projected = await mintProjectedSessionJwt(demoJwtClaims(), SECRET);
    for (const cookieName of ['__Secure-next-auth.session-token', '__Secure-next-auth.session-token.0']) {
        const res = await AuthHandler({
            options: { ...authOptions, secret: SECRET, logger: { error() {}, warn() {}, debug() {} } },
            req: { action: 'session', method: 'GET', cookies: { [cookieName]: projected }, headers: {}, host: 'https://trafficclaw.test' },
        });
        assert.deepEqual(res.body, {}, `${cookieName}: no session`);
        const set = (res.cookies || []).filter((c) => /session-token/.test(c.name));
        assert.ok(set.every((c) => !c.value), `${cookieName}: only clearing cookies, got ${JSON.stringify(set.map((c) => c.name))}`);
    }
});

test('F2: the demo marker is an HMAC of the secret (unforgeable, constant-time compared)', async () => {
    const m = await demoMarker(SECRET);
    assert.match(m, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await isDemoMarker(m, SECRET), true);
    assert.equal(await isDemoMarker('1', SECRET), false);
    assert.equal(await isDemoMarker(`${m.slice(0, -1)}A`, SECRET), m.endsWith('A'));
    assert.equal(await isDemoMarker(m, 'another-secret-0123456789abcdef0123456789'), false);
    assert.equal(await isDemoMarker(null, SECRET), false);
    assert.equal(await demoMarker(''), null);
});

test('cookie projection swaps only the session cookies, in the request header', () => {
    const header = 'theme=dark; next-auth.session-token=REAL; __Secure-next-auth.session-token.0=A; __Secure-next-auth.session-token.1=B; tc_demo=DEMO; tc_site=acme; next-auth.csrf-token=c';
    const out = projectDemoCookieHeader(header, 'DEMOJWT');
    assert.equal(out, 'theme=dark; tc_site=acme; next-auth.csrf-token=c; next-auth.session-token=DEMOJWT; __Secure-next-auth.session-token=DEMOJWT');
    assert.equal(projectDemoCookieHeader('', 'J'), 'next-auth.session-token=J; __Secure-next-auth.session-token=J');
    assert.ok(isSessionCookieName('next-auth.session-token.3'));
    assert.ok(!isSessionCookieName('next-auth.session-token.x'));
    assert.ok(!isSessionCookieName('next-auth.csrf-token'));
    assert.deepEqual(ownSessionCookie(header), { value: 'REAL', present: true });
    assert.deepEqual(ownSessionCookie('__Secure-next-auth.session-token.0=A'), { value: null, present: true });
    assert.deepEqual(ownSessionCookie('theme=dark'), { value: null, present: false });
});

test('the demo session answer carries no tokens', () => {
    const json = demoSessionJson(demoJwtClaims(), { realSession: true });
    assert.equal(json.user.demo, true);
    assert.equal(json.user.id, cfg.DEMO_USER_ID);
    assert.equal(json.user.hasGoogle, true);
    assert.equal(json.demoRealSession, true);
    assert.ok(!/demo-access|demo-refresh|token/i.test(JSON.stringify(json.user)), JSON.stringify(json.user));
    assert.ok(!Number.isNaN(Date.parse(json.expires)));
});

test('kill switch', () => {
    assert.equal(cfg.publicDemoEnabled({}), true);
    assert.equal(cfg.publicDemoEnabled({ TC_PUBLIC_DEMO: '1' }), true);
    assert.equal(cfg.publicDemoEnabled({ TC_PUBLIC_DEMO: '0' }), false);
});

test('per-visitor demo rate limit: fixed one-minute windows', async () => {
    const { demoRateOk, clientIp } = await import('../src/lib/publicDemo/rateLimit.ts');
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) assert.equal(demoRateOk('k1', 5, t + i), true);
    assert.equal(demoRateOk('k1', 5, t + 10), false);
    assert.equal(demoRateOk('k2', 5, t + 10), true, 'other visitors are not affected');
    assert.equal(demoRateOk('k1', 5, t + 60_001), true, 'a new minute starts fresh');
    assert.equal(clientIp(new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' })), '1.2.3.4');
    assert.equal(clientIp(new Headers({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' })), '5.6.7.8');
    assert.equal(clientIp(new Headers()), 'unknown');
});

test('F4: IPv6 is limited per /64, IPv4 per address', async () => {
    const { addressKey, clientIp } = await import('../src/lib/publicDemo/rateLimit.ts');
    assert.equal(addressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
    assert.equal(addressKey('2001:db8:1:2::1'), '2001:db8:1:2::/64');
    assert.equal(addressKey('2001:0db8:0001:0002:ffff::'), '2001:db8:1:2::/64');
    assert.equal(addressKey('[2001:db8::5]'), '2001:db8:0:0::/64');
    assert.equal(addressKey('::ffff:1.2.3.4'), '1.2.3.4');
    assert.equal(addressKey('1.2.3.4'), '1.2.3.4');
    assert.equal(clientIp(new Headers({ 'cf-connecting-ip': '2001:db8:1:2:3:4:5:6' })), clientIp(new Headers({ 'cf-connecting-ip': '2001:db8:1:2:ffff::9' })));
});

test('F4: a full rate table drops the oldest windows, not everyone', async () => {
    const { demoRateOk, demoRateTracked, RATE_MAX_KEYS } = await import('../src/lib/publicDemo/rateLimit.ts');
    const t = 5_000_000;
    // An attacker rotates through more keys than the table holds.
    for (let i = 0; i < RATE_MAX_KEYS + 10; i++) demoRateOk(`rot-${i}`, 5, t + i);
    const newest = `rot-${RATE_MAX_KEYS + 9}`;
    assert.ok(demoRateTracked(newest));
    assert.ok(!demoRateTracked('rot-0'), 'the oldest window was dropped');
    // Nothing was reset wholesale: the newest keys are still counted.
    assert.equal(demoRateOk(newest, 1, t + RATE_MAX_KEYS + 9), false);
});
