/**
 * Round 9 scatter: schema, query plan, data shaping (medians, quadrants, log axis), viewer switchers and the
 * engine end to end against the demo Google.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/chart-scatter.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import { logTicks, median, pointRadius, quadrantOf, quadrantText, shapeScatter } from '@/lib/builder/charts/scatter';
import type { ScatterWidget } from '@/lib/builder/charts/types';
import { defaultWidget, widgetMetrics, widgetTitle } from '@/lib/builder/registry';
import { validateWidgets } from '@/lib/builder/schema';
import type { MetricControl } from '@/lib/builder/types';
import { ACME, controlsOf, calls, runOne } from './chartsHelper';

const both = { families: { ga4: true, gsc: true } };
const scatter = (over: Partial<ScatterWidget['config']> = {}, id = 'w_sc'): ScatterWidget => {
    const w = defaultWidget('scatter', both, id) as ScatterWidget;
    return { ...w, source: ACME, config: { ...w.config, ...over } };
};

test('scatter: defaults are pages, impressions against CTR sized by clicks (Analytics only: pageviews against engagement)', () => {
    const w = defaultWidget('scatter', both) as ScatterWidget;
    assert.deepEqual([w.config.dimension, w.config.x.id, w.config.y.id, w.config.size?.id, w.config.xScale, w.config.highlight], ['page', 'gsc:impressions', 'gsc:ctr', 'gsc:clicks', 'log', 'br']);
    const ga = defaultWidget('scatter', { families: { ga4: true, gsc: false } }) as ScatterWidget;
    assert.deepEqual([ga.config.x.id, ga.config.y.id], ['ga4:screenPageViews', 'ga4:engagementRate']);
    assert.equal(widgetTitle({ ...w, title: undefined }), 'CTR against impressions by page');
    assert.deepEqual(widgetMetrics(w), ['gsc:impressions', 'gsc:ctr', 'gsc:clicks']);
});

test('scatter schema: validates, refuses the same metric twice, dates and out-of-range point counts', () => {
    assert.equal(validateWidgets([scatter()]).ok, true);
    assert.equal(validateWidgets([scatter({ size: undefined })]).ok, true);
    const same = validateWidgets([scatter({ y: { id: 'gsc:impressions' } })]);
    assert.equal(same.ok, false);
    if (!same.ok) assert.match(same.error, /two different metrics/);
    assert.equal(validateWidgets([scatter({ dimension: 'date' })]).ok, false);
    assert.equal(validateWidgets([scatter({ top: 500 })]).ok, false);
    assert.equal(validateWidgets([scatter({ top: 2 })]).ok, false);
    assert.equal(validateWidgets([scatter({ highlight: 'xx' as 'br' })]).ok, false);
    assert.equal(validateWidgets([{ ...scatter(), config: { dimension: 'page', x: { id: 'nope' }, y: { id: 'gsc:ctr' }, top: 10 } }]).ok, false);
});

test('scatter compile: one ranked report with every metric once, biggest by size', () => {
    const ctx = { controlDefs: [], controls: controlsOf() };
    const q = compileWidget(scatter(), ctx).queries;
    assert.equal(q.length, 1);
    assert.deepEqual([q[0].part, q[0].dimensions, q[0].metrics], ['rows', ['page'], ['gsc:impressions', 'gsc:ctr', 'gsc:clicks']]);
    assert.deepEqual(q[0].sort, { by: 'gsc:clicks', dir: 'desc' });
    assert.deepEqual(q[0].top, { n: 50, other: false });
    // Without a size metric it ranks by x; the same metric on two roles is fetched once.
    const q2 = compileWidget(scatter({ size: undefined, x: { id: 'gsc:clicks' }, y: { id: 'gsc:ctr' } }), ctx).queries[0];
    assert.deepEqual(q2.metrics, ['gsc:clicks', 'gsc:ctr']);
    assert.deepEqual(q2.sort, { by: 'gsc:clicks', dir: 'desc' });
});

test('scatter follows the metric switcher (any axis) and filters', () => {
    const mc: MetricControl = { id: 'm1', type: 'metric', label: 'Metric', options: ['gsc:impressions', 'gsc:clicks'], default: 'gsc:impressions', scope: { mode: 'all' } };
    const ctx = { controlDefs: [mc], controls: controlsOf('28d', { metric: { m1: 'gsc:clicks' }, interaction: [{ dimension: 'country', op: 'eq', value: 'US' }] }) };
    // The widget already shows clicks (as the size), so the switcher leaves it alone.
    const w = applyViewerControls(scatter(), ctx) as ScatterWidget;
    assert.equal(w.config.x.id, 'gsc:impressions');
    const noSize = applyViewerControls(scatter({ size: undefined }), ctx) as ScatterWidget;
    assert.equal(noSize.config.x.id, 'gsc:clicks');
    assert.equal(noSize.config.y.id, 'gsc:ctr');
    assert.deepEqual(compileWidget(scatter(), ctx).queries[0].filters, [{ dimension: 'country', op: 'eq', value: 'US' }]);
});

const row = (k: string, x: number | null, y: number | null, s: number | null = null) => ({ 'd:page': k, 'm:gsc:impressions': x, 'm:gsc:ctr': y, 'm:gsc:clicks': s });

test('scatter shaping: medians, quadrants, skipped rows, extents', () => {
    const c = scatter().config;
    const m = shapeScatter([row('/a', 100, 0.1, 10), row('/b', 200, 0.02, 4), row('/c', 300, 0.3, 90), row('/d', 400, 0.01, 4), row('/e', null, 0.5), { ...row('/other', 1, 1), __other: 1 }, row('', 5, 5)], c);
    assert.equal(m.points.length, 4);
    assert.equal(m.skipped, 2); // /e (no x) and the empty key; the (other) row is dropped silently
    assert.equal(m.medianX, 250);
    assert.ok(Math.abs(m.medianY - 0.06) < 1e-9);
    assert.deepEqual([m.xMin, m.xMax, m.yMin, m.yMax, m.sizeMin, m.sizeMax], [100, 400, 0.01, 0.3, 4, 90]);
    // br = x high, y low: /b is below the x median, so /d only.
    assert.deepEqual(m.counts, { tl: 1, tr: 1, bl: 1, br: 1 });
    assert.equal(quadrantOf({ x: 400, y: 0.01 }, m.medianX, m.medianY), 'br');
    assert.equal(quadrantOf({ x: 250, y: m.medianY }, m.medianX, m.medianY), 'tr'); // ties count as high
});

test('scatter shaping: a log axis drops non-positive values', () => {
    const rows = [row('/a', 0, 0.1), row('/b', 10, 0.1), row('/c', 100, 0.2)];
    assert.equal(shapeScatter(rows, scatter({ xScale: 'log' }).config).points.length, 2);
    assert.equal(shapeScatter(rows, scatter({ xScale: 'linear' }).config).points.length, 3);
    assert.equal(shapeScatter(rows, scatter({ xScale: 'log' }).config).skipped, 1);
});

test('scatter helpers: median, radius, log ticks, quadrant wording', () => {
    assert.equal(median([]), 0);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(pointRadius(null, 0, 10), 5);
    assert.equal(pointRadius(0, 0, 100), 4);
    assert.equal(pointRadius(100, 0, 100), 16);
    assert.ok(pointRadius(25, 0, 100) > 4 && pointRadius(25, 0, 100) < 16);
    assert.deepEqual(logTicks(8, 600), [10, 20, 50, 100, 200, 500]);
    assert.ok(logTicks(3, 3.1).length >= 2);
    assert.equal(quadrantText('br', scatter().config), 'Above-median impressions, below-median CTR');
});

test('scatter engine: pages with impressions, CTR and clicks from Search Console (and Analytics pages too)', async () => {
    const r = await runOne(scatter());
    const m = shapeScatter(r.parts.rows.rows, scatter().config);
    assert.ok(m.points.length >= 10, `points ${m.points.length}`);
    assert.ok(m.points.length <= 50);
    assert.ok(m.points.every((p) => p.x > 0 && p.y >= 0 && p.y <= 1));
    assert.ok(m.sizeMax > 0);
    assert.ok(m.counts.br + m.counts.tr + m.counts.bl + m.counts.tl === m.points.length);
    assert.equal(calls.filter((c) => c.url.includes('analyticsdata')).length, 0);
    // Analytics pages: pageviews against engagement rate, sized by sessions (one report).
    const g = await runOne(scatter({ x: { id: 'ga4:screenPageViews' }, y: { id: 'ga4:engagementRate' }, size: { id: 'ga4:sessions' }, highlight: undefined }, 'w_ga'));
    assert.ok(shapeScatter(g.parts.rows.rows, scatter({ x: { id: 'ga4:screenPageViews' }, y: { id: 'ga4:engagementRate' } }).config).points.length >= 5);
    assert.equal(calls.filter((c) => c.url.includes('analyticsdata')).length, 1);
    // Search Console and Analytics together join on page.
    const j = await runOne(scatter({ x: { id: 'gsc:impressions' }, y: { id: 'ga4:engagementRate' }, size: { id: 'ga4:sessions' } }, 'w_j'));
    assert.ok(shapeScatter(j.parts.rows.rows, scatter({ x: { id: 'gsc:impressions' }, y: { id: 'ga4:engagementRate' } }).config).points.length >= 3);
});
