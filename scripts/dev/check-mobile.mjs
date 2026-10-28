#!/usr/bin/env node
/**
 * Mobile layout audit: every page route at phone widths, with touch, in light
 * (and dark for /dashboard routes). Finds what a phone user would hit:
 *
 *   overflow     the page scrolls sideways (documentElement.scrollWidth > the phone's width; not innerWidth, which
 *                a mobile browser widens to fit content that is too wide, hiding the problem)
 *   offscreen    elements whose box goes past the viewport edge (outermost only; elements
 *                inside a horizontal scroll container are skipped, they are meant to scroll)
 *   clipped      text or controls cut by an overflow:hidden ancestor (straddling its edge)
 *   textClipped  text cut by its own box without an ellipsis (horizontally or vertically)
 *   textSpill    text running out of its box (long words, nowrap) without being clipped
 *   smallTargets tap targets under 32 px (inline links inside a sentence are exempt)
 *   tabbar       fixed/sticky elements overlapping the bottom tab bar
 *   tabbarEnd    content still hidden behind the tab bar when scrolled to the end
 *   error        an error boundary ("Something went wrong"), HTTP >= 500 or an uncaught exception
 *   badText      "NaN", "undefined", "Infinity", "[object Object]", "Invalid Date" on screen
 *   loading      spinners/skeletons still visible after the page settled
 *   api          same-origin /api/* answers >= 500, or any error answer that is not JSON
 *
 *   node scripts/dev/check-mobile.mjs <webPort | baseUrl> [--label name] [--out dir]
 *        [--widths 360,390,414] [--themes light,dark] [--user demo|demo2|admin] [--state file]
 *        [--host h1,h2] [--only /a,/b] [--skip /a,/b] [--part k/n] [--wait ms] [--no-shots]
 *        [--fail-on error,overflow,offscreen] [--settle ms] [--spinner-wait ms] [--cookie name=value] [--paths /a,/b?x=1]
 *
 * One page load per route and theme; the viewport is resized to each width.
 * Output: <out>/mobile-<label>.json, <out>/mobile-<label>.md and offender
 * screenshots (outlined in red) in <out>/mobile-<label>/. Results of earlier
 * parts with the same label merge. Default out: /root/projects/tc-redesign-research/robust.
 * Stops (exit 3) when MemAvailable < 1800 MB. Exit 1 when a --fail-on category is hit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, MOBILE, settle, watchPage, withTimeout } from './pw.mjs';
import { discoverRoutes, fillRoute, findInstance, memAvailableMb, routeSlug } from './routes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const THIRD_PARTY = /tawk\.to|cloudflareinsights|googletagmanager|google-analytics\.com|clarity\.ms|bing\.com|platform\.twitter\.com|reddit(media)?\.com|dicebear|googleusercontent|google\.com\/s2\/favicons|mapbox|fonts\.g/;

function usage(msg) {
    if (msg) console.error(`check-mobile: ${msg}`);
    console.error('usage: node scripts/dev/check-mobile.mjs <webPort|baseUrl> [--label name] [--out dir] [--widths 360,390,414] [--themes light,dark] [--user u] [--state f|none] [--host h1,h2] [--only /a,/b] [--skip /a] [--part k/n] [--wait ms] [--no-shots] [--fail-on error,overflow,offscreen]');
    process.exit(2);
}

const argv = process.argv.slice(2);
const opts = {
    target: null, label: null, out: '/root/projects/tc-redesign-research/robust', widths: [390, 360, 414], themes: ['light', 'dark'],
    user: 'demo', state: null, hosts: ['acmeanalytics.example'], only: null, paths: null, skip: [], part: null, wait: 800, shots: true,
    failOn: ['error', 'overflow', 'offscreen'], settleMs: 25_000, spinnerWait: 20_000, cookies: [],
};
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const list = () => argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    if (a === '--label') opts.label = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--widths') opts.widths = list().map(Number);
    else if (a === '--themes') opts.themes = list();
    else if (a === '--user') opts.user = argv[++i];
    else if (a === '--state') opts.state = argv[++i];
    else if (a === '--host') opts.hosts = list();
    else if (a === '--only') opts.only = list();
    else if (a === '--paths') opts.paths = list();
    else if (a === '--skip') opts.skip = list();
    else if (a === '--part') {
        const m = /^(\d+)\/(\d+)$/.exec(argv[++i] || '');
        if (!m || +m[1] < 1 || +m[1] > +m[2]) usage('--part wants k/n');
        opts.part = [+m[1], +m[2]];
    } else if (a === '--wait') opts.wait = Number(argv[++i]);
    else if (a === '--no-shots') opts.shots = false;
    else if (a === '--fail-on') opts.failOn = list();
    else if (a === '--settle') opts.settleMs = Number(argv[++i]);
    else if (a === '--spinner-wait') opts.spinnerWait = Number(argv[++i]);
    else if (a === '--cookie') {
        const [name, ...rest] = argv[++i].split('=');
        opts.cookies.push({ name, value: rest.join('=') });
    }
    else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else if (!opts.target) opts.target = a;
    else usage(`unexpected argument ${a}`);
}
if (!opts.target) usage();

// ---------------------------------------------------------------- target, login state, routes
let base;
let inst = null;
if (/^\d+$/.test(opts.target)) {
    inst = findInstance(Number(opts.target));
    if (!inst) usage(`no dev instance with web port ${opts.target}`);
    base = `http://localhost:${opts.target}`;
} else {
    base = opts.target.replace(/\/$/, '');
    try { inst = findInstance(Number(new URL(base).port)); } catch { inst = null; }
}
const baseUrl = new URL(base);
const repo = inst?.REPO || path.resolve(here, '../..');
let stateFile = opts.state === 'none' ? null : opts.state;
if (!stateFile && opts.state !== 'none' && inst) {
    const f = path.join(inst.dir, opts.user === 'demo' ? 'state.json' : `state-${opts.user}.json`);
    if (fs.existsSync(f)) stateFile = f;
}
const seed = inst && fs.existsSync(path.join(inst.dir, 'seed.json')) ? JSON.parse(fs.readFileSync(path.join(inst.dir, 'seed.json'), 'utf8')) : {};
opts.label = opts.label || `${baseUrl.hostname === 'localhost' ? `dev${baseUrl.port}` : baseUrl.hostname}-${opts.user}`;

let routes = [];
for (const pattern of discoverRoutes(path.join(repo, 'web', 'src', 'app'))) {
    if (pattern.startsWith('/dashboard/s/[host]')) {
        for (const host of opts.hosts) routes.push({ pattern: opts.hosts.length > 1 ? `${pattern}#${host}` : pattern, path: fillRoute(pattern, seed, { user: opts.user, host }) });
    } else {
        routes.push({ pattern, path: fillRoute(pattern, seed, { user: opts.user }) });
    }
}
if (opts.paths) routes = opts.paths.map((p) => ({ pattern: p, path: p })); // explicit URLs instead of the route list
else if (opts.only) routes = routes.filter((r) => opts.only.some((o) => r.pattern === o || r.path === o || r.pattern.split('#')[0] === o || (o !== '/' && r.pattern.startsWith(o.endsWith('/') ? o : `${o}/`))));
if (opts.skip.length) routes = routes.filter((r) => !opts.skip.includes(r.pattern) && !opts.skip.includes(r.path));
routes = routes.filter((r) => !r.path.includes('missing-seed'));
if (opts.part) {
    const [k, n] = opts.part;
    const size = Math.ceil(routes.length / n);
    routes = routes.slice((k - 1) * size, k * size);
}
const isApp = (p) => p === '/dashboard' || p.startsWith('/dashboard/');

// ---------------------------------------------------------------- in-page audit
/* eslint-disable no-undef */
function pageAudit(screenWidth) {
    // A phone widens the layout viewport (innerWidth) to fit content that is too wide, so measure against the
    // width the page was asked to fit (round 5 Ask demo: innerWidth 524 on a 390 phone, nothing flagged).
    const vw = Math.min(window.innerWidth, screenWidth || window.innerWidth);
    const vh = window.innerHeight;
    const doc = document.documentElement;
    window.__mcSeq = window.__mcSeq || 0;
    const mark = (el) => {
        if (!el.dataset.mcId) el.dataset.mcId = String(++window.__mcSeq);
        return el.dataset.mcId;
    };
    // Map libraries clip their own markers and tiles on purpose.
    const IGNORE = 'nextjs-portal, script, style, noscript, template, iframe, [data-mc-ignore], .maplibregl-map, .mapboxgl-map, .leaflet-container';
    const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=option], [role=slider], [tabindex]:not([tabindex="-1"])';
    const cssPath = (el) => {
        const parts = [];
        for (let n = el, i = 0; n && n !== document.body && i < 3; n = n.parentElement, i++) {
            let s = n.tagName.toLowerCase();
            if (n.id) s += `#${n.id}`;
            const cls = (n.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, i === 0 ? 5 : 2);
            if (cls.length) s += `.${cls.join('.')}`;
            parts.unshift(s);
        }
        return parts.join(' > ');
    };
    const desc = (el, extra = {}) => {
        const r = el.getBoundingClientRect();
        const text = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        return { id: mark(el), sel: cssPath(el), text, x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height), ...extra };
    };
    const visible = (el) => {
        if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    const srOnly = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 2 && r.height <= 2) return true;
        const cs = getComputedStyle(el);
        return cs.clip && cs.clip !== 'auto' && /rect\(0/.test(cs.clip);
    };
    const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const interactive = (el) => el.matches(INTERACTIVE);
    const meaningful = (el) => hasText(el) || interactive(el);
    const decorative = (el) => Boolean(el.closest('[aria-hidden="true"]'));
    const scrollerAncestor = (el) => {
        for (let a = el.parentElement; a && a !== doc; a = a.parentElement) {
            const ox = getComputedStyle(a).overflowX;
            if (ox === 'auto' || ox === 'scroll') return a;
        }
        return null;
    };
    const clipAncestor = (el, axis = 'x') => {
        for (let a = el.parentElement; a && a !== doc; a = a.parentElement) {
            const cs = getComputedStyle(a);
            const o = axis === 'x' ? cs.overflowX : cs.overflowY;
            if (o === 'visible') continue;
            if (o === 'auto' || o === 'scroll') return { kind: 'scroll', a };
            return { kind: 'clip', a };
        }
        return null;
    };

    const all = [...document.body.querySelectorAll('*')].filter((el) => !el.closest(IGNORE) && !(el instanceof SVGElement && el.ownerSVGElement));
    const vis = all.filter((el) => visible(el) && !srOnly(el));

    const out = { vw, vh, scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth), overflow: false, offscreen: [], clipped: [], textClipped: [], textSpill: [], smallTargets: [], tabbar: [], error: null, badText: [], loading: [] };
    out.overflow = out.scrollWidth > vw + 1;
    out.appliedTheme = doc.getAttribute('data-theme'); // proves the dark pass really ran dark

    // offscreen: past the viewport edge, not inside a scroll container.
    const offscreenSet = new Set();
    for (const el of vis) {
        const r = el.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) continue;
        const cs = getComputedStyle(el);
        if ((cs.position === 'fixed' || cs.position === 'absolute') && (r.left >= vw || r.right <= 0)) continue; // off-canvas by design
        if (scrollerAncestor(el)) continue;
        const clip = clipAncestor(el);
        if (clip && (!meaningful(el) || decorative(el))) continue; // clipped decoration
        offscreenSet.add(el);
    }
    for (const el of offscreenSet) {
        let outer = true;
        for (let a = el.parentElement; a; a = a.parentElement) if (offscreenSet.has(a)) { outer = false; break; }
        if (outer) {
            const r = el.getBoundingClientRect();
            out.offscreen.push(desc(el, { right: Math.round(r.right), clippedBy: clipAncestor(el)?.a ? cssPath(clipAncestor(el).a).split(' > ').pop() : null }));
        }
    }

    // clipped: meaningful elements straddling the edge of an overflow:hidden ancestor (inside the viewport).
    const clippedSet = new Set();
    for (const el of vis) {
        if (!meaningful(el) || decorative(el) || offscreenSet.has(el)) continue;
        const r = el.getBoundingClientRect();
        for (const axis of ['x', 'y']) {
            const c = clipAncestor(el, axis);
            if (!c || c.kind !== 'clip') continue;
            const a = c.a;
            const ar = a.getBoundingClientRect();
            const acs = getComputedStyle(a);
            if (acs.textOverflow === 'ellipsis' || (acs.webkitLineClamp && acs.webkitLineClamp !== 'none')) continue;
            if (srOnly(a)) continue;
            const straddle = axis === 'x'
                ? (r.right > ar.right + 1 && r.left < ar.right - 1) || (r.left < ar.left - 1 && r.right > ar.left + 1)
                : (r.bottom > ar.bottom + 2 && r.top < ar.bottom - 2) || (r.top < ar.top - 2 && r.bottom > ar.top + 2);
            if (straddle) { clippedSet.add(el); break; }
        }
    }
    for (const el of clippedSet) {
        let outer = true;
        for (let a = el.parentElement; a; a = a.parentElement) if (clippedSet.has(a)) { outer = false; break; }
        if (outer) out.clipped.push(desc(el));
    }

    // Own text clipped (no ellipsis) or spilling out of its box.
    for (const el of vis) {
        if (!hasText(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'inline' || cs.display === 'contents') continue;
        const r = el.getBoundingClientRect();
        const padR = parseFloat(cs.paddingRight) || 0;
        let textRight = -Infinity;
        for (const n of el.childNodes) {
            if (n.nodeType !== 3 || !n.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const rr of range.getClientRects()) textRight = Math.max(textRight, rr.right);
        }
        const clipsX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
        const clipsY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
        const lineClamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
        if (textRight > r.right - padR + 2) {
            if (clipsX) { if (cs.textOverflow !== 'ellipsis' && !lineClamp) out.textClipped.push(desc(el, { axis: 'x', over: Math.round(textRight - r.right) })); }
            else if (!scrollerAncestor(el)) out.textSpill.push(desc(el, { over: Math.round(textRight - r.right) }));
        }
        if (clipsY && !lineClamp && el.scrollHeight > el.clientHeight + 3 && cs.textOverflow !== 'ellipsis') {
            out.textClipped.push(desc(el, { axis: 'y', over: el.scrollHeight - el.clientHeight }));
        }
    }

    // Tap targets. An absolutely positioned ::before/::after widens the hit area: `pointer-coarse:after:-inset-3`
    // on a positioned control, or a stretched link (`after:absolute after:inset-0`, the pseudo covers the nearest
    // positioned ancestor, e.g. the whole card). Its box is resolved against that containing block.
    const hitRect = (el) => {
        const r = el.getBoundingClientRect();
        let { left, top, right, bottom } = r;
        let cb = el;
        while (cb && getComputedStyle(cb).position === 'static') cb = cb.parentElement;
        if (cb && cb !== document.body && cb !== document.documentElement) {
            const cr = cb.getBoundingClientRect();
            for (const pseudo of ['::before', '::after']) {
                const ps = getComputedStyle(el, pseudo);
                if (ps.content === 'none' || ps.position !== 'absolute' || ps.display === 'none' || ps.pointerEvents === 'none') continue;
                const [t, b, l, rr] = [ps.top, ps.bottom, ps.left, ps.right].map(parseFloat);
                if (!Number.isNaN(t)) top = Math.min(top, cr.top + t);
                if (!Number.isNaN(b)) bottom = Math.max(bottom, cr.bottom - b);
                if (!Number.isNaN(l)) left = Math.min(left, cr.left + l);
                if (!Number.isNaN(rr)) right = Math.max(right, cr.right - rr);
            }
        }
        return { width: right - left, height: bottom - top };
    };
    out.coarse = matchMedia('(pointer: coarse)').matches;
    const seenTargets = new Map();
    const TAPPABLE = INTERACTIVE.replace(/, \[tabindex\]:not\(\[tabindex="-1"\]\)$/, ''); // tabindex-only spans are tooltip/focus stops, not tap targets
    for (const el of vis) {
        if (!el.matches(TAPPABLE) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
        const r = hitRect(el);
        if (r.width >= 32 && r.height >= 32) continue;
        const cs = getComputedStyle(el);
        const parent = el.parentElement;
        if (cs.display === 'inline' && parent && [...parent.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; // link inside a sentence
        const label = el.closest('label');
        if (label && label !== el) {
            const lr = label.getBoundingClientRect();
            if (lr.width >= 32 && lr.height >= 32) continue;
        }
        // An interactive ancestor that is big enough is the real target (e.g. an icon inside a button).
        const host = el.parentElement?.closest(INTERACTIVE);
        if (host) {
            const hr = host.getBoundingClientRect();
            if (hr.width >= 32 && hr.height >= 32) continue;
        }
        const d = desc(el);
        const key = `${d.sel}|${d.w}x${d.h}`;
        const prev = seenTargets.get(key);
        if (prev) prev.count++;
        else seenTargets.set(key, { ...d, count: 1 });
    }
    out.smallTargets = [...seenTargets.values()];

    // Fixed/sticky elements over the bottom tab bar.
    let bar = document.querySelector('nav[aria-label="Quick navigation"]');
    if (!bar || !visible(bar)) {
        bar = vis.find((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return cs.position === 'fixed' && Math.abs(r.bottom - vh) <= 2 && r.width >= vw * 0.9 && r.height <= 100 && el.querySelectorAll('a,button').length >= 3;
        }) || null;
    }
    if (bar && visible(bar)) {
        const br = bar.getBoundingClientRect();
        out.tabbarHeight = Math.round(br.height);
        for (const el of vis) {
            if (el === bar || bar.contains(el) || el.contains(bar)) continue;
            const cs = getComputedStyle(el);
            // Fixed elements, and sticky ones pinned to the bottom (a sticky first table column scrolls under the bar, which is fine).
            if (cs.position !== 'fixed' && !(cs.position === 'sticky' && cs.bottom !== 'auto')) continue;
            const r = el.getBoundingClientRect();
            const ox = Math.min(r.right, br.right) - Math.max(r.left, br.left);
            const oy = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top);
            if (ox > 2 && oy > 2 && !(r.width >= vw * 0.95 && r.height >= vh * 0.9)) out.tabbar.push(desc(el, { overlap: Math.round(oy), z: cs.zIndex }));
        }
    }

    // Error boundary / Next error page.
    const body = document.body.innerText || '';
    const em = /Something went wrong|Application error|Unhandled Runtime Error|Internal Server Error|This page couldn.t load|client-side exception/i.exec(body);
    if (em) out.error = em[0];

    // NaN / undefined on screen.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const BAD = /\bNaN\b|\bundefined\b|(?<![\w.-])-?Infinity\b|\[object Object\]|Invalid Date/;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const p = n.parentElement;
        if (!p || p.closest(`${IGNORE}, code, pre, textarea`)) continue;
        if (!BAD.test(n.textContent)) continue;
        if (!visible(p)) continue;
        out.badText.push(desc(p, { match: n.textContent.trim().slice(0, 80) }));
        if (out.badText.length >= 10) break;
    }
    for (const el of vis) {
        for (const attr of ['aria-label', 'title', 'alt']) {
            const v = el.getAttribute(attr);
            if (v && BAD.test(v) && out.badText.length < 10) out.badText.push(desc(el, { match: `${attr}="${v.slice(0, 60)}"` }));
        }
    }

    // Still loading.
    const spinners = vis.filter((el) => el.matches('[aria-busy="true"], .animate-spin, [data-skeleton], [role="progressbar"]:not([aria-valuenow]), .tc-skeleton, .skeleton'));
    const pulses = vis.filter((el) => el.matches('.animate-pulse') && el.getBoundingClientRect().width > 24);
    out.loading = [...spinners, ...pulses].slice(0, 6).map((el) => desc(el));
    out.loadingCount = spinners.length + pulses.length;
    return out;
}

/** After scrolling to the end: interactive/text content still under the tab bar. */
function tabbarEndAudit() {
    const bar = document.querySelector('nav[aria-label="Quick navigation"]');
    if (!bar || !bar.checkVisibility?.()) return [];
    const br = bar.getBoundingClientRect();
    const hits = [];
    const main = document.querySelector('main') || document.body;
    for (const el of main.querySelectorAll('a[href], button, input, select, textarea, h1, h2, h3, p, li')) {
        if (bar.contains(el) || !el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.bottom <= br.top + 2 || r.top >= br.bottom) continue;
        const cx = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
        const cy = Math.min(Math.max(r.top + r.height / 2, br.top + 1), br.bottom - 1);
        const top = document.elementFromPoint(cx, cy);
        if (top && bar.contains(top)) {
            hits.push({ sel: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(/\s+/).slice(0, 3).join('.')}`, text: (el.innerText || '').trim().slice(0, 50), covered: Math.round(Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top)) });
        }
    }
    return hits.slice(0, 5);
}
/* eslint-enable no-undef */

// ---------------------------------------------------------------- browser
async function makeContext(browser, theme) {
    let state = null;
    if (stateFile) {
        state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        if (baseUrl.hostname !== 'localhost') {
            state.cookies = (state.cookies || []).filter((c) => c.domain === 'localhost').map((c) => ({ ...c, domain: baseUrl.hostname, secure: baseUrl.protocol === 'https:' }));
            state.origins = (state.origins || []).slice(0, 1).map((o) => ({ ...o, origin: baseUrl.origin }));
        }
    }
    const context = await browser.newContext({
        ...MOBILE,
        colorScheme: theme === 'dark' ? 'dark' : 'light',
        reducedMotion: 'reduce',
        timezoneId: 'UTC',
        locale: 'en-US',
        storageState: state ? { cookies: state.cookies || [], origins: state.origins || [] } : undefined,
    });
    await context.addInitScript((t) => {
        try { localStorage.setItem('tc-theme', t); } catch { /* ignore */ }
    }, theme);
    if (opts.cookies.length) await context.addCookies(opts.cookies.map((c) => ({ ...c, domain: baseUrl.hostname, path: '/' })));
    const session = state?.sessionStorage || [];
    if (session.length) {
        await context.addInitScript((entries) => {
            for (const e of entries) for (const it of e.items) { try { sessionStorage.setItem(it.name, it.value); } catch { /* ignore */ } }
        }, session);
    }
    return context;
}

const shotDir = path.join(opts.out, `mobile-${opts.label}`);
const issueCount = (w) => (w.overflow ? 1 : 0) + w.offscreen.length + w.clipped.length + w.textClipped.length + w.tabbar.length + (w.tabbarEnd?.length || 0) + (w.error ? 1 : 0) + w.badText.length;

async function visit(context, route, theme) {
    const page = await context.newPage();
    const watch = watchPage(page, base);
    const res = { route: route.pattern, path: route.path, theme, status: 0, finalPath: null, navError: null, pageErrors: [], consoleErrors: [], failedRequests: [], api: [], widths: {}, shots: [] };
    const apiSeen = new Set();
    page.on('response', async (r) => {
        const u = r.url();
        if (!u.startsWith(`${base}/api/`) || r.status() < 400) return;
        const ct = r.headers()['content-type'] || '';
        const json = ct.includes('json');
        if (r.status() < 500 && json) return;
        const key = `${r.status()} ${r.request().method()} ${u.replace(base, '').split('?')[0]}`;
        if (apiSeen.has(key)) return;
        apiSeen.add(key);
        let body = '';
        try { body = (await r.text()).slice(0, 160).replace(/\s+/g, ' '); } catch { /* streamed or gone */ }
        res.api.push({ status: r.status(), method: r.request().method(), path: u.replace(base, '').slice(0, 200), contentType: ct.split(';')[0], body });
    });
    try {
        const r = await page.goto(base + route.path, { waitUntil: 'load', timeout: 150_000 });
        res.status = r?.status() ?? 0;
    } catch (err) {
        res.navError = err.message.split('\n')[0];
    }
    await settle(page, watch, { quietMs: 1200, maxMs: opts.settleMs });
    // Pages that poll (portfolio sync, realtime) keep skeletons up between requests: give
    // them up to --spinner-wait ms to finish, so what is left is a spinner that never ends.
    const spinStart = Date.now();
    while (Date.now() - spinStart < opts.spinnerWait) {
        const busy = await withTimeout(page.evaluate(() => [...document.querySelectorAll('[aria-busy="true"], .animate-spin, .skeleton, .tc-skeleton, [data-skeleton]')]
            .some((el) => el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0)), 5000, false);
        if (!busy) break;
        await page.waitForTimeout(1000);
    }
    if (opts.wait) await page.waitForTimeout(opts.wait);
    res.finalPath = page.url().replace(base, '');
    await withTimeout(page.addStyleTag({ content: 'nextjs-portal{display:none!important} [data-mc-hit]{outline:3px solid #ff1744!important;outline-offset:-1px!important} [data-mc-small]{outline:2px dashed #ff9100!important}' }), 5000);
    for (const width of opts.widths) {
        await withTimeout(page.setViewportSize({ width, height: MOBILE.viewport.height }), 15_000);
        await page.waitForTimeout(450);
        await withTimeout(page.evaluate(() => window.scrollTo(0, 0)), 10_000);
        let w;
        try {
            w = await deadline(page.evaluate(pageAudit, width), 60_000, 'audit');
        } catch (err) {
            res.widths[width] = { auditError: err.message.split('\n')[0] };
            continue;
        }
        try {
            await deadline(page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)), 10_000, 'scroll');
            await page.waitForTimeout(250);
            w.tabbarEnd = await deadline(page.evaluate(tabbarEndAudit), 20_000, 'tab bar audit');
            await deadline(page.evaluate(() => window.scrollTo(0, 0)), 10_000, 'scroll');
        } catch { w.tabbarEnd = []; }
        res.widths[width] = w;
        if (opts.shots && issueCount(w) > 0) {
            const hits = [...w.offscreen, ...w.clipped, ...w.textClipped, ...w.tabbar, ...w.badText].map((x) => x.id);
            const file = path.join(shotDir, `${routeSlug(route.pattern.replace('#', '_'))}-${theme}-${width}.jpg`);
            try {
                await deadline(page.evaluate((ids) => {
                    for (const el of document.querySelectorAll('[data-mc-hit]')) el.removeAttribute('data-mc-hit');
                    let first = null;
                    for (const id of ids) {
                        const el = document.querySelector(`[data-mc-id="${id}"]`);
                        if (el) { el.setAttribute('data-mc-hit', ''); first = first || el; }
                    }
                    if (first) first.scrollIntoView({ block: 'center', inline: 'nearest' });
                }, hits), 10_000, 'highlight');
                await page.waitForTimeout(150);
                fs.mkdirSync(shotDir, { recursive: true });
                await page.screenshot({ path: file, type: 'jpeg', quality: 70, timeout: 30_000 });
                res.shots.push(path.relative(opts.out, file));
            } catch { /* screenshot is best effort */ }
        }
    }
    const firstParty = (x) => {
        if (THIRD_PARTY.test(x)) return false;
        const urls = String(x).match(/https?:\/\/[^\s'"),]+/g) || [];
        return urls.length === 0 || urls.some((u) => u.startsWith(base));
    };
    res.pageErrors = watch.pageErrors;
    res.consoleErrors = watch.consoleErrors.filter((x) => firstParty(x) && !/^Failed to load resource/.test(x));
    res.failedRequests = watch.failedRequests.filter(firstParty);
    await withTimeout(page.close(), 15_000);
    return res;
}

/** Rejects when `promise` takes longer than `ms` (a page busy in a loop must not hang the whole run). */
function deadline(promise, ms, what) {
    let t;
    return Promise.race([promise, new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`${what} took over ${ms} ms`)), ms); })]).finally(() => clearTimeout(t));
}

// ---------------------------------------------------------------- report
const jsonFile = path.join(opts.out, `mobile-${opts.label}.json`);
const mdFile = path.join(opts.out, `mobile-${opts.label}.md`);
fs.mkdirSync(opts.out, { recursive: true });
let results = [];
try {
    const prev = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    if (prev.base === base && prev.user === opts.user) results = prev.results || [];
} catch { /* first run */ }

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function categories(r) {
    const c = { error: 0, overflow: 0, offscreen: 0, clipped: 0, textClipped: 0, textSpill: 0, smallTargets: 0, tabbar: 0, badText: 0, loading: 0, api: (r.api || []).length };
    if (r.status >= 500 || r.pageErrors.length || r.navError) c.error++;
    for (const w of Object.values(r.widths)) {
        if (w.auditError) { c.error++; continue; }
        if (w.error) c.error++;
        if (w.overflow) c.overflow++;
        c.offscreen += w.offscreen.length;
        c.clipped += w.clipped.length;
        c.textClipped += w.textClipped.length;
        c.textSpill += w.textSpill.length;
        c.smallTargets += w.smallTargets.reduce((n, t) => n + t.count, 0);
        c.tabbar += w.tabbar.length + (w.tabbarEnd?.length || 0);
        c.badText += w.badText.length;
        c.loading = Math.max(c.loading, w.loadingCount || 0);
    }
    return c;
}
function writeReports() {
    const ordered = [...results].sort((a, b) => (a.route + a.theme).localeCompare(b.route + b.theme));
    fs.writeFileSync(jsonFile, JSON.stringify({ base, user: opts.user, label: opts.label, widths: opts.widths, updatedAt: new Date().toISOString(), results: ordered }, null, 2));
    const cols = ['error', 'overflow', 'offscreen', 'clipped', 'textClipped', 'textSpill', 'smallTargets', 'tabbar', 'badText', 'loading', 'api'];
    const totals = Object.fromEntries(cols.map((k) => [k, 0]));
    const rows = ordered.map((r) => {
        const c = categories(r);
        for (const k of cols) totals[k] += c[k];
        return `| ${esc(r.path)} | ${r.theme} | ${r.status}${r.finalPath && r.finalPath !== r.path ? ` → ${esc(r.finalPath)}` : ''} | ${cols.map((k) => c[k] || '').join(' | ')} |`;
    });
    const lines = [
        `# Mobile check: ${base} as ${opts.user}`,
        '',
        `Widths ${opts.widths.join(', ')} px, touch, ${opts.themes.join(' + ')} (dark for /dashboard routes only). Updated ${new Date().toISOString()}.`,
        `Counts are summed over the widths. Screenshots outline offenders in red: \`mobile-${opts.label}/\`.`,
        '',
        `**Totals:** ${cols.map((k) => `${k} ${totals[k]}`).join(' · ')}`,
        '',
        `| Route | Theme | Status | ${cols.join(' | ')} |`,
        `|---|---|---|${cols.map(() => '---').join('|')}|`,
        ...rows,
        '',
        '## Details',
        '',
    ];
    for (const r of ordered) {
        const c = categories(r);
        if (!cols.some((k) => c[k])) continue;
        lines.push(`### ${r.path} (${r.theme})`, '');
        if (r.navError) lines.push(`- navigation: ${esc(r.navError)}`);
        for (const e of r.pageErrors) lines.push(`- uncaught: ${esc(e.split('\n')[0])}`);
        for (const e of r.consoleErrors.slice(0, 5)) lines.push(`- console: ${esc(e.slice(0, 200))}`);
        for (const x of r.api || []) lines.push(`- api: ${x.status} ${x.method} \`${esc(x.path)}\` ${esc(x.contentType)} ${esc(x.body.slice(0, 120))}`);
        for (const [width, w] of Object.entries(r.widths)) {
            if (w.auditError) { lines.push(`- ${width}: audit failed: ${esc(w.auditError)}`); continue; }
            const items = [];
            if (w.error) items.push(`error boundary: "${w.error}"`);
            if (w.overflow) items.push(`page scrolls sideways (scrollWidth ${w.scrollWidth} > ${w.vw})`);
            for (const x of w.offscreen) items.push(`offscreen: \`${esc(x.sel)}\` "${esc(x.text)}" right=${x.right}${x.clippedBy ? ` (cut by ${esc(x.clippedBy)})` : ''}`);
            for (const x of w.clipped) items.push(`clipped: \`${esc(x.sel)}\` "${esc(x.text)}" ${x.w}×${x.h}`);
            for (const x of w.textClipped) items.push(`text clipped (${x.axis}, ${x.over}px): \`${esc(x.sel)}\` "${esc(x.text)}"`);
            for (const x of w.textSpill) items.push(`text spills ${x.over}px: \`${esc(x.sel)}\` "${esc(x.text)}"`);
            for (const x of w.tabbar) items.push(`over tab bar: \`${esc(x.sel)}\` "${esc(x.text)}" overlap ${x.overlap}px`);
            for (const x of w.tabbarEnd || []) items.push(`hidden behind tab bar at page end: \`${esc(x.sel)}\` "${esc(x.text)}"`);
            for (const x of w.badText) items.push(`bad text: \`${esc(x.sel)}\` "${esc(x.match)}"`);
            for (const x of w.smallTargets) items.push(`small target ${x.w}×${x.h}${x.count > 1 ? ` ×${x.count}` : ''}: \`${esc(x.sel)}\` "${esc(x.text)}"`);
            if (w.loadingCount) items.push(`still loading: ${w.loadingCount} spinner/skeleton(s), e.g. \`${esc(w.loading[0]?.sel)}\``);
            if (items.length) lines.push(`- **${width}px**`, ...items.map((s) => `  - ${s}`));
        }
        for (const s of r.shots) lines.push(`- screenshot: [${s}](${s})`);
        lines.push('');
    }
    fs.writeFileSync(mdFile, lines.join('\n'));
    return { ordered, totals };
}

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

// ---------------------------------------------------------------- run
console.error(`[mobile] ${routes.length} routes × ${opts.widths.join('/')} px on ${base} as ${opts.user}${stateFile ? '' : ' (logged out)'}`);
const browser = await launchBrowser();
let stoppedForRam = false;
try {
    const contexts = {};
    for (const theme of opts.themes) contexts[theme] = await makeContext(browser, theme);
    for (const route of routes) {
        for (const theme of opts.themes) {
            if (theme === 'dark' && !isApp(route.path)) continue;
            const avail = memAvailableMb();
            if (avail < 1800) {
                console.error(`[mobile] stopping early: MemAvailable ${avail} MB < 1800 MB. Run the rest later with --part or --only (same --label merges).`);
                stoppedForRam = true;
                break;
            }
            const t0 = Date.now();
            let r = await visit(contexts[theme], route, theme);
            // The dev server restarts itself near its memory limit: wait for it and visit once more.
            const down = (r.navError && /ERR_(EMPTY_RESPONSE|CONNECTION_REFUSED|CONNECTION_RESET)|Timeout \d+ms exceeded/.test(r.navError)) || String(r.finalPath).startsWith('chrome-error:');
            if (down && await serverUp()) {
                r = await visit(contexts[theme], route, theme);
            }
            const c = categories(r);
            console.error(`[mobile] ${String(r.status).padEnd(3)} ${theme.padEnd(5)} ${route.path}${r.finalPath && r.finalPath !== route.path ? ` → ${r.finalPath}` : ''}  ${Date.now() - t0}ms  ${Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' ')}`);
            results = results.filter((x) => !(x.route === r.route && x.theme === r.theme));
            results.push(r);
            writeReports();
        }
        if (stoppedForRam) break;
    }
} finally {
    await browser.close();
}
const { ordered, totals } = writeReports();
console.error(`[mobile] wrote ${mdFile}`);
console.error(`[mobile] totals: ${Object.entries(totals).map(([k, v]) => `${k}=${v}`).join(' ')}`);
const failing = ordered.filter((r) => opts.failOn.some((k) => categories(r)[k] > 0));
if (failing.length) console.error(`[mobile] failing (${opts.failOn.join(', ')}): ${failing.map((r) => `${r.path} (${r.theme})`).join(', ')}`);
process.exit(stoppedForRam ? 3 : failing.length ? 1 : 0);
