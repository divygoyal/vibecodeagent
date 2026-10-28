/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Google request fixtures */
/**
 * Round 7 viewer switchers: site switcher (compile, server-side ownership checks, opaque public keys),
 * metric switcher and Day / Week / Month control.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/switchers.test.ts
 * Google is answered by the demo generator (lib/demo fetch shim); nothing touches the network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { applyViewerControls, compileWidget, followsMetricControl, selectedSite } from '@/lib/builder/compile';
import { defaultWidget } from '@/lib/builder/registry';
import { resetSources } from '@/lib/builder/docOps';
import { validateDoc } from '@/lib/builder/schema';
import { buildFromTemplate } from '@/lib/builder/templates';
import { publicControlsFromQuery, publicDoc } from '@/lib/builder/publicDoc';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import { allowedSites, checkSitePicks, publicSiteChoices, siteOptionKey, sitePicksFromKeys } from '@/lib/builder/server/access';
import type { ResolvedSite, SiteDirectory } from '@/lib/builder/server/sources';
import type { ControlDef, ControlState, DashboardDocV2, GrainControl, MetricControl, SiteControl, WidgetDef } from '@/lib/builder/types';

const calls: Array<{ url: string; body: any }> = [];
const demoFetch = createDemoGoogleFetch();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (/analyticsdata|searchAnalytics/.test(url)) calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return demoFetch(input, init);
}) as typeof fetch;

const NOW = new Date('2026-10-26T12:00:00Z');
const TOKEN = demoAccessToken();
const SHARE = 'tok_abcdefghijklmnopqrstuvwxyz012345';
const ACME = 'acmeanalytics.example';
const DATAVIZ = 'datavizpro.example';
const PUZZLE = 'puzzlehub.example';
const RECIPE = 'recipenest.example';

const base = (extra: Partial<ControlState> = {}): ControlState => ({ date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'previous_period' } }, filters: {}, ...extra });

const site = (id: string): ResolvedSite => ({ siteId: id, label: id, ga4: `properties/${id.length}`, gsc: `sc-domain:${id}` });
/** The owner's own directory: these three sites only (another user's sites are simply not in it). */
const ownerDir = (): SiteDirectory => {
    const sites = [site(ACME), site(DATAVIZ), site(RECIPE)];
    return { sites, byId: new Map(sites.map((s) => [s.siteId, s])), ga4Set: new Set(sites.map((s) => s.ga4!)), gscSet: new Set(sites.map((s) => s.gsc!)), errors: {} };
};

const siteCtl = (over: Partial<SiteControl> = {}): SiteControl => ({ id: 's1', type: 'site', label: 'Client', options: [ACME, DATAVIZ], default: '', scope: { mode: 'all' }, ...over });
const metricCtl = (over: Partial<MetricControl> = {}): MetricControl => ({ id: 'm1', type: 'metric', label: 'Metric', options: ['gsc:clicks', 'gsc:impressions', 'gsc:ctr'], default: 'gsc:clicks', scope: { mode: 'all' }, ...over });
const grainCtl = (over: Partial<GrainControl> = {}): GrainControl => ({ id: 'g1', type: 'grain', label: 'Group by', options: ['auto', 'day', 'week', 'month'], default: 'auto', scope: { mode: 'all' }, ...over });

function ts(id: string, metrics: string[], title?: string): Extract<WidgetDef, { type: 'timeseries' }> {
    const w = defaultWidget('timeseries', { families: { ga4: true, gsc: true } }, id) as Extract<WidgetDef, { type: 'timeseries' }>;
    w.config.series = metrics.map((m) => ({ metric: { id: m }, kind: 'line' as const }));
    w.config.granularity = 'auto';
    if (title) w.title = title;
    return w;
}

// ── compile ──────────────────────────────────────────────────────────────

