#!/usr/bin/env node
/**
 * Visit every page route of the app (dashboard + marketing + public pages),
 * logged in, take desktop and mobile screenshots, and write a report of HTTP
 * status, console errors, uncaught exceptions and failed requests per route.
 *
 *   node scripts/dev/crawl.mjs <webPort> <outDir> [--user demo|demo2|admin] [--host h] [--only a,b] [--skip a,b] [--part k/n]
 *                              [--desktop-only | --mobile-only] [--dark] [--wait ms] [--show-dev-ui]
 *
 * RAM: every route compiled grows the dev server (a full crawl reaches ~3.5 GB).
 * Crawl in parts with a restart between them, e.g.
 *   crawl --part 1/2; down.sh; up.sh; crawl --part 2/2   (same outDir: reports merge)
 * The crawl stops early (exit 3, report kept) if MemAvailable drops below 1800 MB.
 *
 * Routes come from web/src/app/**\/page.tsx of the instance's worktree;
 * dynamic segments are filled from <instance>/seed.json (written by login.mjs).
 * Output: <outDir>/desktop/*.png, <outDir>/mobile/*.png, report.json, report.md.
 * Exit code 1 when any route returned >= 500 or threw an uncaught exception.
 */
import fs from 'node:fs';
import path from 'node:path';
import { devIssueCount, hideDevUi, launchBrowser, newContext, settle, watchPage } from './pw.mjs';
import { discoverRoutes, fillRoute as fillRouteFor, findInstance, memAvailableMb, routeSlug as slug } from './routes.mjs';

const THIRD_PARTY = /tawk\.to|cloudflareinsights|googletagmanager|google-analytics\.com|clarity\.ms|bing\.com|platform\.twitter\.com|reddit(media)?\.com|dicebear|googleusercontent|google\.com\/s2\/favicons|mapbox|fonts\.g/;

function usage(msg) {
    if (msg) console.error(`crawl.mjs: ${msg}`);
    console.error('usage: node scripts/dev/crawl.mjs <webPort> <outDir> [--user demo|demo2|admin] [--host h] [--only a,b] [--skip a,b] [--desktop-only|--mobile-only] [--dark] [--wait ms] [--show-dev-ui]');
    process.exit(2);
}

const argv = process.argv.slice(2);
const opts = { port: null, out: null, user: 'demo', host: 'acmeanalytics.example', only: null, skip: [], part: null, desktop: true, mobile: true, dark: false, wait: 1200, showDevUi: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user') opts.user = argv[++i];
    else if (a === '--host') opts.host = argv[++i];
    else if (a === '--only') opts.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--skip') opts.skip = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--part') {
        const m = /^(\d+)\/(\d+)$/.exec(argv[++i] || '');
        if (!m || +m[1] < 1 || +m[1] > +m[2]) usage('--part wants k/n, e.g. 1/2');
        opts.part = [+m[1], +m[2]];
    }
    else if (a === '--desktop-only') opts.mobile = false;
    else if (a === '--mobile-only') opts.desktop = false;
    else if (a === '--dark') opts.dark = true;
    else if (a === '--wait') opts.wait = Number(argv[++i]);
    else if (a === '--show-dev-ui') opts.showDevUi = true;
    else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else if (!opts.port) opts.port = Number(a);
    else if (!opts.out) opts.out = a;
    else usage(`unexpected argument ${a}`);
}
if (!opts.port || !opts.out) usage();

const fillRoute = (route, seed) => fillRouteFor(route, seed, { user: opts.user, host: opts.host });

