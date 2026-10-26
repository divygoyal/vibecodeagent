#!/usr/bin/env node
/**
 * Screenshot one URL and print console errors, uncaught exceptions and
 * failed requests.
 *
 *   node scripts/dev/shot.mjs <url> <out.png> [--state file] [--mobile] [--dark] [--full] [--wait ms]
 *
 * --state  Playwright state from login.mjs (e.g. /root/.trafficclaw-dev/kit/state.json)
 * --mobile 390x844 iPhone-like viewport (default 1440x900 desktop)
 * --dark   prefers-color-scheme: dark
 * --full   full-page screenshot
 * --wait   extra milliseconds after the page settles (default 1500)
 * --show-dev-ui  keep the Next.js dev badge/overlay in the image (hidden by default;
 *                its issue count is always reported as devIssues)
 * Exit code: 0 ok, 1 navigation failed or HTTP >= 500, 2 bad usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { devIssueCount, hideDevUi, launchBrowser, newContext, settle, watchPage } from './pw.mjs';

function usage(msg) {
    if (msg) console.error(`shot.mjs: ${msg}`);
    console.error('usage: node scripts/dev/shot.mjs <url> <out.png> [--state file] [--mobile] [--dark] [--full] [--wait ms]');
    process.exit(2);
}

const argv = process.argv.slice(2);
const opts = { url: null, out: null, state: null, mobile: false, dark: false, full: false, wait: 1500, showDevUi: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--state') opts.state = argv[++i];
    else if (a === '--mobile') opts.mobile = true;
    else if (a === '--dark') opts.dark = true;
    else if (a === '--full') opts.full = true;
    else if (a === '--show-dev-ui') opts.showDevUi = true;
    else if (a === '--wait') opts.wait = Number(argv[++i]);
    else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else if (!opts.url) opts.url = a;
    else if (!opts.out) opts.out = a;
    else usage(`unexpected argument ${a}`);
}
if (!opts.url || !opts.out) usage();
if (opts.state && !fs.existsSync(opts.state)) usage(`state file not found: ${opts.state}`);

const browser = await launchBrowser();
let exitCode = 0;
try {
    const context = await newContext(browser, { stateFile: opts.state, mobile: opts.mobile, dark: opts.dark });
    const page = await context.newPage();
    const origin = new URL(opts.url).origin;
    const report = watchPage(page, origin);
    const t0 = Date.now();
    let status = 0;
    try {
        const res = await page.goto(opts.url, { waitUntil: 'load', timeout: 120_000 });
        status = res?.status() ?? 0;
    } catch (err) {
        console.error(`navigation failed: ${err.message}`);
        exitCode = 1;
    }
    await settle(page, report);
    if (opts.wait > 0) await page.waitForTimeout(opts.wait);
    const dev = await devIssueCount(page);
    if (!opts.showDevUi) await hideDevUi(page);
    fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    await page.screenshot({ path: opts.out, fullPage: opts.full });
    if (status >= 500) exitCode = 1;
    const out = {
        url: opts.url,
        finalUrl: page.url(),
        status,
        ms: Date.now() - t0,
        screenshot: path.resolve(opts.out),
        devIssues: dev,
        consoleErrors: report.consoleErrors,
        pageErrors: report.pageErrors,
        failedRequests: report.failedRequests,
    };
    console.log(JSON.stringify(out, null, 2));
    await context.close();
} finally {
    await browser.close();
}
process.exit(exitCode);
