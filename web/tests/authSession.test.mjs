// OAuth tokens must never reach the browser session (/api/auth/session, useSession()).
// The session callback (lib/authSession.ts sessionCallback, wired in lib/auth.ts) must
// strip them; server code reads them from the JWT via lib/serverAuth.ts.
// Run: cd web && node --test tests/authSession.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../src');

const { sessionCallback, publicSessionUser, serverAuthUser } = await import('../src/lib/authSession.ts');

// A JWT shaped like lib/auth.ts jwt() builds it: Google primary, GitHub connected second.
const fullToken = () => ({
    name: 'Demo Owner',
    email: 'owner@example.com',
    picture: 'https://example.com/a.png',
    sub: 'g-123',
    primaryProvider: 'google',
    primarySub: 'g-123',
    primaryName: 'Demo Owner',
    primaryEmail: 'owner@example.com',
    primaryImage: 'https://example.com/a.png',
    provider: 'google',
    accessToken: 'gho_latest-access',
    refreshToken: '1//google-refresh',
    googleAccountId: 'g-123',
    googleAccessToken: 'ya29.google-access',
    googleRefreshToken: '1//google-refresh',
    githubAccountId: '987',
    githubLogin: 'demo-owner',
    githubAccessToken: 'gho_github-access',
    workspaceSetupCompleted: true,
});

const SECRET_VALUES = ['gho_latest-access', '1//google-refresh', 'ya29.google-access', 'gho_github-access'];

function allKeys(obj, out = []) {
    if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
            out.push(k);
            allKeys(v, out);
        }
    }
    return out;
}

async function renderSession(token) {
    // NextAuth builds this default before calling callbacks.session.
    const session = {
        user: { name: token.name ?? null, email: token.email ?? null, image: token.picture ?? null },
        expires: '2099-01-01T00:00:00.000Z',
    };
    return sessionCallback({ session, token });
}

test('session callback output has no *Token key and no token value', async () => {
    const out = await renderSession(fullToken());
    const keys = allKeys(out);
    assert.deepEqual(keys.filter((k) => /token/i.test(k)), [], `token keys leaked: ${keys.join(', ')}`);
    const json = JSON.stringify(out);
    for (const secret of SECRET_VALUES) assert.ok(!json.includes(secret), `session leaks ${secret}`);
    // Provider account ids and logins stay server-side too.
    for (const k of ['githubAccountId', 'googleAccountId', 'githubLogin', 'primarySub', 'username']) {
        assert.ok(!keys.includes(k), `session.user carries ${k}`);
    }
});

test('session.user is exactly identity + non-secret flags', async () => {
    const out = await renderSession(fullToken());
    assert.deepEqual(Object.keys(out.user).sort(), ['email', 'hasGithub', 'hasGoogle', 'id', 'image', 'name', 'provider', 'workspaceSetupCompleted']);
    assert.equal(out.user.id, 'g-123');
    assert.equal(out.user.name, 'Demo Owner');
    assert.equal(out.user.email, 'owner@example.com');
    assert.equal(out.user.provider, 'google');
    assert.equal(out.user.hasGoogle, true);
    assert.equal(out.user.hasGithub, true);
    assert.equal(out.user.workspaceSetupCompleted, true);
    assert.equal(out.expires, '2099-01-01T00:00:00.000Z');
});

test('session callback drops unknown fields already on session.user', async () => {
    const token = fullToken();
    const session = { user: { name: 'x', email: 'y', image: null, googleRefreshToken: 'stale', accessToken: 'stale' }, expires: 'e' };
    const out = await sessionCallback({ session, token });
    assert.ok(!('googleRefreshToken' in out.user));
    assert.ok(!('accessToken' in out.user));
});

test('primary identity is kept when a second provider is connected', () => {
    const token = { ...fullToken(), name: 'Github Name', email: 'gh@example.com', sub: 'g-123' };
    const user = publicSessionUser(token, { name: token.name, email: token.email, image: null });
    assert.equal(user.name, 'Demo Owner');
    assert.equal(user.email, 'owner@example.com');
});

test('flags are false without connections', async () => {
    const out = await renderSession({ sub: '42', name: 'N', email: 'n@example.com', provider: 'github', primaryProvider: 'github', primarySub: '42' });
    assert.equal(out.user.hasGoogle, false);
    assert.equal(out.user.hasGithub, false);
    assert.equal(out.user.workspaceSetupCompleted, false);
    assert.equal(out.user.id, '42');
});

test('server-only view still has every token the routes need', () => {
    const u = serverAuthUser(fullToken());
    assert.equal(u.id, 'g-123');
    assert.equal(u.googleAccessToken, 'ya29.google-access');
    assert.equal(u.googleRefreshToken, '1//google-refresh');
    assert.equal(u.githubAccessToken, 'gho_github-access');
    assert.equal(u.accessToken, 'gho_latest-access');
    assert.equal(u.refreshToken, '1//google-refresh');
    assert.equal(u.githubAccountId, '987');
    assert.equal(u.googleAccountId, 'g-123');
    assert.equal(u.username, 'demo-owner');
});

test('lib/auth.ts wires the token-free session callback', () => {
    const src = fs.readFileSync(path.join(SRC, 'lib/auth.ts'), 'utf8');
    assert.match(src, /session:\s*sessionCallback\b/);
    assert.doesNotMatch(src, /async session\s*\(/, 'auth.ts must not define its own session callback');
    assert.doesNotMatch(src, /user\.(accessToken|refreshToken|githubAccessToken|googleAccessToken|googleRefreshToken)\s*=/);
});

// ── Client bundle sources: 'use client' modules and everything they import. ──

const USE_CLIENT = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/;
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(tsx?|jsx?|mjs)$/.test(e.name)) out.push(p);
    }
    return out;
}

function resolveImport(spec, fromFile) {
    let base;
    if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
    else if (spec.startsWith('./') || spec.startsWith('../')) base = path.resolve(path.dirname(fromFile), spec);
    else return null;
    for (const ext of EXTS) {
        const cand = base + ext;
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    }
    return null;
}

function importsOf(file) {
    const src = fs.readFileSync(file, 'utf8');
    const specs = [];
    // Type-only imports are erased and never reach the bundle.
    const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
        if (m[2]) continue;
        specs.push(m[3] || m[4]);
    }
    return specs;
}

function clientGraph() {
    const roots = walk(SRC).filter((f) => USE_CLIENT.test(fs.readFileSync(f, 'utf8')));
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
        const f = stack.pop();
        if (seen.has(f)) continue;
        seen.add(f);
        for (const spec of importsOf(f)) {
            const r = resolveImport(spec, f);
            if (r && !seen.has(r)) stack.push(r);
        }
    }
    return { roots, files: [...seen] };
}

test('client bundle sources never read OAuth tokens', () => {
    const { roots, files } = clientGraph();
    assert.ok(roots.length > 50, `expected many 'use client' modules, found ${roots.length}`);
    const offenders = [];
    for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        const rel = path.relative(SRC, f);
        if (/\b(googleRefreshToken|googleAccessToken|githubAccessToken)\b/.test(src)) offenders.push(`${rel}: names a session token field`);
        if (/^\s*import\s+(?!type\b)[^\n]*from\s+['"](next-auth\/jwt|@\/lib\/serverAuth)['"]/m.test(src)) offenders.push(`${rel}: imports a server-only token module`);
    }
    assert.ok(files.some((f) => f.endsWith('lib/useDashboardData.ts')), 'client graph should include hooks imported by client modules');
    assert.deepEqual(offenders, []);
});
