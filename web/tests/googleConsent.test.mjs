// When Google sign-in asks for consent, and which refresh token the session keeps
// (src/lib/googleConsent.ts, wired in src/lib/auth.ts).
// Run: cd web && node --test tests/googleConsent.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../src');

const {
    GOOGLE_SIGNIN_PARAMS, GOOGLE_CONSENT_PROMPT, GOOGLE_SCOPE,
    decideGoogleRefreshToken, missingGoogleScopes, lookupStoredGoogleRefresh, planGoogleSignIn,
    refreshTokenToKeep, consentRedirectUrl, safeCallbackPath,
} = await import('../src/lib/googleConsent.ts');
const { demoGoogleFetch } = await import('../src/lib/demo/fetchShim.ts');

const SUB = '100000000000000000001';
const FULL_SCOPE = GOOGLE_SCOPE;

/**
 * A fake admin API (stored tokens by Google sub) in front of the demo Google token endpoint
 * (src/lib/demo/fetchShim.ts: demo-refresh:<account> refreshes, a `~revoked` suffix answers
 * invalid_grant, as for the worker1 user frevoked). Records every URL it is asked for.
 */
function fakeNet(stored, { adminStatus, googleDown } = {}) {
    const calls = [];
    const fetch = async (url, init) => {
        const u = String(url);
        calls.push(u);
        if (u.startsWith('http://admin.test/')) {
            if (adminStatus) return new Response('{}', { status: adminStatus });
            const m = u.match(/\/api\/users\/([^/]+)\/oauth\/google$/);
            const row = m && stored[decodeURIComponent(m[1])];
            if (!row) return new Response(JSON.stringify({ detail: 'No google connection found' }), { status: 404 });
            return new Response(JSON.stringify({ provider: 'google', access_token: row.access, refresh_token: row.refresh }), { status: 200 });
        }
        if (u.startsWith('https://oauth2.googleapis.com/')) {
            if (googleDown) throw new Error('connect ETIMEDOUT');
            return demoGoogleFetch(u, init, () => { throw new Error('no network in tests'); });
        }
        throw new Error(`unexpected fetch ${u}`);
    };
    return { calls, deps: { fetch, adminUrl: 'http://admin.test', adminKey: 'k', clientId: 'cid', clientSecret: 'cs', timeoutMs: 2000 } };
}