test('metric switcher swaps the bound metric only (titles follow, targets and rules of the old metric go)', () => {
    const controlDefs: ControlDef[] = [metricCtl()];
    const ctx = { controlDefs, controls: base({ metric: { m1: 'gsc:impressions' } }) };
    const chart = ts('w_ts', ['gsc:clicks', 'ga4:sessions'], 'Clicks over time');
    const out = applyViewerControls(chart, ctx) as typeof chart;
    assert.deepEqual(out.config.series.map((s) => s.metric.id), ['gsc:impressions', 'ga4:sessions']);
    assert.equal(out.title, 'Impressions over time');
    assert.deepEqual(compileWidget(chart, ctx).queries[0].metrics, ['gsc:impressions', 'ga4:sessions'], 'compile asks Google for the swapped metric');

    const card = defaultWidget('scorecard', { families: { ga4: false, gsc: true } }, 'w_sc') as Extract<WidgetDef, { type: 'scorecard' }>;
    card.config.metric = { id: 'gsc:clicks', label: 'Clicks (custom)' };
    card.config.target = { value: 5000 };
    const c2 = applyViewerControls(card, ctx) as typeof card;
    assert.deepEqual(c2.config.metric, { id: 'gsc:impressions' });
    assert.equal(c2.config.target, undefined, 'a goal for clicks is not a goal for impressions');

    const table = defaultWidget('table', { families: { ga4: false, gsc: true } }, 'w_tb') as Extract<WidgetDef, { type: 'table' }>;
    table.config.columns = [
        { id: 'd:query', kind: 'dimension', ref: 'query', visual: 'none' },
        { id: 'm:gsc:clicks', kind: 'metric', ref: 'gsc:clicks', visual: 'bar' },
        { id: 'm:gsc:position', kind: 'metric', ref: 'gsc:position', visual: 'none' },
    ];
    table.config.sort = { by: 'm:gsc:clicks', dir: 'desc' };
    table.config.rules = [{ column: 'm:gsc:clicks', op: 'gt', value: 10, style: 'good' }, { column: 'm:gsc:position', op: 'lt', value: 3, style: 'good' }];
    const t2 = applyViewerControls(table, ctx) as typeof table;
    assert.deepEqual(t2.config.columns.map((c) => c.ref), ['query', 'gsc:impressions', 'gsc:position']);
    assert.equal(t2.config.sort.by, 'm:gsc:impressions');
    assert.deepEqual(t2.config.rules?.map((r) => r.column), ['m:gsc:position']);

    // Not bound: shows impressions only, or out of scope, or ignores the control.
    const other = ts('w_other', ['gsc:impressions']);
    assert.equal(applyViewerControls(other, ctx), other);
    const ignoring = { ...ts('w_ign', ['gsc:clicks']), ignoreControls: ['m1'] };
    assert.equal(applyViewerControls(ignoring, ctx), ignoring);
    const scoped = { controlDefs: [metricCtl({ scope: { mode: 'pages', pageIds: ['p_two'] } })], controls: ctx.controls, pageId: 'p_one' };
    assert.equal(applyViewerControls(chart, scoped), chart);
    assert.equal(followsMetricControl(metricCtl(), chart, { controlDefs }), true);
    assert.equal(followsMetricControl(metricCtl(), other, { controlDefs }), false);
});

test('metric switcher: a pick outside the options (or unknown) keeps the default; swaps are idempotent; widgets showing the pick stay', () => {
    const controlDefs: ControlDef[] = [metricCtl()];
    const chart = ts('w_ts', ['gsc:clicks']);
    for (const pick of ['ga4:totalRevenue', 'gsc:nonsense', '']) {
        const out = applyViewerControls(chart, { controlDefs, controls: base({ metric: { m1: pick } }) }) as typeof chart;
        assert.equal(out.config.series[0].metric.id, 'gsc:clicks', `pick ${pick} ignored`);
    }
    const ctx = { controlDefs, controls: base({ metric: { m1: 'gsc:impressions' } }) };
    const once = applyViewerControls(chart, ctx);
    assert.deepEqual(applyViewerControls(once, ctx), once);
    // A widget that already shows the pick is left alone (no duplicate series, no lost series).
    const both = ts('w_both', ['gsc:clicks', 'gsc:impressions']);
    assert.equal(applyViewerControls(both, ctx), both);
});

