/**
 * Shared Playwright helpers for shot.mjs and crawl.mjs. Uses the global
 * Playwright install and the system Chrome, so the repo gains no dependency.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const PLAYWRIGHT_DIR = process.env.TC_PLAYWRIGHT_DIR || '/usr/lib/node_modules/playwright';
const CHROME = process.env.TC_CHROME || '/usr/bin/google-chrome';

export function loadPlaywright() {
    const require = createRequire(`${PLAYWRIGHT_DIR}/package.json`);
    return require(PLAYWRIGHT_DIR);
}

export async function launchBrowser() {
    const { chromium } = loadPlaywright();
    return chromium.launch({
        executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--js-flags=--max-old-space-size=512'],
    });
}

export const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
export const MOBILE = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
};

/**
 * New context with an optional login state written by login.mjs. Applies the
 * extra `sessionStorage` entries (superadmin token) that Playwright's own
 * storageState format does not carry.
 */
export async function newContext(browser, { stateFile, mobile = false, dark = false } = {}) {
    let state = null;
    if (stateFile) state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const context = await browser.newContext({
        ...(mobile ? MOBILE : DESKTOP),
        colorScheme: dark ? 'dark' : 'light',
        reducedMotion: 'reduce',
        timezoneId: 'UTC',
        locale: 'en-US',
        storageState: state ? { cookies: state.cookies || [], origins: state.origins || [] } : undefined,
    });
    // The app's theme follows localStorage['tc-theme'] (lib/themeScript.ts), not prefers-color-scheme:
    // set it before any page script runs. (/embed, /share and /view take ?theme=dark instead.)
    await context.addInitScript((t) => {
        try { localStorage.setItem('tc-theme', t); } catch { /* storage blocked */ }
    }, dark ? 'dark' : 'light');
    const session = state?.sessionStorage || [];
    if (session.length) {
        await context.addInitScript(entries => {
            for (const e of entries) {
                if (e.origin !== location.origin) continue;
                for (const it of e.items) {
                    try { sessionStorage.setItem(it.name, it.value); } catch { /* ignore */ }
                }
            }
        }, session);
    }
    return context;
}

/**
 * Attach listeners that collect console errors, uncaught exceptions and
 * failed requests. Returns the arrays (filled as the page runs).
 */
export function watchPage(page, baseOrigin) {
    const report = { consoleErrors: [], pageErrors: [], failedRequests: [], inflight: new Set() };
    page.on('console', msg => {
        if (msg.type() === 'error') report.consoleErrors.push(msg.text().slice(0, 500));
    });
    page.on('pageerror', err => report.pageErrors.push(String(err?.stack || err).slice(0, 800)));
    page.on('request', req => {
        if (['fetch', 'xhr', 'document'].includes(req.resourceType())) report.inflight.add(req);
    });
    page.on('requestfinished', req => report.inflight.delete(req));
    page.on('requestfailed', req => {
        report.inflight.delete(req);
        const reason = req.failure()?.errorText || 'failed';
        if (reason.includes('ERR_ABORTED')) return; // navigations / cancelled polls
        report.failedRequests.push(`${req.method()} ${req.url().slice(0, 300)} – ${reason}`);
    });
    page.on('response', res => {
        const status = res.status();
        if (status >= 400) {
            const url = res.url();
            const sameOrigin = baseOrigin ? url.startsWith(baseOrigin) : true;
            report.failedRequests.push(`${status} ${res.request().method()} ${url.slice(0, 300)}${sameOrigin ? '' : ' (3rd party)'}`);
        }
    });
    return report;
}

/** Wait until no fetch/xhr has been in flight for `quietMs`, at most `maxMs`. */
export async function settle(page, report, { quietMs = 1200, maxMs = 20000 } = {}) {
    const start = Date.now();
    let quietSince = Date.now();
    while (Date.now() - start < maxMs) {
        // Ignore long-lived streams (SSE) so they do not block forever.
        const busy = [...report.inflight].filter(r => !/\/(stream|events|sse)\b/.test(r.url())).length > 0;
        if (busy) quietSince = Date.now();
        else if (Date.now() - quietSince >= quietMs) return;
        await page.waitForTimeout(200);
    }
}

/** Resolve to `fallback` if `promise` takes longer than `ms`. */
export function withTimeout(promise, ms, fallback = null) {
    return Promise.race([promise.catch(() => fallback), new Promise(r => setTimeout(() => r(fallback), ms))]);
}

/** Next.js dev-overlay issue count; 0 for non-HTML documents. */
export async function devIssueCount(page) {
    return withTimeout(page.evaluate(() => {
        if (document.contentType !== 'text/html') return 0;
        const text = document.querySelector('nextjs-portal')?.shadowRoot?.textContent || '';
        const m = /(\d+)\s+Issues?/.exec(text);
        return m ? Number(m[1]) : 0;
    }), 5000, 0);
}

/** Hide the Next.js dev badge/overlay before a screenshot (HTML pages only). */
export async function hideDevUi(page) {
    await withTimeout(page.evaluate(() => {
        if (document.contentType !== 'text/html') return;
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal{display:none!important}';
        document.head?.appendChild(style);
    }), 5000);
}
