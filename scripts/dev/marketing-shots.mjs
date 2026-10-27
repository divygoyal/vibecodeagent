#!/usr/bin/env node
/**
 * Regenerate the home page's product-tour pictures (web/public/marketing/*.webp) from the REAL app, so they never
 * go stale. App screens are opened through the public live demo (`/demo?to=<path>`), the way a visitor sees them.
 *
 *   node scripts/dev/marketing-shots.mjs <webPort> <outDir> [--only site,fixes] [--keep-png]
 *
 * Each shot is a crop of the part that matters (site overview, fix list, AI traffic, a dashboard, an Ask answer), not
 * the whole window: desktop = the content column of a 1024x900 viewport at 2x (~760 css px, the width the home page's
 * feature rows show it at, so text stays at its own size), mobile = the 390 px phone layout at 2x; both kept at 2x.
 * The bottom of every crop snaps to the last whole card, so no card edge is cut. Both themes. Output: <outDir>/<name>-<desktop|mobile>-<light|dark>.<hash>.webp, tourImages.json (the
 * manifest the home page imports: names + pixel sizes; run the whole set, not --only, before copying it) and shots.json.
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
 *   rm -f web/public/marketing/*.webp
 *   rsync -a --include='*.webp' --exclude='*' worker1:/root/trafficclaw-test/tmp/marketing/ web/public/marketing/
 *   scp worker1:/root/trafficclaw-test/tmp/marketing/tourImages.json web/src/components/marketing/home/tourImages.json
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
import { createHash } from 'node:crypto';
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
    // Each crop shows what its feature row on the home page says (see the bullets in app/(marketing)/page.tsx).
    // `height` is the most a crop may take; the bottom then snaps to the last whole card, so no card edge is cut.
    { name: 'site', path: `/dashboard/s/${SITE}`, crop: { from: 'main', height: { desktop: 560, mobile: 660 } } },
    {
        name: 'fixes',
        path: `/dashboard/s/${SITE}/actions`,
        prepare: async (page, mobile) => {
            // Desktop: the first task with its suggested fix open; phones: the task card as it opens.
            const btn = page.getByRole('button', { name: 'Suggested fix' }).first();
            if (!mobile && (await btn.count())) await btn.click();
        },
        // Phones: exactly the first task card.
        crop: { from: { desktop: 'main', mobile: 'card:High impact' }, offset: -12, whole: { mobile: true }, height: { desktop: 640, mobile: 900 } },
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
        // Wider window so all five KPI tiles fit (at 1024 the strip scrolls); shown full width on the home page.
        viewport: { desktop: { width: 1280, height: 900 } },
        // The KPI card: the AI traffic tile selected and its daily chart.
        crop: { from: 'card:AI traffic per day', offset: -12, height: { desktop: 620, mobile: 640 } },
    },
    {
        name: 'dashboards',
        // Wider window: the dashboard's scorecard row needs ~1000 px; the home page shows this one full width.
        viewport: { desktop: { width: 1280, height: 900 } },
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
        // Phones: from the first chart (the scorecard row scrolls sideways on phones and would look cut).
        crop: { from: { desktop: 'main', mobile: 'text=Search' }, offset: -14, height: { desktop: 860, mobile: 720 } },
    },
    {
        name: 'ask',
        path: '/dashboard/ask',
        prepare: async (page, mobile, report) => {
            // Desktop: a question and its sample answer; phones: the start screen with its question cards (the
            // answer's tables scroll sideways on a phone).
            const q = page.getByRole('button', { name: /grew the most/i }).first();
            if (!mobile && (await q.count())) {
                await q.click();
                await settle(page, report);
                await page.waitForTimeout(1500);
            }
        },
        crop: { from: { desktop: 'text=Which of my sites grew the most', mobile: 'text=Ask anything about' }, offset: -20, height: { desktop: 560, mobile: 640 } },
    },
];

const VIEWPORTS = {
    // 1024 px: the app with its sidebar, content column ~730 css px, the width the home page shows it at.
    desktop: { viewport: { width: 1024, height: 900 }, deviceScaleFactor: 2, outWidth: null },
    mobile: {
        viewport: { width: 390, height: 1000 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        outWidth: null,
    },
};

/**
 * Crop rectangle in page coordinates: the app's content column (no sidebar, no top bars), from `from` down.
 * Desktop crops are about 1030 css px wide, so on the home page (~1150 px) the text renders at full size.
 */
