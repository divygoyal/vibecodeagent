#!/usr/bin/env node
/**
 * Create one dashboard per template (and the "every widget type" showcase,
 * web/tests/builder/showcase.ts) for a logged-in dev user, through the app's
 * own API, and print their paths for check-mobile.mjs --paths.
 *
 *   node scripts/dev/seed-dashboards.mjs <webPort> [--user demo] [--site acmeanalytics.example]
 *
 * Idempotent per user: ids are kept in <instance>/dashboards-<user>.json and
 * reused while they still exist. Prints a comma-separated list of
 * /dashboard/dashboards/<id> and /dashboard/dashboards/<id>/edit paths.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { findInstance } from './routes.mjs';

const TEMPLATES = ['site-overview', 'search-performance', 'traffic-acquisition', 'content-performance', 'portfolio', 'client-report', 'audience-geography', 'key-events-revenue', 'blank'];

const argv = process.argv.slice(2);
const opts = { port: null, user: 'demo', site: 'acmeanalytics.example' };
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--user') opts.user = argv[++i];
    else if (argv[i] === '--site') opts.site = argv[++i];
    else if (/^\d+$/.test(argv[i])) opts.port = Number(argv[i]);
    else { console.error(`seed-dashboards: unknown argument ${argv[i]}`); process.exit(2); }
}
if (!opts.port) { console.error('usage: node scripts/dev/seed-dashboards.mjs <webPort> [--user u] [--site host]'); process.exit(2); }

const inst = findInstance(opts.port);
if (!inst) { console.error(`no dev instance on ${opts.port}`); process.exit(2); }
const state = JSON.parse(fs.readFileSync(path.join(inst.dir, opts.user === 'demo' ? 'state.json' : `state-${opts.user}.json`), 'utf8'));
const cookie = state.cookies.filter((c) => c.domain === 'localhost').map((c) => `${c.name}=${c.value}`).join('; ');
const base = `http://localhost:${opts.port}`;
const store = path.join(inst.dir, `dashboards-${opts.user}.json`);
const known = fs.existsSync(store) ? JSON.parse(fs.readFileSync(store, 'utf8')) : {};

async function api(method, p, body) {
    const res = await fetch(base + p, {
        method,
        headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
}

const showcase = () => {
    const web = path.join(inst.REPO, 'web');
    const doc = JSON.parse(execFileSync(process.execPath, ['--no-warnings', '--import', './tests/_register-alias.mjs', 'tests/builder/showcase.ts'], { cwd: web, encoding: 'utf8' }));
    return doc;
};

const out = [];
for (const id of [...TEMPLATES, 'showcase']) {
    if (known[id]) {
        const r = await api('GET', `/api/dashboards/${known[id]}`);
        if (r.status === 200) { out.push([id, known[id]]); continue; }
    }
    const body = id === 'showcase'
        ? { name: 'Widget showcase', doc: showcase() }
        : { name: `Template: ${id}`, templateId: id, siteId: opts.site };
    const r = await api('POST', '/api/dashboards', body);
    const did = r.data?.dashboard?.id;
    if (r.status !== 200 || !did) {
        console.error(`[seed-dashboards] ${id}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
        continue;
    }
    known[id] = did;
    out.push([id, did]);
}
fs.writeFileSync(store, JSON.stringify(known, null, 2));
console.error(`[seed-dashboards] ${out.length} dashboards for ${opts.user}: ${out.map(([t]) => t).join(', ')}`);
console.log(out.flatMap(([, did]) => [`/dashboard/dashboards/${did}`, `/dashboard/dashboards/${did}/edit`]).join(','));