test('Day / Week / Month replaces the granularity of time series in scope; Auto keeps each chart\'s own', () => {
    const controlDefs: ControlDef[] = [grainCtl()];
    const chart = ts('w_ts', ['gsc:clicks']);
    const weekly = compileWidget(chart, { controlDefs, controls: base({ grain: { g1: 'week' } }) }).queries[0];
    assert.equal(weekly.granularity, 'week');
    assert.deepEqual(weekly.dimensions, ['week']);
    assert.equal(compileWidget(chart, { controlDefs, controls: base({ grain: { g1: 'auto' } }) }).queries[0].granularity, undefined);
    const fixedMonth = { ...chart, config: { ...chart.config, granularity: 'month' as const } };
    assert.equal(compileWidget(fixedMonth, { controlDefs, controls: base() }).queries[0].granularity, 'month', 'default auto: chart setting stays');
    // A grain that is not one of the options is ignored.
    assert.equal(compileWidget(chart, { controlDefs: [grainCtl({ options: ['auto', 'week'] })], controls: base({ grain: { g1: 'day' } }) }).queries[0].granularity, undefined);
    // Scorecard sparklines stay daily.
    const card = defaultWidget('scorecard', { families: { ga4: false, gsc: true } }, 'w_sc');
    assert.deepEqual(compileWidget(card, { controlDefs, controls: base({ grain: { g1: 'month' } }) }).queries.find((q) => q.part === 'spark')?.dimensions, ['date']);
});

test('site switcher re-points widgets on the default site only; a pick outside an explicit list is refused', () => {
    const controlDefs: ControlDef[] = [siteCtl()];
    const onDefault = ts('w_def', ['gsc:clicks']);
    const pinned = { ...ts('w_pin', ['gsc:clicks']), source: { type: 'site' as const, siteId: RECIPE } };
    const all = { ...ts('w_all', ['gsc:clicks']), source: { type: 'portfolio' as const, include: 'all' as const } };
    const ctx = { controlDefs, controls: base({ site: { s1: DATAVIZ } }) };
    assert.deepEqual(applyViewerControls(onDefault, ctx).source, { type: 'site', siteId: DATAVIZ });
    assert.deepEqual(compileWidget(onDefault, ctx).queries[0].source, { type: 'site', siteId: DATAVIZ });
    assert.equal(applyViewerControls(pinned, ctx), pinned);
    assert.equal(applyViewerControls(all, ctx), all);
    assert.deepEqual(applyViewerControls(onDefault, ctx, { site: false }).source, onDefault.source, 'render copy keeps the source');
    // NEGATIVE: a site that is not in the allowed list (even one the owner has) is ignored.
    assert.equal(selectedSite(siteCtl(), base({ site: { s1: RECIPE } })), undefined);
    assert.equal(applyViewerControls(onDefault, { controlDefs, controls: base({ site: { s1: RECIPE } }) }), onDefault);
    assert.equal(selectedSite(siteCtl(), base({ site: { s1: PUZZLE } })), undefined);
    // Starts on a chosen site.
    assert.equal(selectedSite(siteCtl({ default: DATAVIZ }), base()), DATAVIZ);
});

// ── server-side ownership checks ─────────────────────────────────────────

test('owner requests: picks are kept only for allowed sites the owner can read (never another user\'s site)', () => {
    const dir = ownerDir();
    const defs: ControlDef[] = [siteCtl()];
    assert.deepEqual(checkSitePicks(defs, base({ site: { s1: DATAVIZ } }), dir).site, { s1: DATAVIZ });
    // NEGATIVE: not in the control's list (but owned).
    assert.equal(checkSitePicks(defs, base({ site: { s1: RECIPE } }), dir).site, undefined);
    // NEGATIVE: options 'all' still means "the owner's sites": a site of another user is dropped.
    const allDefs: ControlDef[] = [siteCtl({ options: 'all' })];
    assert.equal(checkSitePicks(allDefs, base({ site: { s1: PUZZLE } }), dir).site, undefined);
    assert.equal(checkSitePicks(allDefs, base({ site: { s1: 'evil.example' } }), dir).site, undefined);
    assert.deepEqual(checkSitePicks(allDefs, base({ site: { s1: RECIPE } }), dir).site, { s1: RECIPE });
    // NEGATIVE: a pick for a control that does not exist; no directory (Google not connected).
    assert.equal(checkSitePicks(defs, base({ site: { nope: DATAVIZ } }), dir).site, undefined);
    assert.equal(checkSitePicks(defs, base({ site: { s1: DATAVIZ } }), null).site, undefined);
    assert.deepEqual(allowedSites(siteCtl({ options: [DATAVIZ, PUZZLE] }), dir).map((s) => s.siteId), [DATAVIZ], 'a listed site the owner lost is not offered');
});

