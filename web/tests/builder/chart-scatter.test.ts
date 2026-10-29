/**
 * Round 9 scatter: schema, query plan, data shaping (medians, quadrants, log axis), viewer switchers and the
 * engine end to end against the demo Google.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/chart-scatter.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import { axisPixel, ellipsize, logTicks, lowerIsBetter, median, placeLabels, pointRadius, quadrantOf, quadrantText, shapeScatter, type LabelRect, type PlacedLabel } from '@/lib/builder/charts/scatter';
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

test('scatter: a position axis is inverted (1 at top) and quadrants say better or worse, never "above-median position"', () => {
    const q = scatter({ y: { id: 'gsc:position' }, x: { id: 'gsc:impressions' } }).config;
    assert.equal(lowerIsBetter('gsc:position'), true);
    assert.equal(lowerIsBetter('gsc:ctr'), false);
    assert.equal(quadrantText('tr', q), 'Above-median impressions, worse-than-median avg. position');
    assert.equal(quadrantText('br', q), 'Above-median impressions, better-than-median avg. position');
    assert.doesNotMatch(quadrantText('tl', q), /above-median avg\. position/);
    // The pixel scale flips a reversed axis: position 1 sits at the top (small y), the biggest position at the bottom.
    assert.equal(axisPixel(1, [1, 50], 'linear', 300, 10, true), 10);
    assert.equal(axisPixel(50, [1, 50], 'linear', 300, 10, true), 300);
    assert.equal(axisPixel(50, [1, 50], 'linear', 300, 10, false), 10);
    assert.ok(Math.abs(axisPixel(100, [10, 1000], 'log', 0, 200) - 100) < 1e-9);
});

const bounds: LabelRect = { x: 2, y: 8, w: 396, h: 200 };
const rectOf = (l: PlacedLabel): LabelRect => ({ x: l.x, y: l.y, w: l.w, h: l.h });
const hit = (a: LabelRect, b: LabelRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('scatter labels: a name near the right edge flips to the left of its point and stays inside the chart', () => {
    const [l] = placeLabels([{ key: 'a', text: '/blog/a-long-page-name', cx: 380, cy: 100, r: 8 }], bounds);
    assert.equal(l.anchor, 'end');
    assert.ok(l.x >= bounds.x && l.x + l.w <= bounds.x + bounds.w);
    // Plenty of room: it goes to the right.
    assert.equal(placeLabels([{ key: 'a', text: '/blog/a', cx: 50, cy: 100, r: 8 }], bounds)[0].anchor, 'start');
});

test('scatter labels: long names are cut with an ellipsis; no two labels, and no median label, overlap', () => {
    assert.equal(ellipsize('/blog/product-analytics-tools-compared', 16), '/blog/product-a…'); // 15 characters and the ellipsis make 16
    assert.equal(ellipsize('short', 16), 'short');
    const items = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, text: `/blog/some-quite-long-page-name-${i}`, cx: 60 + (i % 5) * 18, cy: 80 + Math.floor(i / 5) * 9, r: 7 }));
    const reserved: LabelRect[] = [{ x: 150, y: 9, w: 90, h: 12 }];
    const out = placeLabels(items, bounds, reserved);
    assert.ok(out.length >= 3, `placed ${out.length}`);
    assert.ok(out.every((l) => l.text.length <= 24 && l.x >= bounds.x && l.x + l.w <= bounds.x + bounds.w + 1));
    assert.ok(out.some((l) => l.truncated && l.text.endsWith('…')));
    for (let i = 0; i < out.length; i++) {
        assert.equal(hit(rectOf(out[i]), reserved[0]), false);
        for (let j = i + 1; j < out.length; j++) assert.equal(hit(rectOf(out[i]), rectOf(out[j])), false, `${out[i].key} / ${out[j].key}`);
    }
    // Labels that cannot be placed are dropped rather than stacked: 40 points in one spot never give 40 labels.
    const pile = placeLabels(Array.from({ length: 40 }, (_, i) => ({ key: `p${i}`, text: 'same place', cx: 200, cy: 100, r: 6 })), bounds);
    assert.ok(pile.length > 0 && pile.length < 10);
});

test('scatter labels: the biggest points are placed first', () => {
    const out = placeLabels([{ key: 'big', text: 'big', cx: 100, cy: 100, r: 14 }, { key: 'small', text: 'small', cx: 104, cy: 102, r: 4 }], bounds);
    assert.equal(out[0].key, 'big');
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