async function cropRect(page, crop, form) {
    return page.evaluate(({ crop, form }) => {
        const visible = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const pick = (sel) => {
            if (sel.startsWith('card:')) {
                // The outermost card (bordered, rounded box, under 1000 px tall) that holds this text.
                let n = pick(`text=${sel.slice(5)}`);
                let card = null;
                while (n && n !== document.body) {
                    const cs = getComputedStyle(n);
                    const card_ = (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0) && parseFloat(cs.borderBottomLeftRadius) > 0;
                    if (card_ && n.getBoundingClientRect().height < 1000) card = n;
                    n = n.parentElement;
                }
                return card;
            }
            if (sel.startsWith('text=')) {
                const t = sel.slice(5);
                // The innermost element whose text starts with it (an icon inside the line is fine).
                const hits = [...document.querySelectorAll('p,span,div,h1,h2,h3,li')].filter((n) => visible(n) && n.textContent?.trim().startsWith(t));
                return hits.find((n) => !hits.some((m) => m !== n && n.contains(m))) ?? null;
            }
            return document.querySelector(sel === 'main' ? '#main-content' : sel);
        };
        const main = document.querySelector('#main-content');
        const inner = main?.firstElementChild ?? main;
        const box = (crop.container ? pick(crop.container) : inner)?.getBoundingClientRect();
        const from = typeof crop.from === 'string' ? crop.from : crop.from[form];
        const start = pick(from);
        if (!box || !start) return null;
        const pad = form === 'mobile' ? 12 : 16;
        let top = start.getBoundingClientRect().top + window.scrollY + (crop.offset ?? 0);
        if (from === 'main') top = (inner?.getBoundingClientRect().top ?? 0) + window.scrollY - pad;
        top = Math.max(0, top);
        // Snap the bottom to the end of the last card that fits whole, so no card edge is cut. A bordered,
        // rounded box is a card; a bottom is only usable if no other card straddles it.
        const limit = top + crop.height[form];
        const cards = [...(main ?? document.body).querySelectorAll('*')].map((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const bordered = parseFloat(cs.borderBottomWidth) > 0 && parseFloat(cs.borderBottomLeftRadius) > 0;
            return bordered && r.height > 24 && r.width > 80 ? { t: r.top + window.scrollY, b: r.bottom + window.scrollY } : null;
        }).filter(Boolean);
        const straddles = (y) => cards.some((c) => c.t < y - 1 && c.b > y + 1);
        const bottoms = cards.filter((c) => c.t >= top - 1 && c.b <= limit).map((c) => c.b).sort((a, b) => b - a);
        let bottom = bottoms.find((b) => !straddles(b + 1)) ?? limit;
        if (crop.whole?.[form]) bottom = start.getBoundingClientRect().bottom + window.scrollY;
        // Air under it, but never into the next card.
        const nextTop = Math.min(...cards.filter((c) => c.t > bottom).map((c) => c.t), Infinity);
        const end = Math.min(limit, bottom + pad, (bottom + nextTop) / 2);
        const height = Math.round(end - top);
        const x = Math.max(0, box.left - pad);
        return { x, y: top, width: Math.min(document.documentElement.clientWidth - x, box.width + pad * 2), height };
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
        // Sticky and fixed top bars (app top bar, demo bar) would cover the top of a scrolled crop.
        for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if ((cs.position === 'sticky' || cs.position === 'fixed') && parseFloat(cs.top) === 0 && el.getBoundingClientRect().height < 140) el.style.visibility = 'hidden';
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

async function newContext(browser, form, theme, { storage, viewport }) {
    const { outWidth: _w, ...ctxOpts } = VIEWPORTS[form];
    const context = await browser.newContext({
        ...ctxOpts,
        ...(viewport ? { viewport } : {}),
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
                const storage = shot.storage && (shot.storage.desktop || shot.storage.mobile) ? shot.storage[form] : shot.storage;
                const context = await newContext(browser, form, theme, { storage, viewport: shot.viewport?.[form] });
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
                    const rect = await cropRect(page, shot.crop, form);
                    if (!rect) throw new Error('crop target not found');
                    // Scroll the crop to the top of the window and shoot the window: Chromium's full-page capture
                    // re-lays out phone pages and shifts them against the measured rectangle.
                    const scrolled = await page.evaluate((y) => { window.scrollTo(0, y); return window.scrollY; }, rect.y);
                    await page.waitForTimeout(400);
                    const vh = page.viewportSize().height;
                    const clip = { x: rect.x, y: rect.y - scrolled, width: rect.width, height: Math.min(rect.height, vh - (rect.y - scrolled)) };
                    await page.screenshot({ path: png, clip });
                    let img = sharp(png);
                    if (VIEWPORTS[form].outWidth) img = img.resize({ width: VIEWPORTS[form].outWidth });
                    const { data, info } = await img
                        .webp({ quality: 80, effort: 6, smartSubsample: true })
                        .toBuffer({ resolveWithObject: true });
                    // Content hash in the name: a new picture is a new URL, so no image cache can serve the old one.
                    const name = `${file}.${createHash('sha1').update(data).digest('hex').slice(0, 8)}.webp`;
                    fs.writeFileSync(path.join(opts.out, name), data);
                    if (!opts.keepPng) fs.unlinkSync(png);
                    results.push({ key: shot.name, form, theme, file: name, width: info.width, height: info.height, kb: Math.round(data.length / 1024), url: page.url() });
                    console.log(`ok   ${name} ${info.width}x${info.height} ${Math.round(data.length / 1024)} KB`);
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
// The manifest the home page reads (web/src/components/marketing/home/tourImages.json): file names and pixel sizes.
const manifest = {};
for (const r of results) {
    manifest[r.key] ??= {};
    manifest[r.key][r.form] ??= { width: r.width, height: r.height };
    manifest[r.key][r.form][r.theme] = `/marketing/${r.file}`;
}
fs.writeFileSync(path.join(opts.out, 'tourImages.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const total = results.reduce((s, r) => s + r.kb, 0);
console.log(`${results.length} images, ${total} KB total${failed ? `, ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