test('public links: opaque keys only, mapped server side; raw ids, foreign keys and locked controls are refused', () => {
    const dir = ownerDir();
    const open = siteCtl({ viewerCanChange: true });
    const choices = publicSiteChoices(open, dir, SHARE);
    assert.deepEqual(choices.map((c) => c.label), [ACME, DATAVIZ]);
    for (const c of choices) assert.ok(/^[A-Za-z0-9_-]{12}$/.test(c.key) && !c.key.includes('example'), 'keys say nothing');
    const key = siteOptionKey(SHARE, 's1', DATAVIZ);
    assert.deepEqual(sitePicksFromKeys([open], { s1: key }, dir, SHARE), { s1: DATAVIZ });
    // NEGATIVE: a raw site id, a key of a site outside the list, a key of another user's site, a key from another share.
    assert.deepEqual(sitePicksFromKeys([open], { s1: DATAVIZ }, dir, SHARE), {});
    assert.deepEqual(sitePicksFromKeys([open], { s1: siteOptionKey(SHARE, 's1', RECIPE) }, dir, SHARE), {});
    assert.deepEqual(sitePicksFromKeys([open], { s1: siteOptionKey(SHARE, 's1', PUZZLE) }, dir, SHARE), {});
    assert.deepEqual(sitePicksFromKeys([open], { s1: siteOptionKey('tok_other_share_token_00000000000', 's1', DATAVIZ) }, dir, SHARE), {});
    // NEGATIVE: the owner did not let share viewers switch.
    assert.deepEqual(sitePicksFromKeys([siteCtl()], { s1: key }, dir, SHARE), {});
    assert.deepEqual(publicSiteChoices(siteCtl(), dir, SHARE), []);
});

test('public doc: a site switcher carries keys and allowed labels only; locked ones are left out; m./g. are checked', () => {
    const doc: DashboardDocV2 = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME, ga4: 'properties/412300101', gsc: 'sc-domain:acmeanalytics.example' } });
    doc.controls = [...doc.controls, siteCtl({ viewerCanChange: true, default: DATAVIZ }), metricCtl(), grainCtl()];
    const dir = ownerDir();
    const pub = publicDoc(doc, (s) => (s.type === 'site' ? s.siteId : 'All sites'), { siteChoices: (c) => publicSiteChoices(c, dir, SHARE) });
    const sc = pub.controls.find((c): c is SiteControl => c.type === 'site')!;
    assert.deepEqual(sc.choices?.map((c) => c.label), [ACME, DATAVIZ]);
    assert.deepEqual(sc.options, sc.choices?.map((c) => c.key), 'options are the keys, not site ids');
    assert.equal(sc.default, siteOptionKey(SHARE, 's1', DATAVIZ));
    const json = JSON.stringify(pub);
    assert.ok(!json.includes(RECIPE), 'a site the owner did not allow is never named');
    assert.ok(!json.includes('properties/') && !json.includes('sc-domain:'), 'no property ids or Search Console URLs');

    // Locked (owner-only) site switcher: not in the public doc at all.
    const locked = { ...doc, controls: doc.controls.map((c) => (c.type === 'site' ? { ...c, viewerCanChange: false } : c)) };
    const pub2 = publicDoc(locked, () => 'x', { siteChoices: (c) => publicSiteChoices(c, dir, SHARE) });
    assert.equal(pub2.controls.some((c) => c.type === 'site'), false);
    assert.ok(!JSON.stringify(pub2).includes(DATAVIZ));

    // Query string: only option values pass; site keys only through the server mapping.
    const share = { viewerControls: { date: true, compare: true, filters: true } };
    const q = new URLSearchParams(`m.m1=ga4:totalRevenue&g.g1=quarter&s.s1=${DATAVIZ}`);
    const st = publicControlsFromQuery(q, doc, share, (picks) => sitePicksFromKeys(doc.controls, picks, dir, SHARE));
    assert.equal(st.metric, undefined);
    assert.equal(st.grain, undefined);
    assert.equal(st.site, undefined, 'a raw site id in the URL is not a key');
    const ok = publicControlsFromQuery(new URLSearchParams(`m.m1=gsc:ctr&g.g1=month&s.s1=${siteOptionKey(SHARE, 's1', ACME)}`), doc, share, (picks) => sitePicksFromKeys(doc.controls, picks, dir, SHARE));
    assert.deepEqual(ok.metric, { m1: 'gsc:ctr' });
    assert.deepEqual(ok.grain, { g1: 'month' });
    assert.deepEqual(ok.site, { s1: ACME });
    assert.equal(publicControlsFromQuery(new URLSearchParams(`s.s1=${siteOptionKey(SHARE, 's1', ACME)}`), doc, share).site, undefined, 'no mapper, no site');
});

