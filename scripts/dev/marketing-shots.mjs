#!/usr/bin/env node
/**
 * Regenerate the home page's product-tour pictures (web/public/marketing/*.webp) from the REAL app, so they never
 * go stale. App screens are opened through the public live demo (`/demo?to=<path>`), the way a visitor sees them.
 *
 *   node scripts/dev/marketing-shots.mjs <webPort> <outDir> [--only site,fixes] [--keep-png]
 *
 * Each shot is a crop of the part that matters (the fix list, the dashboard, the AI traffic chart, the Ask answer...),
 * not the whole window: desktop = the content column of a 1280x900 viewport at 2x (about 1030 css px wide, so text is
 * full size on the home page), saved 1800 px wide; mobile = the top of the 390 px phone layout at 2x, saved 720 px
 * wide. Both themes. Output: <outDir>/<name>-<desktop|mobile>-<light|dark>.webp + shots.json (sizes).
 *
 * Run it where Playwright and an instance are (worker1, production build). From the main VPS:
 *
 *   scripts/dev/worker1.sh sync . && scripts/dev/worker1.sh build r3-home && scripts/dev/worker1.sh up r3-home 1
 *   ssh worker1 'cd /root/trafficclaw-test/src/r3-home && env -i PATH=/root/trafficclaw-test/node/bin:/usr/bin:/bin \
 *     HOME=/root/trafficclaw-test/home TMPDIR=/root/trafficclaw-test/tmp TZ=UTC \
 *     TC_PLAYWRIGHT_DIR=/root/trafficclaw-test/pw/node_modules/playwright \
 *     TC_CHROME=$(ls -d /root/ai-tutor-render/ms-playwright/chromium-*\/chrome-linux64/chrome | sort -V | tail -1) \
 *     FONTCONFIG_FILE=/root/trafficclaw-test/fontconfig/fonts.conf \
 *     node scripts/dev/marketing-shots.mjs <port printed by up> /root/trafficclaw-test/tmp/marketing'
 *   rsync -a --exclude=shots.json worker1:/root/trafficclaw-test/tmp/marketing/ web/public/marketing/
 *   scripts/dev/worker1.sh down r3-home
 *
 * Dev-only text is cleaned before each capture (a localhost URL becomes https://trafficclaw.com, the dev seed's
 * "demo site generated for local development" blurbs go). The home page labels every picture "sample data".
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
    console.error('usage: node scripts/dev/marketing-shots.mjs <webPort> <outDir> [--only a,b] [--keep-png]');
    process.exit(2);
}

const argv = process.argv.slice(2);
const opts = { port: null, out: null, only: null, keepPng: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') opts.only = new Set(argv[++i].split(',').filter(Boolean));
    else if (a === '--keep-png') opts.keepPng = true;
    else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else if (!opts.port) opts.port = a;
    else if (!opts.out) opts.out = a;
    else usage(`unexpected argument ${a}`);
}
if (!opts.port || !/^\d+$/.test(opts.port) || !opts.out) usage();

const BASE = `http://localhost:${opts.port}`;
const SITE = 'acmeanalytics.example';

/**
 * The shots. `path` is an app path (opened through /demo?to=) or, with `public`, a public page.
 * `prepare(page, mobile, report)` runs after the page settles (clicks); `crop` picks the rectangle (cropRect).
 */
const SHOTS = [
    {
        // The table layout (the hero already shows the cards): every site in one sortable list.
        name: 'portfolio',
        path: '/dashboard',
        storage: { 'tc-portfolio-trend': '0', 'tc-portfolio-layout': 'table' },
        crop: { from: 'main', height: { desktop: 700, mobile: 760 } },
    },
    { name: 'site', path: `/dashboard/s/${SITE}`, crop: { from: 'main', height: { desktop: 700, mobile: 760 } } },
    {
        name: 'fixes',
        path: `/dashboard/s/${SITE}/actions`,
        prepare: async (page) => {
            const btn = page.getByRole('button', { name: 'Suggested fix' }).first();
            if (await btn.count()) await btn.click();
        },
        crop: { from: 'main', height: { desktop: 700, mobile: 760 } },
    },
    {
        name: 'traffic',
        path: `/dashboard/s/${SITE}/traffic`,
        prepare: async (page) => {
            const tile = page.getByRole('tab', { name: /^AI traffic/ }).first();
            if (await tile.count()) {
                await tile.click();
                await page.waitForTimeout(900);
            }
        },
        crop: { from: 'main', height: { desktop: 700, mobile: 760 } },
    },
    {
        name: 'dashboards',
        path: '/dashboard/dashboards',
        prepare: async (page, mobile, report) => {
            // The first sample dashboard (not a template link).
            const href = await page.$$eval('main a[href^="/dashboard/dashboards/"]', (as) =>
                as.map((a) => a.getAttribute('href')).find((h) => /\/dashboard\/dashboards\/[0-9a-f-]{36}$/.test(h)));
            if (href) {
                await page.goto(`${BASE}${href}`, { waitUntil: 'load' });
                await settle(page, report);
                await page.waitForTimeout(1200);
            }
        },
        crop: { from: 'main', height: { desktop: 700, mobile: 760 } },
    },
    {
        name: 'leaderboard',
        path: '/leaderboard',
        public: true,
        crop: { from: 'text=Ranked by', offset: -10, height: { desktop: 600, mobile: 760 }, container: 'main' },
    },
    {
        name: 'ask',
        path: '/dashboard/ask',
        prepare: async (page, mobile, report) => {
            const q = page.getByRole('button', { name: /grew the most/i }).first();
            if (await q.count()) {
                await q.click();
                await settle(page, report);
                await page.waitForTimeout(1500);
            }
        },
        crop: { from: 'text=Which of my sites grew the most', offset: -28, height: { desktop: 640, mobile: 760 } },
    },
];

