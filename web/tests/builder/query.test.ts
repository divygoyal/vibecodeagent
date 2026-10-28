/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Google request/response fixtures */
/**
 * Builder v2 query API tests: date resolution, compile, leaf dedupe and GA4 batching, cache,
 * limiter, per-family filters, v1 migration and the privacy of the public endpoint.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/query.test.ts
 * Google is answered by the demo generator (lib/demo fetch shim); nothing touches the network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { limiterPeak, resetLimiterStats } from '@/lib/googleLimiter';
import { resolveCompare, resolveRange, rangeFromParam } from '@/lib/builder/dates';
import { compileWidget } from '@/lib/builder/compile';
import { defaultWidget, newWidgetId } from '@/lib/builder/registry';
import { migrateV1toV2 } from '@/lib/builder/migrate';
import { validateDoc } from '@/lib/builder/schema';
import { TEMPLATES, buildFromTemplate } from '@/lib/builder/templates';
import { publicDoc, publicControlsFromQuery } from '@/lib/builder/publicDoc';
import { evaluateWidgets, __test, type EvalInput } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import type { ControlState, DashboardDocV2, WidgetDef } from '@/lib/builder/types';

// Google answered by the demo generator (no network); every data call is counted.
interface Call { url: string; body: any }
const calls: Call[] = [];
const demoFetch = createDemoGoogleFetch();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (/analyticsdata|searchAnalytics/.test(url)) calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return demoFetch(input, init);
}) as typeof fetch;

const NOW = new Date('2026-10-26T12:00:00Z');
const TOKEN = demoAccessToken();
const deps = (userId = 'u1') => ({ userId, getToken: async () => TOKEN, mode: 'owner' as const, now: NOW });
const ACME = { type: 'site' as const, siteId: 'acmeanalytics.example' };
const controls = (range = '28d', compare: 'previous_period' | 'none' = 'previous_period'): ControlState => ({
    date: { range: { kind: 'preset', id: range as '28d' }, compare: { mode: compare } },
    filters: {},
});
const ga4Calls = () => calls.filter((c) => c.url.includes('analyticsdata'));
const gscCalls = () => calls.filter((c) => c.url.includes('searchAnalytics'));
const reset = () => {
    calls.length = 0;
    clearBuilderCache();
    resetLimiterStats();
};

// ── dates ──
test('dates: presets end yesterday, compare ranges, custom clamp', () => {
    assert.deepEqual(resolveRange({ kind: 'preset', id: '28d' }, '2026-10-26'), { start: '2026-09-28', end: '2026-10-25' });
    assert.deepEqual(resolveRange({ kind: 'preset', id: '7d', includeToday: true }, '2026-10-26'), { start: '2026-10-20', end: '2026-10-26' });
    assert.deepEqual(resolveRange({ kind: 'preset', id: 'last_month' }, '2026-03-15'), { start: '2026-02-01', end: '2026-02-28' });
    const r = resolveRange({ kind: 'preset', id: '28d' }, '2026-10-26');
    assert.deepEqual(resolveCompare(r, { mode: 'previous_period' }), { start: '2026-08-31', end: '2026-09-27' });
    assert.deepEqual(resolveCompare({ start: '2024-02-29', end: '2024-03-06' }, { mode: 'previous_year' }), { start: '2023-02-28', end: '2023-03-06' });
    assert.deepEqual(resolveCompare(r, { mode: 'previous_year', align: 'weekday' }), { start: '2025-09-29', end: '2025-10-26' });
    // custom ranges are clamped to the 16-month history and to today
    assert.deepEqual(resolveRange({ kind: 'custom', start: '2020-01-01', end: '2030-01-01' }, '2026-10-26'), { start: '2025-06-27', end: '2026-10-26' });
    assert.deepEqual(rangeFromParam('2026-09-01_2026-09-30'), { kind: 'custom', start: '2026-09-01', end: '2026-09-30' });
    assert.equal(rangeFromParam('nonsense'), null);
});

// ── compile ──
test('compile: scorecard asks for a total and a spark; filters respect scope', () => {
    const w = defaultWidget('scorecard', { families: { ga4: true, gsc: true } }, 'w_a');
    const c = compileWidget(w, {
        controlDefs: [
            { id: 'f_country', type: 'filter', label: 'Country', dimension: 'country', ui: 'multiselect', scope: { mode: 'all' }, viewerCanChange: true },
            { id: 'f_other', type: 'filter', label: 'Device', dimension: 'device', ui: 'select', scope: { mode: 'widgets', widgetIds: ['w_other'] }, viewerCanChange: true },
        ],
        controls: { ...controls(), filters: { f_country: ['US', 'CA'], f_other: ['mobile'] } },
    });
    assert.deepEqual(c.queries.map((q) => q.part), ['total', 'spark']);
    assert.deepEqual(c.queries[0].filters, [{ dimension: 'country', op: 'in', value: ['US', 'CA'] }]);
});

test('filters translate per family (GSC alpha-3 regex, GA4 inList)', () => {
    const { ga4Filter, gscFilters } = __test;
    assert.deepEqual(gscFilters([{ dimension: 'country', op: 'in', value: ['US', 'CA'] }]), [{ groupType: 'and', filters: [{ dimension: 'country', operator: 'includingRegex', expression: '^(usa|can)$' }] }]);
    assert.deepEqual(gscFilters([{ dimension: 'device', op: 'eq', value: 'mobile' }]), [{ groupType: 'and', filters: [{ dimension: 'device', operator: 'equals', expression: 'MOBILE' }] }]);
    assert.deepEqual(ga4Filter([{ dimension: 'country', op: 'in', value: ['US', 'CA'] }]), { filter: { fieldName: 'countryId', inListFilter: { values: ['US', 'CA'], caseSensitive: false } } });
    assert.equal(__test.isoWeekToMonday('202643'), '2026-10-19');
});

// ── engine: dedupe and batching ──
function input(widgets: WidgetDef[], c = controls()): EvalInput {
    return { widgets: widgets.map((widget) => ({ widget })), defaultSource: ACME, controlDefs: [], controls: c };
}

test('identical widgets share one Google call; GA4 reports go out in batches of 5', async () => {
    reset();
    const ctx = { families: { ga4: true, gsc: true } };
    const ga4Metrics = ['ga4:activeUsers', 'ga4:sessions', 'ga4:screenPageViews', 'ga4:keyEvents', 'ga4:engagementRate', 'ga4:bounceRate', 'ga4:newUsers'];
    const widgets: WidgetDef[] = [];
    // 7 scorecards (merged into one total report + one spark report), the same scorecard twice,
    // and 8 bar charts on different dimensions (8 ranked reports that cannot merge).
    for (const id of ga4Metrics) {
        const w = defaultWidget('scorecard', ctx) as Extract<WidgetDef, { type: 'scorecard' }>;
        w.config.metric = { id };
        widgets.push(w);
    }
    widgets.push({ ...widgets[0], id: newWidgetId() });
    for (const dim of ['channel', 'source', 'medium', 'country', 'device', 'browser', 'os', 'language']) {
        const w = defaultWidget('bar', { families: { ga4: true, gsc: false } }) as Extract<WidgetDef, { type: 'bar' }>;
        w.config.dimension = dim;
        widgets.push(w);
    }
    const res = await evaluateWidgets(input(widgets), deps());
    const errors = Object.values(res.results).filter((r) => r.status === 'error');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const batches = ga4Calls();
    assert.ok(batches.every((c) => c.url.endsWith(':batchRunReports')), 'only batchRunReports');
    assert.ok(batches.every((c) => c.body.requests.length <= 5), 'at most 5 reports per batch');
    assert.ok(batches.every((c) => c.url.includes('properties/412300101')), 'one property per batch');
    const reports = batches.reduce((n, c) => n + c.body.requests.length, 0);
    assert.equal(reports, 10, `2 merged scorecard reports + 8 bar reports, got ${reports}`);
    assert.equal(batches.length, 2);
    assert.equal(res.meta.google.ga4Calls, 2);
    // Merged report carries every scorecard metric
    const totalReq = batches.flatMap((c) => c.body.requests).find((r: any) => r.dimensions.length === 0);
    assert.equal(totalReq.metrics.length, 7);
    assert.equal(totalReq.dateRanges.length, 2, 'comparison is a second named range in the same report');
    // Values come back with their comparison
    const sc = res.results[widgets[0].id];
    assert.equal(sc.status, 'ok');
    if (sc.status === 'ok') {
        const row = sc.parts.total.rows[0];
        assert.equal(typeof row['m:ga4:activeUsers'], 'number');
        assert.equal(typeof row['m:ga4:activeUsers:prev'], 'number');
        assert.equal(sc.parts.spark.rows.length, 28, 'spark is zero-filled to the 28 days');
    }
    assert.ok(limiterPeak('ga4', 'properties/412300101') <= 8);

    // Second load: everything from cache, no Google calls.
    calls.length = 0;
    const again = await evaluateWidgets(input(widgets), deps());
    assert.equal(calls.length, 0);
    assert.equal(again.meta.cache.miss, 0);
});

test('GSC widgets honour the date range and compare (v1 bug: always 30 days)', async () => {
    reset();
    const w = defaultWidget('scorecard', { families: { ga4: false, gsc: true } });
    const res = await evaluateWidgets(input([w], controls('7d')), deps());
    const bodies = gscCalls().map((c) => c.body);
    assert.equal(bodies.length, 3, 'total, previous total, spark');
    // Round 7: Search Console reads its own complete days (lib/dateRange: through 2 days ago), the site page's window.
    assert.ok(bodies.some((b) => b.startDate === '2026-10-18' && b.endDate === '2026-10-24'));
    assert.ok(bodies.some((b) => b.startDate === '2026-10-11' && b.endDate === '2026-10-17'));
    assert.ok(bodies.every((b) => b.dataState === 'all'));
    assert.deepEqual(res.resolved.search, { start: '2026-10-18', end: '2026-10-24' }, 'the header can name the Search Console days');
    // A dashboard without Search Console widgets has one window: no Search Console days in the header.
    const ga = await evaluateWidgets(input([defaultWidget('scorecard', { families: { ga4: true, gsc: false } })], controls('7d')), deps());
    assert.equal(ga.resolved.search, undefined, 'GA4-only: no Search Console window');
    assert.equal((await evaluateWidgets(input([], controls('7d')), deps())).resolved.search, undefined, 'empty dashboard: none either');
    const r = res.results[w.id];
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
        assert.equal(r.flags.preliminaryFrom, undefined, 'complete days only: nothing preliminary');
        assert.equal(r.parts.spark.rows.length, 7);
        assert.equal(r.parts.spark.rows[6]['d:date'], '2026-10-24');
    }
});

test('limiter keeps a 40-widget dashboard at most 8 in flight per property', async () => {
    reset();
    const dims = ['channel', 'source', 'medium', 'sourceMedium', 'campaign', 'page', 'pageTitle', 'landingPage', 'country', 'region', 'city', 'language', 'device', 'browser', 'os', 'newVsReturning', 'eventName', 'continent', 'hostName', 'firstUserChannel'];
    const widgets: WidgetDef[] = [];
    for (const dim of dims) {
        for (const metric of ['ga4:sessions', 'ga4:activeUsers']) {
            const w = defaultWidget('bar', { families: { ga4: true, gsc: false } }) as Extract<WidgetDef, { type: 'bar' }>;
            w.config.dimension = dim;
            w.config.metrics = [{ id: metric }];
            w.config.sort = { by: metric, dir: 'desc' };
            widgets.push(w);
        }
    }
    const res = await evaluateWidgets(input(widgets), deps());
    assert.equal(Object.values(res.results).filter((r) => r.status === 'error').length, 0);
    assert.ok(limiterPeak('ga4', 'properties/412300101') <= 8, `peak ${limiterPeak('ga4', 'properties/412300101')}`);
    assert.ok(ga4Calls().length <= 8, `40 reports in ${ga4Calls().length} calls`);
});

test('mixed families join on date; missing family is an error state, not a crash', async () => {
    reset();
    const ts = defaultWidget('timeseries', { families: { ga4: true, gsc: true } }) as Extract<WidgetDef, { type: 'timeseries' }>;
    ts.config.series = [{ metric: { id: 'gsc:clicks' }, kind: 'line' }, { metric: { id: 'ga4:sessions' }, kind: 'line' }];
    const noGa4 = defaultWidget('scorecard', { families: { ga4: true, gsc: true } });
    noGa4.source = { type: 'site', siteId: 'recipenest.example' };
    const res = await evaluateWidgets(input([ts, noGa4]), deps());
    const r = res.results[ts.id];
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
        const row = r.parts.series.rows[3];
        assert.equal(typeof row['m:ga4:sessions'], 'number');
        assert.equal(typeof row['m:gsc:clicks'], 'number');
    }
    const e = res.results[noGa4.id];
    assert.equal(e.status, 'error');
    if (e.status === 'error') assert.equal(e.code, 'NO_GA4_SOURCE');
});

test('portfolio source rolls up every site and flags summed users', async () => {
    reset();
    const kpi = defaultWidget('kpi-strip', { families: { ga4: true, gsc: true } });
    kpi.source = { type: 'portfolio', include: 'all' };
    const grid = defaultWidget('portfolio-grid', { families: { ga4: true, gsc: true } });
    const res = await evaluateWidgets(input([kpi, grid]), deps());
    const k = res.results[kpi.id];
    assert.equal(k.status, 'ok', JSON.stringify(k));
    if (k.status === 'ok') {
        assert.equal(k.flags.usersSummed, true);
        assert.ok((k.parts.total.rows[0]['m:gsc:clicks'] as number) > 0);
    }
    const g = res.results[grid.id];
    assert.equal(g.status, 'ok', JSON.stringify(g));
    if (g.status === 'ok') assert.ok(g.parts.sites.rows.length >= 8, `sites ${g.parts.sites.rows.length}`);
});

test('every template evaluates against the demo data without errors', async () => {
    reset();
    for (const t of TEMPLATES) {
        const doc = buildFromTemplate(t.id, { name: t.name, defaultSource: t.portfolio ? { type: 'portfolio', include: 'all' } : ACME });
        assert.equal(validateDoc(doc).ok, true, `${t.id} validates`);
        const widgets = doc.pages.flatMap((p) => p.layouts.lg.map((l) => ({ widget: doc.widgets[l.i], pageId: p.id })));
        const res = await evaluateWidgets({ widgets, defaultSource: doc.defaultSource, controlDefs: doc.controls, controls: controls() }, deps());
        const bad = Object.entries(res.results).filter(([, r]) => r.status === 'error');
        assert.equal(bad.length, 0, `${t.id}: ${JSON.stringify(bad)}`);
    }
});

test('mover lists (changeOnly) keep only rows that moved their way: "Declining pages" never lists a rising page', async () => {
    reset();
    const doc = buildFromTemplate('content-performance', { name: 'Content', defaultSource: ACME });
    const widgets = doc.pages.flatMap((p) => p.layouts.lg.map((l) => ({ widget: doc.widgets[l.i], pageId: p.id })));
    const res = await evaluateWidgets({ widgets, defaultSource: doc.defaultSource, controlDefs: doc.controls, controls: controls() }, deps());
    const moved = (r: Record<string, unknown>) => Number(r['m:gsc:clicks'] ?? 0) - Number(r['m:gsc:clicks:prev'] ?? 0);
    for (const [id, sign] of [['w_rising', 1], ['w_declining', -1]] as const) {
        const r = res.results[id];
        assert.equal(r.status, 'ok', `${id}: ${JSON.stringify(r)}`);
        if (r.status !== 'ok') continue;
        const rows = Object.values(r.parts)[0].rows;
        for (const row of rows) assert.ok(Math.sign(moved(row)) === sign, `${id}: ${JSON.stringify(row)}`);
    }
});

test('portfolio "All sites" table: by clicks high to low, hosts as names, GA4 names only for the owner', async () => {
    reset();
    const doc = buildFromTemplate('portfolio', { name: 'P', defaultSource: { type: 'portfolio', include: 'all' } });
    const widgets = [{ widget: doc.widgets.w_sites, pageId: doc.pages[0].id }];
    const run = (mode: 'owner' | 'public') => evaluateWidgets({ widgets, defaultSource: doc.defaultSource, controlDefs: doc.controls, controls: controls() }, { ...deps(), mode });
    const owner = (await run('owner')).results.w_sites;
    assert.equal(owner.status, 'ok', JSON.stringify(owner));
    if (owner.status !== 'ok') return;
    const frame = Object.values(owner.parts)[0];
    const clicks = frame.rows.map((r) => r['m:gsc:clicks']).filter((v): v is number => typeof v === 'number');
    assert.deepEqual(clicks, [...clicks].sort((a, b) => b - a), 'clicks high to low');
    const labels = Object.values(frame.labels ?? {});
    assert.ok(labels.includes('creativeprints.example'), `GA4-only site named by its host: ${labels.join(', ')}`);
    assert.ok(!labels.some((l) => /Shop|\(\d+\)$/.test(l)), `no GA4 names or bare numbers as names: ${labels.join(', ')}`);
    assert.equal(frame.sublabels?.['creativeprints.example'], 'Creative Prints Shop');
    const pub = (await run('public')).results.w_sites;
    if (pub.status === 'ok') assert.equal(Object.values(pub.parts)[0].sublabels, undefined, 'public views never get GA4 names');
});

// ── migration ──
test('v1 dashboards migrate to valid v2 docs (layout doubled, metrics fixed, ids pinned)', () => {
    const v1 = {
        id: 'd1', name: 'Old', propertyId: 'properties/412300101', siteUrl: 'sc-domain:acmeanalytics.example',
        widgets: [
            { id: 'k1', type: 'kpi', title: 'Users', dataSource: 'ga4', metric: 'totalUsers' },
            { id: 'a1', type: 'area-chart', title: 'Trend', dataSource: 'ga4', metric: 'engagementRate', dimension: 'date', chartType: 'line' },
            { id: 'b1', type: 'bar-chart', title: 'Sources', dataSource: 'ga4', metric: 'sessions', dimension: 'source' },
            { id: 's1', type: 'seo-performance', dataSource: 'gsc' },
            { id: 'q1', type: 'keywords-table', dataSource: 'gsc' },
            { id: 'x1', type: 'weird-widget' },
        ],
        gridLayouts: { lg: [{ i: 'k1', x: 0, y: 0, w: 3, h: 2, minW: 2 }, { i: 'a1', x: 0, y: 2, w: 6, h: 4 }], md: [], sm: [] },
        theme: { preset: 'default', backgroundColor: '#09090b', companyName: 'Acme', showTrafficClawBranding: false },
    };
    const doc = migrateV1toV2(v1, NOW);
    assert.equal(validateDoc(doc).ok, true, JSON.stringify(validateDoc(doc)));
    assert.deepEqual(doc.defaultSource, { type: 'site', siteId: 'acmeanalytics.example', ga4: 'properties/412300101', gsc: 'sc-domain:acmeanalytics.example' });
    assert.deepEqual(doc.pages[0].layouts.lg[0], { i: 'k1', x: 0, y: 0, w: 3, h: 4 });
    assert.equal(doc.widgets.k1.type, 'scorecard');
    assert.equal((doc.widgets.k1 as any).config.metric.id, 'ga4:activeUsers');
    assert.equal((doc.widgets.a1 as any).config.series[0].metric.id, 'ga4:engagementRate', 'no silent activeUsers fallback');
    assert.equal((doc.widgets.b1 as any).config.dimension, 'sourceMedium');
    assert.equal(doc.widgets.s1.type, 'timeseries');
    assert.equal(doc.widgets.x1.type, 'text', 'unknown widgets become a visible note');
    assert.equal(doc.theme.mode, 'dark');
    assert.equal(doc.theme.badge.show, false);
    assert.equal(doc.pages[0].layouts.lg.length, 6, 'widgets missing from the layout are kept');
});

// ── public endpoint privacy ──
test('public doc has no property ids or site URLs; query string cannot name metrics or sources', () => {
    const doc: DashboardDocV2 = buildFromTemplate('site-overview', {
        name: 'Acme', defaultSource: { type: 'site', siteId: 'acmeanalytics.example', ga4: 'properties/412300101', gsc: 'sc-domain:acmeanalytics.example' },
    });
    doc.meta.migratedFromV1 = { at: 'x', propertyId: 'properties/412300101', siteUrl: 'sc-domain:acmeanalytics.example' };
    const firstId = Object.keys(doc.widgets)[0];
    doc.widgets[firstId].source = { type: 'site', siteId: 'datavizpro.example', ga4: 'properties/412300103', gsc: 'sc-domain:datavizpro.example' };
    const pub = publicDoc(doc, (s) => (s.type === 'site' ? s.siteId : 'All sites'));
    const json = JSON.stringify(pub);
    assert.ok(!json.includes('properties/'), 'no GA4 property ids');
    assert.ok(!json.includes('sc-domain:'), 'no Search Console site URLs');
    assert.ok(!json.includes('https://www.'), 'no URL-prefix site URLs');

    const share = { viewerControls: { date: true, compare: false, filters: false } };
    const q = new URLSearchParams('range=7d&compare=yoy&metric=ga4:totalRevenue&source=properties/1&f.country=US&widgets=evil&page=p_main');
    const state = publicControlsFromQuery(q, doc, share);
    assert.deepEqual(state.date.range, { kind: 'preset', id: '7d' }, 'date allowed');
    assert.deepEqual(state.date.compare, { mode: 'previous_period' }, 'compare locked to the default');
    assert.deepEqual(state.filters, {}, 'filters not allowed for viewers');
    assert.equal(JSON.stringify(state).includes('totalRevenue'), false);
    assert.equal(JSON.stringify(state).includes('properties/1'), false);
});
