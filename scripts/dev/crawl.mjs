#!/usr/bin/env node
/**
 * Visit every page route of the app (dashboard + marketing + public pages),
 * logged in, take desktop and mobile screenshots, and write a report of HTTP
 * status, console errors, uncaught exceptions and failed requests per route.
 *
 *   node scripts/dev/crawl.mjs <webPort> <outDir> [--user demo|demo2|admin] [--only a,b] [--skip a,b]
 *                              [--desktop-only | --mobile-only] [--dark] [--wait ms] [--show-dev-ui]
 *
 * Routes come from web/src/app/**\/page.tsx of the instance's worktree;
 * dynamic segments are filled from <instance>/seed.json (written by login.mjs).
 * Output: <outDir>/desktop/*.png, <outDir>/mobile/*.png, report.json, report.md.
 * Exit code 1 when any route returned >= 500 or threw an uncaught exception.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, newContext, settle, watchPage } from './pw.mjs';

const DEV_HOME = process.env.TC_DEV_HOME || '/root/.trafficclaw-dev';
const THIRD_PARTY = /tawk\.to|cloudflareinsights|googletagmanager|google-analytics\.com|clarity\.ms|bing\.com|platform\.twitter\.com|reddit(media)?\.com|dicebear|googleusercontent|google\.com\/s2\/favicons|mapbox|fonts\.g/;

function usage(msg) {
    if (msg) console.error(`crawl.mjs: ${msg}`);
    console.error('usage: node scripts/dev/crawl.mjs <webPort> <outDir> [--user demo|demo2|admin] [--only a,b] [--skip a,b] [--desktop-only|--mobile-only] [--dark] [--wait ms] [--show-dev-ui]');
    process.exit(2);
}

const argv = process.argv.slice(2);
const opts = { port: null, out: null, user: 'demo', only: null, skip: [], desktop: true, mobile: true, dark: false, wait: 1200, showDevUi: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user') opts.user = argv[++i];
    else if (a === '--only') opts.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--skip') opts.skip = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
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

function readEnvFile(file) {
    const env = {};
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (m) env[m[1]] = m[2];
    }
    return env;
}

function findInstance(port) {
    for (const name of fs.existsSync(DEV_HOME) ? fs.readdirSync(DEV_HOME) : []) {
        const f = path.join(DEV_HOME, name, 'instance.env');
        if (fs.existsSync(f) && Number(readEnvFile(f).WEB_PORT) === port) return { dir: path.dirname(f), ...readEnvFile(f) };
    }
    return null;
}

/** All page routes under web/src/app, with route groups removed. */
function discoverRoutes(appDir) {
    const routes = [];
    const walk = (dir, segs) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (entry.name === 'api' && segs.length === 0) continue;
                if (entry.name.startsWith('_')) continue;
                const seg = /^\(.*\)$/.test(entry.name) ? null : entry.name;
                walk(path.join(dir, entry.name), seg ? [...segs, seg] : segs);
            } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
                routes.push('/' + segs.join('/'));
            }
        }
    };
    walk(appDir, []);
    return [...new Set(routes)].sort();
}

function fillRoute(route, seed) {
    const s = seed.demo || seed[opts.user] || {};
    const fills = {
        '/dashboard/dashboards/[id]': s.dashboardId,
        '/dashboard/share/[token]': s.shareToken,
        '/share/[token]': s.shareToken,
        '/share/[token]/events': s.shareToken,
        '/view/[token]': s.dashboardPublicToken,
        '/leaderboard/[id]': s.leaderboardSlug || s.leaderboardId,
        '/embed/[siteId]': s.embedToken ? `demo?token=${s.embedToken}` : null,
    };
    if (route in fills) {
        const v = fills[route];
        if (v === undefined || v === null) return route.replace(/\[[^\]]+\]/g, 'missing-seed');
        if (route === '/embed/[siteId]') return `/embed/${v}`;
        return route.replace(/\[[^\]]+\]/, encodeURIComponent(String(v)));
    }
    return route.replace(/\[\.\.\.[^\]]+\]/g, 'x').replace(/\[[^\]]+\]/g, 'demo-token');
}

const slug = r => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+$/, '')).slice(0, 120);

async function devIssues(page) {
    return page.evaluate(() => {
        const portal = document.querySelector('nextjs-portal');
        const text = portal?.shadowRoot?.textContent || '';
        const m = /(\d+)\s+Issues?/.exec(text);
        const overlay = /Unhandled Runtime Error|Runtime Error|Build Error|Console Error/.exec(text);
        return { issues: m ? Number(m[1]) : 0, overlay: overlay ? overlay[0] : null };
    }).catch(() => ({ issues: 0, overlay: null }));
}

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
    const dev = await devIssues(page);
    if (!opts.showDevUi) await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
    try {
        await page.screenshot({ path: outFile, fullPage: false, timeout: 30_000 });
    } catch (err) {
        error = error || `screenshot: ${err.message.split('\n')[0]}`;
    }
    const firstParty = x => !THIRD_PARTY.test(x);
    const result = {
        status,
        finalPath: page.url().replace(base, ''),
        redirects: redirects.map(u => u.replace(base, '')),
        ms: Date.now() - t0,
        error,
        devIssues: dev.issues,
        devOverlay: dev.overlay,
        pageErrors: report.pageErrors,
        consoleErrors: report.consoleErrors.filter(firstParty),
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

fs.mkdirSync(opts.out, { recursive: true });
const variants = [...(opts.desktop ? ['desktop'] : []), ...(opts.mobile ? ['mobile'] : [])];
for (const v of variants) fs.mkdirSync(path.join(opts.out, v), { recursive: true });

console.error(`[crawl] ${routes.length} routes × ${variants.join('+')} as ${opts.user} on ${base}`);
const browser = await launchBrowser();
const results = [];
try {
    const contexts = {};
    for (const v of variants) contexts[v] = await newContext(browser, { stateFile, mobile: v === 'mobile', dark: opts.dark });
    for (const r of routes) {
        const entry = { route: r.pattern, path: r.path };
        for (const v of variants) {
            entry[v] = await visit(contexts[v], base, r.path, path.join(opts.out, v, `${slug(r.pattern)}.png`));
        }
        const d = entry.desktop || entry.mobile;
        const problems = variants.reduce((n, v) => n + entry[v].pageErrors.length + entry[v].consoleErrors.length + entry[v].failedRequests.length, 0);
        console.error(`[crawl] ${String(d.status).padEnd(3)} ${r.path}${d.finalPath !== r.path ? ` → ${d.finalPath}` : ''}  ${d.ms}ms  problems=${problems}${d.error ? `  ERROR ${d.error}` : ''}`);
        results.push(entry);
    }
} finally {
    await browser.close();
}

const summary = results.map(e => {
    const vs = variants.map(v => e[v]);
    return {
        route: e.route,
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
fs.writeFileSync(path.join(opts.out, 'report.json'), JSON.stringify({ base, user: opts.user, createdAt: new Date().toISOString(), results }, null, 2));

const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
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
console.error(`[crawl] wrote ${path.join(opts.out, 'report.md')}`);
const bad = summary.filter(s => s.status >= 500 || s.pageErrors.length || s.error);
process.exit(bad.length ? 1 : 0);
