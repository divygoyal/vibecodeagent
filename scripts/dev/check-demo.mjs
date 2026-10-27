#!/usr/bin/env node
/**
 * End-to-end check of the public live demo (/demo -> the real app, read-only) on a dev / worker1 instance.
 *
 *   node scripts/dev/check-demo.mjs <webPort> [--out dir] [--shots dir] [--quick] [--no-walk]
 *
 * 1. HTTP: /demo sets only the httpOnly tc_demo cookie and lands in /dashboard; ?to= accepts /dashboard paths only;
 *    /demo/<slug>; ?static=1 and link-preview bots get the marketing page; /api/auth/session answers the demo
 *    without touching the session cookie; denied routes answer 403 (x-tc-demo: readonly); background writes are
 *    no-ops; reads work; a forged demo cookie is ignored; signed-out /api stays 401.
 * 2. Browser, signed out, at 1440 and 390, light and dark: /demo -> Portfolio -> a site page (every tab) ->
 *    Dashboards -> a dashboard -> Leaderboard -> Connect AI -> Ask (sample answer). No console errors, no 5xx,
 *    no error screens, no horizontal overflow, the demo bar is there. Screenshots.
 * 3. Write actions in the UI (star a site, a builder save, Connect AI key) show the demo toast and change nothing.
 * 4. Exit demo -> home page, no demo cookie.
 * 5. A signed-in dev user (login.mjs state.json) visits /demo, sees the demo with "Back to your sites", goes back:
 *    the real session cookie is byte-for-byte the same and /api/auth/session is the real user again.
 * Writes <out>/demo-check.{json,md}. Exit 0 = every check passed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, newContext } from './pw.mjs';
import { findInstance } from './routes.mjs';

const argv = process.argv.slice(2);
const opts = { port: null, out: '/root/projects/tc-redesign-research/round3/demo/check', shots: null, quick: false, walk: true };
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = argv[++i];
    else if (argv[i] === '--shots') opts.shots = argv[++i];
    else if (argv[i] === '--quick') opts.quick = true;
    else if (argv[i] === '--no-walk') opts.walk = false;
    else if (argv[i] === '--variants') opts.variants = argv[++i].split(',');
    else if (/^\d+$/.test(argv[i])) opts.port = Number(argv[i]);
    else { console.error(`check-demo: unknown argument ${argv[i]}`); process.exit(2); }
}
if (!opts.port) { console.error('usage: node scripts/dev/check-demo.mjs <webPort> [--out dir] [--shots dir] [--quick]'); process.exit(2); }
opts.shots ??= path.join(opts.out, 'shots');
fs.mkdirSync(opts.out, { recursive: true });
fs.mkdirSync(opts.shots, { recursive: true });

const inst = findInstance(opts.port);
const base = `http://localhost:${opts.port}`;
const DEMO_ID = 'tc-public-demo';
const SITE = 'acmeanalytics.example';

const checks = [];
const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 800) });
    console.error(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` -- ${String(detail).slice(0, 300)}` : ''}`);
};

async function http(method, p, { cookie, body, headers = {} } = {}) {
    const res = await fetch(base + p, {
        method,
        redirect: 'manual',
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, headers: res.headers, data, text, setCookies: res.headers.getSetCookie?.() ?? [] };
}

const cookieOf = (setCookies, name) => {
    const line = setCookies.find((c) => c.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).split(';')[0] : null;
};

// ─── 1. HTTP ───
async function httpChecks() {
    let r = await http('GET', '/demo');
    const demoJwt = cookieOf(r.setCookies, 'tc_demo');
    check('GET /demo -> 307 /dashboard', r.status === 307 && r.headers.get('location') === '/dashboard', `${r.status} ${r.headers.get('location')}`);
    check('/demo sets tc_demo (httpOnly, SameSite=Lax, 2 h)', demoJwt && /HttpOnly/i.test(r.setCookies.join()) && /SameSite=Lax/i.test(r.setCookies.join()) && /Max-Age=7200/.test(r.setCookies.join()), r.setCookies.join(' | '));
    check('/demo never sets a session cookie', !r.setCookies.some((c) => /session-token/.test(c)), r.setCookies.join(' | '));
    const cookie = `tc_demo=${demoJwt}`;

    for (const [to, want] of [
        ['/dashboard/dashboards', '/dashboard/dashboards'],
        [`/dashboard/s/${SITE}/search?tab=queries`, `/dashboard/s/${SITE}/search?tab=queries`],
        ['https://evil.com/', '/dashboard'], ['//evil.com/dashboard', '/dashboard'], ['/\\evil.com', '/dashboard'],
        ['/dashboard/../admin', '/dashboard'], ['/admin', '/dashboard'], ['javascript:alert(1)', '/dashboard'],
    ]) {
        r = await http('GET', `/demo?to=${encodeURIComponent(to)}`);
        check(`/demo?to=${to} -> ${want}`, r.status === 307 && r.headers.get('location') === want, `${r.status} ${r.headers.get('location')}`);
    }
    r = await http('GET', '/demo/acme');
    check('/demo/acme -> the Acme site page', r.headers.get('location') === `/dashboard/s/${SITE}`, r.headers.get('location'));
    r = await http('GET', '/demo/creativeprints');
    check('/demo/creativeprints -> its GA4-only site page', r.headers.get('location') === '/dashboard/s/ga4-412300108', r.headers.get('location'));
    r = await http('GET', '/demo', { headers: { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' } });
    check('a router prefetch of /demo starts nothing (204, no cookie)', r.status === 204 && r.setCookies.length === 0, `${r.status} ${r.setCookies.join()}`);
    r = await http('GET', '/demo', { headers: { 'sec-fetch-mode': 'navigate', 'sec-purpose': 'prefetch;prerender' } });
    check('a speculative prerender of /demo starts nothing (204)', r.status === 204 && r.setCookies.length === 0, `${r.status}`);
    r = await http('GET', '/demo/exit', { headers: { 'sec-fetch-mode': 'cors' }, cookie: 'tc_demo=x' });
    check('a router fetch of /demo/exit ends nothing (204, no cookie)', r.status === 204 && r.setCookies.length === 0, `${r.status} ${r.setCookies.join()}`);
    r = await http('GET', '/demo?static=1');
    check('/demo?static=1 -> the marketing demo page (200)', r.status === 200 && /<html/i.test(r.text), r.status);
    r = await http('GET', '/demo', { headers: { 'User-Agent': 'Twitterbot/1.0' } });
    check('link-preview bot gets the marketing page with Open Graph tags', r.status === 200 && /og:title/.test(r.text), r.status);
    r = await http('GET', '/demo/exit', { cookie });
    check('/demo/exit (signed out) -> / and clears tc_demo', r.status === 307 && r.headers.get('location') === '/' && /tc_demo=;/.test(r.setCookies.join()), `${r.headers.get('location')} ${r.setCookies.join(' | ')}`);

    r = await http('GET', '/api/auth/session', { cookie });
    check('/api/auth/session is the demo user', r.data?.user?.id === DEMO_ID && r.data?.user?.demo === true, JSON.stringify(r.data));
    check('/api/auth/session sets no cookie and leaks no token', r.setCookies.length === 0 && !/demo-access|demo-refresh|Token/.test(r.text), r.text);
    r = await http('GET', '/dashboard', { cookie });
    check('/dashboard renders for the demo (200, noindex)', r.status === 200 && /noindex/.test(r.headers.get('x-robots-tag') || ''), `${r.status} ${r.headers.get('x-robots-tag')}`);
    r = await http('GET', '/dashboard/setup', { cookie });
    check('/dashboard/setup -> /dashboard for the demo', r.status === 307 && /\/dashboard$/.test(r.headers.get('location') || ''), r.headers.get('location'));

    const denied = [
        ['POST', '/api/ai-chat', { message: 'hi' }], ['GET', '/api/keyword-research?keyword=seo'], ['POST', '/api/domain-overview', { domain: 'x.com' }],
        ['POST', '/api/chart-annotations', {}], ['POST', '/api/audit/synthesize', {}], ['POST', '/api/report/user-generate', {}],
        ['POST', '/api/dashboards', { name: 'x', templateId: 'blank' }], ['PUT', '/api/dashboards/1', {}], ['DELETE', '/api/dashboards/1'],
        ['POST', '/api/dashboards/1/share', {}], ['POST', '/api/share', {}], ['POST', '/api/embed/tokens', {}],
        ['POST', '/api/leaderboard/join', {}], ['POST', '/api/leaderboard/me', {}], ['POST', '/api/ai-connections/keys', { name: 'x' }],
        ['POST', '/api/ai-connections/revoke-all', {}], ['GET', '/api/google/link/start'], ['DELETE', '/api/google/connections/x'],
        ['POST', '/api/subscription/cancel', {}], ['GET', '/api/provision'], ['GET', '/api/admin'], ['POST', '/api/superadmin', { action: 'auth', password: 'x' }],
        ['GET', '/api/cron/portfolio-sync'], ['GET', '/api/cron/weekly-digest'], ['POST', '/api/annotations', { date: '2026-01-01', title: 'x' }],
        ['PATCH', `/api/portfolio/assets/${encodeURIComponent('gsc:sc-domain:acmeanalytics.example')}`, { starred: false }],
        ['POST', '/api/seo/psi', { url: 'https://www.google.com' }], ['POST', '/api/seo/schema-audit', { url: 'https://www.google.com' }],
        ['GET', `/api/site/audit?url=${encodeURIComponent('https://www.google.com/')}`], ['POST', '/api/site/actions/state', {}],
        ['POST', '/api/support/messages', { message: 'x' }], ['POST', '/api/chat-store?action=create_thread', {}], ['GET', '/api/does-not-exist'],
    ];
    const bad = [];
    for (const [m, p, b] of denied) {
        r = await http(m, p, { cookie, body: b });
        if (!(r.status === 403 && r.headers.get('x-tc-demo') === 'readonly' && r.data?.demo === true)) bad.push(`${m} ${p} -> ${r.status} ${r.headers.get('x-tc-demo')}`);
    }
    check(`${denied.length} denied routes answer 403 with the demo message`, bad.length === 0, bad.join('; '));

    r = await http('PATCH', '/api/user/workspace', { cookie, body: { selected_site_url: 'https://puzzlehub.example/' } });
    check('workspace PATCH is a no-op', r.status === 200 && r.data?.demo === true, `${r.status} ${JSON.stringify(r.data)}`);
    r = await http('GET', '/api/user/workspace', { cookie });
    check('the shared workspace is unchanged', r.data?.selected_site_url === 'sc-domain:acmeanalytics.example', JSON.stringify(r.data));
    r = await http('POST', '/api/auth/register-provider', { cookie, body: {} });
    check('register-provider is a no-op', r.status === 200 && r.data?.synced === true, r.status);

    const reads = [
        ['/api/portfolio?range=28d', (d) => d && (Array.isArray(d.sites) || d.state)],
        ['/api/sites/directory', (d) => Array.isArray(d?.sites) && d.sites.length >= 10],
        ['/api/analytics/properties', (d) => Array.isArray(d) && d.length >= 8],
        ['/api/seo/sites', (d) => (Array.isArray(d) ? d : d?.siteEntry || d?.sites || []).length >= 8],
        ['/api/demo/ask', (d) => d?.samples?.length === 4 && d.samples.every((s) => s.answer.length > 100)],
        [`/api/site/audit?url=${encodeURIComponent(`https://${SITE}/`)}`, (d) => d && d.meta],
        ['/api/leaderboard/me', (d) => d && Array.isArray(d.entries)],
        ['/api/ai-connections', (d) => d !== null],
    ];
    for (const [p, ok] of reads) {
        r = await http('GET', p, { cookie });
        check(`read ${p.split('?')[0]} works for the demo`, r.status === 200 && ok(r.data), `${r.status} ${r.text.slice(0, 200)}`);
    }
    // Seeding runs in the background after the first /demo: give it a moment.
    let dashboards = [];
    for (let i = 0; i < 30 && dashboards.length < 4; i++) {
        r = await http('GET', '/api/dashboards', { cookie });
        dashboards = r.data?.dashboards ?? [];
        if (dashboards.length < 4) await new Promise((res) => setTimeout(res, 2000));
    }
    check('the demo user has 4 sample dashboards', dashboards.length >= 4, dashboards.map((d) => d.name).join(', '));
    r = await http('POST', '/api/dashboards/query', { cookie, body: {} });
    check('builder query endpoint reachable (not refused)', r.status !== 403 && r.status < 500, r.status);

    r = await http('GET', '/api/portfolio');
    check('signed-out /api/portfolio is still 401', r.status === 401, r.status);
    r = await http('GET', '/api/portfolio', { cookie: 'tc_demo=forged.jwt.value' });
    check('a forged demo cookie is ignored (401) and cleared', r.status === 401 && /tc_demo=;/.test(r.setCookies.join()), `${r.status} ${r.setCookies.join()}`);
    r = await http('GET', '/dashboard', { cookie: 'tc_demo=forged.jwt.value' });
    check('a forged / expired demo cookie on a page restarts the demo', r.status === 307 && /\/demo\?to=/.test(r.headers.get('location') || ''), r.headers.get('location'));
    r = await http('GET', '/api/portfolio', { headers: { 'x-tc-demo-request': '1' } });
    check('a spoofed demo request header alone gives nothing', r.status === 401, r.status);
    return { demoJwt, dashboards };
}

// ─── 2-4. Browser ───
const ERROR_TEXT = /Something went wrong|This page could not be loaded|Application error|Unhandled Runtime Error|Internal Server Error/i;

async function walk(browser, { mobile, dark, full, dashboards }) {
    const tag = `${mobile ? '390' : '1440'}-${dark ? 'dark' : 'light'}`;
    const context = await newContext(browser, { mobile, dark });
    const page = await context.newPage();
    const consoleErrors = [];
    const serverErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${page.url()} :: ${m.text()}${m.location()?.url ? ` [${m.location().url}]` : ''}`); });
    page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: pageerror ${e.message}`));
    page.on('response', (res) => { if (res.status() >= 500 && res.url().startsWith(base)) serverErrors.push(`${res.status()} ${res.request().method()} ${res.url()}`); });

    const settle = async () => {
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .animate-pulse'), null, { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(400);
    };
    const shot = async (name) => {
        await page.screenshot({ path: path.join(opts.shots, `${tag}-${name}.png`), fullPage: !mobile });
    };
    const inspect = async (name) => {
        const s = await page.evaluate(() => ({
            text: document.body.innerText,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            bar: Boolean(document.querySelector('[role="region"][aria-label="Live demo"]')),
        }));
        const err = ERROR_TEXT.exec(s.text);
        check(`[${tag}] ${name}: no error screen`, !err, err?.[0]);
        check(`[${tag}] ${name}: no horizontal overflow`, s.overflow <= 1, `${s.overflow}px`);
        check(`[${tag}] ${name}: demo bar shown`, s.bar);
    };
    const visit = async (url, name) => {
        await page.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await settle();
        await inspect(name);
        await shot(name);
    };

    await page.goto(`${base}/demo`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await settle();
    check(`[${tag}] /demo lands on the portfolio`, new URL(page.url()).pathname === '/dashboard', page.url());
    await page.getByText('Acme Analytics', { exact: false }).first().waitFor({ timeout: 60_000 }).catch(() => {});
    await settle();
    await inspect('portfolio');
    await shot('portfolio');

    const tabs = full ? ['', '/traffic', '/search', '/pages', '/actions', '/actions/audit'] : ['', '/search'];
    for (const t of tabs) await visit(`/dashboard/s/${SITE}${t}`, `site${t.replace(/\//g, '-') || '-overview'}`);
    await visit('/dashboard/dashboards', 'dashboards');
    const first = dashboards[0];
    if (first) await visit(`/dashboard/dashboards/${first.id}`, 'dashboard');
    if (full && dashboards[1]) await visit(`/dashboard/dashboards/${dashboards[1].id}`, 'dashboard-2');
    if (full && first) await visit(`/dashboard/dashboards/${first.id}/edit`, 'builder');
    await visit('/dashboard/leaderboard', 'leaderboard');
    await visit('/dashboard/connect-ai', 'connect-ai');
    if (full) await visit('/dashboard/settings', 'settings');
    if (full) await visit('/dashboard/plan', 'plan');

    // Ask: sample answer
    await visit('/dashboard/ask', 'ask');
    const q = page.getByRole('button', { name: /grew the most/i });
    if (await q.count()) {
        await q.first().click();
        await page.getByText('Sample answer · demo data').first().waitFor({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(500);
        const answered = await page.getByText('Sample answer · demo data').count();
        check(`[${tag}] Ask shows a sample answer`, answered > 0);
        await shot('ask-answer');
    } else {
        check(`[${tag}] Ask shows sample questions`, false, 'no sample question button');
    }
    const composerDisabled = await page.locator('#ask-composer').isDisabled().catch(() => false);
    check(`[${tag}] Ask composer is off in the demo`, composerDisabled);

    // 3. Write actions -> the demo toast (desktop light only).
    if (full && !mobile && !dark) {
        const toastShown = async () => page.getByText('This is a read-only demo').first().waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
        await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
        await settle();
        const star = page.getByRole('button', { name: /^Star /i }).first();
        if (await star.count()) {
            const before = await star.getAttribute('aria-pressed');
            await star.click();
            check('UI write: starring a site shows the demo toast', await toastShown());
            await shot('toast-star');
            await page.waitForTimeout(1500);
            const toasts = await page.locator('.tc-toast').count();
            check('UI write: one toast, not two', toasts === 1, `${toasts} toasts`);
            check('UI write: the star did not stick', (await star.getAttribute('aria-pressed')) === before);
        } else {
            check('UI write: star button found', false);
        }
        await page.goto(`${base}/dashboard/connect-ai`, { waitUntil: 'domcontentloaded' });
        await settle();
        const res = await page.evaluate(async () => (await fetch('/api/ai-connections/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"x"}' })).status);
        check('in-page API write: 403 and the demo toast', res === 403 && await toastShown(), res);
        const ai = await page.evaluate(async () => (await fetch('/api/ai-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"hi"}' })).status);
        check('in-page Ask call is refused (no model call)', ai === 403, ai);

        // 4. Exit demo
        await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
        await settle();
        await page.getByRole('region', { name: 'Live demo' }).getByRole('link', { name: /Exit/ }).click();
        await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 30_000 }).catch(() => {});
        const cookies = await context.cookies();
        check('Exit demo -> home page without the demo cookie', new URL(page.url()).pathname === '/' && !cookies.some((c) => c.name === 'tc_demo' && c.value), page.url());
    }

    const relevant = consoleErrors.filter((e) => !/tawk|cloudflareinsights|googletagmanager|clarity|favicon|ERR_NAME_NOT_RESOLVED|Failed to load resource: the server responded with a status of 403/i.test(e));
    check(`[${tag}] no console errors`, relevant.length === 0, relevant.slice(0, 6).join('\n'));
    check(`[${tag}] no 5xx responses`, serverErrors.length === 0, serverErrors.slice(0, 6).join('\n'));
    await context.close();
}

// ─── 5. Signed-in owner ───
async function ownerFlow(browser) {
    const stateFile = inst ? path.join(inst.dir, 'state.json') : null;
    if (!stateFile || !fs.existsSync(stateFile)) {
        check('signed-in owner flow (state.json from login.mjs)', false, `no ${stateFile}`);
        return;
    }
    const context = await newContext(browser, { stateFile });
    const page = await context.newPage();
    const sessionCookie = async () => (await context.cookies(base)).find((c) => /session-token$/.test(c.name));
    const sessionId = async () => page.evaluate(async () => (await (await fetch('/api/auth/session')).json())?.user?.id ?? null);
    // Every Set-Cookie that names a session cookie while the demo is on (there must be none).
    let inDemo = false;
    const demoSessionSetCookies = [];
    page.on('response', async (res) => {
        if (!inDemo) return;
        const sc = (await res.allHeaders().catch(() => ({})))['set-cookie'] || '';
        if (/session-token/.test(sc)) demoSessionSetCookies.push(`${res.request().method()} ${res.url()}`);
    });
    await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    const realId = await sessionId();
    check('owner: signed in as the dev user', Boolean(realId) && realId !== DEMO_ID, realId);
    // NextAuth rolls the cookie on its own session calls; take the value once the real dashboard has settled.
    await page.waitForTimeout(500);
    const before = await sessionCookie();

    inDemo = true;
    await page.goto(`${base}/demo`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    check('owner: /demo shows the demo (demo cookie wins)', (await sessionId()) === DEMO_ID);
    const back = page.getByRole('region', { name: 'Live demo' }).getByRole('link', { name: 'Back to your sites' });
    await back.waitFor({ timeout: 20_000 }).catch(() => {});
    check('owner: the demo bar offers "Back to your sites"', (await back.count()) === 1);
    await page.screenshot({ path: path.join(opts.shots, '1440-light-owner-in-demo.png') });
    // A few app pages and API calls during the demo must not re-issue the session cookie either.
    await page.goto(`${base}/dashboard/s/${SITE}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.evaluate(async () => { await fetch('/api/portfolio'); await fetch('/api/auth/session'); await fetch('/api/dashboards'); await fetch('/api/auth/csrf'); });
    const during = await sessionCookie();
    check('owner: no response during the demo set a session cookie', demoSessionSetCookies.length === 0, demoSessionSetCookies.join('; '));
    check('owner: session cookie byte-for-byte unchanged during the demo', during?.value === before?.value && during?.expires === before?.expires,
        `before ${before?.value?.slice(-12)} ${before?.expires} / during ${during?.value?.slice(-12)} ${during?.expires}`);
    inDemo = false;

    await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
    await back.waitFor({ timeout: 20_000 }).catch(() => {});
    await Promise.all([page.waitForResponse((r) => r.url().includes('/demo/exit'), { timeout: 30_000 }).catch(() => null), back.click()]);
    await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    check('owner: back on /dashboard as themselves', (await sessionId()) === realId, page.url());
    check('owner: demo cookie gone', !(await context.cookies(base)).some((c) => c.name === 'tc_demo' && c.value));
    const bar = await page.getByRole('region', { name: 'Live demo' }).count();
    check('owner: no demo bar on the real dashboard', bar === 0);
    await page.screenshot({ path: path.join(opts.shots, '1440-light-owner-after-exit.png') });
    await context.close();
}

const t0 = Date.now();
const { dashboards } = await httpChecks();
const browser = await launchBrowser();
try {
    const variants = opts.quick
        ? [{ mobile: false, dark: false, full: true }]
        : [{ mobile: false, dark: false, full: true }, { mobile: false, dark: true, full: false }, { mobile: true, dark: false, full: true }, { mobile: true, dark: true, full: false }];
    const picked = opts.variants ? variants.filter((v) => opts.variants.includes(`${v.mobile ? '390' : '1440'}-${v.dark ? 'dark' : 'light'}`)) : variants;
    if (opts.walk) for (const v of picked) await walk(browser, { ...v, dashboards });
    await ownerFlow(browser);
} finally {
    await browser.close();
}

const failed = checks.filter((c) => !c.ok);
const summary = { port: opts.port, ms: Date.now() - t0, total: checks.length, failed: failed.length, checks };
fs.writeFileSync(path.join(opts.out, 'demo-check.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(opts.out, 'demo-check.md'), [
    `# Live demo check (port ${opts.port})`, '',
    `${checks.length - failed.length}/${checks.length} passed in ${Math.round(summary.ms / 1000)} s. Screenshots: ${opts.shots}`, '',
    ...checks.map((c) => `- ${c.ok ? 'ok' : '**FAIL**'} ${c.name}${!c.ok && c.detail ? ` — ${c.detail.replace(/\n/g, ' ')}` : ''}`),
].join('\n'));
console.error(`\n${checks.length - failed.length}/${checks.length} passed (${Math.round(summary.ms / 1000)} s); report ${path.join(opts.out, 'demo-check.md')}`);
process.exit(failed.length ? 1 : 0);
