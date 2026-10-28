#!/usr/bin/env node
/**
 * Golden-screenshot gate for dashboards (round 2, WS3): every dashboard that exists today must
 * render pixel for pixel the same after the theme/template work, as long as it uses the default
 * theme.
 *
 *   node scripts/dev/dash-golden.mjs capture <webPort> <outDir> [--user demo] [--only name,name] [--modes light,dark]
 *   node scripts/dev/dash-golden.mjs compare <baseDir>[,<baseDir2>…] <candDir> [--diff <diffDir>]
 *
 * capture: makes sure one dashboard per shipped template exists (scripts/dev/seed-dashboards.mjs,
 *   idempotent), then shoots, at 1440x900 in light and dark, full page:
 *   - the owner view of every template dashboard, every visible page (?page=<id>);
 *   - the owner view of the seeded v1 dashboard (login.mjs seed.json) and its public link (/view).
 *   Third-party requests are blocked, motion is reduced, the "Updated … ago" text (wall-clock
 *   dependent) is masked, and the page waits for data, fonts and charts before the shot.
 * compare: counts changed pixels per image (exact RGBA match, no tolerance), writes a red diff
 *   image for every changed shot and exits 1 when anything changed or a shot is missing. Several
 *   baseline captures can be given (comma separated): a few of today's views settle in one of two
 *   states depending on timing (the donut on a public link measures its box before or after the
 *   data arrives), so a shot passes when it equals any baseline sample exactly.
 *
 * Demo data is deterministic per UTC day: capture the baseline and the candidate on the same day
 * (or re-shoot the baseline from a pristine worktree with TC_REPO=<path> up.sh on another port).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { hideDevUi, launchBrowser, newContext, settle, watchPage } from './pw.mjs';
import { findInstance } from './routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const cmd = argv[0];

function usage(msg) {
    if (msg) console.error(`dash-golden: ${msg}`);
    console.error('usage:\n  node scripts/dev/dash-golden.mjs capture <webPort> <outDir> [--user demo]\n  node scripts/dev/dash-golden.mjs compare <baseDir>[,<baseDir2>...] <candDir> [--diff <diffDir>]');
    process.exit(2);
}

function opt(name, fallback) {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
}

if (cmd === 'capture') await capture();
else if (cmd === 'compare') await compare();
else usage();

async function capture() {
    const port = Number(argv[1]);
    const outDir = argv[2];
    const user = opt('--user', 'demo');
    if (!port || !outDir) usage();
    const inst = findInstance(port);
    if (!inst) usage(`no dev instance on port ${port}`);
    const stateFile = path.join(inst.dir, user === 'demo' ? 'state.json' : `state-${user}.json`);
    if (!fs.existsSync(stateFile)) usage(`log in first: node scripts/dev/login.mjs ${port}`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const cookie = state.cookies.filter((c) => c.domain === 'localhost').map((c) => `${c.name}=${c.value}`).join('; ');
    const base = `http://localhost:${port}`;

    // 1. One dashboard per shipped template (idempotent).
    execFileSync(process.execPath, [path.join(HERE, 'seed-dashboards.mjs'), String(port), '--user', user], { stdio: ['ignore', 'ignore', 'inherit'] });
    const ids = JSON.parse(fs.readFileSync(path.join(inst.dir, `dashboards-${user}.json`), 'utf8'));
    const seed = fs.existsSync(path.join(inst.dir, 'seed.json')) ? JSON.parse(fs.readFileSync(path.join(inst.dir, 'seed.json'), 'utf8')) : {};
    const seedUser = seed[user] ?? seed;

    const api = async (p) => {
        const r = await fetch(base + p, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(120_000) });
        return r.ok ? r.json() : null;
    };

    // 2. The shot list: [name, url, isPublic]
    const jobs = [];
    const keep = ['site-overview', 'search-performance', 'traffic-acquisition', 'content-performance', 'portfolio', 'client-report', 'audience-geography', 'key-events-revenue', 'blank', 'showcase'];
    for (const t of keep) {
        const id = ids[t];
        if (!id) { console.error(`[golden] no dashboard for ${t}`); continue; }
        const rec = await api(`/api/dashboards/${id}`);
        const pages = (rec?.dashboard?.doc?.pages ?? []).filter((p) => !p.hidden);
        if (pages.length <= 1) jobs.push([`tpl-${t}`, `/dashboard/dashboards/${id}`, false]);
        else pages.forEach((p, i) => jobs.push([`tpl-${t}-p${i + 1}`, `/dashboard/dashboards/${id}?page=${encodeURIComponent(p.id)}`, false]));
    }
    const v1 = seedUser.dashboardId;
    if (v1 !== undefined) jobs.push(['v1-seeded', `/dashboard/dashboards/${v1}`, false]);
    if (seedUser.dashboardPublicToken) jobs.push(['v1-seeded-public', `/view/${seedUser.dashboardPublicToken}`, true]);

    // --only a,b: re-shoot just these shots (names without -1440-<mode>.png), e.g. after a flaky frame.
    const only = opt('--only', '');
    if (only) {
        const want = new Set(only.split(','));
        for (let i = jobs.length - 1; i >= 0; i--) if (!want.has(jobs[i][0])) jobs.splice(i, 1);
    }
    const modes = opt('--modes', 'light,dark').split(',');
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await launchBrowser();
    const results = [];
    try {
        for (const dark of [false, true].filter((d) => modes.includes(d ? 'dark' : 'light'))) {
            const context = await newContext(browser, { stateFile, dark });
            await context.route('**/*', (route) => {
                const u = route.request().url();
                if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
                // The showcase image widget points at the live site's logo; serve the same file from this checkout.
                if (u === 'https://trafficclaw.com/icon.svg') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(path.join(HERE, '..', '..', 'web', 'public', 'icon.svg')) });
                return route.abort();
            });
            const page = await context.newPage();
            for (const [name, url, isPublic] of jobs) {
                const full = `${base}${url}${isPublic ? `${url.includes('?') ? '&' : '?'}theme=${dark ? 'dark' : 'light'}` : ''}`;
                const report = watchPage(page, base);
                let status = 0;
                try {
                    const res = await page.goto(full, { waitUntil: 'load', timeout: 120_000 });
                    status = res?.status() ?? 0;
                } catch (e) {
                    console.error(`[golden] ${name}: ${e.message}`);
                }
                await settle(page, report, { quietMs: 1500, maxMs: 60_000 });
                // Ready = the grid has laid out its widgets (or the page says it is empty) and no
                // skeleton is on screen. A view that is not ready after 45 s is reloaded once.
                const ready = () => page.waitForFunction(() => {
                    if (document.querySelector('.skeleton')) return false;
                    if (/This page is empty/.test(document.body.innerText)) return true;
                    const canvas = document.querySelector('.tc-canvas');
                    return Boolean(canvas && canvas.querySelector('.react-grid-item'));
                }, null, { timeout: 45_000, polling: 250 }).then(() => true, () => false);
                if (!(await ready())) {
                    console.error(`[golden] ${name}: not ready, reloading`);
                    await page.reload({ waitUntil: 'load', timeout: 120_000 }).catch(() => undefined);
                    await settle(page, report, { quietMs: 1500, maxMs: 60_000 });
                    if (!(await ready())) console.error(`[golden] ${name}: still not ready`);
                }
                await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
                await page.mouse.move(0, 0);
                await hideDevUi(page);
                const file = path.join(outDir, `${name}-1440-${dark ? 'dark' : 'light'}.png`);
                // Wall-clock text ("Updated 3 min ago") becomes a fixed string; then shoot until two
                // frames 1.5 s apart are identical (lazy maps, late fonts), at most 10 tries.
                let prev = null;
                let shot = null;
                let tries = 0;
                for (; tries < 10; tries++) {
                    await page.waitForTimeout(tries === 0 ? 1200 : 1500);
                    await page.evaluate(() => {
                        for (const el of document.querySelectorAll('span')) {
                            if (el.childElementCount === 0 && /^· Updated /.test(el.textContent || '')) el.textContent = '· Updated just now';
                        }
                    });
                    shot = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', timeout: 120_000 }).catch((e) => { console.error(`[golden] ${name}: ${e.message.split('\n')[0]}`); return null; });
                    if (!shot) continue;
                    if (prev && prev.equals(shot)) break;
                    prev = shot;
                }
                if (shot) fs.writeFileSync(file, shot);
                results.push({ name, dark, status, file, stableAfter: tries + 1, consoleErrors: report.consoleErrors.length, pageErrors: report.pageErrors.length });
                console.error(`[golden] ${path.basename(file)} ${status} (${tries + 1} frames)`);
            }
            await context.close();
        }
    } finally {
        await browser.close();
    }
    if (!only) fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ at: new Date().toISOString(), port, jobs, results }, null, 2));
    console.log(JSON.stringify({ shots: results.length, outDir }, null, 2));
}

