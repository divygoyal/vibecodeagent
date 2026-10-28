/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed engine fixtures */
/**
 * Round 7 (B3): calculated metrics (ratio, per 1,000, difference, % of total) and the table trend
 * column. Pure maths first, then the engine against the demo Google data (no network).
 *
 * Run: cd web && npx --offline tsx --test tests/builder/calc.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { resetLimiterStats } from '@/lib/googleLimiter';
import {
    calcAutoLabel, calcId, calcValue, expandCalcs, parseCalcId, registerCalcs, replaceMetricId, shareTotals, withCalcValues,
} from '@/lib/builder/calc';
import { fmtMetricValue, getMetric, metricDeltaFor, metricFamilies, metricLabel } from '@/lib/builder/catalog';
import { compileWidget } from '@/lib/builder/compile';
import { copyWidgets, parseClip, pasteWidgets } from '@/lib/builder/clipboard';
import { publicDoc } from '@/lib/builder/publicDoc';
import { defaultWidget, tableColumns, widgetFamilies } from '@/lib/builder/registry';
import { validateDoc, validateWidgets } from '@/lib/builder/schema';
import { buildFromTemplate } from '@/lib/builder/templates';
import { rowTrends, tableTrendQuery, TABLE_TREND_ROWS, trendChange, trendMetric, trendUnsupported } from '@/lib/builder/trend';
import { evaluateWidgets, __test, type EvalInput } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import type { ControlState, DataFrame, WidgetDef, WidgetResultOk } from '@/lib/builder/types';

const KE_PER_1K = calcId({ op: 'per1k', a: 'ga4:keyEvents', b: 'ga4:sessions', format: 'num', better: 'up', token: 'ke1k01' });
const MY_CTR = calcId({ op: 'ratio', a: 'gsc:clicks', b: 'gsc:impressions', format: 'pct', better: 'up', token: 'ctr001' });
const CLICKS_PER_VIEW = calcId({ op: 'ratio', a: 'gsc:clicks', b: 'ga4:screenPageViews', format: 'num', better: 'up', token: 'cpv001' });
const NOT_ENGAGED = calcId({ op: 'diff', a: 'ga4:sessions', b: 'ga4:engagedSessions', format: 'num', better: 'down', token: 'dif001' });
const SHARE = calcId({ op: 'share', a: 'ga4:sessions', format: 'pct', better: 'up', token: 'shr001' });
const CLICK_SHARE = calcId({ op: 'share', a: 'gsc:clicks', format: 'pct', better: 'up', token: 'shr002' });

// ── ids ──

test('calc ids: round trip, strict grammar, fits the saved-doc metric id rule', () => {
    assert.equal(KE_PER_1K, 'calc:per1k_num_up:ga4:keyEvents:ga4:sessions:ke1k01');
    assert.deepEqual(parseCalcId(KE_PER_1K), { op: 'per1k', a: 'ga4:keyEvents', b: 'ga4:sessions', format: 'num', better: 'up', token: 'ke1k01' });
    assert.deepEqual(parseCalcId(SHARE), { op: 'share', a: 'ga4:sessions', b: undefined, format: 'pct', better: 'up', token: 'shr001' });
    for (const bad of [
        'calc:ratio_num_up:ga4:sessions:abcd12', // ratio without B
        'calc:share_pct_up:ga4:sessions:ga4:users:abcd12', // share with B
        'calc:avg_num_up:ga4:sessions:ga4:users:abcd12', // unknown op
        'calc:ratio_num_up:ga4:sessions:ga4:users', // no token
        'calc:ratio_num_up:ga4:a.b:ga4:users:abcd12', // bad characters
        'ga4:sessions',
    ]) assert.equal(parseCalcId(bad), null, bad);
    // A calc over metrics the catalogue does not know is not a metric.
    assert.equal(getMetric('calc:ratio_num_up:ga4:nope:ga4:sessions:abcd12'), undefined);
    // Longest possible id still fits schema.ts metricId (<= 80 after 'calc:').
    const longest = calcId({ op: 'per1k', a: 'ga4:screenPageViewsPerSession', b: 'ga4:averageRevenuePerUser', format: 'pct', better: 'down', token: 'abcdef' });
    assert.ok(longest.length - 'calc:'.length <= 80, `${longest.length}`);
    const fresh = calcId({ op: 'ratio', a: 'gsc:clicks', b: 'ga4:sessions', format: 'num', better: 'up' });
    assert.match(fresh, /:[a-z0-9]{6}$/);
});

test('calc metrics resolve in the catalogue: default and dashboard names, format, direction, families', () => {
    assert.equal(metricLabel(KE_PER_1K), 'Key events per 1,000 sessions');
    assert.equal(metricLabel(MY_CTR), 'Clicks ÷ impressions');
    assert.equal(metricLabel(NOT_ENGAGED), 'Sessions − engaged sessions');
    assert.equal(metricLabel(SHARE), 'Share of sessions');
    const renamed = calcId({ op: 'ratio', a: 'gsc:clicks', b: 'gsc:impressions', format: 'pct', better: 'up', token: 'ren001' });
    registerCalcs([{ id: renamed, label: 'My CTR' }, { id: 'calc:bogus', label: 'x' }]);
    assert.equal(metricLabel(renamed), 'My CTR');
    assert.equal(getMetric(MY_CTR)?.format, 'percent');
    assert.equal(getMetric(NOT_ENGAGED)?.better, 'down');
    assert.equal(getMetric(NOT_ENGAGED)?.additive, true, 'a difference of summable metrics sums');
    assert.equal(getMetric(KE_PER_1K)?.additive, false);
    assert.deepEqual(metricFamilies(CLICKS_PER_VIEW).sort(), ['ga4', 'gsc']);
    assert.equal(fmtMetricValue(MY_CTR, 0.0523), '5.2%');
    assert.equal(fmtMetricValue(KE_PER_1K, 12.3456), '12.35');
    assert.equal(fmtMetricValue(KE_PER_1K, null), '–');
    // A percent calc changes in points, like CTR; a "lower is better" calc colours a rise red.
    assert.equal(metricDeltaFor(MY_CTR, 0.06, 0.05).text, '1.0 pt');
    assert.equal(metricDeltaFor(NOT_ENGAGED, 120, 100).tone, 'bad');
    assert.equal(calcAutoLabel({ op: 'share', a: 'gsc:ctr' }, (id) => getMetric(id)!.label), 'Share of CTR');
});

test('calc maths: ratio, per 1,000, difference, % of total; division by zero and missing inputs give no value', () => {
    const r = parseCalcId(KE_PER_1K)!;
    assert.equal(calcValue(r, { 'ga4:keyEvents': 30, 'ga4:sessions': 1200 }), 25);
    assert.equal(calcValue(r, { 'ga4:keyEvents': 30, 'ga4:sessions': 0 }), null, 'divide by zero');
    assert.equal(calcValue(r, { 'ga4:keyEvents': 0, 'ga4:sessions': 0 }), null, '0 / 0');
    assert.equal(calcValue(r, { 'ga4:sessions': 10 }), null, 'missing A');
    assert.equal(calcValue(r, { 'ga4:keyEvents': 1, 'ga4:sessions': null }), null, 'missing B');
    const ratio = parseCalcId(MY_CTR)!;
    assert.equal(calcValue(ratio, { 'gsc:clicks': 5, 'gsc:impressions': 200 }), 0.025);
    const diff = parseCalcId(NOT_ENGAGED)!;
    assert.equal(calcValue(diff, { 'ga4:sessions': 100, 'ga4:engagedSessions': 140 }), -40);
    assert.equal(calcValue(diff, { 'ga4:sessions': 0, 'ga4:engagedSessions': 0 }), 0, 'difference of zeros is zero, not empty');
    const share = parseCalcId(SHARE)!;
    assert.equal(calcValue(share, { 'ga4:sessions': 25 }, 100), 0.25);
    assert.equal(calcValue(share, { 'ga4:sessions': 25 }, 0), null, 'empty column');
    // Column totals for share, and a row with every calc added.
    const rows = [{ 'ga4:sessions': 60, 'ga4:engagedSessions': 30 }, { 'ga4:sessions': 40, 'ga4:engagedSessions': 10 }, { 'ga4:sessions': null }];
    const tot = shareTotals([SHARE, NOT_ENGAGED], rows);
    assert.deepEqual(tot, { [SHARE]: 100 });
    const row = withCalcValues([SHARE, NOT_ENGAGED, 'ga4:sessions'], rows[0], tot);
    assert.equal(row[SHARE], 0.6);
    assert.equal(row[NOT_ENGAGED], 30);
    assert.deepEqual(expandCalcs([KE_PER_1K, 'ga4:sessions', SHARE, MY_CTR]), ['ga4:keyEvents', 'ga4:sessions', 'gsc:clicks', 'gsc:impressions']);
});

// ── engine frame maths (synthetic rows: exact numbers) ──

function frameOf(metrics: string[], rows: Array<{ dims: Record<string, string>; cur: Record<string, number | null>; prev?: Record<string, number | null> }>, opts: { top?: number; other?: boolean; compare?: boolean; time?: boolean } = {}): DataFrame {
    const q: any = {
        part: 'rows', source: { type: 'default' }, filters: [], metrics, compare: Boolean(opts.compare),
        dimensions: opts.time ? ['date'] : ['channel'],
        sort: opts.time ? undefined : { by: metrics[0], dir: 'desc' },
        top: opts.top ? { n: opts.top, other: Boolean(opts.other) } : undefined,
    };
    const cur = new Map<string, any>();
    const prev = new Map<string, any>();
    for (const r of rows) {
        const k = Object.values(r.dims).join('\u0001');
        cur.set(k, { dims: r.dims, cur: r.cur, prev: {} });
        if (r.prev) prev.set(k, { dims: r.dims, cur: r.prev, prev: {} });
    }
    const e: any = {
        q, range: { start: '2026-10-01', end: '2026-10-03' }, compare: opts.compare ? { start: '2026-09-28', end: '2026-09-30' } : undefined,
        targets: [], leaves: [], families: ['ga4'], granularity: 'day', base: expandCalcs(metrics),
    };
    const plan: any = { widget: { id: 'w', type: 'bar', config: {} }, queries: [], flags: {}, sourceLabel: '' };
    return __test.shapeFrame(q, e, cur, prev, false, plan, {});
}

const S = 'ga4:sessions';
const K = 'ga4:keyEvents';

test('engine: ratios of rolled-up rows come from summed inputs (totals, Other, comparison), never an average of row ratios', () => {
    const f = frameOf([S, K, KE_PER_1K, SHARE], [
        { dims: { channel: 'Organic' }, cur: { [S]: 1000, [K]: 50 }, prev: { [S]: 800, [K]: 20 } },
        { dims: { channel: 'Direct' }, cur: { [S]: 500, [K]: 5 }, prev: { [S]: 500, [K]: 10 } },
        { dims: { channel: 'Email' }, cur: { [S]: 10, [K]: 5 }, prev: { [S]: 0, [K]: 0 } },
        { dims: { channel: 'Paid' }, cur: { [S]: 0, [K]: 0 } },
    ], { top: 2, other: true, compare: true });
    const by = Object.fromEntries(f.rows.map((r) => [r['d:channel'], r]));
    assert.equal(by.Organic[`m:${KE_PER_1K}`], 50);
    assert.equal(by.Organic[`m:${KE_PER_1K}:prev`], 25, 'previous period from previous inputs');
    assert.equal(by.Direct[`m:${KE_PER_1K}`], 10);
    // Other = Email + Paid: (5 + 0) / (10 + 0) * 1000 = 500, not the mean of 500 and "no value".
    assert.equal(by['(other)'][`m:${KE_PER_1K}`], 500);
    assert.equal(by['(other)'][`m:${KE_PER_1K}:prev`], null, 'previous Other: 0 / 0');
    // Totals: (50 + 5 + 5 + 0) / (1000 + 500 + 10 + 0) * 1000, not the mean of the row ratios.
    assert.equal(f.totals![`m:${KE_PER_1K}`], (60 / 1510) * 1000);
    assert.equal(f.totals![`m:${KE_PER_1K}:prev`], (30 / 1300) * 1000);
    // % of total: each row over the whole column (all rows, also those folded into Other).
    assert.equal(by.Organic[`m:${SHARE}`], 1000 / 1510);
    assert.equal(by['(other)'][`m:${SHARE}`], 10 / 1510);
    assert.equal(f.totals![`m:${SHARE}`], 1);
    assert.equal(by.Organic[`m:${SHARE}:prev`], 800 / 1300, 'share of the previous period column');
    const shares = f.rows.reduce((s, r) => s + (r[`m:${SHARE}`] as number), 0);
    assert.ok(Math.abs(shares - 1) < 1e-12, `shares add up to 100% (${shares})`);
});

test('engine: a row with zero sessions shows no ratio, not Infinity or 0', () => {
    const f = frameOf([KE_PER_1K, S], [
        { dims: { channel: 'Paid' }, cur: { [S]: 0, [K]: 3 } },
        { dims: { channel: 'Organic' }, cur: { [S]: 100, [K]: 1 } },
    ]);
    const paid = f.rows.find((r) => r['d:channel'] === 'Paid')!;
    assert.equal(paid[`m:${KE_PER_1K}`], null);
    // Sorting by the calc puts rows without a value last.
    assert.equal(f.rows[f.rows.length - 1]['d:channel'], 'Paid');
    // Totals need summable inputs: users or rates as inputs give no total.
    const users = calcId({ op: 'ratio', a: 'ga4:keyEvents', b: 'ga4:activeUsers', format: 'num', better: 'up', token: 'usr001' });
    const g = frameOf([users], [{ dims: { channel: 'A' }, cur: { [K]: 2, 'ga4:activeUsers': 4 } }]);
    assert.equal(g.rows[0][`m:${users}`], 0.5);
    assert.equal(g.totals![`m:${users}`], undefined);
});

test('engine: days without data compute from zero-filled inputs (difference 0, ratio empty)', () => {
    const f = frameOf([NOT_ENGAGED, KE_PER_1K], [
        { dims: { date: '2026-10-01' }, cur: { [S]: 10, 'ga4:engagedSessions': 4, [K]: 1 } },
        { dims: { date: '2026-10-03' }, cur: { [S]: 20, 'ga4:engagedSessions': 5, [K]: 2 } },
    ], { time: true });
    assert.deepEqual(f.rows.map((r) => r['d:date']), ['2026-10-01', '2026-10-02', '2026-10-03']);
    assert.deepEqual(f.rows.map((r) => r[`m:${NOT_ENGAGED}`]), [6, 0, 15]);
    assert.deepEqual(f.rows.map((r) => r[`m:${KE_PER_1K}`]), [100, null, 100]);
});

// ── engine against the demo Google data ──

interface Call { url: string; body: any }
const calls: Call[] = [];
const demoFetch = createDemoGoogleFetch();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (/analyticsdata|searchAnalytics/.test(url)) calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return demoFetch(input, init);
}) as typeof fetch;

const NOW = new Date('2026-10-26T12:00:00Z');
const deps = () => ({ userId: 'u-calc', getToken: async () => demoAccessToken(), mode: 'owner' as const, now: NOW });
const ACME = { type: 'site' as const, siteId: 'acmeanalytics.example' };
const ctl = (range = '28d', compare: 'previous_period' | 'none' = 'previous_period'): ControlState => ({ date: { range: { kind: 'preset', id: range as '28d' }, compare: { mode: compare } }, filters: {} });
const input = (widgets: WidgetDef[], c = ctl()): EvalInput => ({ widgets: widgets.map((widget) => ({ widget })), defaultSource: ACME, controlDefs: [], controls: c });
const reset = () => { calls.length = 0; clearBuilderCache(); resetLimiterStats(); };
const ok = (r: unknown): WidgetResultOk => { assert.equal((r as WidgetResultOk).status, 'ok', JSON.stringify(r)); return r as WidgetResultOk; };
const reports = () => calls.filter((c) => c.url.includes('analyticsdata')).reduce((n, c) => n + (c.body?.requests?.length ?? 1), 0);
const gscCalls = () => calls.filter((c) => c.url.includes('searchAnalytics')).length;
const ctx = { families: { ga4: true, gsc: true } };

test('engine (demo data): scorecards of calcs equal the maths on their inputs, with comparison, no extra Google calls', async () => {
    reset();
    const base = defaultWidget('kpi-strip', ctx) as Extract<WidgetDef, { type: 'kpi-strip' }>;
    base.config.metrics = [{ id: S }, { id: K }, { id: 'gsc:clicks' }, { id: 'gsc:impressions' }, { id: 'gsc:ctr' }];
    base.config.sparkline.show = false;
    const res1 = await evaluateWidgets(input([base]), deps());
    const n1 = { r: reports(), g: gscCalls() };
    const t = ok(res1.results[base.id]).parts.total.rows[0];
    reset();
    const calc = { ...base, id: 'w_calc', config: { ...base.config, metrics: [{ id: KE_PER_1K }, { id: MY_CTR }, { id: CLICKS_PER_VIEW }, { id: NOT_ENGAGED }] } } as WidgetDef;
    const res2 = await evaluateWidgets(input([calc]), deps());
    assert.deepEqual({ r: reports(), g: gscCalls() }, { r: n1.r, g: n1.g }, 'calcs fetch their inputs in the same report');
    const c = ok(res2.results.w_calc).parts.total.rows[0];
    const close = (a: unknown, b: number, msg: string) => assert.ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
    close(c[`m:${KE_PER_1K}`], ((t[`m:${K}`] as number) / (t[`m:${S}`] as number)) * 1000, 'per 1,000');
    close(c[`m:${KE_PER_1K}:prev`], ((t[`m:${K}:prev`] as number) / (t[`m:${S}:prev`] as number)) * 1000, 'per 1,000, previous period');
    close(c[`m:${MY_CTR}`], (t['m:gsc:clicks'] as number) / (t['m:gsc:impressions'] as number), 'clicks / impressions');
    close(c[`m:${MY_CTR}`], t['m:gsc:ctr'] as number, 'equals Search Console CTR');
    assert.equal(typeof c[`m:${CLICKS_PER_VIEW}`], 'number', 'Search Console over Analytics joins');
    assert.equal(typeof c[`m:${NOT_ENGAGED}:prev`], 'number');
});

test('engine (demo data): weekly and portfolio roll-ups compute a calc from summed inputs', async () => {
    reset();
    const ts = defaultWidget('timeseries', ctx) as Extract<WidgetDef, { type: 'timeseries' }>;
    ts.config.granularity = 'week';
    ts.config.series = [{ metric: { id: MY_CTR }, kind: 'line' }, { metric: { id: 'gsc:ctr' }, kind: 'line' }];
    const kpi = defaultWidget('kpi-strip', ctx) as Extract<WidgetDef, { type: 'kpi-strip' }>;
    kpi.source = { type: 'portfolio', include: 'all' };
    kpi.config.metrics = [{ id: MY_CTR }, { id: 'gsc:clicks' }, { id: 'gsc:impressions' }];
    kpi.config.sparkline.show = false;
    const res = await evaluateWidgets(input([ts, kpi], ctl('90d')), deps());
    const rows = ok(res.results[ts.id]).parts.series.rows;
    assert.ok(rows.length >= 12);
    for (const r of rows) {
        if (typeof r['m:gsc:ctr'] !== 'number' || typeof r[`m:${MY_CTR}`] !== 'number') continue;
        assert.ok(Math.abs((r[`m:${MY_CTR}`] as number) - (r['m:gsc:ctr'] as number)) < 1e-9, `week ${r['d:date']}`);
    }
    const p = ok(res.results[kpi.id]).parts.total.rows[0];
    assert.ok(Math.abs((p[`m:${MY_CTR}`] as number) - (p['m:gsc:clicks'] as number) / (p['m:gsc:impressions'] as number)) < 1e-12, 'portfolio: sum of clicks / sum of impressions');
});

test('engine (demo data): tables, bars and donuts with calcs; % of total adds up', async () => {
    reset();
    const table = defaultWidget('table', ctx) as Extract<WidgetDef, { type: 'table' }>;
    table.config.dimensions = ['channel'];
    table.config.columns = tableColumns(['channel'], [S, K, KE_PER_1K, SHARE]);
    table.config.sort = { by: `m:${KE_PER_1K}`, dir: 'desc' };
    table.config.totalsRow = true;
    const pie = defaultWidget('pie', ctx) as Extract<WidgetDef, { type: 'pie' }>;
    pie.config.dimension = 'device';
    pie.config.metric = { id: CLICK_SHARE };
    const res = await evaluateWidgets(input([table, pie]), deps());
    const t = ok(res.results[table.id]);
    const ratios = t.parts.rows.rows.map((r) => r[`m:${KE_PER_1K}`]).filter((v): v is number => typeof v === 'number');
    assert.deepEqual(ratios, [...ratios].sort((a, b) => b - a), 'sorted by the calc');
    const sumShares = t.parts.rows.rows.reduce((s, r) => s + (Number(r[`m:${SHARE}`]) || 0), 0);
    assert.ok(Math.abs(sumShares - 1) < 1e-9, `channel shares add to 100% (${sumShares})`);
    const tot = t.parts.totals.rows[0];
    assert.ok(Math.abs((tot[`m:${KE_PER_1K}`] as number) - ((tot[`m:${K}`] as number) / (tot[`m:${S}`] as number)) * 1000) < 1e-9, 'totals row');
    const d = ok(res.results[pie.id]).parts.rows;
    const pieShares = d.rows.reduce((s, r) => s + (Number(r[`m:${CLICK_SHARE}`]) || 0), 0);
    assert.ok(Math.abs(pieShares - 1) < 1e-9, `device shares incl. Other add to 100% (${pieShares})`);
    // compile gives a donut of a share an "Other" slice (its inputs add up).
    assert.equal(compileWidget(pie, { controlDefs: [], controls: ctl() }).queries[0].top?.other, true);
});

test('saved dashboards with calcs validate; old ones stay valid; share links and paste keep the names', () => {
    const doc = buildFromTemplate('site-overview', { name: 'Calc', defaultSource: ACME });
    assert.equal(validateDoc(doc).ok, true, 'a doc without calcs is valid');
    const w = Object.values(doc.widgets).find((x) => x.type === 'kpi-strip') as Extract<WidgetDef, { type: 'kpi-strip' }>;
    w.config.metrics = [...w.config.metrics.slice(0, 3), { id: KE_PER_1K }];
    const withCalcs = { ...doc, calcs: [{ id: KE_PER_1K, label: 'Leads per 1k' }] };
    assert.equal(validateDoc(withCalcs).ok, true, validateDoc(withCalcs).ok ? '' : (validateDoc(withCalcs) as any).error);
    assert.equal(validateDoc({ ...doc, calcs: [{ id: 'calc:nope', label: 'x' }] }).ok, false);
    assert.equal(validateDoc({ ...doc, calcs: [{ id: KE_PER_1K, label: '' }] }).ok, false);
    assert.equal(validateWidgets([w]).ok, true, 'inline editor widgets with a calc id');
    const pub = publicDoc(withCalcs, () => 'acme');
    assert.deepEqual(pub.calcs, [{ id: KE_PER_1K, label: 'Leads per 1k' }]);
    assert.equal(publicDoc({ ...doc, calcs: [{ id: MY_CTR, label: 'unused' }] }, () => 'acme').calcs, undefined, 'unused names stay private');
    // Copy to another dashboard: the name travels with the widget.
    const page = withCalcs.pages.find((p) => p.layouts.lg.some((l) => l.i === w.id))!;
    const clip = parseClip(copyWidgets(withCalcs, page.id, [w.id]))!;
    assert.deepEqual(clip.calcs, [{ id: KE_PER_1K, label: 'Leads per 1k' }]);
    const target = buildFromTemplate('content-performance', { name: 'Target', defaultSource: ACME });
    const pasted = pasteWidgets(target, target.pages[0].id, clip).doc;
    assert.deepEqual(pasted.calcs, [{ id: KE_PER_1K, label: 'Leads per 1k' }]);
    assert.equal(validateDoc(pasted).ok, true);
    // Editing a calc renames its id everywhere (exact token match, ':prev' keys too).
    const next = calcId({ op: 'per1k', a: 'ga4:keyEvents', b: 'ga4:sessions', format: 'num', better: 'down', token: 'ke1k02' });
    const moved = replaceMetricId({ a: KE_PER_1K, b: `m:${KE_PER_1K}:prev`, c: `${KE_PER_1K}x` }, KE_PER_1K, next);
    assert.deepEqual(moved, { a: next, b: `m:${next}:prev`, c: `${KE_PER_1K}x` });
    assert.deepEqual(widgetFamilies({ ...w, config: { ...w.config, metrics: [{ id: CLICKS_PER_VIEW }] } }).sort(), ['ga4', 'gsc']);
});

// ── trend column ──

test('trend: query asks for the sort metric by date x row for the top rows only; weekly past 92 days', () => {
    const table = defaultWidget('table', ctx) as Extract<WidgetDef, { type: 'table' }>;
    table.config.dimensions = ['page'];
    table.config.columns = tableColumns(['page'], ['gsc:clicks', 'gsc:impressions']);
    table.config.sort = { by: 'm:gsc:impressions', dir: 'desc' };
    assert.equal(trendMetric(table), 'gsc:impressions');
    const rows: DataFrame = { columns: [], rows: [...Array.from({ length: 40 }, (_, i) => ({ 'd:page': `/p${i}`, 'm:gsc:impressions': 100 - i })), { 'd:page': '(other)', __other: 1 }] };
    const rowsQ = compileWidget(table, { controlDefs: [], controls: ctl() }).queries[0];
    assert.equal(tableTrendQuery(table, rowsQ, rows, { start: '2026-09-28', end: '2026-10-25' }), null, 'off by default');
    table.config.trend = true;
    const t = tableTrendQuery(table, rowsQ, rows, { start: '2026-09-28', end: '2026-10-25' })!;
    assert.equal(t.values.length, TABLE_TREND_ROWS);
    assert.deepEqual(t.values.slice(0, 2), ['/p0', '/p1']);
    assert.deepEqual(t.query.dimensions, ['date', 'page']);
    assert.deepEqual(t.query.metrics, ['gsc:impressions']);
    assert.equal(t.query.granularity, 'day');
    assert.deepEqual(t.query.pivot, { dimension: 'page', top: 25, other: false });
    assert.deepEqual(t.filter, { dimension: 'page', op: 'in', value: t.values });
    assert.equal(tableTrendQuery(table, rowsQ, rows, { start: '2026-01-01', end: '2026-10-25' })!.query.granularity, 'week');
    // Not for two dimensions, sites or dates.
    assert.ok(trendUnsupported({ ...table, config: { ...table.config, dimensions: ['page', 'country'] } }));
    assert.ok(trendUnsupported({ ...table, config: { ...table.config, dimensions: ['site'] } }));
    assert.ok(trendUnsupported({ ...table, config: { ...table.config, dimensions: ['date'] } }));
    assert.equal(trendUnsupported(table), null);
});

test('trend: wide frame shaping per row; trailing empty days dropped (at most 3)', () => {
    const frame: DataFrame = {
        columns: [],
        seriesKeys: ['b:/a', 'b:/b'],
        rows: [
            { 'd:date': '2026-10-01', 'b:/a': 3, 'b:/b': 0 },
            { 'd:date': '2026-10-02', 'b:/a': 5, 'b:/b': null },
            { 'd:date': '2026-10-03', 'b:/a': 4, 'b:/b': 2 },
            { 'd:date': '2026-10-04', 'b:/a': 0, 'b:/b': 0 },
            { 'd:date': '2026-10-05', 'b:/a': 0, 'b:/b': null },
        ],
    };
    const t = rowTrends(frame);
    assert.deepEqual(t.dates, ['2026-10-01', '2026-10-02', '2026-10-03']);
    assert.deepEqual(t.byValue.get('/a'), [3, 5, 4]);
    assert.deepEqual(t.byValue.get('/b'), [0, null, 2]);
    assert.equal(rowTrends(undefined).byValue.size, 0);
    const zeros: DataFrame = { columns: [], seriesKeys: ['b:x'], rows: Array.from({ length: 6 }, (_, i) => ({ 'd:date': `2026-10-0${i + 1}`, 'b:x': 0 })) };
    assert.equal(rowTrends(zeros).dates.length, 3, 'never trims more than 3 buckets');
    assert.deepEqual(trendChange([null, 2, 5, null]), { first: 2, last: 5 });
    assert.equal(trendChange([null, 2]), null);
});

test('engine (demo data): trend column costs one GA4 report or one Search Console call per table, matching its rows', async () => {
    for (const [dim, metric, family] of [['page', 'gsc:clicks', 'gsc'], ['channel', 'ga4:sessions', 'ga4'], ['page', KE_PER_1K, 'ga4']] as const) {
        const table = defaultWidget('table', ctx) as Extract<WidgetDef, { type: 'table' }>;
        table.config.dimensions = [dim];
        table.config.columns = tableColumns([dim], [metric]);
        table.config.sort = { by: `m:${metric}`, dir: 'desc' };
        reset();
        await evaluateWidgets(input([table]), deps());
        const before = { r: reports(), g: gscCalls() };
        reset();
        table.config.trend = true;
        const res = await evaluateWidgets(input([table]), deps());
        const after = { r: reports(), g: gscCalls() };
        if (family === 'gsc') assert.deepEqual(after, { r: before.r, g: before.g + 1 }, `${dim}/${metric}: +1 Search Console call`);
        else assert.deepEqual(after, { r: before.r + 1, g: before.g }, `${dim}/${metric}: +1 GA4 report`);
        const r = ok(res.results[table.id]);
        const trends = rowTrends(r.parts.trend);
        const top = r.parts.rows.rows.slice(0, TABLE_TREND_ROWS).map((x) => String(x[`d:${dim}`]));
        assert.ok(trends.byValue.size > 0, `${dim}: trends`);
        for (const v of trends.byValue.keys()) assert.ok(top.includes(v), `${dim}: trend for a row not in the top rows: ${v}`);
        assert.ok(trends.dates.length >= 25 && trends.dates.length <= 28, `${dim}: daily points ${trends.dates.length}`);
        if (metric === 'ga4:sessions') {
            // The line adds up to the row's number (GA4 counts a session that spans midnight on both days,
            // and the demo generator draws days and periods separately: within 1 %).
            const first = r.parts.rows.rows[0];
            const sum = trends.byValue.get(String(first[`d:${dim}`]))!.reduce<number>((s, v) => s + (v ?? 0), 0);
            assert.ok(Math.abs(sum / (first[`m:${metric}`] as number) - 1) < 0.01, `${sum} vs ${first[`m:${metric}`]}`);
        }
        // Cached: a second evaluation makes no Google call.
        calls.length = 0;
        await evaluateWidgets(input([table]), deps());
        assert.equal(calls.length, 0, 'second load from the cache');
    }
});
