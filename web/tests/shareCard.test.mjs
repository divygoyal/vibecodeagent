// Link-preview cards of shared dashboards: which KPI widgets feed the card, how their numbers and changes are written,
// and the "no numbers" cases. (The cache, the 2.5 s budget and site shares: tests/builder/shareCardServer.test.ts.) Run: cd web && node --test tests/shareCard.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { pickKpiWidgetIds, shareCardNumbers, shareCardRange, within, SHARE_CARD_KPIS } = await import('../src/lib/builder/shareCard.ts');
const { buildFromTemplate } = await import('../src/lib/builder/templates.ts');

const doc = () => buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: 'acme.test' } });
const ok = (parts, extra = {}) => ({ status: 'ok', fetchedAt: '2026-10-28T08:00:00Z', cache: 'hit', parts, flags: {}, ...extra });
const RESOLVED = { range: { start: '2026-09-30', end: '2026-10-27' }, timezone: 'UTC', today: '2026-10-28' };
const response = (results) => ({ results, resolved: RESOLVED, meta: { durationMs: 1, google: { ga4Calls: 0, gscCalls: 0, ga4Reports: 0 }, cache: { hit: 0, stale: 0, miss: 0 } } });
const controls = (compare = { mode: 'previous_period' }) => ({ date: { range: { kind: 'preset', id: '28d' }, compare }, filters: {} });

/** A canned response: every KPI widget answers with 1234 now and 1000 before for each of its metrics. */
function canned(d, over = {}) {
    const results = {};
    for (const id of pickKpiWidgetIds(d)) {
        const w = d.widgets[id];
        const metrics = w.type === 'scorecard' ? [w.config.metric] : w.config.metrics;
        const row = {};
        for (const m of metrics) { row[`m:${m.id}`] = 1234; row[`m:${m.id}:prev`] = 1000; }
        results[id] = ok({ total: { columns: [], rows: [row] } }, { sourceLabel: 'acme.test' });
    }
    return response({ ...results, ...over });
}

test('the card takes at most three metrics from the first KPI widgets of the first visible page, in reading order', () => {
    const d = doc();
    const ids = pickKpiWidgetIds(d);
    assert.ok(ids.length >= 1);
    for (const id of ids) assert.ok(['scorecard', 'kpi-strip'].includes(d.widgets[id].type));
    const n = shareCardNumbers(d, canned(d), controls());
    assert.ok(n);
    assert.ok(n.kpis.length >= 1 && n.kpis.length <= SHARE_CARD_KPIS);
});

test('numbers come with their site, the range and the change (tone by what is good for the metric)', () => {
    const d = doc();
    const n = shareCardNumbers(d, canned(d), controls());
    assert.equal(n.site, 'acme.test');
    assert.equal(n.range, 'Last 28 days · Sep 30 – Oct 27');
    const k = n.kpis[0];
    assert.match(k.value, /^1\.2K$|^1,234$/);
    assert.equal(k.delta.dir, 'up');
    assert.equal(k.delta.text, '23.4%');
    assert.equal(k.delta.tone, 'good');
});

test('no comparison on the dashboard: numbers without a change', () => {
    const d = doc();
    const n = shareCardNumbers(d, canned(d), controls({ mode: 'none' }));
    assert.ok(n.kpis.length);
    for (const k of n.kpis) assert.equal(k.delta, undefined);
});

test('a falling bounce rate is a good change; a widget without a number is left out, never invented', () => {
    const d = { pages: [{ id: 'p', title: 'P', layouts: { lg: [{ i: 'a', x: 0, y: 0, w: 4, h: 2 }, { i: 'b', x: 4, y: 0, w: 4, h: 2 }] } }], widgets: {
        a: { id: 'a', type: 'scorecard', source: { type: 'default' }, config: { metric: { id: 'ga4:bounceRate' }, comparison: { show: true, display: 'percent' }, sparkline: { show: false, kind: 'line' } } },
        b: { id: 'b', type: 'scorecard', source: { type: 'default' }, config: { metric: { id: 'ga4:sessions' }, comparison: { show: true, display: 'percent' }, sparkline: { show: false, kind: 'line' } } },
    } };
    const res = response({
        a: ok({ total: { columns: [], rows: [{ 'm:ga4:bounceRate': 0.4, 'm:ga4:bounceRate:prev': 0.45 }] } }),
        b: { status: 'error', code: 'UPSTREAM', message: 'x', retryable: true },
    });
    const n = shareCardNumbers(d, res, controls());
    assert.equal(n.kpis.length, 1);
    assert.equal(n.kpis[0].label, 'Bounce rate');
    assert.equal(n.kpis[0].delta.tone, 'good');
    assert.equal(n.kpis[0].delta.dir, 'down');
    assert.equal(shareCardNumbers(d, response({}), controls()), null, 'nothing came back: no numbers');
});

test('widgets with their own dates and pages without KPI widgets give no numbers', () => {
    const d = doc();
    for (const id of pickKpiWidgetIds(d)) d.widgets[id].dateOverride = { range: { kind: 'preset', id: '7d' } };
    assert.deepEqual(pickKpiWidgetIds(d), []);
    assert.equal(shareCardNumbers(d, canned(doc()), controls()), null);
    assert.deepEqual(pickKpiWidgetIds({ pages: [], widgets: {} }), []);
});

test('a hidden first page is skipped', () => {
    const d = doc();
    const first = d.pages[0];
    d.pages = [{ ...first, id: 'hid', hidden: true, layouts: { lg: [] } }, first];
    assert.ok(pickKpiWidgetIds(d).length >= 1);
});

test('range text: preset name and the days the data covers', () => {
    assert.equal(shareCardRange(controls(), RESOLVED), 'Last 28 days · Sep 30 – Oct 27');
    assert.equal(shareCardRange(controls(), undefined), 'Last 28 days');
});

test('within(): the value, or null when it is late or fails', async () => {
    assert.equal(await within(Promise.resolve(5), 50), 5);
    assert.equal(await within(new Promise((r) => setTimeout(() => r(5), 200)), 20), null);
    assert.equal(await within(Promise.reject(new Error('x')), 50), null);
});

test('the old headline and office line are gone from the share card source', () => {
    for (const f of ['../src/app/view/[token]/opengraph-image.tsx', '../src/app/share/[token]/opengraph-image.tsx', '../src/components/marketing/site/og.tsx']) {
        const s = readFileSync(new URL(f, import.meta.url), 'utf8');
        assert.ok(!/Verified traffic from confirmed sites|from the office/.test(s), f);
    }
});
