/**
 * Round 9 funnel ("step counts"): schema, query plan (one report per step, the step as a filter), data
 * shaping (conversion, drop-off, out-of-order), CSV, filters and the engine end to end against the demo Google.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/chart-funnel.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import { activeSteps, funnelCsvFrame, funnelWarnings, shapeFunnel, stepFilter, stepLabel } from '@/lib/builder/charts/funnel';
import type { FunnelWidget } from '@/lib/builder/charts/types';
import { defaultWidget, widgetMetrics, widgetTitle } from '@/lib/builder/registry';
import { validateWidgets } from '@/lib/builder/schema';
import type { DataFrame, MetricControl, WidgetResultOk } from '@/lib/builder/types';
import { ACME, controlsOf, calls, run, reset, runOne } from './chartsHelper';

const both = { families: { ga4: true, gsc: true } };
const funnel = (over: Partial<FunnelWidget['config']> = {}, id = 'w_fn'): FunnelWidget => {
    const w = defaultWidget('funnel', both, id) as FunnelWidget;
    return { ...w, source: { type: 'site', siteId: 'creativeprints.example' }, config: { ...w.config, ...over } };
};
const SHOP = [
    { label: 'Visit', kind: 'event' as const, value: 'session_start' },
    { label: 'Viewed a product', kind: 'event' as const, value: 'view_item' },
    { label: 'Added to cart', kind: 'event' as const, value: 'add_to_cart' },
    { label: 'Started checkout', kind: 'event' as const, value: 'begin_checkout' },
    { label: 'Bought', kind: 'event' as const, value: 'purchase' },
];

test('funnel: default widget, title and metrics', () => {
    const w = defaultWidget('funnel', both) as FunnelWidget;
    assert.equal(w.config.steps.length, 4);
    assert.equal(w.config.metric.id, 'ga4:activeUsers');
    assert.equal(widgetTitle({ ...w, title: undefined }), 'Users by step');
    assert.deepEqual(widgetMetrics(w), ['ga4:activeUsers']);
});

test('funnel schema: 2 to 8 steps, Analytics metric only, known step kinds', () => {
    assert.equal(validateWidgets([funnel({ steps: SHOP })]).ok, true);
    assert.equal(validateWidgets([funnel({ steps: SHOP.slice(0, 1) })]).ok, false);
    assert.equal(validateWidgets([funnel({ steps: [...SHOP, ...SHOP] })]).ok, false);
    const gsc = validateWidgets([funnel({ metric: { id: 'gsc:clicks' } })]);
    assert.equal(gsc.ok, false);
    if (!gsc.ok) assert.match(gsc.error, /Analytics metric/);
    assert.equal(validateWidgets([funnel({ steps: [{ kind: 'sql' as 'event', value: 'x' }, SHOP[0]] })]).ok, false);
    assert.equal(validateWidgets([funnel({ steps: [{ kind: 'page', match: 'regex' as 'exact', value: '/x' }, SHOP[0]] })]).ok, false);
    // A step still being filled in is allowed (the widget asks nothing of Google until two are named).
    assert.equal(validateWidgets([funnel({ steps: [SHOP[0], { kind: 'event', value: '' }] })]).ok, true);
});

test('funnel compile: one total report per named step, the step as its own filter, widget filters kept', () => {
    const ctx = { controlDefs: [], controls: controlsOf('28d', { interaction: [{ dimension: 'country', op: 'eq', value: 'US' }] }) };
    const q = compileWidget(funnel({ steps: [...SHOP, { kind: 'event', value: '  ' }] }), ctx).queries;
    assert.deepEqual(q.map((x) => x.part), ['s0', 's1', 's2', 's3', 's4']);
    assert.ok(q.every((x) => x.dimensions.length === 0 && x.metrics[0] === 'ga4:activeUsers' && !x.compare));
    assert.deepEqual(q[2].stepFilters, [{ dimension: 'eventName', op: 'eq', value: 'add_to_cart' }]);
    assert.deepEqual(q[2].filters, [{ dimension: 'country', op: 'eq', value: 'US' }]);
    assert.equal(compileWidget(funnel({ steps: [SHOP[0], { kind: 'event', value: '' }] }), ctx).queries.length, 0);
    // Page steps.
    assert.deepEqual(stepFilter({ kind: 'page', value: '/pricing' }), { dimension: 'page', op: 'eq', value: '/pricing' });
    assert.deepEqual(stepFilter({ kind: 'page', match: 'starts', value: '/blog/' }), { dimension: 'page', op: 'starts', value: '/blog/' });
    assert.deepEqual(stepFilter({ kind: 'page', match: 'contains', value: 'checkout' }), { dimension: 'page', op: 'contains', value: 'checkout' });
    assert.equal(stepLabel({ kind: 'event', value: 'purchase' }), 'purchase');
    assert.equal(stepLabel({ kind: 'event', value: 'purchase', label: ' Bought ' }), 'Bought');
    assert.equal(activeSteps(funnel({ steps: [SHOP[0], { kind: 'page', value: '' }, SHOP[1]] }).config).length, 2);
});

test('funnel follows the metric switcher', () => {
    const mc: MetricControl = { id: 'm1', type: 'metric', label: 'Metric', options: ['ga4:activeUsers', 'ga4:sessions'], default: 'ga4:activeUsers', scope: { mode: 'all' } };
    const w = applyViewerControls(funnel(), { controlDefs: [mc], controls: controlsOf('28d', { metric: { m1: 'ga4:sessions' } }) }) as FunnelWidget;
    assert.equal(w.config.metric.id, 'ga4:sessions');
    assert.equal(w.title ?? widgetTitle(w), 'Sessions by step');
});

const frameOf = (n: number): DataFrame => ({ columns: [], rows: [{ 'm:ga4:activeUsers': n }] });
const parts = (...n: number[]) => Object.fromEntries(n.map((v, i) => [`s${i}`, frameOf(v)]));

test('funnel shaping: conversion, drop-off, overall, bar scale', () => {
    const c = funnel({ steps: SHOP.slice(0, 4) }).config;
    const m = shapeFunnel(parts(1000, 400, 100, 25), c);
    assert.deepEqual(m.rows.map((r) => r.value), [1000, 400, 100, 25]);
    assert.deepEqual(m.rows.map((r) => r.ofFirst), [1, 0.4, 0.1, 0.025]);
    assert.deepEqual(m.rows.map((r) => r.ofPrev), [null, 0.4, 0.25, 0.25]);
    assert.deepEqual(m.rows.map((r) => r.lost), [null, 600, 300, 75]);
    assert.equal(m.overall, 0.025);
    assert.equal(m.max, 1000);
    assert.equal(m.outOfOrder, false);
    assert.equal(m.empty, false);
    assert.equal(m.rows[0].label, 'Visit');
});

test('funnel shaping: a bigger later step is flagged, empty steps are zero, an empty first step has no ratios', () => {
    const c = funnel({ steps: SHOP.slice(0, 3) }).config;
    const out = shapeFunnel(parts(100, 50, 80), c);
    assert.equal(out.outOfOrder, true);
    assert.equal(out.rows[2].lost, 0); // never negative
    assert.equal(out.rows[2].ofPrev, 1.6);
    const none = shapeFunnel({ s0: { columns: [], rows: [] }, s1: { columns: [], rows: [] }, s2: frameOf(3) }, c);
    assert.deepEqual(none.rows.map((r) => r.value), [0, 0, 3]);
    assert.equal(none.overall, null);
    assert.equal(none.rows[1].ofPrev, null);
    assert.equal(shapeFunnel(parts(0, 0, 0), c).empty, true);
    assert.equal(shapeFunnel({}, funnel({ steps: [SHOP[0], { kind: 'event', value: '' }] }).config).needsSteps, true);
});

test('funnel warnings: a step that repeats an earlier one, and an event shown by its raw name', () => {
    assert.deepEqual(funnelWarnings(funnel({ steps: SHOP }).config), []);
    // The default funnel plus a raw "click" step: the same event as "Clicked", no label.
    const base = defaultWidget('funnel', both) as FunnelWidget;
    const w = funnelWarnings({ ...base.config, steps: [...base.config.steps, { kind: 'event', value: 'click' }] });
    assert.deepEqual(w.map((x) => [x.step, x.kind]), [[5, 'duplicate'], [5, 'raw']]);
    assert.match(w[0].text, /Step 5 counts the same event as step 4 \(click\)/);
    assert.match(w[1].text, /raw event name "click"/);
    // Pages: the same path with a different match is a different step; a blank step is ignored; labels silence "raw".
    const pages = funnelWarnings({ ...base.config, steps: [{ kind: 'page', value: '/pricing' }, { kind: 'page', value: '/pricing', match: 'starts' }, { kind: 'page', value: '/pricing' }, { kind: 'event', value: '' }] });
    assert.deepEqual(pages.map((x) => [x.step, x.kind]), [[3, 'duplicate']]);
});

test('funnel CSV: a row per step with both ratios', () => {
    const w = funnel({ steps: SHOP.slice(0, 3) });
    const r = { status: 'ok', fetchedAt: '', cache: 'hit', parts: parts(200, 50, 10), flags: {} } as WidgetResultOk;
    const f = funnelCsvFrame(w, r);
    assert.deepEqual(f.columns.map((c) => c.label), ['Step', 'Users', '% of previous step', '% of first step']);
    assert.deepEqual(f.rows[1], { 'd:step': 'Viewed a product', 'm:ga4:activeUsers': 50, 'm:ofPrev': 25, 'm:ofFirst': 25 });
    assert.equal(f.rows[0]['m:ofPrev'], null);
});

test('funnel engine: five shop steps are five filtered Analytics reports in one batch, counts fall step by step', async () => {
    const w = funnel({ steps: SHOP });
    const r = await runOne(w);
    const m = shapeFunnel(r.parts, w.config);
    assert.equal(m.rows.length, 5);
    assert.ok(m.rows.every((x) => x.value > 0), JSON.stringify(m.rows.map((x) => x.value)));
    assert.ok(m.rows[0].value > m.rows[2].value && m.rows[2].value > m.rows[4].value);
    assert.equal(m.outOfOrder, false);
    const ga = calls.filter((c) => c.url.includes('analyticsdata'));
    assert.equal(ga.length, 1, 'five reports fit one batchRunReports call');
    const reqs = ga[0].body.requests;
    assert.equal(reqs.length, 5);
    assert.deepEqual(reqs.map((q: any) => q.dimensionFilter.filter.stringFilter.value), SHOP.map((s) => s.value)); // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.ok(reqs.every((q: any) => q.dimensions.length === 0)); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('funnel engine: page steps and a dashboard filter combine into one filter group', async () => {
    const w = funnel({
        metric: { id: 'ga4:sessions' },
        steps: [{ kind: 'page', value: '/', label: 'Home' }, { kind: 'page', match: 'starts', value: '/shop', label: 'Shop' }, { kind: 'event', value: 'purchase' }],
    });
    reset();
    const res = await run([w], controlsOf('28d', { interaction: [{ dimension: 'device', op: 'eq', value: 'mobile' }] }), [], w.source);
    const r = res.results[w.id];
    assert.equal(r.status, 'ok');
    const req = calls.filter((c) => c.url.includes('analyticsdata'))[0].body.requests[1];
    assert.equal(req.dimensionFilter.andGroup.expressions.length, 2);
    const fields = req.dimensionFilter.andGroup.expressions.map((e: any) => e.filter.fieldName).sort(); // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.deepEqual(fields, ['deviceCategory', 'pagePath']);
    // The widget never asks Search Console for anything.
    assert.equal(calls.filter((c) => c.url.includes('searchAnalytics')).length, 0);
    void ACME;
});

test('funnel engine: with fewer than two named steps nothing is asked of Google', async () => {
    const w = funnel({ steps: [SHOP[0], { kind: 'event', value: '' }] });
    const r = await runOne(w);
    assert.equal(calls.length, 0);
    assert.equal(shapeFunnel(r.parts, w.config).needsSteps, true);
});
