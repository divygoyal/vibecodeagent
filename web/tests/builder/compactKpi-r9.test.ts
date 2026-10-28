/**
 * Round 9 polish: KPI cards with no comparison and no sparkline are compact for viewers, full height otherwise.
 * Run: cd web && npx --offline tsx --test tests/builder/compactKpi-r9.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPACT_KPI_ROWS, showsComparison, viewerRows } from '@/lib/builder/compactKpi';
import { buildFromTemplate } from '@/lib/builder/templates';
import { defaultWidget } from '@/lib/builder/registry';
import type { KpiStripWidget, ScorecardWidget, WidgetDef } from '@/lib/builder/types';

const strip = (comparison: boolean, over: Partial<WidgetDef> = {}): KpiStripWidget => ({
    id: 's', type: 'kpi-strip', source: { type: 'default' },
    config: { metrics: [{ id: 'ga4:sessions' }], comparison: { show: comparison, display: 'percent' }, sparkline: { show: true, kind: 'area' } },
    ...over,
} as KpiStripWidget);

test('compact KPI: a strip with no comparison on screen is 2 rows, with one it keeps the author height', () => {
    assert.equal(viewerRows(strip(true), 3, 'none'), COMPACT_KPI_ROWS, 'dashboard compares nothing');
    assert.equal(viewerRows(strip(true), 3, 'previous_period'), 3);
    assert.equal(viewerRows(strip(false), 3, 'previous_period'), COMPACT_KPI_ROWS, 'the strip itself hides the comparison');
    assert.equal(viewerRows(strip(true, { dateOverride: { compare: { mode: 'previous_year' } } }), 3, 'none'), 3, 'own comparison switches it on');
    assert.equal(viewerRows(strip(true, { dateOverride: { compare: { mode: 'none' } } }), 3, 'previous_period'), COMPACT_KPI_ROWS, 'own "none" switches it off');
});

test('compact KPI: tall cards, small cards and other widgets are left alone', () => {
    assert.equal(viewerRows(strip(true), 4, 'none'), 4, 'a 4-row strip shows its sparklines');
    assert.equal(viewerRows(strip(true), 2, 'none'), 2);
    assert.equal(viewerRows(undefined, 3, 'none'), 3);
    const t = defaultWidget('timeseries', { families: { ga4: true, gsc: true } }, 't');
    assert.equal(viewerRows(t, 3, 'none'), 3);
    assert.equal(showsComparison(t, 'previous_period'), false);
});

test('compact KPI: a scorecard keeps its height when it has a sparkline or a target', () => {
    const card = defaultWidget('scorecard', { families: { ga4: true, gsc: true } }, 'c') as ScorecardWidget;
    const plain: ScorecardWidget = { ...card, config: { ...card.config, comparison: { show: true, display: 'percent' }, sparkline: { show: false, kind: 'area' }, target: undefined } };
    assert.equal(viewerRows(plain, 3, 'none'), COMPACT_KPI_ROWS);
    assert.equal(viewerRows({ ...plain, config: { ...plain.config, sparkline: { show: true, kind: 'area' } } }, 3, 'none'), 3);
    assert.equal(viewerRows({ ...plain, config: { ...plain.config, target: { value: 100 } } }, 3, 'none'), 3);
});

test('compact KPI: the R9 chart templates open with a compact strip (their dashboard compares nothing)', () => {
    const doc = buildFromTemplate('when-visitors-come', { name: 'x', defaultSource: { type: 'site', siteId: 'acme.test' } });
    const w = Object.values(doc.widgets).find((x) => x.type === 'kpi-strip')!;
    const layout = doc.pages[0].layouts.lg.find((l) => l.i === w.id)!;
    assert.equal(layout.h, 3);
    assert.equal(viewerRows(w, layout.h, 'none'), COMPACT_KPI_ROWS);
});
