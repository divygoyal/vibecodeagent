#!/usr/bin/env node
/**
 * Edge-case sweep: log in as each scenario user (scripts/dev/login.mjs) and
 * visit every app page at phone width, recording what check-mobile.mjs sees:
 * error boundaries, uncaught exceptions, "NaN"/"undefined" on screen,
 * spinners that never finish, and /api answers that are 5xx or not JSON.
 *
 *   node scripts/dev/check-scenarios.mjs <webPort> [--users empty,one,…] [--only /dashboard,…]
 *        [--out dir] [--settle ms] [--skip-login]
 *
 * Users (see login.mjs): empty one ga4only gsconly many nogoogle nocredits
 *                        f403 f429 f500 ftimeout fempty frevoked fhuge
 * Plus cookie runs on public pages: --users cookie:429,cookie:empty (tc_demo_faults cookie,
 * logged out) for the marketing / leaderboard / embed / demo pages.
 *
 * Output: <out>/scenarios.md (one table, user × page) and each run's
 * mobile-scen-<user>.{json,md} next to it. Default out: tc-redesign-research/robust.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillRoute, findInstance } from './routes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ALL_USERS = ['empty', 'one', 'ga4only', 'gsconly', 'many', 'nogoogle', 'nocredits', 'f403', 'f429', 'f500', 'ftimeout', 'fempty', 'frevoked', 'fhuge'];
const HOST = { many: 'site-001.example', default: 'acmeanalytics.example' };
const APP_ROUTES = [
    '/dashboard', '/dashboard/s/[host]', '/dashboard/s/[host]/traffic', '/dashboard/s/[host]/search', '/dashboard/s/[host]/pages',
    '/dashboard/s/[host]/actions', '/dashboard/s/[host]/actions/audit', '/dashboard/ask', '/dashboard/connect-ai', '/dashboard/dashboards',
    '/dashboard/dashboards/new', '/dashboard/dashboards/[id]', '/dashboard/leaderboard', '/dashboard/plan', '/dashboard/settings',
    '/dashboard/setup', '/dashboard/weekly', '/dashboard/support',
];
const PUBLIC_ROUTES = ['/', '/demo', '/demo/[slug]', '/leaderboard', '/leaderboard/[id]', '/leaderboard/join', '/embed/leaderboard/[id]', '/embed/[siteId]', '/view/[token]', '/share/[token]'];

const argv = process.argv.slice(2);
const opts = { port: null, users: ALL_USERS, only: null, out: '/root/projects/tc-redesign-research/robust', settle: 45_000, login: true };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--users') opts.users = argv[++i].split(',').filter(Boolean);
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--settle') opts.settle = Number(argv[++i]);
    else if (a === '--skip-login') opts.login = false;
    else if (/^\d+$/.test(a)) opts.port = Number(a);
    else { console.error(`check-scenarios: unknown argument ${a}`); process.exit(2); }
}
if (!opts.port) { console.error('usage: node scripts/dev/check-scenarios.mjs <webPort> [--users a,b] [--only /a,/b] [--out dir] [--settle ms] [--skip-login]'); process.exit(2); }

const summary = [];
fs.mkdirSync(opts.out, { recursive: true });
for (const user of opts.users) {
    const cookie = user.startsWith('cookie:') ? user.slice(7) : null;
    const label = cookie ? `scen-cookie-${cookie.replace(/[^a-z0-9]+/gi, '_')}` : `scen-${user}`;
    if (!cookie && opts.login) {
        const r = spawnSync(process.execPath, [path.join(here, 'login.mjs'), String(opts.port), '--user', user], { encoding: 'utf8', timeout: 300_000 });
        if (r.status !== 0) {
            console.error(`[scenarios] login ${user} failed: ${(r.stderr || r.stdout).slice(-400)}`);
            summary.push({ user, label, error: 'login failed' });
            continue;
        }
    }
    // Exact pages (an --only prefix like /dashboard would pull in every legacy redirect too).
    const inst = findInstance(opts.port);
    const seed = inst && fs.existsSync(path.join(inst.dir, 'seed.json')) ? JSON.parse(fs.readFileSync(path.join(inst.dir, 'seed.json'), 'utf8')) : {};
    const paths = opts.only ? opts.only.split(',') : (cookie ? PUBLIC_ROUTES : APP_ROUTES).map((r) => fillRoute(r, seed, { user: 'demo', host: HOST[user] || HOST.default }));
    const routes = paths.join(',');
    const args = [
        path.join(here, 'check-mobile.mjs'), String(opts.port), '--label', label, '--out', opts.out, '--widths', '390', '--themes', 'light',
        '--paths', routes, '--settle', String(opts.settle), '--no-shots', '--fail-on', 'error,badText,api',
        ...(cookie ? ['--state', 'none', '--cookie', `tc_demo_faults=${cookie}`] : ['--user', user]),
    ];
    console.error(`[scenarios] ${user}: ${routes.split(',').length} routes`);
    const r = spawnSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'], timeout: 3_600_000 });
    summary.push({ user, label, exit: r.status });
    if (r.status === 3) { console.error('[scenarios] stopped: low memory'); break; }
}

// Combined table.
const lines = ['# Edge-case scenarios', '', `Port ${opts.port}, 390 px, light, settle up to ${opts.settle} ms. Generated ${new Date().toISOString()}.`, '',
    'Cells: `ok`, or what went wrong (E = error boundary / uncaught / 5xx, N = NaN/undefined on screen, L = still loading, A = /api 5xx or non-JSON error).', ''];
// Every scenario run in the out dir (earlier runs of other users included).
const byUser = {};
const allPaths = new Set();
for (const file of fs.readdirSync(opts.out).filter((f) => /^mobile-scen-.+\.json$/.test(f)).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(opts.out, file), 'utf8'));
    const user = file.replace(/^mobile-scen-/, '').replace(/\.json$/, '');
    byUser[user] = {};
    const s = { user };
    for (const r of data.results) {
        const w = Object.values(r.widths)[0] || {};
        const flags = [];
        if (r.status >= 500 || r.pageErrors.length || r.navError || w.error || w.auditError) flags.push('E');
        if (w.badText?.length) flags.push('N');
        if (w.loadingCount) flags.push('L');
        if (r.api?.length) flags.push('A');
        const key = r.route.replace(/#.*/, '').replace(/\/dashboard\/s\/[^/]+/, '/dashboard/s/[host]').replace(/\/dashboards\/[0-9a-f-]{36}/, '/dashboards/[id]');
        allPaths.add(key);
        byUser[s.user][key] = { flags, r, w };
    }
}
const users = Object.keys(byUser);
const paths = [...allPaths].sort();
lines.push(`| Page | ${users.join(' | ')} |`, `|---|${users.map(() => '---').join('|')}|`);
for (const p of paths) lines.push(`| ${p} | ${users.map((u) => (byUser[u][p] ? (byUser[u][p].flags.join('') || 'ok') : '')).join(' | ')} |`);
lines.push('', '## Problems', '');
for (const u of users) {
    for (const p of paths) {
        const e = byUser[u][p];
        if (!e || !e.flags.length) continue;
        lines.push(`### ${u} ${p} → ${e.r.finalPath}`);
        if (e.r.navError) lines.push(`- navigation: ${e.r.navError}`);
        for (const x of e.r.pageErrors) lines.push(`- uncaught: ${x.split('\n')[0].slice(0, 200)}`);
        if (e.w.error) lines.push(`- error boundary: ${e.w.error}`);
        for (const x of e.w.badText || []) lines.push(`- bad text: \`${x.sel.slice(-80)}\` "${x.match}"`);
        if (e.w.loadingCount) lines.push(`- still loading: ${e.w.loadingCount} (${(e.w.loading || []).map((x) => `\`${x.sel.slice(-60)}\``).join(', ')})`);
        for (const x of e.r.api || []) lines.push(`- api ${x.status} ${x.method} ${x.path} (${x.contentType}) ${x.body.slice(0, 100)}`);
        lines.push('');
    }
}
fs.mkdirSync(opts.out, { recursive: true });
fs.writeFileSync(path.join(opts.out, 'scenarios.md'), lines.join('\n'));
console.error(`[scenarios] wrote ${path.join(opts.out, 'scenarios.md')}`);