test('provider default: select_account + offline, never consent; Reconnect prompt asks consent', () => {
    assert.equal(GOOGLE_SIGNIN_PARAMS.prompt, 'select_account');
    assert.equal(GOOGLE_SIGNIN_PARAMS.access_type, 'offline');
    assert.deepEqual(missingGoogleScopes(GOOGLE_SIGNIN_PARAMS.scope), []);
    assert.equal(GOOGLE_CONSENT_PROMPT, 'select_account consent');

    const auth = fs.readFileSync(path.join(SRC, 'lib/auth.ts'), 'utf8');
    assert.match(auth, /params:\s*\{\s*\.\.\.GOOGLE_SIGNIN_PARAMS\s*\}/);
    assert.doesNotMatch(auth, /prompt:\s*["']consent["']/);
    // Every Reconnect / Connect Google button keeps asking consent per call.
    for (const f of [
        'app/(dashboard)/dashboard/settings/GoogleTab.tsx',
        'app/(dashboard)/dashboard/s/[host]/SiteRouteGuard.tsx',
        'app/(dashboard)/dashboard/setup/page.tsx',
        'app/(dashboard)/dashboard/ask/page.tsx',
    ]) {
        assert.match(fs.readFileSync(path.join(SRC, f), 'utf8'), /prompt: 'select_account consent'/, f);
    }
});

test('decision table', () => {
    const none = { status: 'none' };
    const ok = { status: 'ok', refreshToken: '1//stored' };
    const revoked = { status: 'revoked', refreshToken: '1//stored' };
    const unknown = { status: 'unknown' };
    const rows = [
        // [returned, scope, stored, consentAttempted] -> expected
        [['1//new', FULL_SCOPE, none, false], { action: 'store_new', refreshToken: '1//new' }],          // first sign-in (Google showed consent)
        [['1//new', FULL_SCOPE, ok, false], { action: 'store_new', refreshToken: '1//new' }],            // Reconnect
        [[undefined, FULL_SCOPE, none, false], { action: 'ask_consent', reason: 'first_connect' }],      // grant exists, nothing stored
        [[undefined, FULL_SCOPE, ok, false], { action: 'keep_stored', refreshToken: '1//stored' }],      // returning user
        [['', FULL_SCOPE, ok, false], { action: 'keep_stored', refreshToken: '1//stored' }],             // empty never overwrites
        [['  ', FULL_SCOPE, ok, false], { action: 'keep_stored', refreshToken: '1//stored' }],
        [[undefined, FULL_SCOPE, revoked, false], { action: 'ask_consent', reason: 'revoked' }],         // revoked / evicted
        [[undefined, 'openid email profile', ok, false], { action: 'ask_consent', reason: 'scope_upgrade' }],
        [[undefined, FULL_SCOPE, unknown, false], { action: 'keep_stored', refreshToken: undefined }],   // admin/Google unreachable
        [[undefined, undefined, ok, false], { action: 'keep_stored', refreshToken: '1//stored' }],       // no scope string: no upgrade
        // Consent already tried (cookie set by /connect-google): never a second redirect.
        [[undefined, FULL_SCOPE, revoked, true], { action: 'reconnect', reason: 'revoked' }],
        [[undefined, FULL_SCOPE, none, true], { action: 'reconnect', reason: 'first_connect' }],
        [[undefined, 'openid', ok, true], { action: 'keep_stored', refreshToken: '1//stored' }],
    ];
    for (const [[returnedRefreshToken, grantedScope, stored, consentAttempted], want] of rows) {
        assert.deepEqual(decideGoogleRefreshToken({ returnedRefreshToken, grantedScope, stored, consentAttempted }), want,
            JSON.stringify({ returnedRefreshToken, grantedScope, stored, consentAttempted }));
    }
    assert.equal(refreshTokenToKeep({ action: 'keep_stored', refreshToken: '1//stored' }), '1//stored');
    assert.equal(refreshTokenToKeep({ action: 'keep_stored' }), undefined);
    assert.equal(refreshTokenToKeep({ action: 'ask_consent', reason: 'revoked' }), undefined);
    assert.equal(refreshTokenToKeep({ action: 'store_new', refreshToken: '1//n' }), '1//n');
});

test('first sign-in: Google returned a refresh token -> stored, no lookups', async () => {
    const net = fakeNet({});
    const plan = await planGoogleSignIn({ providerAccountId: SUB, refresh_token: '1//first', scope: FULL_SCOPE }, false, net.deps);
    assert.deepEqual(plan, { action: 'store_new', refreshToken: '1//first' });
    assert.deepEqual(net.calls, []);
});

test('first-time connect without a token (grant left from before, nothing stored) -> consent', async () => {
    const net = fakeNet({});
    const plan = await planGoogleSignIn({ providerAccountId: SUB, scope: FULL_SCOPE }, false, net.deps);
    assert.deepEqual(plan, { action: 'ask_consent', reason: 'first_connect' });
    assert.deepEqual(net.calls, [`http://admin.test/api/users/${SUB}/oauth/google`]);
});

test('returning user with a working stored token -> select_account sign-in keeps it', async () => {
    const net = fakeNet({ [SUB]: { access: 'demo-access:main', refresh: 'demo-refresh:main' } });
    const plan = await planGoogleSignIn({ providerAccountId: SUB, scope: FULL_SCOPE }, false, net.deps);
    assert.deepEqual(plan, { action: 'keep_stored', refreshToken: 'demo-refresh:main' });
    assert.equal(refreshTokenToKeep(plan), 'demo-refresh:main');
    assert.deepEqual(net.calls, [`http://admin.test/api/users/${SUB}/oauth/google`, 'https://oauth2.googleapis.com/token']);
});

test('revoked stored token (frevoked) -> consent once, then Reconnect state', async () => {
    const net = fakeNet({ [SUB]: { access: 'demo-access:main~revoked', refresh: 'demo-refresh:main~revoked' } });
    assert.deepEqual(await lookupStoredGoogleRefresh(SUB, net.deps), { status: 'revoked', refreshToken: 'demo-refresh:main~revoked' });
    assert.deepEqual(await planGoogleSignIn({ providerAccountId: SUB, scope: FULL_SCOPE }, false, net.deps), { action: 'ask_consent', reason: 'revoked' });
    assert.deepEqual(await planGoogleSignIn({ providerAccountId: SUB, scope: FULL_SCOPE }, true, net.deps), { action: 'reconnect', reason: 'revoked' });
});

test('stored token empty or deleted -> none; lookups use the Google sub only', async () => {
    const net = fakeNet({ [SUB]: { access: 'demo-access:main', refresh: '' } });
    assert.deepEqual(await lookupStoredGoogleRefresh(SUB, net.deps), { status: 'none' });
    assert.deepEqual(await lookupStoredGoogleRefresh('other-sub', net.deps), { status: 'none' });
    assert.ok(net.calls.every((u) => !u.includes('@')), 'never looked up by email');
});

test('admin or Google unreachable -> unknown: sign-in keeps going, no consent loop', async () => {
    assert.deepEqual(await lookupStoredGoogleRefresh(SUB, fakeNet({}, { adminStatus: 503 }).deps), { status: 'unknown' });
    assert.deepEqual(await lookupStoredGoogleRefresh(SUB, { ...fakeNet({}).deps, adminKey: '' }), { status: 'unknown' });
    const down = fakeNet({ [SUB]: { access: 'a', refresh: 'demo-refresh:main' } }, { googleDown: true });
    assert.deepEqual(await lookupStoredGoogleRefresh(SUB, down.deps), { status: 'unknown', refreshToken: 'demo-refresh:main' });
    assert.deepEqual(await planGoogleSignIn({ providerAccountId: SUB, scope: FULL_SCOPE }, false, down.deps), { action: 'keep_stored', refreshToken: 'demo-refresh:main' });
});

test('consent redirect: same-site callback only', () => {
    const base = 'https://preview.trafficclaw.com';
    const u = new URL(consentRedirectUrl(base, 'https://preview.trafficclaw.com/dashboard/s/acme.example?x=1', 'revoked'));
    assert.equal(u.origin + u.pathname, 'https://preview.trafficclaw.com/connect-google');
    assert.equal(u.searchParams.get('callbackUrl'), '/dashboard/s/acme.example?x=1');
    assert.equal(u.searchParams.get('reason'), 'revoked');
    assert.equal(u.searchParams.get('auto'), '1');
    for (const evil of ['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '']) {
        assert.equal(safeCallbackPath(evil, base), '/dashboard', evil);
    }
    assert.equal(safeCallbackPath('%2Fdashboard%2Fask', base), '/dashboard/ask');
});

test('admin sync never sends an empty refresh_token', () => {
    const sync = fs.readFileSync(path.join(SRC, 'lib/adminUserSync.ts'), 'utf8');
    assert.match(sync, /\.\.\.\(refreshToken \? \{ refresh_token: refreshToken \} : \{\}\)/);
    const serverAuth = fs.readFileSync(path.join(SRC, 'lib/serverAuth.ts'), 'utf8');
    // A JWT without a refresh token reads the stored one from the admin DB.
    assert.match(serverAuth, /if \(!refreshToken && userId\)/);
});