test('schema keeps old docs valid, accepts the new controls and never saves public choices; copies reset site lists', () => {
    const doc: DashboardDocV2 = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME } });
    assert.equal(validateDoc(doc).ok, true);
    doc.controls = [...doc.controls, { ...siteCtl({ viewerCanChange: true }), choices: [{ key: 'abcdefghijkl', label: 'x' }] }, metricCtl(), grainCtl()];
    const v = validateDoc(doc);
    assert.equal(v.ok, true, v.ok ? '' : v.error);
    if (v.ok) assert.equal((v.value.controls.find((c) => c.type === 'site') as SiteControl).choices, undefined);
    assert.equal(validateDoc({ ...doc, controls: [...doc.controls, grainCtl({ id: 'g2', options: ['hour' as 'day'] })] }).ok, false);
    const copy = resetSources(doc, { type: 'site', siteId: 'mine.example' });
    const sc = copy.controls.find((c): c is SiteControl => c.type === 'site')!;
    assert.deepEqual([sc.options, sc.default, sc.viewerCanChange], ['all', '', false], 'no site ids of the old owner travel with a copy');
});

// ── engine end to end (demo Google) ──────────────────────────────────────

test('engine: the picked site is queried; another user\'s site never is (defence in depth below the route check)', async () => {
    clearBuilderCache();
    calls.length = 0;
    const chart = ts('w_ts', ['ga4:sessions']);
    const deps = { userId: 'u_switch', getToken: async () => TOKEN, mode: 'owner' as const, now: NOW, loadDirectory: async () => ownerDir() };
    const real = { userId: 'u_switch', getToken: async () => TOKEN, mode: 'owner' as const, now: NOW };
    const run = (controlDefs: ControlDef[], controls: ControlState, d: typeof real = real) =>
        evaluateWidgets({ widgets: [{ widget: chart }], defaultSource: { type: 'site', siteId: ACME }, controlDefs, controls }, d);

    const picked = await run([siteCtl()], base({ site: { s1: DATAVIZ } }));
    const r = picked.results.w_ts;
    assert.equal(r.status, 'ok', JSON.stringify(r));
    assert.equal(r.sourceLabel, DATAVIZ);
    assert.ok(calls.some((c) => c.url.includes('412300103')), 'datavizpro property queried');
    assert.ok(!calls.some((c) => c.url.includes('412300101')), 'default site not queried');

    // Not in the list: falls back to the default site.
    const fallback = await run([siteCtl()], base({ site: { s1: RECIPE } }));
    assert.equal(fallback.results.w_ts.sourceLabel, ACME);

    // Options 'all' and a site outside the owner's directory (route check bypassed): the engine refuses it.
    const foreign = await run([siteCtl({ options: 'all' })], base({ site: { s1: PUZZLE } }), deps);
    const f = foreign.results.w_ts;
    assert.equal(f.status, 'error');
    if (f.status === 'error') assert.equal(f.code, 'NO_ACCESS');
});

test('engine: metric and grain switchers change what is asked and the columns returned', async () => {
    clearBuilderCache();
    const chart = ts('w_ts', ['gsc:clicks']);
    const res = await evaluateWidgets({
        widgets: [{ widget: chart }], defaultSource: { type: 'site', siteId: ACME },
        controlDefs: [metricCtl(), grainCtl()], controls: base({ metric: { m1: 'gsc:impressions' }, grain: { g1: 'week' } }),
    }, { userId: 'u_switch2', getToken: async () => TOKEN, mode: 'owner', now: NOW });
    const r = res.results.w_ts;
    assert.equal(r.status, 'ok', JSON.stringify(r));
    if (r.status === 'ok') {
        const row = r.parts.series.rows[0];
        assert.equal(typeof row['m:gsc:impressions'], 'number');
        assert.equal(row['m:gsc:clicks'], undefined);
        assert.ok(r.parts.series.rows.length <= 6, `weekly rows ${r.parts.series.rows.length}`);
    }
});
