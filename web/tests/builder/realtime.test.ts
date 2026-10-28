/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Google request fixtures */
/**
 * Round 9 realtime widget: schema, registry, parsing of Google's realtime reports, the page query leaving the widget
 * alone, owner caching (per user + property, never property only), public links (one Google read per 30 s per link +
 * widget + picks, share permissions, no owner token or ids in the answer) and the site switcher.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/realtime.test.ts
 * Google is answered by the demo generator (lib/demo fetch shim); nothing touches the network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { resetLimiterStats } from '@/lib/googleLimiter';
import { defaultWidget, skipsPageQuery, widgetMeta, widgetTitle } from '@/lib/builder/registry';
import { validateDoc, validateWidgets } from '@/lib/builder/schema';
import { buildFromTemplate } from '@/lib/builder/templates';
import { publicControlsFromQuery, publicDoc } from '@/lib/builder/publicDoc';
import { sitePicksFromKeys, siteOptionKey } from '@/lib/builder/server/access';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import {
    cachedRealtime, clearRealtimeCache, evaluatePublicRealtime, evaluateRealtime, publicRealtimeWidget, realtimeCacheSize, type RealtimeDeps,
} from '@/lib/builder/server/realtime';
import {
    mergeRaw, normalizeRealtimeConfig, parsePerMinute, parseRows, parseTotal, publicRealtimeQuery, publicResultKey, realtimeFrameResult, realtimeRows,
    realtimeFailureView, realtimeHttpError, snapshotKey, splitRealtimeFilters, REALTIME_MINUTES, REALTIME_PUBLIC_TTL_MS, REALTIME_QUOTA_TEXT, REALTIME_UPSTREAM_TEXT,
} from '@/lib/builder/realtime';
import { QueryHttpError } from '@/components/dashboard-builder/useWidgetData';
import { RealtimeError } from '@/components/dashboard-builder/widgets/RealtimeView';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ControlDef, ControlState, DashboardDocV2, RealtimeWidget, SiteControl, WidgetDef } from '@/lib/builder/types';

const calls: Array<{ url: string; body: any }> = [];
const demoFetch = createDemoGoogleFetch();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (/analyticsdata/.test(url)) calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return demoFetch(input, init);
}) as typeof fetch;

const TOKEN = demoAccessToken();
const ACME = 'acmeanalytics.example';
const DATAVIZ = 'datavizpro.example';
const SHARE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const rtCalls = () => calls.filter((c) => c.url.includes(':runRealtimeReport'));
const reset = () => {
    calls.length = 0;
    clearBuilderCache();
    clearRealtimeCache();
    resetLimiterStats();
};
const state = (extra: Partial<ControlState> = {}): ControlState => ({ date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'none' } }, filters: {}, ...extra });

const rt = (id = 'w_rt', over: Partial<RealtimeWidget['config']> = {}, extra: Partial<RealtimeWidget> = {}): RealtimeWidget => {
    const w = defaultWidget('realtime', { families: { ga4: true, gsc: true } }, id) as RealtimeWidget;
    return { ...w, ...extra, config: { ...w.config, ...over } };
};
const owner = (userId = 'u1', now?: () => number): RealtimeDeps => ({ userId, mode: 'owner', getToken: async () => TOKEN, now });
const ctx = (w: RealtimeWidget, controls: ControlState = state(), controlDefs: ControlDef[] = []) => ({ widget: w, defaultSource: { type: 'site' as const, siteId: ACME }, controlDefs, controls });

// ── schema and registry ──

test('realtime: default widget validates, registry says it fetches its own data', () => {
    const w = rt();
    assert.equal(w.type, 'realtime');
    assert.deepEqual(w.config, { breakdown: 'country', top: 5, bars: true });
    assert.equal(widgetMeta('realtime').group, 'Metrics');
    assert.equal(skipsPageQuery('realtime'), true);
    assert.equal(skipsPageQuery('scorecard'), false);
    assert.equal(widgetTitle(w), 'Online now');
    assert.equal(validateWidgets([w]).ok, true);
});

test('realtime: schema refuses an unknown breakdown, a bad row count and a missing config', () => {
    const w = rt() as any;
    assert.equal(validateWidgets([{ ...w, config: { ...w.config, breakdown: 'source' } }]).ok, false, 'GA4 realtime has no source dimension');
    assert.equal(validateWidgets([{ ...w, config: { ...w.config, top: 4 } }]).ok, false);
    assert.equal(validateWidgets([{ ...w, config: { breakdown: 'page' } }]).ok, false);
    for (const b of ['none', 'country', 'city', 'page', 'device']) assert.equal(validateWidgets([{ ...w, config: { ...w.config, breakdown: b } }]).ok, true, b);
});

test('realtime: a dashboard with the widget saves; unknown or missing settings fall back to the defaults when rendered', () => {
    const doc = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME } });
    const w = rt('w_rt1');
    const withW: DashboardDocV2 = { ...doc, widgets: { ...doc.widgets, [w.id]: w }, pages: doc.pages.map((p, i) => (i === 0 ? { ...p, layouts: { ...p.layouts, lg: [...p.layouts.lg, { i: w.id, x: 0, y: 99, w: 4, h: 8 }] } } : p)) };
    const v = validateDoc(withW);
    assert.equal(v.ok, true, v.ok ? '' : v.error);
    assert.deepEqual(normalizeRealtimeConfig(undefined), { breakdown: 'country', top: 5, bars: true });
    assert.deepEqual(normalizeRealtimeConfig({ breakdown: 'bogus' as any, top: 9 as any, bars: false }), { breakdown: 'country', top: 5, bars: false });
});

// ── parsing ──

test('realtime: parsing the total, the minutes and the ranked rows', () => {
    const total = { metricHeaders: [{ name: 'activeUsers' }], rows: [{ metricValues: [{ value: '18' }] }] };
    assert.equal(parseTotal(total), 18);
    assert.equal(parseTotal({}), 0);
    assert.equal(parseTotal({ metricHeaders: [{ name: 'activeUsers' }], rows: [{ metricValues: [{ value: '7' }] }, { metricValues: [{ value: '5' }] }] }), 7, 'extra rows never double the number');
    const minutes = { dimensionHeaders: [{ name: 'minutesAgo' }], metricHeaders: [{ name: 'activeUsers' }], rows: [
        { dimensionValues: [{ value: '00' }], metricValues: [{ value: '4' }] },
        { dimensionValues: [{ value: '01' }], metricValues: [{ value: '2' }] },
        { dimensionValues: [{ value: '29' }], metricValues: [{ value: '9' }] },
        { dimensionValues: [{ value: '30' }], metricValues: [{ value: '99' }] },
        { dimensionValues: [{ value: 'x' }], metricValues: [{ value: '99' }] },
    ] };
    const bars = parsePerMinute(minutes);
    assert.equal(bars.length, REALTIME_MINUTES);
    assert.equal(bars[REALTIME_MINUTES - 1], 4, 'minutesAgo 0 is the right-most bar');
    assert.equal(bars[REALTIME_MINUTES - 2], 2);
    assert.equal(bars[0], 9);
    assert.equal(bars.reduce((a, b) => a + b, 0), 15, 'out-of-range minutes are dropped');
    const rows = parseRows({ metricHeaders: [{ name: 'activeUsers' }], rows: [
        { dimensionValues: [{ value: 'US' }], metricValues: [{ value: '6' }] },
        { dimensionValues: [{ value: '(not set)' }], metricValues: [{ value: '9' }] },
        { dimensionValues: [{ value: 'IN' }], metricValues: [{ value: '6' }] },
        { dimensionValues: [{ value: 'DE' }], metricValues: [{ value: '0' }] },
        { dimensionValues: [{ value: 'GB' }], metricValues: [{ value: '8' }] },
    ] }, 3);
    assert.deepEqual(rows, [{ key: 'GB', users: 8 }, { key: 'IN', users: 6 }, { key: 'US', users: 6 }]);
});

test('realtime: sites add up, the list merges by key', () => {
    const a = { activeUsers: 5, perMinute: Array.from({ length: 30 }, (_, i) => (i === 29 ? 2 : 0)), rows: [{ key: 'US', users: 3 }, { key: 'IN', users: 2 }], fetchedAt: 2000 };
    const b = { activeUsers: 4, perMinute: Array.from({ length: 30 }, (_, i) => (i === 29 ? 1 : 0)), rows: [{ key: 'US', users: 1 }, { key: 'DE', users: 3 }], fetchedAt: 1000 };
    const m = mergeRaw([a, b], 2);
    assert.equal(m.activeUsers, 9);
    assert.equal(m.perMinute[29], 3);
    assert.deepEqual(m.rows, [{ key: 'US', users: 4 }, { key: 'DE', users: 3 }]);
    assert.equal(m.fetchedAt, 1000, 'the oldest read names the age');
});

test('realtime: only country, city and device filters reach Google; the rest are counted', () => {
    const s = splitRealtimeFilters([
        { dimension: 'country', op: 'eq', value: 'US' },
        { dimension: 'channel', op: 'eq', value: 'Organic Search' },
        { dimension: 'page', op: 'contains', value: '/blog' },
        { dimension: 'device', op: 'in', value: ['mobile'] },
    ]);
    assert.deepEqual(s.apply.map((c) => c.dimension), ['country', 'device']);
    assert.equal(s.ignored, 2);
});

test('realtime: frame result keeps the list for the CSV and passes errors through', () => {
    const ok = realtimeFrameResult({ status: 'ok', snapshot: { activeUsers: 3, perMinute: [], breakdown: { by: 'country', rows: [{ key: 'US', users: 3 }] }, fetchedAt: '2026-10-28T10:00:00Z', sourceLabel: ACME, sites: 1 } });
    assert.equal(ok.status, 'ok');
    if (ok.status === 'ok') assert.deepEqual(ok.parts.rows.rows, [{ 'd:country': 'US', 'm:ga4:activeUsers': 3 }]);
    const err = realtimeFrameResult({ status: 'error', code: 'NOT_CONNECTED', message: 'Connect Google to see this data.', retryable: false });
    assert.equal(err.status, 'error');
    if (err.status === 'error') assert.equal(err.hint?.action, 'reconnect');
});

test('realtime: list rows shrink with the card and vanish before they crowd the number', () => {
    const full = { title: true, bars: true, footnote: true };
    assert.equal(realtimeRows(416, 5, full), 5, 'the default card (9 rows) shows the whole list');
    assert.ok(realtimeRows(260, 5, full) < 5);
    assert.equal(realtimeRows(120, 5, full), 0);
});

// ── keys ──

test('realtime: cache keys are per user and property; public keys per link, owner, widget and picks', () => {
    assert.notEqual(snapshotKey('u1', 'properties/123', 'country', 'f'), snapshotKey('u2', 'properties/123', 'country', 'f'), 'two users never share a property entry');
    assert.equal(snapshotKey('u1', 'properties/123', 'country', 'f'), snapshotKey('u1', '123', 'country', 'f'));
    assert.notEqual(snapshotKey('u1', '123', 'country', 'f'), snapshotKey('u1', '123', 'page', 'f'));
    const k = publicResultKey(SHARE, 'owner1', 'w1', 'p');
    assert.notEqual(k, publicResultKey('b'.repeat(32), 'owner1', 'w1', 'p'));
    assert.notEqual(k, publicResultKey(SHARE, 'owner1', 'w2', 'p'));
    assert.notEqual(k, publicResultKey(SHARE, 'owner1', 'w1', 'q'));
});

test('realtime: the public request keeps only site picks, filters, the click filter and the page', () => {
    const q = publicRealtimeQuery('page=p1&range=7d&compare=none&s.s1=abc&f.c1=US&x=country:US&m.m1=gsc:clicks&d.w=1&t.t=news', 'w_rt');
    const sp = new URLSearchParams(q);
    assert.deepEqual([...sp.keys()].sort(), ['f.c1', 'page', 's.s1', 'w', 'x']);
    assert.equal(sp.get('w'), 'w_rt');
});

test('realtime: the single-flight cache computes once and expires by its own TTL', async () => {
    reset();
    let t = 1_000;
    let n = 0;
    const get = () => cachedRealtime('k', () => 10_000, async () => ++n, () => t);
    assert.deepEqual(await Promise.all([get(), get(), get()]), [1, 1, 1]);
    t += 9_999;
    assert.equal(await get(), 1);
    t += 2;
    assert.equal(await get(), 2);
    assert.ok(realtimeCacheSize() >= 1);
});

// ── the page query leaves the widget alone ──

test('realtime: the page query makes no Google call for it', async () => {
    reset();
    const w = rt('w_only');
    const res = await evaluateWidgets({ widgets: [{ widget: w as WidgetDef }], defaultSource: { type: 'site', siteId: ACME }, controlDefs: [], controls: state() }, { userId: 'u1', getToken: async () => TOKEN, mode: 'owner' });
    assert.equal(res.results.w_only.status, 'ok');
    assert.equal(calls.length, 0);
});

// ── errors in plain words ──

test('realtime errors: a failed request reads as one plain sentence, never the raw text; the detail is the owner\'s only', () => {
    const boom = new QueryHttpError(500, 'boom');
    const o = realtimeHttpError(boom, { owner: true });
    assert.equal(o.message, REALTIME_UPSTREAM_TEXT);
    assert.equal(o.message, "Couldn't load live data from Google Analytics. Retrying…");
    assert.equal(o.retryable, true);
    assert.equal(o.detail, 'HTTP 500: boom');
    const p = realtimeHttpError(boom, { owner: false });
    assert.equal(p.message, REALTIME_UPSTREAM_TEXT);
    assert.equal(p.detail, undefined);
    assert.doesNotMatch(JSON.stringify(p), /boom|500/);
    // a network failure
    const net = realtimeHttpError(new TypeError('Failed to fetch'), { owner: true });
    assert.equal(net.message, REALTIME_UPSTREAM_TEXT);
    assert.match(net.detail ?? '', /Network error.*Failed to fetch/);
    assert.doesNotMatch(realtimeHttpError(new TypeError('Failed to fetch'), { owner: false }).message, /fetch/i);
    // the statuses that will not fix themselves do not say "Retrying"
    for (const [status, code] of [[401, 'NOT_CONNECTED'], [403, 'NO_ACCESS'], [404, 'UPSTREAM']] as const) {
        const e = realtimeHttpError(new QueryHttpError(status, 'raw server words'), { owner: false });
        assert.equal(e.code, code);
        assert.equal(e.retryable, false);
        assert.doesNotMatch(e.message, /Retrying|raw server words/);
    }
    const limited = realtimeHttpError(new QueryHttpError(429, 'Too many requests. Slow down a little.'), { owner: false });
    assert.equal(limited.code, 'QUOTA');
    assert.equal(limited.retryAfterSec, 60);
    assert.doesNotMatch(limited.message, /Slow down a little/);
    assert.equal(realtimeFailureView(undefined, undefined, { owner: true }), undefined);
    // the server's own error answers pass through, minus the detail for everyone but the owner
    const answer = { status: 'error' as const, code: 'UPSTREAM' as const, message: REALTIME_UPSTREAM_TEXT, retryable: true, detail: 'Google answered 500: x' };
    assert.equal(realtimeFailureView(answer, undefined, { owner: true })?.detail, 'Google answered 500: x');
    assert.equal(realtimeFailureView(answer, undefined, { owner: false })?.detail, undefined);
});

test('realtime errors: the card shows the plain message and a Details toggle only to the owner', () => {
    const f = { status: 'error' as const, code: 'UPSTREAM' as const, message: REALTIME_UPSTREAM_TEXT, retryable: true, detail: 'HTTP 500: boom' };
    const ownerHtml = renderToStaticMarkup(createElement(RealtimeError, { failure: f, owner: true, onRetry: () => undefined }));
    assert.match(ownerHtml, /Couldn&#x27;t load live data from Google Analytics\. Retrying…/);
    assert.match(ownerHtml, /data-testid="rt-details-toggle"/);
    assert.doesNotMatch(ownerHtml, /boom/, 'the detail stays closed until the owner opens it');
    const publicHtml = renderToStaticMarkup(createElement(RealtimeError, { failure: f, owner: false, onRetry: () => undefined }));
    assert.match(publicHtml, /Retrying/);
    assert.doesNotMatch(publicHtml, /Details|boom|rt-detail/);
});

test('realtime errors: Google failures answer plainly; the technical line is added for the owner, never for a public link', async () => {
    reset();
    const failing = (status: number) => async () => { throw new Error(`Google API error ${status}: backend said no (properties/12345)`); };
    for (const [status, text] of [[500, REALTIME_UPSTREAM_TEXT], [429, REALTIME_QUOTA_TEXT]] as const) {
        reset();
        const o = await evaluateRealtime(ctx(rt()), { ...owner('u1'), report: failing(status) });
        assert.equal(o.status, 'error');
        if (o.status === 'error') {
            assert.equal(o.message, text);
            assert.match(o.detail ?? '', new RegExp(`Google answered ${status}`));
        }
        reset();
        const p = await evaluateRealtime(ctx(rt()), { ...owner('u1'), mode: 'public', report: failing(status) });
        assert.equal(p.status, 'error');
        if (p.status === 'error') {
            assert.equal(p.message, text);
            assert.equal(p.detail, undefined);
        }
        assert.doesNotMatch(JSON.stringify(p), /backend said no|properties\/12345/);
    }
    reset();
    const doc = sharedDoc();
    const controls = publicControlsFromQuery(new URLSearchParams(''), doc, { viewerControls: { date: false, compare: false, filters: false } });
    const pub = await evaluatePublicRealtime({ shareToken: SHARE, ownerId: 'owner1', widget: doc.widgets.w_pub as RealtimeWidget, defaultSource: doc.defaultSource, controlDefs: doc.controls, controls }, { ...owner('owner1'), report: failing(500) });
    assert.equal(pub.status, 'error');
    assert.doesNotMatch(JSON.stringify(pub), /detail|backend said no|12345/);
});

// ── owner reads ──

test('realtime: three realtime reads per property, a repeat inside 20 s is served from the cache', async () => {
    reset();
    const t = 5_000_000;
    const r1 = await evaluateRealtime(ctx(rt()), owner('u1', () => t));
    assert.equal(r1.status, 'ok');
    assert.equal(rtCalls().length, 3, 'total + per minute + list');
    if (r1.status === 'ok') {
        assert.equal(r1.snapshot.perMinute.length, REALTIME_MINUTES);
        assert.ok(r1.snapshot.activeUsers >= 0);
        assert.ok((r1.snapshot.breakdown?.rows.length ?? 0) <= 5);
        assert.equal(r1.snapshot.breakdown?.by, 'country');
        assert.equal(r1.snapshot.sourceLabel, ACME);
    }
    await evaluateRealtime(ctx(rt()), owner('u1', () => t + 5_000));
    assert.equal(rtCalls().length, 3, 'cached');
    await evaluateRealtime(ctx(rt()), owner('u1', () => t + 21_000));
    assert.equal(rtCalls().length, 6, 'after the owner TTL Google is asked again');
});

test('realtime: the cache is per user: a second user asking for the same property is not served the first one\'s numbers', async () => {
    reset();
    await evaluateRealtime(ctx(rt()), owner('u1'));
    assert.equal(rtCalls().length, 3);
    await evaluateRealtime(ctx(rt()), owner('u2'));
    assert.equal(rtCalls().length, 6, 'u2 had to ask Google itself');
});

test('realtime: breakdown none asks for two reads; a page list uses the page title dimension; the number can be a page of one', async () => {
    reset();
    await evaluateRealtime(ctx(rt('a', { breakdown: 'none' })), owner('u1'));
    assert.equal(rtCalls().length, 2);
    reset();
    const r = await evaluateRealtime(ctx(rt('b', { breakdown: 'page', top: 3 })), owner('u1'));
    const dims = rtCalls().map((c) => (c.body.dimensions ?? []).map((d: any) => d.name).join(','));
    assert.ok(dims.includes('unifiedScreenName'));
    assert.ok(dims.includes('minutesAgo'));
    if (r.status === 'ok') assert.ok((r.snapshot.breakdown?.rows.length ?? 0) <= 3);
});

test('realtime: a country filter reaches Google as countryId; a channel filter is counted, not sent', async () => {
    reset();
    const w = rt('f', {}, { filters: [{ dimension: 'country', op: 'eq', value: 'US' }, { dimension: 'channel', op: 'eq', value: 'Direct' }] });
    const r = await evaluateRealtime(ctx(w), owner('u1'));
    const json = JSON.stringify(rtCalls().map((c) => c.body.dimensionFilter));
    assert.match(json, /countryId/);
    assert.doesNotMatch(json, /channel|Direct/i);
    if (r.status === 'ok') assert.equal(r.snapshot.filtersIgnored, 1);
});

test('realtime: not connected and unknown site answer as errors, not as zeros', async () => {
    reset();
    const a = await evaluateRealtime(ctx(rt()), { ...owner('u1'), getToken: async () => null });
    assert.equal(a.status, 'error');
    if (a.status === 'error') assert.equal(a.code, 'NOT_CONNECTED');
    const b = await evaluateRealtime({ ...ctx(rt()), defaultSource: { type: 'site', siteId: 'nobody.example' } }, owner('u1'));
    assert.equal(b.status, 'error');
    if (b.status === 'error') assert.equal(b.code, 'NO_ACCESS');
});

test('realtime: an All sites source adds the sites up and says so', async () => {
    reset();
    const r = await evaluateRealtime({ ...ctx(rt()), defaultSource: { type: 'portfolio', include: [ACME, DATAVIZ] } }, owner('u1'));
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') assert.equal(r.snapshot.sites, 2);
    assert.equal(rtCalls().length, 6);
    reset();
    const big = await evaluateRealtime({ ...ctx(rt()), defaultSource: { type: 'portfolio', include: 'all' } }, owner('u1'));
    // The demo account has more than 10 properties only on the big fixture; whichever it is, it is never a thrown error.
    assert.ok(big.status === 'ok' || (big.status === 'error' && big.code === 'UNSUPPORTED_FOR_PORTFOLIO'));
});

// ── site switcher ──

test('realtime: the owner\'s site switcher moves a default-source widget to the picked site', async () => {
    reset();
    const sc: SiteControl = { id: 's1', type: 'site', label: 'Site', options: [ACME, DATAVIZ], default: '', scope: { mode: 'all' }, viewerCanChange: true };
    await evaluateRealtime(ctx(rt(), state({ site: { s1: DATAVIZ } }), [sc]), owner('u1'));
    const urls = new Set(rtCalls().map((c) => c.url));
    reset();
    await evaluateRealtime(ctx(rt(), state(), [sc]), owner('u1'));
    const base = new Set(rtCalls().map((c) => c.url));
    assert.notDeepEqual([...urls], [...base], 'a different property');
});

// ── public links ──

function sharedDoc(hiddenPage = false): DashboardDocV2 {
    const w = rt('w_pub');
    const other = rt('w_hidden');
    return {
        schemaVersion: 2, name: 'Live', defaultSource: { type: 'site', siteId: ACME },
        controls: [{ id: 'date', type: 'date', default: { kind: 'preset', id: '28d' }, defaultCompare: { mode: 'none' }, viewerCanChange: true, viewerCanCompare: true }, { id: 'f_c', type: 'filter', label: 'Country', dimension: 'country', ui: 'select', scope: { mode: 'all' }, viewerCanChange: true }],
        pages: [
            { id: 'p1', title: 'One', layouts: { lg: [{ i: 'w_pub', x: 0, y: 0, w: 4, h: 8 }] } },
            { id: 'p2', title: 'Two', hidden: hiddenPage, layouts: { lg: [{ i: 'w_hidden', x: 0, y: 0, w: 4, h: 8 }] } },
        ],
        widgets: { w_pub: w, w_hidden: other }, theme: { mode: 'light', header: { show: true, logoPosition: 'left', showDates: true }, badge: { show: false } },
        settings: { widthMode: 'contained', autoRefreshSec: 0 }, meta: {},
    } as DashboardDocV2;
}

test('realtime public: only a realtime widget on a page the share shows can be asked for', () => {
    const doc = sharedDoc(true);
    assert.equal(publicRealtimeWidget(doc, 'w_pub')?.id, 'w_pub');
    assert.equal(publicRealtimeWidget(doc, 'w_hidden'), null, 'a hidden page is not shared');
    assert.equal(publicRealtimeWidget(doc, 'nope'), null);
    const scorecard = { ...doc, widgets: { ...doc.widgets, w_s: defaultWidget('scorecard', { families: { ga4: true, gsc: false } }, 'w_s') }, pages: [{ ...doc.pages[0], layouts: { lg: [...doc.pages[0].layouts.lg, { i: 'w_s', x: 0, y: 9, w: 3, h: 4 }] } }] };
    assert.equal(publicRealtimeWidget(scorecard as DashboardDocV2, 'w_s'), null, 'other widget types go through the page query');
});

test('realtime public: viewers and refreshes inside 30 s share one Google read; after that it is read again', async () => {
    reset();
    let t = 9_000_000;
    const doc = sharedDoc();
    const share = { viewerControls: { date: false, compare: false, filters: false } };
    const controls = publicControlsFromQuery(new URLSearchParams('w=w_pub'), doc, share);
    const run = (at: number) => evaluatePublicRealtime({ shareToken: SHARE, ownerId: 'owner1', widget: doc.widgets.w_pub as RealtimeWidget, defaultSource: doc.defaultSource, controlDefs: doc.controls, controls }, { ...owner('owner1', () => at), mode: 'public' });
    const first = await run(t);
    assert.equal(first.status, 'ok');
    assert.equal(rtCalls().length, 3);
    // 40 viewers over the next 29 seconds
    await Promise.all(Array.from({ length: 40 }, (_, i) => run(t + i * 700)));
    assert.equal(rtCalls().length, 3, 'one Google read for everybody');
    assert.equal(REALTIME_PUBLIC_TTL_MS, 30_000);
    t += REALTIME_PUBLIC_TTL_MS + 1;
    await run(t);
    assert.equal(rtCalls().length, 6);
});

test('realtime public: another link to the same dashboard and another owner are separate cache entries', async () => {
    reset();
    const doc = sharedDoc();
    const controls = publicControlsFromQuery(new URLSearchParams(''), doc, { viewerControls: { date: false, compare: false, filters: false } });
    const run = (shareToken: string, ownerId: string) => evaluatePublicRealtime({ shareToken, ownerId, widget: doc.widgets.w_pub as RealtimeWidget, defaultSource: doc.defaultSource, controlDefs: doc.controls, controls }, { ...owner(ownerId), mode: 'public' });
    await run(SHARE, 'owner1');
    await run('c'.repeat(32), 'owner1'); // same owner: the property snapshot is shared, the rendered answer is not
    assert.equal(rtCalls().length, 3, 'the owner\'s snapshot is reused by their second link');
    await run(SHARE, 'owner2');
    assert.equal(rtCalls().length, 6, 'a different owner never reads the first owner\'s entry');
});

test('realtime public: filters from the URL count only when the share lets viewers filter', async () => {
    reset();
    const doc = sharedDoc();
    const q = new URLSearchParams('f.f_c=US');
    const off = publicControlsFromQuery(q, doc, { viewerControls: { date: false, compare: false, filters: false } });
    const on = publicControlsFromQuery(q, doc, { viewerControls: { date: false, compare: false, filters: true } });
    const run = (controls: ControlState, id: string) => evaluatePublicRealtime({ shareToken: SHARE + id, ownerId: 'owner1', widget: doc.widgets.w_pub as RealtimeWidget, defaultSource: doc.defaultSource, controlDefs: doc.controls, controls }, { ...owner('owner1'), mode: 'public' });
    await run(off, 'a');
    assert.doesNotMatch(JSON.stringify(rtCalls().map((c) => c.body.dimensionFilter)), /countryId/, 'filters off: the URL cannot narrow the numbers');
    reset();
    await run(on, 'b');
    assert.match(JSON.stringify(rtCalls().map((c) => c.body.dimensionFilter)), /countryId/);
});

test('realtime public: the answer carries no owner token, property id, site URL or account', async () => {
    reset();
    const doc = sharedDoc();
    const controls = publicControlsFromQuery(new URLSearchParams(''), doc, { viewerControls: { date: false, compare: false, filters: false } });
    const r = await evaluatePublicRealtime({ shareToken: SHARE, ownerId: 'owner1', widget: doc.widgets.w_pub as RealtimeWidget, defaultSource: doc.defaultSource, controlDefs: doc.controls, controls }, { ...owner('owner1'), mode: 'public' });
    const text = JSON.stringify(r);
    assert.doesNotMatch(text, /demo-access|Bearer|ya29|properties\/\d|sc-domain|owner1|refresh/i);
    assert.match(text, /acmeanalytics\.example/, 'a host label, like the public doc');
    // and the public doc itself still names no ids for the widget
    const pd = publicDoc(doc, () => 'Acme');
    assert.doesNotMatch(JSON.stringify(pd.widgets.w_pub), /siteId|properties\//);
});

test('realtime public: a site switch key the owner did not allow never moves the widget', async () => {
    reset();
    const doc = sharedDoc();
    const sc: SiteControl = { id: 's1', type: 'site', label: 'Site', options: [ACME, DATAVIZ], default: '', scope: { mode: 'all' }, viewerCanChange: true };
    const dir = { sites: [{ siteId: ACME, label: ACME, ga4: 'properties/1' }, { siteId: DATAVIZ, label: DATAVIZ, ga4: 'properties/2' }] };
    const good = siteOptionKey(SHARE, 's1', DATAVIZ);
    assert.deepEqual(sitePicksFromKeys([sc], { s1: good }, dir, SHARE), { s1: DATAVIZ });
    assert.deepEqual(sitePicksFromKeys([sc], { s1: 'AAAAAAAAAAAA' }, dir, SHARE), {}, 'forged key');
    assert.deepEqual(sitePicksFromKeys([sc], { s1: siteOptionKey('d'.repeat(32), 's1', DATAVIZ) }, dir, SHARE), {}, 'another link\'s key');
    assert.deepEqual(sitePicksFromKeys([{ ...sc, viewerCanChange: false }], { s1: good }, dir, SHARE), {}, 'switching is off');
    void doc;
});
