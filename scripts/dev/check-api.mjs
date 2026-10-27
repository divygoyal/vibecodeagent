#!/usr/bin/env node
/**
 * GET every /api route of the app as a logged-in dev user, once per Google
 * fault (tc_demo_faults cookie, see web/src/lib/demo/faults.ts), and report
 * answers that a client cannot handle:
 *
 *   html     an error (or any /api answer) that is HTML or empty instead of JSON
 *   5xx      a server error whose JSON has no `error`/`message`
 *   slow     no answer within --timeout (a hanging route)
 *   soft     200 with a JSON `error` field (informational: the UI must check bodies)
 *   down     the dev server was restarting (retried once; not counted)
 *
 *   node scripts/dev/check-api.mjs <webPort> [--user demo] [--faults none,429,403,500,empty,huge,revoked,timeout:4000]
 *        [--only /api/site,/api/portfolio] [--timeout ms] [--out dir]
 *
 * Routes with side effects on GET (cron, OAuth callbacks, installs, admin,
 * superadmin, provisioning) are skipped. Output: robust/api-<user>.{json,md}.
 * Exit 1 when any html/5xx/slow answer is found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { findInstance } from './routes.mjs';

const SKIP = /^\/api\/(cron|auth|webhooks|github-app|github|aitraffic\/authorize|provision|superadmin|admin|setup-bot|subscription)(\/|$)/;
const NON_JSON_OK = /^\/api\/(badges\/|favicon|portfolio\/export\.csv|share\/[^/]+\/umami\/dashboard)/;

const argv = process.argv.slice(2);
const opts = { port: null, user: 'demo', faults: ['none', '429', '403', '500', 'empty', 'huge', 'revoked', 'timeout:4000'], only: null, timeout: 45_000, out: '/root/projects/tc-redesign-research/robust' };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user') opts.user = argv[++i];
    else if (a === '--faults') opts.faults = argv[++i].split(',');
    else if (a === '--only') opts.only = argv[++i].split(',');
    else if (a === '--timeout') opts.timeout = Number(argv[++i]);
    else if (a === '--out') opts.out = argv[++i];
    else if (/^\d+$/.test(a)) opts.port = Number(a);
    else { console.error(`check-api: unknown argument ${a}`); process.exit(2); }
}
if (!opts.port) { console.error('usage: node scripts/dev/check-api.mjs <webPort> [--user u] [--faults a,b] [--only /api/x] [--timeout ms] [--out dir]'); process.exit(2); }

const inst = findInstance(opts.port);
if (!inst) { console.error(`no dev instance on ${opts.port}`); process.exit(2); }
const state = JSON.parse(fs.readFileSync(path.join(inst.dir, opts.user === 'demo' ? 'state.json' : `state-${opts.user}.json`), 'utf8'));
const session = state.cookies.filter((c) => c.domain === 'localhost').map((c) => `${c.name}=${c.value}`).join('; ');
const seedAll = fs.existsSync(path.join(inst.dir, 'seed.json')) ? JSON.parse(fs.readFileSync(path.join(inst.dir, 'seed.json'), 'utf8')) : {};
const seed = seedAll[opts.user] || seedAll.demo || {};
const base = `http://localhost:${opts.port}`;

// Routes with a GET handler.
const apiDir = path.join(inst.REPO, 'web', 'src', 'app', 'api');
const routes = [];
(function walk(dir, segs) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name), [...segs, e.name]);
        else if (e.name === 'route.ts' && /export\s+(async\s+)?(function|const)\s+GET\b/.test(fs.readFileSync(path.join(dir, e.name), 'utf8'))) routes.push(`/api/${segs.join('/')}`);
    }
})(apiDir, []);

function fill(route) {
    return route
        .replace('/dashboards/public/[token]', `/dashboards/public/${seed.dashboardPublicToken || 'missing'}`)
        .replace('/dashboards/[id]', `/dashboards/${seed.dashboardId || 'missing'}`)
        .replace('/share/[token]', `/share/${seed.shareToken || 'missing'}`)
        .replace(/\/(leaderboard|badges)\/\[id\]/, `/$1/${seed.leaderboardSlug || seed.leaderboardId || 1}`)
        .replace(/\[\.\.\.[^\]]+\]/g, 'x')
        .replace(/\[[^\]]+\]/g, '1');
}
const QUERY = new URLSearchParams({
    range: '28d', siteUrl: 'sc-domain:acmeanalytics.example', propertyId: 'properties/412300101', property: 'properties/412300101',
    site: 'acmeanalytics.example', host: 'acmeanalytics.example', siteId: 'acmeanalytics.example', startDate: '28daysAgo', endDate: 'yesterday',
    days: '28', limit: '10', url: 'https://acmeanalytics.example/', domain: 'acmeanalytics.example', keyword: 'focus timer', token: seed.embedToken || '',
}).toString();

let list = routes.filter((r) => !SKIP.test(r)).sort();
if (opts.only) list = list.filter((r) => opts.only.some((o) => r === o || r.startsWith(`${o}/`)));

async function serverUp() {
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`${base}/api/auth/providers`, { signal: AbortSignal.timeout(10_000) });
            if (res.ok) return true;
        } catch { /* still restarting */ }
        await new Promise((ok) => setTimeout(ok, 3000));
    }
    return false;
}