async function visit(context, base, route, outFile) {
    const page = await context.newPage();
    const report = watchPage(page, base);
    const t0 = Date.now();
    let status = 0;
    let error = null;
    const redirects = [];
    try {
        const res = await page.goto(base + route, { waitUntil: 'load', timeout: 150_000 });
        status = res?.status() ?? 0;
        let req = res?.request().redirectedFrom();
        while (req) { redirects.unshift(req.url()); req = req.redirectedFrom(); }
    } catch (err) {
        error = err.message.split('\n')[0];
    }
    await settle(page, report, { quietMs: 1500, maxMs: 25_000 });
    if (opts.wait > 0) await page.waitForTimeout(opts.wait);
    const dev = { issues: await devIssueCount(page) };
    if (!opts.showDevUi) await hideDevUi(page);
    try {
        await page.screenshot({ path: outFile, fullPage: false, timeout: 30_000 });
    } catch (err) {
        error = error || `screenshot: ${err.message.split('\n')[0]}`;
    }
    // First party = mentions no URL, or only URLs on this dev server.
    // Generic "Failed to load resource" console lines duplicate failedRequests
    // (which carry the URL), so they are dropped from consoleErrors.
    const firstParty = x => {
        if (THIRD_PARTY.test(x)) return false;
        const urls = String(x).match(/https?:\/\/[^\s'"),]+/g) || [];
        return urls.length === 0 || urls.some(u => u.startsWith(base));
    };
    const consoleFirstParty = x => firstParty(x) && !/^Failed to load resource/.test(x);
    const result = {
        status,
        finalPath: page.url().replace(base, ''),
        redirects: redirects.map(u => u.replace(base, '')),
        ms: Date.now() - t0,
        error,
        devIssues: dev.issues,
        pageErrors: report.pageErrors,
        consoleErrors: report.consoleErrors.filter(consoleFirstParty),
        failedRequests: report.failedRequests.filter(firstParty),
        thirdPartyErrors: report.consoleErrors.filter(x => !firstParty(x)).length + report.failedRequests.filter(x => !firstParty(x)).length,
        screenshot: outFile,
    };
    await page.close();
    return result;
}

const inst = findInstance(opts.port);
if (!inst) usage(`no dev instance with web port ${opts.port}`);
const stateFile = path.join(inst.dir, opts.user === 'demo' ? 'state.json' : `state-${opts.user}.json`);
if (!fs.existsSync(stateFile)) usage(`missing ${stateFile}; run login.mjs ${opts.port} --user ${opts.user}`);
const seedFile = path.join(inst.dir, 'seed.json');
const seed = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : {};
const base = `http://localhost:${opts.port}`;

let routes = discoverRoutes(path.join(inst.REPO, 'web', 'src', 'app')).map(r => ({ pattern: r, path: fillRoute(r, seed) }));
routes.push({ pattern: '/robots.txt', path: '/robots.txt' }, { pattern: '/sitemap.xml', path: '/sitemap.xml' }, { pattern: '/llms.txt', path: '/llms.txt' });
if (opts.only) routes = routes.filter(r => opts.only.some(o => r.pattern === o || r.path === o || r.pattern.startsWith(o.endsWith('/') ? o : `${o}/`) || r.pattern === o));
if (opts.skip.length) routes = routes.filter(r => !opts.skip.includes(r.pattern) && !opts.skip.includes(r.path));
if (opts.part) {
    const [k, n] = opts.part;
    const size = Math.ceil(routes.length / n);
    routes = routes.slice((k - 1) * size, k * size);
}

fs.mkdirSync(opts.out, { recursive: true });
const variants = [...(opts.desktop ? ['desktop'] : []), ...(opts.mobile ? ['mobile'] : [])];
for (const v of variants) fs.mkdirSync(path.join(opts.out, v), { recursive: true });

// Results from earlier parts in the same outDir are kept and merged.
const reportJson = path.join(opts.out, 'report.json');
let results = [];
try {
    const prev = JSON.parse(fs.readFileSync(reportJson, 'utf8'));
    if (prev.base === base && prev.user === opts.user) results = prev.results || [];
} catch { /* first part */ }

const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
function writeReports() {
    const ordered = [...results].sort((a, b) => a.route.localeCompare(b.route));
    fs.writeFileSync(reportJson, JSON.stringify({ base, user: opts.user, updatedAt: new Date().toISOString(), results: ordered }, null, 2));
    const summary = ordered.map(e => {
        const vs = ['desktop', 'mobile'].map(v => e[v]).filter(Boolean);
        return {
            path: e.path,
            status: vs[0].status,
            finalPath: vs[0].finalPath,
            pageErrors: [...new Set(vs.flatMap(x => x.pageErrors))],
            consoleErrors: [...new Set(vs.flatMap(x => x.consoleErrors))],
            failedRequests: [...new Set(vs.flatMap(x => x.failedRequests))],
            devIssues: Math.max(...vs.map(x => x.devIssues)),
            error: vs.map(x => x.error).find(Boolean) || null,
        };
    });
    const lines = [
        `# Crawl report – ${base} as ${opts.user} – ${new Date().toISOString()}`,
        '',
        '| Route | Status | Final path | Uncaught | Console errors | Failed requests | Dev issues |',
        '|---|---|---|---|---|---|---|',
        ...summary.map(s => `| ${esc(s.path)} | ${s.status}${s.error ? ' (error)' : ''} | ${esc(s.finalPath)} | ${s.pageErrors.length} | ${s.consoleErrors.length} | ${s.failedRequests.length} | ${s.devIssues} |`),
        '',
        '## Details',
        '',
    ];
    for (const s of summary) {
        if (!s.pageErrors.length && !s.consoleErrors.length && !s.failedRequests.length && !s.error) continue;
        lines.push(`### ${s.path}`, '');
        if (s.error) lines.push(`- navigation: ${esc(s.error)}`);
        for (const x of s.pageErrors) lines.push(`- uncaught: ${esc(x.split('\n')[0])}`);
        for (const x of s.consoleErrors) lines.push(`- console: ${esc(x.slice(0, 300))}`);
        for (const x of s.failedRequests) lines.push(`- request: ${esc(x)}`);
        lines.push('');
    }
    fs.writeFileSync(path.join(opts.out, 'report.md'), lines.join('\n'));
    return summary;
}

console.error(`[crawl] ${routes.length} routes × ${variants.join('+')} as ${opts.user} on ${base}`);
const browser = await launchBrowser();
let stoppedForRam = false;
try {
    const contexts = {};
    for (const v of variants) contexts[v] = await newContext(browser, { stateFile, mobile: v === 'mobile', dark: opts.dark });
    for (const r of routes) {
        const avail = memAvailableMb();
        if (avail < 1800) {
            console.error(`[crawl] stopping early: MemAvailable ${avail} MB < 1800 MB. Restart the dev server (down.sh/up.sh) and crawl the rest with --part or --only.`);
            stoppedForRam = true;
            break;
        }
        const entry = { route: r.pattern, path: r.path };
        for (const v of variants) {
            entry[v] = await visit(contexts[v], base, r.path, path.join(opts.out, v, `${slug(r.pattern)}.png`));
        }
        const d = entry.desktop || entry.mobile;
        const problems = variants.reduce((n, v) => n + entry[v].pageErrors.length + entry[v].consoleErrors.length + entry[v].failedRequests.length, 0);
        console.error(`[crawl] ${String(d.status).padEnd(3)} ${r.path}${d.finalPath !== r.path ? ` → ${d.finalPath}` : ''}  ${d.ms}ms  problems=${problems}${d.error ? `  ERROR ${d.error}` : ''}`);
        results = results.filter(x => x.route !== r.pattern);
        results.push(entry);
        writeReports();
    }
} finally {
    await browser.close();
}

const summary = writeReports();
console.error(`[crawl] wrote ${path.join(opts.out, 'report.md')}`);
const bad = summary.filter(s => s.status >= 500 || s.pageErrors.length || s.error);
process.exit(stoppedForRam ? 3 : bad.length ? 1 : 0);
