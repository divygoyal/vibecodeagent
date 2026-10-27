#!/usr/bin/env node
/**
 * Regenerate the home page's product screenshots (web/public/marketing/*.webp)
 * from the REAL app on demo data, so they never go stale.
 *
 *   node scripts/dev/marketing-shots.mjs <webPort> <outDir> [--state file] [--only site,fixes] [--keep-png]
 *
 * Each shot is taken twice per theme (light, dark): desktop (1280x800 viewport at 2x, the app with its sidebar)
 * and mobile (390x760 at 2x). Output: <outDir>/<name>-<desktop|mobile>-<light|dark>.webp (sharp, quality 78,
 * desktop resized to 1600 px wide, mobile 780 px wide). The home page reads them from /marketing/<file>.
 *
 * Run it where Playwright and a demo-data instance are (worker1, production build). From the main VPS:
 *
 *   scripts/dev/worker1.sh sync . && scripts/dev/worker1.sh build r3-home && scripts/dev/worker1.sh up r3-home 1
 *   ssh worker1 'cd /root/trafficclaw-test/src/r3-home && env -i PATH=/root/trafficclaw-test/node/bin:/usr/bin:/bin \
 *     HOME=/root/trafficclaw-test/home TMPDIR=/root/trafficclaw-test/tmp TZ=UTC \
 *     TC_PLAYWRIGHT_DIR=/root/trafficclaw-test/pw/node_modules/playwright \
 *     TC_CHROME=$(ls -d /root/ai-tutor-render/ms-playwright/chromium-*\/chrome-linux64/chrome | sort -V | tail -1) \
 *     FONTCONFIG_FILE=/root/trafficclaw-test/fontconfig/fonts.conf \
 *     node scripts/dev/marketing-shots.mjs 3201 /root/trafficclaw-test/tmp/marketing \
 *       --state /root/trafficclaw-test/dev-home/r3-home-1/state.json'
 *   rsync -a worker1:/root/trafficclaw-test/tmp/marketing/ web/public/marketing/
 *   scripts/dev/worker1.sh down r3-home
 *
 * Dev-only text is cleaned before each capture (the localhost MCP URL becomes https://trafficclaw.com/mcp, the
 * seeded dashboard's "Seeded by ..." line and the "demo site generated for local development" blurbs go), so the
 * pictures show what production shows. Every picture is captioned "sample data" on the home page.
 * Exit code: 0 ok, 1 a shot failed, 2 bad usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launchBrowser, settle, watchPage } from './pw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const requireWeb = createRequire(path.join(HERE, '../../web/package.json'));

function usage(msg) {
    if (msg) console.error(`marketing-shots.mjs: ${msg}`);
    console.error('usage: node scripts/dev/marketing-shots.mjs <webPort> <outDir> [--state file] [--only a,b] [--keep-png]');
    process.exit(2);
}

const argv = process.argv.slice(2);
const opts = { port: null, out: null, state: null, only: null, keepPng: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--state') opts.state = argv[++i];
    else if (a === '--only') opts.only = new Set(argv[++i].split(',').filter(Boolean));
    else if (a === '--keep-png') opts.keepPng = true;
    else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else if (!opts.port) opts.port = a;
    else if (!opts.out) opts.out = a;
    else usage(`unexpected argument ${a}`);
}
if (!opts.port || !/^\d+$/.test(opts.port) || !opts.out) usage();
if (opts.state && !fs.existsSync(opts.state)) usage(`state file not found: ${opts.state}`);

const BASE = `http://localhost:${opts.port}`;
const SITE = 'acmeanalytics.example';

/**
 * The shots. `path` is a function of the seed ids (the seeded custom dashboard has a random id).
 * `prepare(page, mobile)` runs after the page settles: clicks, scrolls. `scrollTo` is a CSS/text selector
 * scrolled to the top of the viewport (with `offset` px of air above it).
 */
const SHOTS = [
    {
        name: 'portfolio',
        path: () => '/dashboard',
        storage: { 'tc-portfolio-trend': '1', 'tc-portfolio-layout': 'grid' },
    },
    { name: 'site', path: () => `/dashboard/s/${SITE}` },
    {
        name: 'fixes',
        path: () => `/dashboard/s/${SITE}/actions`,
        prepare: async (page) => {
            const btn = page.getByRole('button', { name: 'Suggested fix' }).first();
            if (await btn.count()) await btn.click();
        },
    },
    {
        name: 'traffic',
        path: () => `/dashboard/s/${SITE}/traffic`,
        prepare: async (page, mobile) => {
            const ai = page.getByRole('tab', { name: /^AI/ }).first();
            if (await ai.count()) {
                await ai.scrollIntoViewIfNeeded();
                await ai.click();
                await page.waitForTimeout(800);
            }
            await scrollToText(page, 'Sources', mobile ? 72 : 24);
        },
    },
    { name: 'dashboards', path: (seed) => (seed.dashboardId ? `/dashboard/dashboards/${seed.dashboardId}` : '/dashboard/dashboards') },
    {
        name: 'leaderboard',
        path: () => '/leaderboard',
        prepare: async (page, mobile) => {
            await scrollToText(page, 'Ranked by', mobile ? 120 : 190);
        },
        anonymous: true,
    },
    { name: 'mcp', path: () => '/dashboard/connect-ai' },
];

