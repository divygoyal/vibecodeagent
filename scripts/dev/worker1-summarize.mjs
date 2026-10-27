#!/usr/bin/env node
/**
 * Summarise a check run: counts of findings from the kit's logs, phase times and load.
 *
 *   node scripts/dev/worker1-summarize.mjs <resultsDir> [--name n] [--instances N]
 *
 * JSON on stdout, a markdown summary on stderr. It reads the logs the kit prints, so it works on a worker1
 * results dir (crawl-p1.log, mobile-p1.log, scen-1.log, ...) and on a main-VPS run of the same checks
 * (crawl1.log, crawl-admin.log, mobile1.log, scenarios.log) alike.
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const dir = argv[0];
if (!dir || !fs.existsSync(dir)) { console.error('usage: worker1-summarize.mjs <resultsDir> [--name n] [--instances N]'); process.exit(2); }
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const logs = (re) => fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => ({ f, text: read(path.join(dir, f)) }));
const walk = (d, re, out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, re, out);
        else if (re.test(e.name)) out.push(p);
    }
    return out;
};

const out = { name: opt('--name') || null, instances: opt('--instances') ? Number(opt('--instances')) : null };

// Crawl: "[crawl] 200 /path 4763ms problems=0"
{
    const rows = [];
    for (const { text } of logs(/^crawl.*\.log$/)) {
        for (const line of text.split('\n')) {
            const m = /^\[crawl\] (\d{3}) (\S+).*? (\d+)ms\s+problems=(\d+)/.exec(line);
            if (m) rows.push({ status: +m[1], route: m[2], ms: +m[3], problems: +m[4] });
        }
    }
    // Same route crawled twice (a re-run): keep the last.
    const byRoute = new Map(rows.map((r) => [r.route, r]));
    const list = [...byRoute.values()];
    const ms = list.map((r) => r.ms).sort((a, b) => a - b);
    out.crawl = {
        routes: list.length,
        notOk: list.filter((r) => r.status >= 400).length,
        withProblems: list.filter((r) => r.problems > 0).length,
        problems: list.reduce((n, r) => n + r.problems, 0),
        medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null,
        p90Ms: ms.length ? ms[Math.floor(ms.length * 0.9)] : null,
        problemRoutes: list.filter((r) => r.problems > 0).map((r) => `${r.route} (${r.problems})`),
    };
}

// Mobile: "[mobile] totals: error=0 overflow=0 ..." (summed over parts). The scenario users print the same line.
const sumTotals = (files) => {
    const t = {};
    let runs = 0;
    for (const { text } of files) {
        for (const line of text.split('\n')) {
            const m = /^\[mobile\] totals: (.*)$/.exec(line);
            if (!m) continue;
            runs++;
            for (const kv of m[1].trim().split(/\s+/)) {
                const [k, v] = kv.split('=');
                t[k] = (t[k] || 0) + Number(v);
            }
        }
    }
    return { runs, totals: t };
};
out.mobile = sumTotals(logs(/^mobile.*\.log$/));
{
    const pages = [];
    for (const f of walk(dir, /^mobile-(?!scen).*\.json$/)) {
        try { pages.push(...JSON.parse(read(f)).results); } catch { /* ignore */ }
    }
    out.mobile.pageRuns = pages.length;
    out.mobile.loadingPages = pages.filter((r) => Object.values(r.widths || {}).some((w) => (w.loadingCount || 0) > 0)).length;
}

// Scenarios: per-user totals plus flagged cells in scenarios.md (E error, N bad text, L loading, A api not json, j api json 5xx).
{
    const s = sumTotals(logs(/^scen.*\.log$/));
    const flags = {};
    let cells = 0;
    let flagged = 0;
    for (const f of walk(dir, /^scenarios\.md$/)) {
        const lines = read(f).split('\n');
        const head = lines.findIndex((l) => l.startsWith('| Page |'));
        if (head < 0) continue;
        for (const l of lines.slice(head + 2)) {
            if (!l.startsWith('|')) break;
            for (const c of l.split('|').slice(2, -1).map((x) => x.trim())) {
                if (!c) continue;
                cells++;
                if (c !== 'ok') { flagged++; for (const ch of c) flags[ch] = (flags[ch] || 0) + 1; }
            }
        }
    }
    out.scenarios = { runs: s.runs, totals: s.totals, cells, flaggedCells: flagged, flags };
}

// Golden: "N shots, M identical, K changed or missing"
for (const g of ['golden-compare.log', 'golden-selfcompare.log']) {
    const m = /(\d+) shots, (\d+) identical, (\d+) changed or missing/.exec(read(path.join(dir, g)));
    if (m) (out.golden ||= {})[g.replace('.log', '')] = { shots: +m[1], identical: +m[2], changedOrMissing: +m[3] };
}

// Phase times (worker1 runs).
const tsv = read(path.join(dir, 'timings.tsv')).split('\n').filter(Boolean).map((l) => l.split('\t'));
if (tsv.length) out.phases = Object.fromEntries(tsv.map(([n, s, f]) => [n, { secs: Number(s), nonZeroExit: f === '1' }]));

// Load (worker1 runs): "HH:MM:SS load1 memavail_mb phase"
const load = read(path.join(dir, 'load.log')).split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(' '));
if (load.length) {
    const l1 = load.map((r) => Number(r[1]));
    const mem = load.map((r) => Number(r[2]));
    out.load = { samples: load.length, peakLoad1: Math.max(...l1), meanLoad1: +(l1.reduce((a, b) => a + b, 0) / l1.length).toFixed(2), minMemAvailableMb: Math.min(...mem) };
    const per = {};
    for (const r of load) { const p = r[3] || '-'; per[p] = Math.max(per[p] || 0, Number(r[1])); }
    out.load.peakLoad1ByPhase = per;
}

console.log(JSON.stringify(out, null, 2));

const L = [];
L.push(`# Check summary${out.name ? `: ${out.name}` : ''}${out.instances ? ` (${out.instances} instances)` : ''}`, '');
if (out.phases) L.push('| Phase | Seconds | A job exited non-zero |', '|---|---|---|', ...Object.entries(out.phases).map(([n, p]) => `| ${n} | ${p.secs} | ${p.nonZeroExit ? 'yes' : 'no'} |`), '');
L.push(`Crawl: ${out.crawl.routes} routes, ${out.crawl.notOk} not ok, ${out.crawl.problems} problems on ${out.crawl.withProblems} routes (median ${out.crawl.medianMs} ms, p90 ${out.crawl.p90Ms} ms per route)`);
for (const r of out.crawl.problemRoutes) L.push(`  - ${r}`);
L.push(`Mobile: ${out.mobile.pageRuns} page runs; totals ${Object.entries(out.mobile.totals).map(([k, v]) => `${k}=${v}`).join(' ')}; pages with a spinner still showing: ${out.mobile.loadingPages}`);
L.push(`Scenarios: ${out.scenarios.runs} users; ${out.scenarios.flaggedCells} flagged of ${out.scenarios.cells} cells ${JSON.stringify(out.scenarios.flags)}; totals ${Object.entries(out.scenarios.totals).map(([k, v]) => `${k}=${v}`).join(' ')}`);
if (out.golden) L.push(`Golden: ${JSON.stringify(out.golden)}`);
if (out.load) L.push(`Load on worker1: peak ${out.load.peakLoad1}, mean ${out.load.meanLoad1}, min MemAvailable ${out.load.minMemAvailableMb} MB, peak by phase ${JSON.stringify(out.load.peakLoad1ByPhase)}`);
console.error(L.join('\n'));
