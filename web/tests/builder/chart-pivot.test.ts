/**
 * Round 9 pivot table: schema, query plan, data shaping (cells, totals, heat levels, sorting) and the engine
 * end to end against the demo Google, for a count and for a calculated ratio.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/chart-pivot.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import { colValue, heatPct, HEAT_MAX_PCT, HEAT_MIN_PCT, pivotHeat, pivotTotalsAvailable, PIVOT_TOTALS_PART, shapePivot, sortPivotRows } from '@/lib/builder/charts/pivot';
import type { PivotWidget } from '@/lib/builder/charts/types';
import { defaultWidget, widgetMetrics, widgetTitle } from '@/lib/builder/registry';
import { validateWidgets } from '@/lib/builder/schema';
import type { CellValue, DataFrame, MetricControl } from '@/lib/builder/types';
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

test('pivot heat: a continuous min-max scale per scope (all cells, a row, a column), none', () => {
    const m = shapePivot(F, pv().config);
    const all = pivotHeat(m, 'cell');
    assert.equal(all[0][0], 1); // the biggest cell (100)
    assert.equal(all[2][2], 0); // the smallest cell (2)
    assert.equal(all[1][2], null); // no data
    assert.ok(Math.abs(all[2][0]! - (5 - 2) / 98) < 1e-9); // continuous, not stepped
    const rows = pivotHeat(m, 'row');
    assert.equal(rows[0][0], 1);
    assert.equal(rows[0][2], 0);
    assert.equal(rows[2][0], 1); // within its own row the big cell of a small row still shows up
    // A column: every cell of one column used to share one shade; now each cell has its own place on the scale.
    const cols = pivotHeat(m, 'column');
    assert.deepEqual([cols[0][0], cols[1][0], cols[2][0]], [1, (40 - 5) / 95, 0]);
    assert.ok(pivotHeat(m, 'none').flat().every((v) => v === null));
    // Many different values in one column give many different shades.
    const wide = shapePivot(frame(['b:a'], [['r1', 9812], ['r2', 5894], ['r3', 5314], ['r4', 3886], ['r5', 330]]), pv().config);
    const shades = new Set(pivotHeat(wide, 'column').map((r) => heatPct(r[0]!)));
    assert.equal(shades.size, 5);
    // All values equal: the middle of the scale, not a divide by zero.
    assert.deepEqual(pivotHeat(shapePivot(frame(['b:a'], [['x', 7], ['y', 7]]), pv().config), 'cell'), [[0.5], [0.5]]);
    assert.equal(heatPct(0), HEAT_MIN_PCT);
    assert.equal(heatPct(1), HEAT_MAX_PCT);
});

const totalsFrame = (rows: Array<[string, number]>, rowCount = rows.length): DataFrame => ({
    columns: [{ id: 'd:device', kind: 'dimension', label: 'Device' }, { id: 'm:ga4:sessions', kind: 'metric', label: 'Sessions' }],
    rows: rows.map(([k, v]): Record<string, CellValue> => (k === '(other)' ? { 'd:device': k, 'm:ga4:sessions': v, __other: 1 } : { 'd:device': k, 'm:ga4:sessions': v })),
    rowCount,
});

test('pivot totals: the total row is the true total; the rows not shown become an Other row', () => {
    // Shown: 3 rows (desktop 145, mobile 113, other 12 = 270). The data holds 200 / 120 / 30 over every row.
    const m = shapePivot(F, pv().config, totalsFrame([['desktop', 200], ['mobile', 120], ['(other)', 30]]));
    assert.deepEqual(m.colTotals, [200, 120, 30]);
    assert.equal(m.grand, 350);
    assert.deepEqual(m.otherRow, { cells: [55, 7, 18], total: 80 });
    assert.equal(m.complete, true);
    // Row totals stay the sums of the shown cells; the other row closes the gap to the grand total.
    assert.equal(m.rowTotals.reduce<number>((s, v) => s + (v ?? 0), 0) + m.otherRow!.total, m.grand);
});

test('pivot totals: nothing left over means no Other row; a missing report falls back to the shown rows and says so', () => {
    const exact = shapePivot(F, pv().config, totalsFrame([['desktop', 145], ['mobile', 113], ['(other)', 12]]));
    assert.equal(exact.otherRow, null);
    assert.equal(exact.complete, true);
    assert.equal(exact.grand, 270);
    const none = shapePivot(F, pv().config);
    assert.equal(none.otherRow, null);
    assert.equal(none.complete, false); // the view labels it "Total (top 3)"
    assert.equal(none.grand, 270);
    // A report that does not line up with the pivot's columns is ignored.
    assert.equal(shapePivot(F, pv().config, totalsFrame([['desktop', 145], ['tablet', 3]])).complete, false);
    // Columns the pivot dropped (no Other column): the totals say they are partial.
    const three = frame(['b:desktop', 'b:mobile'], [['Organic', 100, 50]]);
    const hidden = shapePivot(three, pv({ other: false }).config, totalsFrame([['desktop', 100], ['mobile', 50]], 3));
    assert.equal(hidden.complete, false);
});

test('pivot compile: the column totals ride along as one extra small report (counts only)', () => {
    const ctx = { controlDefs: [], controls: controlsOf() };
    const qs = compileWidget(pv(), ctx).queries;
    assert.equal(qs.length, 2);
    assert.deepEqual([qs[1].part, qs[1].dimensions, qs[1].metrics, qs[1].top, qs[1].pivot], [PIVOT_TOTALS_PART, ['device'], ['ga4:sessions'], { n: 3, other: true }, undefined]);
    assert.equal(compileWidget(pv({ totals: false }), ctx).queries.length, 1);
    assert.equal(compileWidget(pv({ metric: { id: RATIO } }), ctx).queries.length, 1);
    assert.equal(compileWidget(pv({ other: false }), ctx).queries[1].top?.other, false);
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
    assert.equal(calls.filter((c) => c.url.includes('analyticsdata')).length, 1); // the pivot and the column totals go in one batch
});

test('pivot engine: the total row is true (equals the whole data) and the Other row closes the gap', async () => {
    const w = pv({ topRows: 3 });
    const r = await runOne(w);
    const t = r.parts[PIVOT_TOTALS_PART];
    assert.ok(t, 'column totals part');
    const m = shapePivot(r.parts.rows, w.config, t);
    assert.equal(m.complete, true);
    assert.ok(m.otherRow, 'more than 3 channels, so some rows are not shown');
    const everything = t.rows.reduce((s, x) => s + (x['m:ga4:sessions'] as number), 0);
    assert.ok(Math.abs(m.grand! - everything) < 1e-6);
    const shownSum = m.cells.flat().reduce<number>((s, v) => s + (v ?? 0), 0);
    assert.ok(Math.abs(shownSum + m.otherRow!.total - m.grand!) < 1e-6);
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