async function compare() {
    const baseDirs = (argv[1] ?? '').split(',').filter(Boolean);
    const candDir = argv[2];
    const diffDir = opt('--diff', path.join(candDir ?? '.', '_diff'));
    if (!baseDirs.length || !candDir) usage();
    const require = createRequire(path.join(HERE, '../../web/package.json'));
    const sharp = require('sharp');
    const load = (p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const files = [...new Set(baseDirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.png'))))].sort();
    const rows = [];
    let bad = 0;
    for (const f of files) {
        const c = path.join(candDir, f);
        if (!fs.existsSync(c)) { rows.push({ file: f, status: 'missing' }); bad++; continue; }
        const B = await load(c);
        let best = null;
        for (const d of baseDirs) {
            const b = path.join(d, f);
            if (!fs.existsSync(b)) continue;
            const A = await load(b);
            if (A.info.width !== B.info.width || A.info.height !== B.info.height) {
                if (!best) best = { base: d, changed: Infinity, size: `${A.info.width}x${A.info.height} -> ${B.info.width}x${B.info.height}` };
                continue;
            }
            const n = A.info.width * A.info.height;
            let changed = 0;
            for (let i = 0; i < n * 4; i += 4) {
                if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2] || A.data[i + 3] !== B.data[i + 3]) changed++;
            }
            if (!best || changed < best.changed) best = { base: d, changed, A };
            if (changed === 0) break;
        }
        if (!best) { rows.push({ file: f, status: 'missing' }); bad++; continue; }
        if (best.changed === 0) { rows.push({ file: f, status: 'same', changedPixels: 0, matched: path.basename(best.base) }); continue; }
        bad++;
        if (best.A) {
            const A = best.A;
            const n = A.info.width * A.info.height;
            const out = Buffer.alloc(n * 4);
            for (let i = 0; i < n * 4; i += 4) {
                const same = A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2] && A.data[i + 3] === B.data[i + 3];
                if (same) {
                    const g = Math.round((A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3);
                    out[i] = out[i + 1] = out[i + 2] = 255 - Math.round((255 - g) * 0.25);
                } else {
                    out[i] = 230; out[i + 1] = 0; out[i + 2] = 0;
                }
                out[i + 3] = 255;
            }
            fs.mkdirSync(diffDir, { recursive: true });
            await sharp(out, { raw: { width: A.info.width, height: A.info.height, channels: 4 } }).png().toFile(path.join(diffDir, f));
            rows.push({ file: f, status: 'changed', changedPixels: best.changed, matched: path.basename(best.base) });
        } else {
            rows.push({ file: f, status: 'size', size: best.size });
        }
    }
    for (const r of rows) console.log(`${r.status.padEnd(8)} ${String(r.changedPixels ?? '').padStart(8)}  ${r.file}${r.size ? `  ${r.size}` : ''}${r.matched ? `  (vs ${r.matched})` : ''}`);
    console.log(`\n${files.length} shots, ${files.length - bad} identical, ${bad} changed or missing`);
    fs.mkdirSync(candDir, { recursive: true });
    fs.writeFileSync(path.join(candDir, 'gate-report.json'), JSON.stringify({ at: new Date().toISOString(), baseDirs, candDir, total: files.length, failed: bad, rows }, null, 2));
    process.exit(bad ? 1 : 0);
}