const VIEWPORTS = {
    desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, outWidth: 1600 },
    mobile: {
        viewport: { width: 390, height: 760 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        outWidth: 780,
    },
};

async function scrollToText(page, text, offset) {
    await page.evaluate(({ text, offset }) => {
        const el = [...document.querySelectorAll('h2,h3,p,span,div')].find((n) => n.childElementCount === 0 && n.textContent?.trim() === text)
            ?? [...document.querySelectorAll('p,span')].find((n) => n.textContent?.trim().startsWith(text));
        if (!el) return;
        const scroller = document.scrollingElement || document.documentElement;
        const y = el.getBoundingClientRect().top + window.scrollY - offset;
        scroller.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
    }, { text, offset });
    await page.waitForTimeout(400);
}

/** Remove dev-only strings so the image matches production. */
async function cleanDevText(page, origin) {
    await page.evaluate((origin) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const hide = [/Seeded by scripts\/dev/i, /demo site generated for local development/i];
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const n of nodes) {
            if (n.nodeValue.includes(origin)) n.nodeValue = n.nodeValue.split(origin).join('https://trafficclaw.com');
            if (hide.some((re) => re.test(n.nodeValue))) {
                const el = n.parentElement;
                if (el) el.style.visibility = 'hidden';
            }
        }
        for (const input of document.querySelectorAll('input')) {
            if (input.value.includes(origin)) input.value = input.value.split(origin).join('https://trafficclaw.com');
        }
        // Chat widgets and toasts never belong in a product picture.
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal,[data-sonner-toaster],iframe[title*="chat" i]{display:none!important}*{caret-color:transparent!important}';
        document.head.appendChild(style);
    }, origin);
}

function readSeed() {
    if (!opts.state) return {};
    try {
        const seed = JSON.parse(fs.readFileSync(path.join(path.dirname(opts.state), 'seed.json'), 'utf8'));
        return seed.demo ?? {};
    } catch {
        return {};
    }
}

async function newContext(browser, form, theme, { stateFile, storage }) {
    const { outWidth: _w, ...ctxOpts } = VIEWPORTS[form];
    const state = stateFile ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
    const context = await browser.newContext({
        ...ctxOpts,
        colorScheme: theme,
        reducedMotion: 'reduce',
        timezoneId: 'UTC',
        locale: 'en-US',
        storageState: state ? { cookies: state.cookies || [], origins: state.origins || [] } : undefined,
    });
    await context.addInitScript(({ theme, storage }) => {
        try {
            localStorage.setItem('tc-theme', theme);
            for (const [k, v] of Object.entries(storage || {})) localStorage.setItem(k, v);
        } catch { /* storage blocked */ }
    }, { theme, storage });
    return context;
}

const sharp = requireWeb('sharp');
fs.mkdirSync(opts.out, { recursive: true });
const seed = readSeed();
const browser = await launchBrowser();
const results = [];
let failed = 0;
try {
    for (const shot of SHOTS) {
        if (opts.only && !opts.only.has(shot.name)) continue;
        for (const form of ['desktop', 'mobile']) {
            for (const theme of ['light', 'dark']) {
                const file = `${shot.name}-${form}-${theme}`;
                const context = await newContext(browser, form, theme, { stateFile: shot.anonymous ? null : opts.state, storage: shot.storage });
                const page = await context.newPage();
                const report = watchPage(page, BASE);
                try {
                    const res = await page.goto(`${BASE}${shot.path(seed)}`, { waitUntil: 'load', timeout: 120_000 });
                    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
                    await settle(page, report);
                    await page.waitForTimeout(1200);
                    if (shot.prepare) await shot.prepare(page, form === 'mobile');
                    await settle(page, report, { quietMs: 600, maxMs: 8000 });
                    await page.mouse.move(1, 1);
                    await cleanDevText(page, BASE);
                    await page.waitForTimeout(300);
                    const png = path.join(opts.out, `${file}.png`);
                    await page.screenshot({ path: png });
                    const webp = path.join(opts.out, `${file}.webp`);
                    const info = await sharp(png)
                        .resize({ width: VIEWPORTS[form].outWidth })
                        .webp({ quality: 78, effort: 6, smartSubsample: true })
                        .toFile(webp);
                    if (!opts.keepPng) fs.unlinkSync(png);
                    results.push({ file: `${file}.webp`, width: info.width, height: info.height, kb: Math.round(info.size / 1024), url: page.url() });
                    console.log(`ok   ${file}.webp ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
                } catch (err) {
                    failed++;
                    console.error(`FAIL ${file}: ${err.message}`);
                } finally {
                    await context.close();
                }
            }
        }
    }
} finally {
    await browser.close();
}
fs.writeFileSync(path.join(opts.out, 'shots.json'), JSON.stringify(results, null, 2));
const total = results.reduce((s, r) => s + r.kb, 0);
console.log(`${results.length} images, ${total} KB total${failed ? `, ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
