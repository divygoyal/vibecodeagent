#!/usr/bin/env node
/**
 * Regression guard before a preview or a release:
 *
 *   1. tsc --noEmit
 *   2. ESLint on the files changed since --since (default: merge-base with work/live);
 *      fails only on errors the branch added (per file and rule), not on older debt
 *   3. npm test (node --test tests/*.test.mjs)
 *   4. check:rsc (Server -> Client Component props that cannot serialize)
 *   5. check-mobile against --base (a running dev server or preview): key routes at
 *      360 + 390 px by default, every route with --full. Skipped without --base.
 *
 *   cd web && npm run check:all -- [--base http://localhost:3101] [--full] [--since <ref>] [--user demo]
 *
 * Every step runs even when an earlier one fails; exit 1 if any failed.
 * Mobile reports go to tc-redesign-research/robust/mobile-checkall-*.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const web = path.join(repo, 'web');

const argv = process.argv.slice(2);
const opts = { base: null, full: false, since: null, user: 'demo' };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') opts.base = argv[++i];
    else if (a === '--full') opts.full = true;
    else if (a === '--since') opts.since = argv[++i];
    else if (a === '--user') opts.user = argv[++i];
    else { console.error(`check-all: unknown argument ${a}`); process.exit(2); }
}

const QUICK_ROUTES = ['/', '/demo', '/demo/[slug]', '/pricing', '/leaderboard', '/leaderboard/[id]', '/dashboard', '/dashboard/s/[host]', '/dashboard/s/[host]/search', '/dashboard/ask', '/dashboard/dashboards', '/dashboard/settings'];

const steps = [];
function run(name, cmd, args, { cwd = web, allowFail = false } = {}) {
    const t0 = Date.now();
    console.error(`\n=== ${name}: ${cmd} ${args.join(' ')}`);
    const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
    const ok = r.status === 0;
    steps.push({ name, ok: ok || allowFail, status: r.status, s: Math.round((Date.now() - t0) / 1000) });
    return ok;
}

// 1. Types.
run('tsc', 'npx', ['tsc', '--noEmit', '-p', '.']);

// 2. Lint changed files.
let since = opts.since;
if (!since) {
    try { since = execFileSync('git', ['merge-base', 'HEAD', 'work/live'], { cwd: repo, encoding: 'utf8' }).trim(); } catch { since = 'HEAD~1'; }
}
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
const changed = [...new Set([...git('diff', '--name-only', `${since}...HEAD`), ...git('diff', '--name-only'), ...git('ls-files', '--others', '--exclude-standard')])]
    .filter((f) => f.startsWith('web/') && /\.(tsx?|mjs|jsx?)$/.test(f) && fs.existsSync(path.join(repo, f)))
    .map((f) => f.slice(4));
if (changed.length) {
    // Only errors this branch added count: per file and rule, compare with the file at --since
    // (legacy files such as lib/googleApi.ts carry old no-explicit-any debt).
    const t0 = Date.now();
    console.error(`\n=== eslint: ${changed.length} files changed since ${since.slice(0, 10)} (new errors only)`);
    const { ESLint } = await import(path.join(web, 'node_modules', 'eslint', 'lib', 'api.js'));
    const eslint = new ESLint({ cwd: web });
    const count = (results) => {
        const m = new Map();
        for (const r of results) for (const msg of r.messages) if (msg.severity === 2) m.set(msg.ruleId, (m.get(msg.ruleId) || 0) + 1);
        return m;
    };
    const fresh = [];
    let legacy = 0;
    for (const f of changed) {
        const now = await eslint.lintFiles([f]);
        const nowCount = count(now);
        if (!nowCount.size) continue;
        let before = new Map();
        try {
            const old = execFileSync('git', ['show', `${since}:web/${f}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            before = count(await eslint.lintText(old, { filePath: path.join(web, f) }));
        } catch { /* new file */ }
        for (const [rule, n] of nowCount) {
            const added = n - (before.get(rule) || 0);
            legacy += Math.min(n, before.get(rule) || 0);
            if (added > 0) {
                const msgs = now[0].messages.filter((m) => m.severity === 2 && m.ruleId === rule).slice(0, 3).map((m) => `${f}:${m.line}:${m.column} ${m.message}`);
                fresh.push({ file: f, rule, added, msgs });
            }
        }
    }
    for (const x of fresh) console.error(`  +${x.added} ${x.rule} in ${x.file}\n    ${x.msgs.join('\n    ')}`);
    console.error(`  ${fresh.reduce((n, x) => n + x.added, 0)} new error(s); ${legacy} older error(s) in these files ignored`);
    steps.push({ name: `eslint (${changed.length} changed files, new errors only)`, ok: fresh.length === 0, s: Math.round((Date.now() - t0) / 1000) });
} else {
    steps.push({ name: 'eslint (no changed files)', ok: true, s: 0 });
}

// 3. Unit tests.
run('npm test', 'npm', ['test', '--silent']);

// 4. Server/client boundary.
run('check:rsc', process.execPath, [path.join(here, 'check-rsc-props.mjs'), '--web', web]);

// 5. Mobile layout.
if (opts.base) {
    const args = [path.join(here, 'check-mobile.mjs'), opts.base, '--label', `checkall-${opts.user}`, '--user', opts.user, '--fail-on', 'error,overflow,offscreen,badText'];
    if (!opts.full) args.push('--widths', '360,390', '--themes', 'light', '--only', QUICK_ROUTES.join(','));
    run(`check-mobile ${opts.full ? '(all routes)' : '(key routes)'}`, process.execPath, args, { cwd: repo });
} else {
    steps.push({ name: 'check-mobile (skipped: pass --base http://localhost:3101)', ok: true, s: 0 });
}

console.error('\n=== check:all summary');
for (const s of steps) console.error(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name}  (${s.s}s)`);
process.exit(steps.every((s) => s.ok) ? 0 : 1);
