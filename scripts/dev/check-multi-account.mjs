#!/usr/bin/env node
/**
 * End-to-end check of "Connect another Google account" on a dev / worker1 instance with demo data.
 *
 *   node scripts/dev/check-multi-account.mjs <webPort> [--out dir] [--no-login]
 *
 * The `multi` user (login.mjs) signs in with demo Google account `multi` (Acme + DataViz) and has
 * `multi2` linked (Puzzle Hub, Health Insights, Creative Prints, Recipe Nest; Acme's Search Console
 * site is in both accounts). Checks, in order:
 *   1. Settings -> Google lists both accounts (Connected, counts), screenshots at 1440 and 390.
 *   2. The site directory and the portfolio (after a sync) show sites from both accounts; the shared
 *      Acme site is credited to the sign-in account.
 *   3. A site from account 2 loads its data (/api/site/ga4 + /api/site/gsc, and its site page).
 *   4. Disconnect account 2 in Settings: its sites leave the directory and the portfolio.
 *   5. The demo OAuth link flow adds it back (?link=added), and the sign-in account is refused (?link=same).
 *   6. A revoked extra account shows "Needs reconnect" for that account only; Reconnect fixes it.
 * Writes <out>/multi-account.{json,md} and screenshots. Exit 0 = every check passed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchBrowser, newContext } from './pw.mjs';
import { DEV_HOME, findInstance, readEnvFile } from './routes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opts = { port: null, out: '/root/projects/tc-redesign-research/batch3/accounts', login: true };
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = argv[++i];
    else if (argv[i] === '--no-login') opts.login = false;
    else if (/^\d+$/.test(argv[i])) opts.port = Number(argv[i]);
    else { console.error(`check-multi-account: unknown argument ${argv[i]}`); process.exit(2); }
}
if (!opts.port) { console.error('usage: node scripts/dev/check-multi-account.mjs <webPort> [--out dir] [--no-login]'); process.exit(2); }
fs.mkdirSync(opts.out, { recursive: true });

const SUB2 = '100000000000000000042';
const PRIMARY_ONLY = ['properties/412300101', 'properties/412300103'];               // acme, dataviz
const EXTRA_PROPS = ['properties/412300104', 'properties/412300102', 'properties/412300108']; // puzzle, health, creativeprints
const EXTRA_SITES = ['https://puzzlehub.example/', 'https://www.healthinsights.example/', 'sc-domain:recipenest.example'];
const SHARED_SITE = 'sc-domain:acmeanalytics.example';

const inst = findInstance(opts.port);
if (!inst) { console.error(`no instance with web port ${opts.port} in ${DEV_HOME}`); process.exit(2); }
const secrets = readEnvFile(path.join(DEV_HOME, 'dev.env'));
const adminHeaders = { 'X-API-Key': secrets.ADMIN_API_KEY, 'Content-Type': 'application/json' };
const base = `http://localhost:${opts.port}`;

if (opts.login) {
    const r = spawnSync(process.execPath, [path.join(here, 'login.mjs'), String(opts.port), '--user', 'multi'], { encoding: 'utf8', timeout: 300_000 });
    if (r.status !== 0) { console.error(`login failed: ${(r.stderr || r.stdout).slice(-600)}`); process.exit(1); }
}
const stateFile = path.join(inst.dir, 'state-multi.json');

const checks = [];
const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 600) });
    console.error(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` -- ${String(detail).slice(0, 300)}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

const browser = await launchBrowser();
try {
    const ctx = await newContext(browser, { stateFile });
    const api = async (method, p, body) => {
        const res = await ctx.request.fetch(`${base}${p}`, { method, data: body, headers: body ? { 'Content-Type': 'application/json' } : undefined, timeout: 180_000, maxRedirects: 0 });
        let data = null;
        try { data = await res.json(); } catch { /* not JSON */ }
        return { status: res.status(), data, headers: res.headers() };
    };
    const connections = async () => (await api('GET', '/api/google/connections')).data?.connections ?? [];
    const portfolio = async () => {
        await api('POST', '/api/portfolio/sync', { force: true, wait: true });
        for (let i = 0; i < 60; i++) {
            const r = await api('GET', '/api/portfolio?range=28d');
            if (r.data && !r.data.syncing) return r.data;
            await sleep(2000);
        }
        return (await api('GET', '/api/portfolio?range=28d')).data;
    };
    const ids = (p) => new Set((p?.sites ?? []).flatMap((s) => [s.ga4?.property, s.gsc?.siteUrl].filter(Boolean)));

    // 1. Settings -> Google with two accounts.
    let conns = await connections();
    check('settings: two connections listed (sign-in + extra)', conns.length === 2 && conns[0].primary && conns[1].id === SUB2, JSON.stringify(conns));
    check('settings: both Connected', conns.every((c) => c.status === 'connected'), JSON.stringify(conns.map((c) => c.status)));
    check('settings: counts per account after dedupe (2+2, 3+3)', conns[0]?.ga4 === 2 && conns[0]?.gsc === 2 && conns[1]?.ga4 === 3 && conns[1]?.gsc === 3, JSON.stringify(conns.map((c) => [c.ga4, c.gsc])));
    check('settings: no token in the listing', !JSON.stringify(conns).includes('demo-refresh') && !JSON.stringify(conns).includes('demo-access'));

    // 2. Directory + portfolio show both accounts.
    const dir = (await api('GET', '/api/sites/directory')).data;
    const dirProps = new Map((dir?.properties ?? []).map((p) => [p.property, p.connectionId ?? 'primary']));
    const dirSites = new Map((dir?.sites ?? []).map((s) => [s.siteUrl, s.connectionId ?? 'primary']));
    check('directory: properties of both accounts', [...PRIMARY_ONLY, ...EXTRA_PROPS].every((p) => dirProps.has(p)), JSON.stringify([...dirProps]));
    check('directory: extra-account sites tagged with that account', EXTRA_SITES.every((s) => dirSites.get(s) === SUB2), JSON.stringify([...dirSites]));
    check('directory: shared Acme site listed once, credited to the sign-in account', dirSites.get(SHARED_SITE) === 'primary' && (dir?.sites ?? []).filter((s) => s.siteUrl === SHARED_SITE).length === 1);

    let pf = await portfolio();
    let have = ids(pf);
    check('portfolio: sites from both accounts', [...PRIMARY_ONLY, ...EXTRA_PROPS, ...EXTRA_SITES, SHARED_SITE].every((x) => have.has(x)), JSON.stringify([...have]));
    const extraSite = (pf?.sites ?? []).find((s) => s.ga4?.property === 'properties/412300104');
    check('portfolio: account-2 site synced (not "no access")', extraSite && extraSite.ga4?.status === 'synced' && extraSite.gsc?.status === 'synced', JSON.stringify(extraSite?.ga4) + JSON.stringify(extraSite?.gsc));
    check('portfolio: no page-wide Google error', !pf?.googleError, JSON.stringify(pf?.googleError));

    // 3. A site from account 2 loads its data.
    const ga = await api('GET', `/api/site/ga4?property=properties/412300104&report=summary&start=${iso(28)}&end=${iso(1)}`);
    check('site ga4: account-2 property answers 200 with numbers', ga.status === 200 && JSON.stringify(ga.data).includes('totals'), `${ga.status} ${JSON.stringify(ga.data).slice(0, 200)}`);
    const gs = await api('GET', `/api/site/gsc?site=${encodeURIComponent('https://puzzlehub.example/')}&report=summary&start=${iso(30)}&end=${iso(3)}`);
    check('site gsc: account-2 site answers 200', gs.status === 200, `${gs.status} ${JSON.stringify(gs.data).slice(0, 200)}`);

    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
    await page.goto(`${base}/dashboard/s/puzzlehub.example`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await sleep(1500);
    const sitePageText = await page.locator('main').innerText().catch(() => '');
    check('site page /dashboard/s/puzzlehub.example renders without errors', pageErrors.length === 0 && !/Something went wrong|no access|can't read/i.test(sitePageText), pageErrors.join(' | ') || sitePageText.slice(0, 200));
    await page.screenshot({ path: path.join(opts.out, 'site-account2-1440.png'), fullPage: false });

    await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await sleep(1500);
    await page.screenshot({ path: path.join(opts.out, 'portfolio-two-accounts-1440.png'), fullPage: false });

    // Settings screenshots, two accounts (1440 and 390, light; 1440 dark).
    const shotSettings = async (file, { mobile = false, dark = false } = {}) => {
        const c = await newContext(browser, { stateFile, mobile, dark });
        const p = await c.newPage();
        await p.goto(`${base}/dashboard/settings?tab=google`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await p.getByText('Add another Google account').first().waitFor({ timeout: 60_000 }).catch(() => {});
        await p.locator('[data-connection="linked"]').first().waitFor({ timeout: 60_000 }).catch(() => {});
        await sleep(800);
        await p.screenshot({ path: path.join(opts.out, file), fullPage: true });
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await c.close();
        return overflow;
    };
    const ov1440 = await shotSettings('settings-google-2accounts-1440.png');
    const ov390 = await shotSettings('settings-google-2accounts-390.png', { mobile: true });
    await shotSettings('settings-google-2accounts-1440-dark.png', { dark: true });
    check('settings: no horizontal overflow at 1440 and 390', ov1440 <= 0 && ov390 <= 0, `1440:${ov1440} 390:${ov390}`);

    // 4. Disconnect account 2 through the UI.
    await page.goto(`${base}/dashboard/settings?tab=google`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const row = page.locator('[data-connection="linked"]').first();
    await row.waitFor({ timeout: 60_000 });
    await row.getByRole('button', { name: 'Disconnect' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
    await page.locator('[data-connection="linked"]').first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
    conns = await connections();
    check('disconnect: only the sign-in account is left', conns.length === 1 && conns[0].primary, JSON.stringify(conns));
    const dir2 = (await api('GET', '/api/sites/directory')).data;
    check('disconnect: account-2 sites leave the directory', !(dir2?.properties ?? []).some((p) => EXTRA_PROPS.includes(p.property)) && !(dir2?.sites ?? []).some((s) => EXTRA_SITES.includes(s.siteUrl)));
    const storeDir = (await api('GET', '/api/sites/directory?source=store')).data;
    check('disconnect: account-2 sites leave the stored directory at once', !(storeDir?.properties ?? []).some((p) => EXTRA_PROPS.includes(p.property)), JSON.stringify(storeDir?.properties?.map((p) => p.property)));
    pf = await portfolio();
    have = ids(pf);
    check('disconnect: portfolio hides account-2 sites, keeps account 1', !EXTRA_PROPS.some((x) => have.has(x)) && PRIMARY_ONLY.every((x) => have.has(x)) && have.has(SHARED_SITE), JSON.stringify([...have]));
    const ga2 = await api('GET', `/api/site/ga4?property=properties/412300104&report=summary&start=${iso(28)}&end=${iso(1)}`);
    check('disconnect: account-2 data no longer readable', ga2.status !== 200, String(ga2.status));
    await page.screenshot({ path: path.join(opts.out, 'settings-google-after-disconnect-1440.png'), fullPage: true });

    // 5. The demo link flow adds it back; the sign-in account is refused.
    await page.goto(`${base}/api/google/link/start`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForURL(/\/dashboard\/settings/, { timeout: 60_000 }).catch(() => {});
    check('link flow: lands back on Settings with link=added', /link=added/.test(page.url()) || (await connections()).length === 2, page.url());
    conns = await connections();
    check('link flow: account 2 connected again', conns.length === 2 && conns[1].id === SUB2 && conns[1].status === 'connected', JSON.stringify(conns));
    const same = await api('GET', '/api/google/link/start?demo_account=multi');
    // Follow the two redirects by hand (start -> callback -> settings) so the cookie travels.
    let loc = same.headers.location;
    let final = '';
    if (loc) {
        const cb = await ctx.request.fetch(new URL(loc, base).toString(), { maxRedirects: 0 });
        final = cb.headers().location || '';
    }
    check('link flow: the sign-in account is refused (link=same)', /link=same/.test(final), final || `start ${same.status}`);
    check('link flow: still exactly two accounts', (await connections()).length === 2);
    const cancel = await api('GET', '/api/google/link/start?demo_account=cancel');
    let cancelFinal = '';
    if (cancel.headers.location) cancelFinal = (await ctx.request.fetch(new URL(cancel.headers.location, base).toString(), { maxRedirects: 0 })).headers().location || '';
    check('link flow: cancelling on Google adds nothing (link=cancelled)', /link=cancelled/.test(cancelFinal), cancelFinal);
    const forged = await ctx.request.fetch(`${base}/api/google/link/callback?code=demo-code:alt&state=forged`, { maxRedirects: 0 });
    check('link flow: a callback without the flow cookie/state is refused (link=expired)', /link=expired/.test(forged.headers().location || ''), forged.headers().location);
    pf = await portfolio();
    check('link flow: account-2 sites back in the portfolio', EXTRA_PROPS.every((x) => ids(pf).has(x)));

    // 6. A revoked extra account: Needs reconnect for that account only.
    let r = await fetch(`${inst.ADMIN_URL}/api/users/100000000000000000041/google/linked/${SUB2}`, {
        method: 'PUT', headers: adminHeaders, body: JSON.stringify({ access_token: 'demo-access:multi2~revoked', refresh_token: 'demo-refresh:multi2~revoked' }),
    });
    check('revoked: admin accepted the revoked token (setup)', r.ok, String(r.status));
    // Lists are cached for 30 s per process: wait them out.
    await sleep(31_000);
    conns = await connections();
    check('revoked: extra account shows Needs reconnect, the sign-in account stays Connected', conns[0]?.status === 'connected' && conns[1]?.status === 'needs_reconnect', JSON.stringify(conns.map((c) => c.status)));
    const dir3 = (await api('GET', '/api/sites/directory')).data;
    check('revoked: sign-in account sites still listed', PRIMARY_ONLY.every((p) => (dir3?.properties ?? []).some((x) => x.property === p)));
    const shot = async (file, mobile) => {
        const c = await newContext(browser, { stateFile, mobile });
        const p = await c.newPage();
        await p.goto(`${base}/dashboard/settings?tab=google`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await p.getByText('Needs reconnect').first().waitFor({ timeout: 60_000 }).catch(() => {});
        await sleep(600);
        await p.screenshot({ path: path.join(opts.out, file), fullPage: true });
        await c.close();
    };
    await shot('settings-google-needs-reconnect-1440.png', false);
    await shot('settings-google-needs-reconnect-390.png', true);
    // Reconnect through the (demo) link flow for that account.
    await page.goto(`${base}/api/google/link/start?reconnect=${SUB2}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForURL(/\/dashboard\/settings/, { timeout: 60_000 }).catch(() => {});
    conns = await connections();
    check('revoked: Reconnect brings it back to Connected (link=updated)', /link=updated/.test(page.url()) && conns[1]?.status === 'connected', `${page.url()} ${JSON.stringify(conns.map((c) => c.status))}`);
    await ctx.close();
} catch (err) {
    check('script ran to the end', false, err?.stack || err);
} finally {
    await browser.close();
}

const failed = checks.filter((c) => !c.ok);
fs.writeFileSync(path.join(opts.out, 'multi-account.json'), JSON.stringify({ port: opts.port, at: new Date().toISOString(), checks }, null, 2));
fs.writeFileSync(path.join(opts.out, 'multi-account.md'), [
    '# Multi-account check', '', `Port ${opts.port}, ${new Date().toISOString()}. ${checks.length - failed.length}/${checks.length} passed.`, '',
    '| Check | Result |', '|---|---|', ...checks.map((c) => `| ${c.name} | ${c.ok ? 'ok' : `FAIL ${c.detail.replace(/\|/g, '/').slice(0, 200)}`} |`), '',
].join('\n'));
console.error(`[multi] ${checks.length - failed.length}/${checks.length} passed; ${opts.out}/multi-account.md`);
process.exit(failed.length ? 1 : 0);
