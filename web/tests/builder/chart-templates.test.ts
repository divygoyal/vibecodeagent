/**
 * Round 9 templates ("When visitors come", "Content opportunities", "Shopping funnel and segments"):
 * they validate, their layouts fit the grid without overlaps, and every chart gets real data from the demo
 * Google (on the demo site each one is made for).
 *
 * Run: cd web && npx --offline tsx --test tests/builder/chart-templates.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { calendarModel, weekdayHourGrid } from '@/lib/builder/charts/heatmap';
import { shapeFunnel } from '@/lib/builder/charts/funnel';
import { shapePivot } from '@/lib/builder/charts/pivot';
import { shapeScatter } from '@/lib/builder/charts/scatter';
import { shapeTreemap } from '@/lib/builder/charts/treemap';
import { validateDoc } from '@/lib/builder/schema';
import { TEMPLATES, buildFromTemplate, templateMeta } from '@/lib/builder/templates';
import type { DashboardDocV2, DashboardQueryResponse, WidgetResultOk } from '@/lib/builder/types';
import { controlsOf, reset, run } from './chartsHelper';

const NEW_IDS = ['when-visitors-come', 'content-opportunities', 'shopping-funnel'];
const doc = (id: string, siteId = 'acmeanalytics.example'): DashboardDocV2 => buildFromTemplate(id, { name: id, defaultSource: { type: 'site', siteId } });

async function evaluate(d: DashboardDocV2): Promise<DashboardQueryResponse> {
    reset();
    const widgets = d.pages.flatMap((p) => p.layouts.lg.map((l) => d.widgets[l.i]));
    return run(widgets, controlsOf('28d'), d.controls, d.defaultSource);
}
const ok = (res: DashboardQueryResponse, id: string): WidgetResultOk => {
    const r = res.results[id];
    assert.equal(r.status, 'ok', `${id}: ${JSON.stringify(r)}`);
    return r as WidgetResultOk;
};

test('the three templates are in the gallery, marked new, and validate', () => {
    for (const id of NEW_IDS) {
        const m = templateMeta(id);
        assert.ok(m, id);
        assert.equal(m!.isNew, true);
        assert.ok(TEMPLATES.some((t) => t.id === id));
        const d = doc(id);
        assert.equal(validateDoc(d).ok, true, id);
        assert.equal(d.meta.createdFrom, id);
    }
    assert.deepEqual(templateMeta('when-visitors-come')!.needs, ['ga4']);
    assert.deepEqual(templateMeta('content-opportunities')!.needs, ['gsc']);
});

test('template layouts: every widget placed once, inside the 12 columns, nothing overlaps', () => {
    for (const id of NEW_IDS) {
        const d = doc(id);
        const lg = d.pages[0].layouts.lg;
        assert.equal(new Set(lg.map((l) => l.i)).size, lg.length);
        assert.equal(lg.length, Object.keys(d.widgets).length, id);
        for (const l of lg) assert.ok(l.x >= 0 && l.x + l.w <= 12, `${id}/${l.i} columns`);
        for (let a = 0; a < lg.length; a++) for (let b = a + 1; b < lg.length; b++) {
            const p = lg[a];
            const q = lg[b];
            assert.ok(!(p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h), `${id}: ${p.i} overlaps ${q.i}`);
        }
        // Every chart is big enough for its minimum size.
        for (const l of lg) assert.ok(l.w >= 4 || d.widgets[l.i].type === 'text', `${id}/${l.i} width ${l.w}`);
    }
});

test('"When visitors come": both weekday x hour grids and a 12-month calendar have data', async () => {
    const d = doc('when-visitors-come');
    const res = await evaluate(d);
    for (const id of ['w_peak', 'w_peak_events']) {
        const { grid, total, cells } = weekdayHourGrid(ok(res, id).parts.rows.rows, (d.widgets[id] as { config: { metric: { id: string } } }).config.metric.id);
        assert.ok(cells > 100, `${id} cells ${cells}`);
        assert.ok(total > 0 && grid.length === 7);
    }
    const cal = calendarModel(ok(res, 'w_calendar').parts.series.rows, 'ga4:sessions', 'mon')!;
    assert.ok(cal.days >= 360, `calendar days ${cal.days}`); // the widget's own 12 month range, not the page's 28 days
    assert.ok(cal.max > 0);
});

test('"Content opportunities": scatter plots, the gap table and the treemap have data', async () => {
    const res = await evaluate(doc('content-opportunities'));
    const d = doc('content-opportunities');
    const pages = shapeScatter(ok(res, 'w_pages').parts.rows.rows, (d.widgets.w_pages as never as { config: Parameters<typeof shapeScatter>[1] }).config);
    assert.ok(pages.points.length >= 10);
    assert.ok(pages.counts.br > 0, 'something lands in the shaded corner');
    const queries = shapeScatter(ok(res, 'w_queries').parts.rows.rows, (d.widgets.w_queries as never as { config: Parameters<typeof shapeScatter>[1] }).config);
    assert.ok(queries.points.length >= 10);
    assert.ok(queries.points.every((p) => p.y >= 1)); // positions start at 1
    ok(res, 'w_gap');
    const tree = shapeTreemap(ok(res, 'w_tree').parts.rows.rows, (d.widgets.w_tree as never as { config: Parameters<typeof shapeTreemap>[1] }).config);
    assert.ok(tree.leafCount >= 5);
    // The page filter controls are shared with the rest of the dashboard.
    assert.ok(d.controls.some((c) => c.type === 'filter' && c.dimension === 'device'));
});

test('"Shopping funnel and segments": the funnel falls step by step on a shop, the pivots and the treemap have data', async () => {
    const d = doc('shopping-funnel', 'creativeprints.example');
    const res = await evaluate(d);
    const fn = shapeFunnel(ok(res, 'w_funnel').parts, (d.widgets.w_funnel as never as { config: Parameters<typeof shapeFunnel>[1] }).config);
    assert.equal(fn.rows.length, 5);
    assert.ok(fn.rows.every((r) => r.value > 0), JSON.stringify(fn.rows));
    assert.equal(fn.outOfOrder, false);
    assert.ok(fn.overall! > 0 && fn.overall! < 0.5);
    const pv = shapePivot(ok(res, 'w_pivot').parts.rows, (d.widgets.w_pivot as never as { config: Parameters<typeof shapePivot>[1] }).config);
    assert.ok(pv.rows.length >= 3 && pv.cols.length >= 2);
    const orders = shapePivot(ok(res, 'w_orders').parts.rows, (d.widgets.w_orders as never as { config: Parameters<typeof shapePivot>[1] }).config);
    assert.ok(orders.rows.length >= 3);
    const rev = shapeTreemap(ok(res, 'w_revenue').parts.rows.rows, (d.widgets.w_revenue as never as { config: Parameters<typeof shapeTreemap>[1] }).config);
    assert.ok(rev.groups.length >= 2 && rev.total > 0);
    ok(res, 'w_items');
});
