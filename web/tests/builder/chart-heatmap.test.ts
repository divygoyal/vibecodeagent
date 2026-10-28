/**
 * Round 9 heatmap: schema, query plan, data shaping, viewer switchers and the engine end to end against
 * the demo Google.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/chart-heatmap.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import { calendarModel, dayIndex, heatLevel, heatThresholds, weekdayHourGrid, weekdayOf } from '@/lib/builder/charts/heatmap';
import type { HeatmapWidget } from '@/lib/builder/charts/types';
import { defaultWidget, widgetMetrics, widgetTitle } from '@/lib/builder/registry';
import { validateWidgets } from '@/lib/builder/schema';
import type { MetricControl } from '@/lib/builder/types';
import { ACME, controlsOf, calls, runOne } from './chartsHelper';

const both = { families: { ga4: true, gsc: true } };
const heat = (variant: HeatmapWidget['config']['variant'], metric = 'ga4:sessions', id = 'w_heat'): HeatmapWidget => {
    const w = defaultWidget('heatmap', both, id) as HeatmapWidget;
    return { ...w, source: ACME, config: { ...w.config, variant, metric: { id: metric } } };
};

test('heatmap: default widget is a weekday and hour grid on Analytics, a calendar for Search Console only', () => {
    const w = defaultWidget('heatmap', both) as HeatmapWidget;
    assert.equal(w.config.variant, 'weekday-hour');
    assert.equal(w.config.metric.id, 'ga4:sessions');
    const g = defaultWidget('heatmap', { families: { ga4: false, gsc: true } }) as HeatmapWidget;
    assert.equal(g.config.variant, 'calendar');
    assert.equal(g.config.metric.id, 'gsc:clicks');
    assert.equal(widgetTitle({ ...w, title: undefined }), 'Sessions by weekday and hour');
    assert.deepEqual(widgetMetrics(w), ['ga4:sessions']);
});

test('heatmap schema: accepts both layouts, refuses unknown layouts and Search Console by hour', () => {
    assert.equal(validateWidgets([heat('weekday-hour'), heat('calendar', 'gsc:clicks', 'w_cal')]).ok, true);
    const bad = validateWidgets([{ ...heat('calendar'), config: { variant: 'sankey', metric: { id: 'ga4:sessions' } } }]);
    assert.equal(bad.ok, false);
    const gsc = validateWidgets([heat('weekday-hour', 'gsc:clicks')]);
    assert.equal(gsc.ok, false);
    if (!gsc.ok) assert.match(gsc.error, /Analytics metric/);
    // A calculated metric made of Analytics metrics is fine by hour.
    assert.equal(validateWidgets([heat('weekday-hour', 'calc:ratio_pct_up:ga4:engagedSessions:ga4:sessions:k3f9a2')]).ok, true);
});

test('heatmap compile: weekday-hour is one report by day of week and hour; calendar is one daily series', () => {
    const ctx = { controlDefs: [], controls: controlsOf() };
    const a = compileWidget(heat('weekday-hour'), ctx).queries;
    assert.equal(a.length, 1);
    assert.deepEqual([a[0].part, a[0].dimensions, a[0].metrics, a[0].limit], ['rows', ['dayOfWeek', 'hour'], ['ga4:sessions'], 200]);
    const b = compileWidget(heat('calendar', 'gsc:clicks'), ctx).queries;
    assert.deepEqual([b[0].part, b[0].dimensions, b[0].granularity, b[0].fillDates], ['series', ['date'], 'day', true]);
});

test('heatmap follows the metric switcher and dashboard filters', () => {
    const mc: MetricControl = { id: 'm1', type: 'metric', label: 'Metric', options: ['ga4:sessions', 'ga4:screenPageViews'], default: 'ga4:sessions', scope: { mode: 'all' } };
    const ctx = { controlDefs: [mc], controls: controlsOf('28d', { metric: { m1: 'ga4:screenPageViews' }, interaction: [{ dimension: 'device', op: 'eq', value: 'mobile' }] }) };
    const w = applyViewerControls(heat('weekday-hour'), ctx) as HeatmapWidget;
    assert.equal(w.config.metric.id, 'ga4:screenPageViews');
    const q = compileWidget(heat('weekday-hour'), ctx).queries[0];
    assert.deepEqual(q.metrics, ['ga4:screenPageViews']);
    assert.deepEqual(q.filters, [{ dimension: 'device', op: 'eq', value: 'mobile' }]);
});

test('heatmap shaping: day names, digits and the grid', () => {
    assert.equal(dayIndex('Sunday'), 0);
    assert.equal(dayIndex('sat'), 6);
    assert.equal(dayIndex('3'), 3);
    assert.equal(dayIndex(2), 2);
    assert.equal(dayIndex('Funday'), -1);
    assert.equal(dayIndex(null), -1);
    const { grid, total, cells } = weekdayHourGrid([
        { 'd:dayOfWeek': 'Monday', 'd:hour': '09', 'm:ga4:sessions': 10 },
        { 'd:dayOfWeek': 'Monday', 'd:hour': '10', 'm:ga4:sessions': 5 },
        { 'd:dayOfWeek': 'Sunday', 'd:hour': '23', 'm:ga4:sessions': 2 },
        { 'd:dayOfWeek': 'Nope', 'd:hour': '23', 'm:ga4:sessions': 99 },
        { 'd:dayOfWeek': 'Monday', 'd:hour': '24', 'm:ga4:sessions': 99 },
        { 'd:dayOfWeek': 'Monday', 'd:hour': '05', 'm:ga4:sessions': null },
    ], 'ga4:sessions');
    assert.equal(grid[1][9], 10);
    assert.equal(grid[1][10], 5);
    assert.equal(grid[0][23], 2);
    assert.equal(total, 17);
    assert.equal(cells, 3);
});

test('heatmap shaping: quantile colour levels', () => {
    const t = heatThresholds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 0]);
    assert.equal(t.length, 4);
    assert.deepEqual([...t].sort((a, b) => a - b), t);
    assert.equal(heatLevel(0, t), 0);
    assert.equal(heatLevel(null, t), 0);
    assert.equal(heatLevel(1, t), 1);
    assert.equal(heatLevel(10, t), 5);
    // One huge spike does not push every other cell into the lowest level.
    const spiky = heatThresholds([5, 6, 7, 8, 9, 10, 11, 12, 13, 5000]);
    assert.ok(heatLevel(12, spiky) >= 4);
    assert.deepEqual(heatThresholds([]), []);
});

test('calendar model: weeks start on Monday or Sunday, partial first and last weeks, month labels', () => {
    assert.equal(weekdayOf('2026-10-26'), 1); // Monday
    const days = Array.from({ length: 21 }, (_, i) => {
        const d = new Date(Date.UTC(2026, 9, 14 + i)).toISOString().slice(0, 10); // Wed 14 Oct .. Tue 3 Nov
        return { 'd:date': d, 'm:ga4:sessions': i + 1 };
    });
    const mon = calendarModel(days, 'ga4:sessions', 'mon')!;
    assert.equal(mon.rows[0], 'Mon');
    assert.equal(mon.weeks.length, 4);
    assert.equal(mon.weeks[0][0], null); // Mon 12 Oct is before the range
    assert.equal(mon.weeks[0][2]?.date, '2026-10-14'); // Wed in the third row
    assert.equal(mon.weeks[3][1]?.date, '2026-11-03'); // Tue
    assert.equal(mon.weeks[3][2], null);
    assert.equal(mon.days, 21);
    assert.deepEqual(mon.months.map((m) => m.label), ['Oct', 'Nov']);
    assert.equal(mon.max, 21);
    const sun = calendarModel(days, 'ga4:sessions', 'sun')!;
    assert.equal(sun.rows[0], 'Sun');
    assert.equal(sun.weeks[0][3]?.date, '2026-10-14');
    assert.equal(calendarModel([], 'ga4:sessions'), null);
    assert.equal(calendarModel([{ 'd:date': 'x', 'm:ga4:sessions': 1 }], 'ga4:sessions'), null);
});

test('heatmap engine: weekday x hour returns the 168 cells from one Analytics report', async () => {
    const r = await runOne(heat('weekday-hour'));
    const rows = r.parts.rows.rows;
    assert.ok(rows.length >= 150 && rows.length <= 168, `rows ${rows.length}`);
    const { grid, total } = weekdayHourGrid(rows, 'ga4:sessions');
    assert.ok(total > 0);
    assert.equal(grid.length, 7);
    assert.equal(calls.filter((c) => c.url.includes('analyticsdata')).length, 1);
    const dims = calls[0].body.requests?.[0]?.dimensions ?? calls[0].body.dimensions;
    assert.deepEqual(dims.map((d: { name: string }) => d.name), ['dayOfWeekName', 'hour']);
    // Night hours are quieter than the afternoon for the demo site.
    const night = [0, 1, 2, 3].reduce((s, h) => s + grid.reduce((a, row) => a + row[h], 0), 0);
    const day = [13, 14, 15, 16].reduce((s, h) => s + grid.reduce((a, row) => a + row[h], 0), 0);
    assert.ok(day > night, `day ${day} vs night ${night}`);
});

test('heatmap engine: calendar covers every day of the range, zero filled', async () => {
    const r = await runOne(heat('calendar', 'ga4:sessions', 'w_cal'), controlsOf('90d'));
    const model = calendarModel(r.parts.series.rows, 'ga4:sessions', 'mon')!;
    assert.equal(model.days, 90);
    assert.ok(model.max > 0);
    // A Search Console metric works on the calendar.
    const g = await runOne(heat('calendar', 'gsc:clicks', 'w_cal2'), controlsOf('28d'));
    assert.ok(calendarModel(g.parts.series.rows, 'gsc:clicks', 'mon')!.days >= 26);
});

test('heatmap engine: weekday x hour with a Search Console metric says why instead of calling Google', async () => {
    const { run, reset } = await import('./chartsHelper');
    reset();
    const bad = { ...heat('weekday-hour', 'gsc:clicks', 'w_bad') };
    const res = await run([bad]);
    const r = res.results.w_bad;
    assert.equal(r.status, 'error');
    if (r.status === 'error') assert.equal(r.code, 'INCOMPATIBLE');
});