async function probe(fault, route, url) {
    const t0 = Date.now();
    const r = { fault, route, status: 0, ms: 0, contentType: '', kind: null, body: '' };
    try {
        const res = await fetch(url, {
            headers: { Cookie: `${session}${fault === 'none' ? '' : `; tc_demo_faults=${fault}`}`, Accept: 'application/json' },
            redirect: 'manual',
            signal: AbortSignal.timeout(opts.timeout),
        });
        r.status = res.status;
        r.contentType = (res.headers.get('content-type') || '').split(';')[0];
        const isStream = r.contentType === 'text/event-stream';
        const text = isStream ? '' : await res.text();
        r.body = text.slice(0, 200).replace(/\s+/g, ' ');
        const json = r.contentType.includes('json');
        let parsed = null;
        if (json) { try { parsed = JSON.parse(text); } catch { r.kind = 'html'; } }
        if (res.status >= 300 && res.status < 400) r.kind = null; // redirects (auth) are fine
        else if (!json && !isStream && !NON_JSON_OK.test(route)) r.kind = 'html';
        else if (res.status >= 500 && parsed && !(parsed.error || parsed.message)) r.kind = '5xx';
        else if (res.status === 200 && parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error) r.kind = 'soft';
    } catch (err) {
        r.kind = err.name === 'TimeoutError' ? 'slow' : 'down';
        r.body = String(err.cause?.code || err.message).slice(0, 200);
    }
    r.ms = Date.now() - t0;
    return r;
}

const results = [];
console.error(`[api] ${list.length} GET routes × ${opts.faults.length} fault modes as ${opts.user}`);
for (const fault of opts.faults) {
    for (const route of list) {
        const url = `${base}${fill(route)}?${QUERY}`;
        let r = await probe(fault, route, url);
        // The dev server restarts itself near its memory limit: wait for it and try once more.
        if (r.kind === 'down' && await serverUp()) r = await probe(fault, route, url);
        results.push(r);
        if (r.kind && r.kind !== 'soft') console.error(`[api] ${fault.padEnd(12)} ${r.status} ${r.kind.padEnd(4)} ${route}  ${r.contentType} ${r.body.slice(0, 80)}`);
    }
}

fs.mkdirSync(opts.out, { recursive: true });
fs.writeFileSync(path.join(opts.out, `api-${opts.user}.json`), JSON.stringify({ base, user: opts.user, updatedAt: new Date().toISOString(), results }, null, 2));
const bad = results.filter((r) => r.kind && r.kind !== 'soft' && r.kind !== 'down');
const soft = results.filter((r) => r.kind === 'soft');
const statusTable = {};
for (const r of results) {
    statusTable[r.route] ??= {};
    statusTable[r.route][r.fault] = `${r.status}${r.kind ? ` ${r.kind}` : ''}`;
}
const lines = [
    `# API check: ${base} as ${opts.user}`, '',
    `${list.length} GET routes × faults ${opts.faults.join(', ')}. ${bad.length} bad answers (html / 5xx without message / slow), ${soft.length} soft errors (200 + error). Generated ${new Date().toISOString()}.`, '',
    `| Route | ${opts.faults.join(' | ')} |`, `|---|${opts.faults.map(() => '---').join('|')}|`,
    ...Object.entries(statusTable).map(([route, by]) => `| ${route} | ${opts.faults.map((f) => by[f] || '').join(' | ')} |`),
    '', '## Bad answers', '',
    ...bad.map((r) => `- ${r.fault} ${r.status} **${r.kind}** \`${r.route}\` ${r.contentType} ${r.body.slice(0, 120)}`),
];
fs.writeFileSync(path.join(opts.out, `api-${opts.user}.md`), lines.join('\n'));
console.error(`[api] wrote ${path.join(opts.out, `api-${opts.user}.md`)}: ${bad.length} bad, ${soft.length} soft`);
process.exit(bad.length ? 1 : 0);
