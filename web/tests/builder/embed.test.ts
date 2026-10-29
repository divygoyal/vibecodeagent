/**
 * Round 9 web embed widget: address validation (https only, no internal hosts, never our own), the sandbox, schema,
 * the share-link opt-in, the "height" setting, X-Frame-Options / frame-ancestors verdicts and the SSRF guarded probe.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/embed.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BRAND_NAME } from '@/lib/brand';
import { EmbedSource } from '@/components/dashboard-builder/widgets/EmbedView';
import {
    EMBED_LOAD_TIMEOUT_MS, EMBED_REFERRER_POLICY, EMBED_SANDBOX, embedBlockedMessage, embedDisclosure, embedFailureMessage, embedHost, probeFailure, embedUrlProblem, fitEmbedHeight, frameVerdict, normalizeEmbedConfig, normalizeEmbedUrl,
    publicEmbedWidget, rowsForPixels, selfHosts,
} from '@/lib/builder/embed';
import { hiddenForViewers } from '@/lib/builder/placeholders';
import { publicDoc } from '@/lib/builder/publicDoc';
import { defaultWidget, skipsPageQuery, widgetMeta } from '@/lib/builder/registry';
import { validateDoc, validateWidgets } from '@/lib/builder/schema';
import { buildFromTemplate } from '@/lib/builder/templates';
import { clearEmbedProbeCache, networkVerdict, probeEmbeddable, probeEmbeddableCached, type HeaderFetch } from '@/lib/builder/server/embedProbe';
import type { DashboardDocV2, EmbedWidget } from '@/lib/builder/types';

const ACME = 'acmeanalytics.example';
const emb = (id = 'w_e', url = 'https://status.example.com/embed', over: Partial<EmbedWidget['config']> = {}): EmbedWidget => {
    const w = defaultWidget('embed', { families: { ga4: true, gsc: true } }, id) as EmbedWidget;
    return { ...w, config: { ...w.config, url, ...over } };
};

function docWith(...widgets: EmbedWidget[]): DashboardDocV2 {
    const doc = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME } });
    return {
        ...doc,
        widgets: { ...doc.widgets, ...Object.fromEntries(widgets.map((w) => [w.id, w])) },
        pages: doc.pages.map((p, i) => (i === 0 ? { ...p, layouts: { ...p.layouts, lg: [...p.layouts.lg, ...widgets.map((w, j) => ({ i: w.id, x: 0, y: 200 + j * 9, w: 6, h: 9 }))], md: undefined, sm: undefined } } : p)),
    };
}

// ── address ──

test('embed address: https public pages pass, everything else says why not', () => {
    for (const ok of ['https://status.example.com/embed', 'https://lookerstudio.google.com/embed/reporting/abc/page/1', 'https://www.youtube.com/embed/xyz?rel=0', 'https://grafana.example.com:3000/d/abc', 'https://münchen.example/seite']) {
        assert.equal(embedUrlProblem(ok), null, ok);
    }
    const bad: Array<[string, RegExp]> = [
        ['', /Add an https/],
        ['status.example.com', /web address/],
        ['http://status.example.com', /https/],
        ['javascript:alert(1)', /https/],
        ['data:text/html,<script>alert(1)</script>', /https/],
        ['file:///etc/passwd', /https/],
        ['ftp://example.com', /https/],
        ['https://user:pw@status.example.com', /user name/],
        ['https://127.0.0.1/', /IP address/],
        ['https://10.0.0.5/admin', /IP address/],
        ['https://[::1]/', /IP address/],
        ['https://2130706433/', /IP address/],
        ['https://localhost/', /public web pages/],
        ['https://intranet/', /public web pages/],
        ['https://printer.local/', /public web pages/],
        ['https://db.internal/', /public web pages/],
        ['https://app.localhost/', /public web pages/],
        ['https://trafficclaw.com/dashboard', /embed itself/],
        ['https://app.trafficclaw.com/view/abc', /embed itself/],
        [`https://${'a'.repeat(2001)}.com`, /too long/],
    ];
    for (const [url, why] of bad) assert.match(embedUrlProblem(url) ?? 'PASSED', why, url);
    assert.equal(embedUrlProblem('https://dash.mycompany.example/', { selfHosts: [...selfHosts(), 'dash.mycompany.example'] }) !== null, true, 'the viewer\'s own host is refused too');
    assert.equal(normalizeEmbedUrl('  https://status.example.com/x  '), 'https://status.example.com/x');
    assert.equal(normalizeEmbedUrl('http://status.example.com'), null);
    assert.equal(embedHost('https://www.status.example.com/x'), 'status.example.com');
});

test('embed sandbox: scripts and forms work, the page cannot navigate, pop up modals or download', () => {
    const tokens = EMBED_SANDBOX.split(' ');
    for (const need of ['allow-scripts', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox']) assert.ok(tokens.includes(need), need);
    for (const never of ['allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-modals', 'allow-downloads', 'allow-presentation', 'allow-pointer-lock', 'allow-orientation-lock']) assert.ok(!tokens.includes(never), never);
    assert.equal(EMBED_REFERRER_POLICY, 'no-referrer');
});

test('embed config: unknown values fall back, height is clamped, the public opt-in is off unless true', () => {
    assert.deepEqual(normalizeEmbedConfig(undefined), { url: '', title: 'Embedded page', scroll: true });
    assert.equal(normalizeEmbedConfig({ heightPx: 10 } as never).heightPx, 120);
    assert.equal(normalizeEmbedConfig({ heightPx: 99999 } as never).heightPx, 2000);
    assert.equal(normalizeEmbedConfig({ showOnPublic: false } as never).showOnPublic, undefined);
    assert.equal(normalizeEmbedConfig({ showOnPublic: true } as never).showOnPublic, true);
});

// ── registry and schema ──

test('embed widget: registry (static content, Content group) and schema', () => {
    assert.equal(widgetMeta('embed').group, 'Content');
    assert.equal(skipsPageQuery('embed'), true);
    assert.equal(validateWidgets([emb()]).ok, true);
    assert.equal(validateWidgets([emb('a', '')]).ok, true, 'a new widget has no address yet');
    for (const url of ['http://example.com', 'javascript:alert(1)', 'https://127.0.0.1/', 'https://localhost', 'https://trafficclaw.com/x']) {
        assert.equal(validateWidgets([emb('a', url)]).ok, false, url);
    }
    assert.equal(validateWidgets([emb('a', 'https://x.example.com', { heightPx: 50 })]).ok, false);
    assert.equal(validateWidgets([emb('a', 'https://x.example.com', { heightPx: 2001 })]).ok, false);
    assert.equal(validateWidgets([emb('a', 'https://x.example.com', { heightPx: 640, showOnPublic: true })]).ok, true);
    const many = Array.from({ length: 11 }, (_, i) => emb(`w_e${i}`));
    assert.equal(validateDoc(docWith(...many.slice(0, 10))).ok, true);
    const tooMany = validateDoc(docWith(...many));
    assert.equal(tooMany.ok, false);
});

test('embed widget: an empty one is hidden from viewers', () => {
    assert.equal(hiddenForViewers(emb('a', '')), true);
    assert.equal(hiddenForViewers(emb('a', 'https://x.example.com')), false);
});

// ── share links ──

test('embed public: left out of a share link unless the owner opted in; its address never leaks otherwise', () => {
    const hidden = emb('w_hide', 'https://secret-status.example.com/internal');
    const shown = emb('w_show', 'https://public-status.example.com/', { showOnPublic: true });
    const doc = docWith(hidden, shown);
    const pd = publicDoc(doc, () => 'Acme');
    assert.equal(pd.widgets.w_hide, undefined);
    assert.ok(pd.widgets.w_show);
    assert.ok(pd.pages.every((p) => !p.layouts.lg.some((l) => l.i === 'w_hide')), 'no empty slot on the page');
    assert.ok(pd.pages.some((p) => p.layouts.lg.some((l) => l.i === 'w_show')));
    assert.doesNotMatch(JSON.stringify(pd), /secret-status/);
    // a dashboard without embeds is untouched
    assert.equal(Object.keys(publicDoc(docWith(), () => 'Acme').widgets).includes('w_hide'), false);
});

test('embed public: the probe route can only ask about an opted-in embed on a shared page', () => {
    const doc = docWith(emb('w_hide', 'https://a.example.com'), emb('w_show', 'https://b.example.com', { showOnPublic: true }));
    assert.equal(publicEmbedWidget(doc, 'w_hide'), null);
    assert.equal(publicEmbedWidget(doc, 'w_show')?.config.url, 'https://b.example.com');
    assert.equal(publicEmbedWidget(doc, 'nope'), null);
    const hiddenPage: DashboardDocV2 = { ...doc, pages: doc.pages.map((p) => ({ ...p, hidden: true })) };
    assert.equal(publicEmbedWidget(hiddenPage, 'w_show'), null, 'a hidden page is not shared');
});

// ── height ──

test('embed height: setting it resizes the card on every layout, clamped', () => {
    const w = emb('w_h');
    const doc = docWith(w);
    const d1 = fitEmbedHeight(doc, 'w_h', 600);
    const cfg = d1.widgets.w_h as EmbedWidget;
    assert.equal(cfg.config.heightPx, 600);
    const item = d1.pages[0].layouts.lg.find((l) => l.i === 'w_h')!;
    assert.ok(item.h * 48 - 16 >= 600, 'the card is at least as tall as the page');
    assert.ok((item.h - 1) * 48 - 16 < 600, 'and not a row more than needed');
    assert.equal((fitEmbedHeight(doc, 'w_h', 5).widgets.w_h as EmbedWidget).config.heightPx, 120);
    assert.equal((fitEmbedHeight(doc, 'w_h', 99999).widgets.w_h as EmbedWidget).config.heightPx, 2000);
    assert.equal(fitEmbedHeight(doc, 'missing', 600), doc);
    assert.equal(rowsForPixels(100), 3, 'never shorter than the minimum card');
    // the saved doc stays valid
    assert.equal(validateDoc(d1).ok, true);
});

// ── X-Frame-Options and frame-ancestors ──

test('embed frame verdict: X-Frame-Options and CSP frame-ancestors', () => {
    const app = ['app.trafficclaw.com'];
    assert.equal(frameVerdict({}, app).blocked, false);
    assert.equal(frameVerdict({ 'x-frame-options': 'DENY' }, app).blocked, true);
    assert.match(frameVerdict({ 'x-frame-options': 'SAMEORIGIN' }, app).reason ?? '', /X-Frame-Options: SAMEORIGIN/);
    assert.equal(frameVerdict({ 'x-frame-options': 'ALLOW-FROM https://app.trafficclaw.com' }, app).blocked, true, 'obsolete, browsers ignore it: treated as blocked');
    assert.equal(frameVerdict({ 'x-frame-options': 'sameorigin, sameorigin' }, app).blocked, true);
    assert.equal(frameVerdict({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }, app).blocked, true);
    assert.equal(frameVerdict({ 'content-security-policy': "frame-ancestors 'self'" }, app).blocked, true);
    assert.equal(frameVerdict({ 'content-security-policy': 'frame-ancestors *' }, app).blocked, false);
    assert.equal(frameVerdict({ 'content-security-policy': 'frame-ancestors https:' }, app).blocked, false);
    assert.equal(frameVerdict({ 'content-security-policy': 'frame-ancestors https://app.trafficclaw.com https://other.example' }, app).blocked, false);
    assert.equal(frameVerdict({ 'content-security-policy': 'frame-ancestors *.trafficclaw.com' }, app).blocked, false);
    assert.equal(frameVerdict({ 'content-security-policy': 'frame-ancestors https://other.example' }, app).blocked, true);
    assert.equal(frameVerdict({ 'content-security-policy': "script-src 'self'" }, app).blocked, false, 'a CSP without frame-ancestors says nothing about framing');
    // two policies: both must allow
    assert.equal(frameVerdict({ 'content-security-policy': "frame-ancestors *, frame-ancestors 'none'" }, app).blocked, true);
    assert.match(embedBlockedMessage('status.example.com'), /status\.example\.com.*new tab/);
});

// ── the card: disclosure and load failures ──

test('embed disclosure: only the host is shortened; "not part of" the brand is never cut and may wrap', () => {
    const html = renderToStaticMarkup(createElement(EmbedSource, { host: 'a-very-long-subdomain.of-a-very-long-company-name-for-testing.example.com' }));
    assert.match(html, /data-embed-disclosure/);
    assert.ok(html.includes(`not part of ${BRAND_NAME}`));
    assert.equal(embedDisclosure('TrafficClaw'), 'not part of TrafficClaw');
    const host = /<span[^>]*data-embed-host[^>]*>/.exec(html)![0];
    assert.match(host, /truncate/, 'the host gets the ellipsis');
    assert.match(host, /title="a-very-long/, 'and its full name as a tooltip');
    const disc = /<span[^>]*data-embed-disclosure[^>]*>/.exec(html)![0];
    assert.doesNotMatch(disc, /truncate|overflow/, 'the disclosure is never ellipsized');
    assert.match(disc, /whitespace-nowrap/);
    const wrapper = /<p[^>]*data-embed-source[^>]*>/.exec(html)![0];
    assert.match(wrapper, /flex-wrap/, 'a narrow card wraps the disclosure onto its own line');
    assert.doesNotMatch(wrapper, /truncate|overflow-hidden/);
});

test('embed failures: each way a page can fail has its own plain sentence, probe answers map to a failure', () => {
    for (const kind of ['blocked', 'unreachable', 'timeout', 'error'] as const) {
        const m = embedFailureMessage('status.example.com', kind);
        assert.match(m, /status\.example\.com/);
        assert.match(m, /new tab/);
        assert.ok(!/[A-Z][a-z]+-[A-Z]/.test(m), 'no header names in the plain sentence');
    }
    assert.notEqual(embedFailureMessage('x.com', 'timeout'), embedFailureMessage('x.com', 'unreachable'));
    assert.match(embedFailureMessage('', 'blocked'), /^This site/);
    assert.deepEqual(probeFailure({ status: 'blocked', reason: 'X-Frame-Options: DENY' }), { kind: 'blocked', reason: 'X-Frame-Options: DENY' });
    assert.deepEqual(probeFailure({ status: 'unreachable', reason: 'No site answers' }), { kind: 'unreachable', reason: 'No site answers' });
    assert.equal(probeFailure({ status: 'ok' }), null);
    assert.equal(probeFailure({ status: 'unknown' }), null);
    assert.equal(probeFailure(undefined), null);
    assert.ok(EMBED_LOAD_TIMEOUT_MS >= 10_000 && EMBED_LOAD_TIMEOUT_MS <= 30_000);
});

// ── the probe (SSRF guarded) ──

const hdr = (headers: Record<string, string>, status = 200, location?: string): ReturnType<HeaderFetch> => Promise.resolve({ status, headers, location });

test('embed probe: ok, blocked, and unknown on a network error', async () => {
    assert.deepEqual(await probeEmbeddable('https://a.example.com/', ['app.trafficclaw.com'], () => hdr({})), { status: 'ok' });
    const b = await probeEmbeddable('https://a.example.com/', ['app.trafficclaw.com'], () => hdr({ 'x-frame-options': 'DENY' }));
    assert.equal(b.status, 'blocked');
    assert.deepEqual(await probeEmbeddable('https://a.example.com/', [], () => Promise.reject(new Error('ECONNRESET'))), { status: 'unknown' });
});

test('embed probe: a host that does not exist, a refused connection and a bad certificate are "unreachable"; slow or reset stays unknown', async () => {
    const fail = (code: string): HeaderFetch => () => Promise.reject(Object.assign(new Error(code), { code }));
    for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']) {
        const r = await probeEmbeddable('https://gone.example.com/', [], fail(code));
        assert.equal(r.status, 'unreachable', code);
        assert.ok('reason' in r && r.reason.length > 10);
    }
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) assert.deepEqual(await probeEmbeddable('https://slow.example.com/', [], fail(code)), { status: 'unknown' }, code);
    assert.deepEqual(await probeEmbeddable('https://slow.example.com/', [], () => Promise.reject(new Error('timeout'))), { status: 'unknown' });
    assert.deepEqual(networkVerdict(new Error('private address')), { status: 'unknown' }, 'a refused private address says nothing');
    assert.deepEqual(networkVerdict(null), { status: 'unknown' });
    // The reason is for the owner: it never carries the address or a header.
    const r = await probeEmbeddable('https://gone.example.com/secret?x=1', [], fail('ENOTFOUND'));
    assert.doesNotMatch(JSON.stringify(r), /gone\.example|secret/);
});

test('embed probe: never fetches an address the validator refuses, nor follows a redirect to one', async () => {
    const fetched: string[] = [];
    const spy: HeaderFetch = (u) => { fetched.push(u.href); return hdr({}); };
    for (const url of ['http://a.example.com/', 'https://127.0.0.1/', 'https://localhost/', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/', 'https://printer.local/', 'https://trafficclaw.com/api']) {
        assert.deepEqual(await probeEmbeddable(url, [], spy), { status: 'unknown' }, url);
    }
    assert.deepEqual(fetched, [], 'nothing was requested');
    // a public page that redirects to a private address or to http: the second hop is refused
    const hops: string[] = [];
    const redirecting = (target: string): HeaderFetch => (u) => { hops.push(u.href); return u.href === 'https://a.example.com/' ? hdr({}, 302, target) : hdr({}); };
    for (const target of ['http://b.example.com/', 'https://127.0.0.1:8080/', 'https://169.254.169.254/', 'https://admin.internal/']) {
        hops.length = 0;
        assert.deepEqual(await probeEmbeddable('https://a.example.com/', [], redirecting(target)), { status: 'unknown' }, target);
        assert.deepEqual(hops, ['https://a.example.com/'], `${target} was not requested`);
    }
    // a redirect chain between public https pages is followed (3 hops), a loop gives up
    const chain: HeaderFetch = (u) => (u.pathname === '/3' ? hdr({ 'x-frame-options': 'DENY' }) : hdr({}, 301, `/${Number(u.pathname.slice(1) || 0) + 1}`));
    assert.equal((await probeEmbeddable('https://a.example.com/', [], chain)).status, 'blocked');
    const loop: HeaderFetch = () => hdr({}, 302, 'https://a.example.com/');
    assert.deepEqual(await probeEmbeddable('https://a.example.com/', [], loop), { status: 'unknown' });
});

test('embed probe: verdicts are cached (an hour; a minute for unknown) and concurrent asks share one request', async () => {
    clearEmbedProbeCache();
    let n = 0;
    let t = 1_000_000;
    const f: HeaderFetch = () => { n++; return hdr({}); };
    await Promise.all([probeEmbeddableCached('https://c.example.com/', ['x'], f, () => t), probeEmbeddableCached('https://c.example.com/', ['x'], f, () => t)]);
    assert.equal(n, 1);
    t += 3_599_000;
    await probeEmbeddableCached('https://c.example.com/', ['x'], f, () => t);
    assert.equal(n, 1);
    t += 2_000;
    await probeEmbeddableCached('https://c.example.com/', ['x'], f, () => t);
    assert.equal(n, 2);
    let m = 0;
    const failing: HeaderFetch = () => { m++; return Promise.reject(new Error('timeout')); };
    await probeEmbeddableCached('https://d.example.com/', ['x'], failing, () => t);
    t += 30_000;
    await probeEmbeddableCached('https://d.example.com/', ['x'], failing, () => t);
    assert.equal(m, 1, 'unknown is remembered for a minute');
    t += 31_000;
    await probeEmbeddableCached('https://d.example.com/', ['x'], failing, () => t);
    assert.equal(m, 2);
});
