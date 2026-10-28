/**
 * Round 9 pivot table: schema, query plan, data shaping (cells, totals, heat levels, sorting) and the engine
 * end to end against the demo Google, for a count and for a calculated ratio.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/chart-pivot.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import { colValue, pivotLevels, pivotTotalsAvailable, shapePivot, sortPivotRows } from '@/lib/builder/charts/pivot';
import type { PivotWidget } from '@/lib/builder/charts/types';
import { defaultWidget, widgetMetrics, widgetTitle } from '@/lib/builder/registry';
import { validateWidgets } from '@/lib/builder/schema';
import type { DataFrame, MetricControl } from '@/lib/builder/types';
import { ACME, controlsOf, calls, runOne } from './chartsHelper';

const both = { families: { ga4: true, gsc: true } };
const pv = (over: Partial<PivotWidget['config']> = {}, id = 'w_pv'): PivotWidget => {
    const w = defaultWidget('pivot', both, id) as PivotWidget;
    return { ...w, source: ACME, config: { ...w.config, ...over } };
};
const RATIO = 'calc:ratio_pct_up:ga4:engagedSessions:ga4:sessions:k3f9a2';

test('pivot: default widget is sessions by channel and device (Search Console only: clicks by page and device)', () => {
    const w = defaultWidget('pivot', both) as PivotWidget;
    assert.deepEqual([w.config.rows, w.config.columns, w.config.metric.id, w.config.heat, w.config.totals], ['channel', 'device', 'ga4:sessions', 'cell', true]);
    assert.equal(widgetTitle({ ...w, title: undefined }), 'Sessions by channel and device');
    assert.deepEqual(widgetMetrics(w), ['ga4:sessions']);
    const g = defaultWidget('pivot', { families: { ga4: false, gsc: true } }) as PivotWidget;
    assert.deepEqual([g.config.rows, g.config.metric.id], ['page', 'gsc:clicks']);
});

test('pivot schema: counts and calculated metrics only, different dimensions, no dates, sane sizes', () => {
    assert.equal(validateWidgets([pv()]).ok, true);
    assert.equal(validateWidgets([pv({ metric: { id: RATIO } })]).ok, true);
    const rate = validateWidgets([pv({ metric: { id: 'ga4:engagementRate' } })]);
    assert.equal(rate.ok, false);
    if (!rate.ok) assert.match(rate.error, /count/);
    assert.equal(validateWidgets([pv({ columns: 'channel' })]).ok, false);
    assert.equal(validateWidgets([pv({ rows: 'date' })]).ok, false);
    assert.equal(validateWidgets([pv({ topRows: 40 })]).ok, false);
    assert.equal(validateWidgets([pv({ topColumns: 12 })]).ok, false);
    assert.equal(validateWidgets([pv({ heat: 'sparkle' as 'none' })]).ok, false);
});

test('pivot compile: rows by columns as an engine pivot, Other only for counts', () => {
    const ctx = { controlDefs: [], controls: controlsOf() };
    const q = compileWidget(pv(), ctx).queries[0];
    assert.deepEqual([q.part, q.dimensions, q.metrics, q.top, q.limit], ['rows', ['channel', 'device'], ['ga4:sessions'], { n: 8, other: false }, 2000]);
    assert.deepEqual(q.pivot, { dimension: 'device', top: 3, other: true });
    assert.equal(compileWidget(pv({ other: false }), ctx).queries[0].pivot?.other, false);
    assert.equal(compileWidget(pv({ metric: { id: RATIO } }), ctx).queries[0].pivot?.other, false);
    assert.equal(pivotTotalsAvailable('ga4:sessions'), true);
    assert.equal(pivotTotalsAvailable(RATIO), false);
});

test('pivot follows the metric switcher and filters', () => {
    const mc: MetricControl = { id: 'm1', type: 'metric', label: 'Metric', options: ['ga4:sessions', 'ga4:screenPageViews'], default: 'ga4:sessions', scope: { mode: 'all' } };
    const ctx = { controlDefs: [mc], controls: controlsOf('28d', { metric: { m1: 'ga4:screenPageViews' }, interaction: [{ dimension: 'country', op: 'eq', value: 'US' }] }) };
    assert.equal((applyViewerControls(pv(), ctx) as PivotWidget).config.metric.id, 'ga4:screenPageViews');
    assert.deepEqual(compileWidget(pv(), ctx).queries[0].filters, [{ dimension: 'country', op: 'eq', value: 'US' }]);
});

const frame = (seriesKeys: string[], rows: Array<[string, ...Array<number | null>]>): DataFrame => ({
    columns: [{ id: 'd:channel', kind: 'dimension', label: 'Channel' }, ...seriesKeys.map((k) => ({ id: k, kind: 'metric' as const, label: k }))],
    rows: rows.map(([k, ...v]) => ({ 'd:channel': k, ...Object.fromEntries(seriesKeys.map((s, i) => [s, v[i]])) })),
    seriesKeys,
});
const F = frame(['b:desktop', 'b:mobile', 'b:__other'], [['Organic', 100, 50, 10], ['Direct', 40, 60, null], ['Email', 5, 3, 2]]);

test('pivot shaping: cells, row and column totals, grand total, extremes', () => {
    const m = shapePivot(F, pv().config);
    assert.deepEqual(m.rows, ['Organic', 'Direct', 'Email']);
    assert.deepEqual(m.cols, ['b:desktop', 'b:mobile', 'b:__other']);
    assert.deepEqual(m.cells[1], [40, 60, null]);
    assert.deepEqual(m.rowTotals, [160, 100, 10]);
    assert.deepEqual(m.colTotals, [145, 113, 12]);
    assert.equal(m.grand, 270);
    assert.deepEqual([m.min, m.max], [2, 100]);
    assert.equal(colValue('b:desktop'), 'desktop');
    assert.equal(m.totalsAvailable, true);
});

test('pivot shaping: a ratio has no totals; empty frames and rows without a key are handled', () => {
    const m = shapePivot(F, pv({ metric: { id: RATIO } }).config);
    assert.equal(m.totalsAvailable, false);
    assert.deepEqual(m.rowTotals, [null, null, null]);
    assert.equal(m.grand, null);
    const empty = shapePivot({ columns: [], rows: [] }, pv().config);
    assert.deepEqual([empty.rows.length, empty.cols.length, empty.grand], [0, 0, null]);
    const noKey = shapePivot(frame(['b:a'], [['x', 1]]), pv().config);
    assert.equal(noKey.rows.length, 1);
});

test('pivot heat: levels against all cells, within a row, within a column, none', () => {
    const m = shapePivot(F, pv().config);
    const all = pivotLevels(m, 'cell');
    assert.equal(all[0][0], 5); // the biggest cell
    assert.equal(all[1][2], 0); // no data
    assert.ok(all[2][0] <= 2); // 5 is small against 100
    const rows = pivotLevels(m, 'row');
    assert.ok(rows[2][0] > all[2][0]); // within its own row the big cell of a small row still shows up
    const cols = pivotLevels(m, 'column');
    assert.ok(cols[0][0] >= 4 && cols[0][0] > cols[2][0]);
    assert.ok(pivotLevels(m, 'none').flat().every((v) => v === 0));
});

test('pivot sorting: by a column or the total, either way, empty cells last, stable', () => {
    const m = shapePivot(F, pv().config);
    assert.deepEqual(sortPivotRows(m, null, 'desc'), [0, 1, 2]);
    assert.deepEqual(sortPivotRows(m, 1, 'desc'), [1, 0, 2]); // mobile: Direct 60, Organic 50, Email 3
    assert.deepEqual(sortPivotRows(m, 1, 'asc'), [2, 0, 1]);
    assert.deepEqual(sortPivotRows(m, 2, 'desc'), [0, 2, 1]); // Other: null goes last
    assert.deepEqual(sortPivotRows(m, 2, 'asc'), [2, 0, 1]);
    assert.deepEqual(sortPivotRows(m, 'total', 'desc'), [0, 1, 2]);
});

test('pivot engine: channels by devices from one Analytics report; rows are the biggest, totals add up', async () => {
    const w = pv({ topRows: 5 });
    const r = await runOne(w);
    const m = shapePivot(r.parts.rows, w.config);
    assert.ok(m.rows.length >= 3 && m.rows.length <= 5, `rows ${m.rows.length}`);
    assert.ok(m.cols.length >= 2 && m.cols.length <= 4);
    assert.ok(m.cols.includes('b:desktop') && m.cols.includes('b:mobile'));
    // Rows come biggest first.
    assert.ok(m.rowTotals[0]! >= m.rowTotals[m.rows.length - 1]!);
    const cellSum = m.cells.flat().reduce<number>((s, v) => s + (v ?? 0), 0);
    assert.ok(Math.abs(m.grand! - cellSum) < 1e-6);
    assert.equal(calls.filter((c) => c.url.includes('analyticsdata')).length, 1);
});

test('pivot engine: a calculated ratio is computed per cell (engagement rate by channel and device)', async () => {
    const w = pv({ metric: { id: RATIO }, topRows: 5 });
    const r = await runOne(w);
    const m = shapePivot(r.parts.rows, w.config);
    assert.ok(m.rows.length >= 3);
    const cells = m.cells.flat().filter((v): v is number => v !== null);
    assert.ok(cells.length > 3);
    assert.ok(cells.every((v) => v >= 0 && v <= 100), `percent values ${cells.slice(0, 4)}`);
    assert.equal(m.totalsAvailable, false);
    // Search Console: clicks by page and device (the three devices), no Analytics call.
    const g = pv({ rows: 'page', columns: 'device', metric: { id: 'gsc:clicks' } }, 'w_g');
    const gr = await runOne(g);
    assert.ok(shapePivot(gr.parts.rows, g.config).rows.length >= 3);
    assert.equal(calls.filter((c) => c.url.includes('analyticsdata')).length, 0);
});