const VIEWPORTS = {
    desktop: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, outWidth: 1800 },
    mobile: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        outWidth: 720,
    },
};

/**
 * Crop rectangle in page coordinates: the app's content column (no sidebar, no top bars), from `from` down.
 * Desktop crops are about 1030 css px wide, so on the home page (~1150 px) the text renders at full size.
 */
async function cropRect(page, crop, form) {
    return page.evaluate(({ crop, form }) => {
        const pick = (sel) => {
            if (sel.startsWith('text=')) {
                const t = sel.slice(5);
                return [...document.querySelectorAll('p,span,div,h1,h2,h3')].find((n) => n.childElementCount === 0 && n.textContent?.trim().startsWith(t)) ?? null;
            }
            return document.querySelector(sel === 'main' ? '#main-content' : sel);
        };
        const main = document.querySelector('#main-content');
        const inner = main?.firstElementChild ?? main;
        const box = (crop.container ? pick(crop.container) : inner)?.getBoundingClientRect();
        const start = pick(crop.from);
        if (!box || !start) return null;
        const pad = form === 'mobile' ? 12 : 16;
        let top = start.getBoundingClientRect().top + window.scrollY + (crop.offset ?? 0);
        if (crop.from === 'main') top = (inner?.getBoundingClientRect().top ?? 0) + window.scrollY - pad;
        const height = crop.height[form];
        const x = Math.max(0, box.left - pad);
        return { x, y: Math.max(0, top), width: Math.min(document.documentElement.clientWidth - x, box.width + pad * 2), height };
    }, { crop, form });
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
        // Fixed bars (the phone tab bar) would sit on top of the crop.
        for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed' && parseFloat(cs.bottom) === 0 && el.getBoundingClientRect().height < 140) el.style.display = 'none';
        }
        // Chat widgets and toasts never belong in a product picture.
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal,[data-sonner-toaster],iframe[title*="chat" i]{display:none!important}*{caret-color:transparent!important}';
        document.head.appendChild(style);
    }, origin);
}

async function newContext(browser, form, theme, { storage }) {
    const { outWidth: _w, ...ctxOpts } = VIEWPORTS[form];
    const context = await browser.newContext({
        ...ctxOpts,
        colorScheme: theme,
        reducedMotion: 'reduce',
        timezoneId: 'UTC',
        locale: 'en-US',
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
const browser = await launchBrowser();
const results = [];
let failed = 0;
try {
    for (const shot of SHOTS) {
        if (opts.only && !opts.only.has(shot.name)) continue;
        for (const form of ['desktop', 'mobile']) {
            for (const theme of ['light', 'dark']) {
                const file = `${shot.name}-${form}-${theme}`;
                const context = await newContext(browser, form, theme, { storage: shot.storage });
                const page = await context.newPage();
                const report = watchPage(page, BASE);
                try {
                    // App screens go through the public live demo, exactly as a visitor gets them (a browser
                    // navigation, so the demo starts; scripts that use fetch cannot start one).
                    const url = shot.public ? `${BASE}${shot.path}` : `${BASE}/demo?to=${shot.path}`;
                    const res = await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
                    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
                    if (!shot.public && !new URL(page.url()).pathname.startsWith('/dashboard')) throw new Error(`demo did not start (${page.url()})`);
                    await settle(page, report);
                    await page.waitForTimeout(1200);
                    if (shot.prepare) await shot.prepare(page, form === 'mobile', report);
                    await settle(page, report, { quietMs: 600, maxMs: 8000 });
                    await page.mouse.move(1, 1);
                    await cleanDevText(page, BASE);
                    await page.waitForTimeout(300);
                    const png = path.join(opts.out, `${file}.png`);
                    const clip = await cropRect(page, shot.crop, form);
                    if (!clip) throw new Error('crop target not found');
                    await page.screenshot({ path: png, clip, fullPage: true });
                    const webp = path.join(opts.out, `${file}.webp`);
                    const info = await sharp(png)
                        .resize({ width: VIEWPORTS[form].outWidth })
                        .webp({ quality: 76, effort: 6, smartSubsample: true })
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
