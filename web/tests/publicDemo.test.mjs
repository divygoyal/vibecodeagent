// Public live demo (src/lib/publicDemo): API guard completeness, ?to= validation, demo JWT and cookie handling.
// Run: cd web && node --test tests/publicDemo.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const { DEMO_API_RULES, demoApiDecision, demoApiRule } = await import('../src/lib/publicDemo/guard.ts');
const cfg = await import('../src/lib/publicDemo/config.ts');
const { mintDemoJwt, readDemoJwt, sessionJwtIsDemo, demoJwtClaims } = await import('../src/lib/publicDemo/token.ts');
const { projectDemoCookieHeader, ownSessionCookie, isSessionCookieName } = await import('../src/lib/publicDemo/cookies.ts');
const { demoSessionJson } = await import('../src/lib/publicDemo/session.ts');
const { demoSlugTarget } = await import('../src/lib/publicDemo/sites.ts');
const { demoAccessToken, demoRefreshToken } = await import('../src/lib/demo/catalog.ts');
const shim = await import('../src/lib/demo/fetchShim.ts');
const { encode } = await import('next-auth/jwt');

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
    assert.equal(tok.workspaceSetupCompleted, true);
    assert.ok(tok.exp - Math.floor(Date.now() / 1000) <= cfg.DEMO_MAX_AGE_S + 5);
    assert.equal(await readDemoJwt(jwt, 'another-secret-0123456789abcdef0123456789'), null);
    assert.equal(await readDemoJwt(`${jwt}x`, SECRET), null);
    assert.equal(await readDemoJwt('', SECRET), null);
    assert.equal(await readDemoJwt(jwt, undefined), null);
    // A real user's session JWT is not a demo token, even in the demo cookie.
    const real = await encode({ token: { sub: '1234567890', name: 'Real', googleAccessToken: 'ya29.x' }, secret: SECRET, maxAge: 3600 });
    assert.equal(await readDemoJwt(real, SECRET), null);
    assert.equal(await sessionJwtIsDemo(real, SECRET), false);
    assert.equal(await sessionJwtIsDemo(jwt, SECRET), true);
    // demo claim without the demo id (or the id without the claim) is still held to the demo rules
    const claimOnly = await encode({ token: { sub: '1234567890', demo: true }, secret: SECRET, maxAge: 3600 });
    assert.equal(await sessionJwtIsDemo(claimOnly, SECRET), true);
    assert.equal(await readDemoJwt(claimOnly, SECRET), null);
    const expired = await encode({ token: demoJwtClaims(), secret: SECRET, maxAge: -60 });
    assert.equal(await readDemoJwt(expired, SECRET), null);
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
