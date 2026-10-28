/**
 * Round 9 treemap: schema, query plan, the squarified layout (tiling, bounds, aspect ratios), data shaping
 * (groups, Other) and the engine end to end against the demo Google.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/chart-treemap.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import { GROUP_HEADER, layoutTreemap, shapeTreemap, squarify, type Rect } from '@/lib/builder/charts/treemap';
import type { TreemapWidget } from '@/lib/builder/charts/types';
import { defaultWidget, widgetMetrics, widgetTitle } from '@/lib/builder/registry';
import { validateWidgets } from '@/lib/builder/schema';
import type { MetricControl } from '@/lib/builder/types';
import { ACME, controlsOf, calls, runOne } from './chartsHelper';

const both = { families: { ga4: true, gsc: true } };
const tm = (over: Partial<TreemapWidget['config']> = {}, id = 'w_tm'): TreemapWidget => {
    const w = defaultWidget('treemap', both, id) as TreemapWidget;
    return { ...w, source: ACME, config: { ...w.config, ...over } };
};

test('treemap: default widget is sessions by channel and source, a flat clicks by page for Search Console only', () => {
    const w = defaultWidget('treemap', both) as TreemapWidget;
    assert.deepEqual([w.config.parent, w.config.dimension, w.config.metric.id], ['channel', 'source', 'ga4:sessions']);
    assert.equal(widgetTitle({ ...w, title: undefined }), 'Sessions by channel and source');
    assert.deepEqual(widgetMetrics(w), ['ga4:sessions']);
    const g = defaultWidget('treemap', { families: { ga4: false, gsc: true } }) as TreemapWidget;
    assert.deepEqual([g.config.parent, g.config.dimension, g.config.metric.id], [undefined, 'page', 'gsc:clicks']);
});

test('treemap schema: additive metrics only, two different dimensions, no dates', () => {
    assert.equal(validateWidgets([tm()]).ok, true);
    assert.equal(validateWidgets([tm({ parent: undefined })]).ok, true);
    const rate = validateWidgets([tm({ metric: { id: 'gsc:ctr' } })]);
    assert.equal(rate.ok, false);
    if (!rate.ok) assert.match(rate.error, /adds up/);
    assert.equal(validateWidgets([tm({ metric: { id: 'ga4:activeUsers' } })]).ok, false);
    assert.equal(validateWidgets([tm({ parent: 'source' })]).ok, false);
    assert.equal(validateWidgets([tm({ dimension: 'date' })]).ok, false);
    assert.equal(validateWidgets([tm({ top: 100 })]).ok, false);
    assert.equal(validateWidgets([tm({ colorBy: 'rainbow' as 'group' })]).ok, false);
});

test('treemap compile: one ranked report; a flat one folds the rest into Other, a grouped one does not', () => {
    const ctx = { controlDefs: [], controls: controlsOf() };
    const g = compileWidget(tm(), ctx).queries[0];
    assert.deepEqual([g.part, g.dimensions, g.metrics, g.sort], ['rows', ['channel', 'source'], ['ga4:sessions'], { by: 'ga4:sessions', dir: 'desc' }]);
    assert.deepEqual(g.top, { n: 30, other: false });
    const f = compileWidget(tm({ parent: undefined, dimension: 'channel' }), ctx).queries[0];
    assert.deepEqual([f.dimensions, f.top], [['channel'], { n: 30, other: true }]);
});

test('treemap follows the metric switcher', () => {
    const mc: MetricControl = { id: 'm1', type: 'metric', label: 'Metric', options: ['ga4:sessions', 'ga4:screenPageViews'], default: 'ga4:sessions', scope: { mode: 'all' } };
    const w = applyViewerControls(tm(), { controlDefs: [mc], controls: controlsOf('28d', { metric: { m1: 'ga4:screenPageViews' } }) }) as TreemapWidget;
    assert.equal(w.config.metric.id, 'ga4:screenPageViews');
    assert.equal(widgetTitle(w), 'Pageviews by channel and source');
});

// ── layout ──
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

test('squarify: tiles the rectangle exactly, nothing overlaps, nothing leaves the bounds', () => {
    const items = [60, 30, 20, 20, 10, 8, 5, 3, 2, 1].map((value, i) => ({ value, i }));
    const rect = { x: 10, y: 20, w: 400, h: 250 };
    const out = squarify(items, rect);
    assert.equal(out.length, items.length);
    const area = out.reduce((s, r) => s + r.w * r.h, 0);
    assert.ok(Math.abs(area - rect.w * rect.h) < 1e-6, `area ${area}`);
    for (const r of out) {
        assert.ok(r.x >= rect.x - 1e-9 && r.y >= rect.y - 1e-9 && r.x + r.w <= rect.x + rect.w + 1e-6 && r.y + r.h <= rect.y + rect.h + 1e-6);
        assert.ok(r.w > 0 && r.h > 0);
    }
    for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) assert.ok(!overlap(out[a], out[b]), `${a} overlaps ${b}`);
    // Each box's area is proportional to its value.
    const total = items.reduce((s, i) => s + i.value, 0);
    for (const r of out) assert.ok(Math.abs((r.w * r.h) / (rect.w * rect.h) - r.value / total) < 1e-9);
});

test('squarify: boxes stay close to squares (worst aspect ratio below 4 for a typical set)', () => {
    const out = squarify([40, 25, 15, 10, 6, 4].map((value) => ({ value })), { x: 0, y: 0, w: 480, h: 300 });
    const worst = Math.max(...out.map((r) => Math.max(r.w / r.h, r.h / r.w)));
    assert.ok(worst < 4, `worst ${worst}`);
});

test('squarify: ignores empty and negative values, handles one item and a degenerate rectangle', () => {
    assert.equal(squarify([{ value: 0 }, { value: -3 }, { value: NaN }], { x: 0, y: 0, w: 10, h: 10 }).length, 0);
    const one = squarify([{ value: 5 }], { x: 0, y: 0, w: 30, h: 20 });
    assert.deepEqual([one[0].x, one[0].y, one[0].w, one[0].h], [0, 0, 30, 20]);
    assert.equal(squarify([{ value: 5 }], { x: 0, y: 0, w: 0, h: 20 }).length, 0);
    assert.equal(squarify([], { x: 0, y: 0, w: 10, h: 10 }).length, 0);
    // Deterministic: the same input twice gives the same boxes, and equal values keep a stable order.
    const a = squarify([{ value: 3, k: 'a' }, { value: 3, k: 'b' }, { value: 1, k: 'c' }], { x: 0, y: 0, w: 100, h: 60 });
    const b = squarify([{ value: 3, k: 'a' }, { value: 3, k: 'b' }, { value: 1, k: 'c' }], { x: 0, y: 0, w: 100, h: 60 });
    assert.deepEqual(a, b);
});

const rows = [
    { 'd:channel': 'Organic Search', 'd:source': 'google', 'm:ga4:sessions': 500 },
    { 'd:channel': 'Organic Search', 'd:source': 'bing', 'm:ga4:sessions': 100 },
    { 'd:channel': 'Direct', 'd:source': '(direct)', 'm:ga4:sessions': 300 },
    { 'd:channel': 'Referral', 'd:source': 'news.example', 'm:ga4:sessions': 60 },
    { 'd:channel': 'Referral', 'd:source': 'google', 'm:ga4:sessions': 40 },
    { 'd:channel': 'Referral', 'd:source': 'zero', 'm:ga4:sessions': 0 },
    { 'd:channel': 'Referral', 'd:source': 'missing', 'm:ga4:sessions': null },
];

test('treemap shaping: groups by parent, biggest first, keeps a same-named box under two groups', () => {
    const m = shapeTreemap(rows, tm().config);
    assert.deepEqual(m.groups.map((g) => [g.parent, g.amount]), [['Organic Search', 600], ['Direct', 300], ['Referral', 100]]);
    assert.equal(m.total, 1000);
    assert.equal(m.leafCount, 5);
    assert.equal(m.skipped, 2);
    assert.deepEqual(m.groups[0].leaves.map((l) => l.value), ['google', 'bing']);
    const keys = m.groups.flatMap((g) => g.leaves.map((l) => l.key));
    assert.equal(new Set(keys).size, keys.length); // google under Organic Search and under Referral
});

test('treemap shaping: a flat treemap is one group; the Other row goes last and is marked', () => {
    const flat = shapeTreemap([
        { 'd:channel': 'Direct', 'm:ga4:sessions': 10 },
        { 'd:channel': '(other)', 'm:ga4:sessions': 50, __other: 1 },
        { 'd:channel': 'Email', 'm:ga4:sessions': 20 },
    ], tm({ parent: undefined, dimension: 'channel' }).config);
    assert.equal(flat.groups.length, 1);
    assert.equal(flat.groups[0].parent, null);
    assert.deepEqual(flat.groups[0].leaves.map((l) => [l.value, Boolean(l.other)]), [['Email', false], ['Direct', false], ['(other)', true]]);
});

test('treemap layout: groups tile the box, boxes tile their group, shares add up', () => {
    const m = shapeTreemap(rows, tm().config);
    const frames = layoutTreemap(m, 600, 360);
    assert.equal(frames.length, 3);
    assert.ok(Math.abs(frames.reduce((s, f) => s + f.w * f.h, 0) - 600 * 360) < 1e-6);
    assert.ok(Math.abs(frames.reduce((s, f) => s + f.share, 0) - 1) < 1e-9);
    for (const f of frames) {
        assert.ok(f.header === GROUP_HEADER); // all three groups are big enough for a title strip
        for (const n of f.leaves) {
            assert.ok(n.x >= 0 && n.y >= f.header && n.x + n.w <= f.w + 1e-6 && n.y + n.h <= f.h + 1e-6, `${f.key}/${n.value} out of frame`);
        }
        const used = f.leaves.reduce((s, n) => s + n.w * n.h, 0);
        assert.ok(used <= f.w * f.h);
        assert.equal(f.leaves.length, m.groups.find((g) => g.key === f.key)!.leaves.length);
    }
    // A flat treemap has no group strip and no padding.
    const flat = layoutTreemap(shapeTreemap(rows.map((r) => ({ ...r, 'd:channel': undefined as never })), tm({ parent: undefined }).config), 300, 200);
    assert.equal(flat.length, 1);
    assert.equal(flat[0].header, 0);
    assert.ok(Math.abs(flat[0].leaves.reduce((s, n) => s + n.w * n.h, 0) - 300 * 200) < 1e-6);
    // A tiny box gets no title strip.
    assert.equal(layoutTreemap(m, 60, 40)[0].header, 0);
});

test('treemap engine: channel and source from one Analytics report, the boxes add up to the group', async () => {
    const r = await runOne(tm());
    const model = shapeTreemap(r.parts.rows.rows, tm().config);
    assert.ok(model.groups.length >= 3, `groups ${model.groups.length}`);
    assert.ok(model.leafCount >= 5 && model.leafCount <= 30);
    for (const g of model.groups) assert.ok(Math.abs(g.leaves.reduce((s, l) => s + l.amount, 0) - g.amount) < 1e-6);
    assert.equal(calls.filter((c) => c.url.includes('analyticsdata')).length, 1);
    const dims = (calls[0].body.requests?.[0] ?? calls[0].body).dimensions.map((d: { name: string }) => d.name); 
    assert.deepEqual(dims, ['sessionDefaultChannelGroup', 'sessionSource']);
    // Flat, with the rest folded into Other, the total stays whole.
    const flatW = tm({ parent: undefined, dimension: 'channel', top: 5 }, 'w_flat');
    const f = await runOne(flatW);
    const fm = shapeTreemap(f.parts.rows.rows, flatW.config);
    assert.equal(fm.groups.length, 1);
    assert.ok(fm.groups[0].leaves.length <= 6);
    // Search Console boxes (flat) work too.
    const g = await runOne(tm({ parent: undefined, dimension: 'page', metric: { id: 'gsc:clicks' }, colorBy: 'value' }, 'w_g'));
    assert.ok(shapeTreemap(g.parts.rows.rows, tm({ parent: undefined, dimension: 'page', metric: { id: 'gsc:clicks' } }).config).leafCount >= 5);
});
