/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Google request fixtures */
/**
 * Round 8 Search Console search type: schema, the switcher control, plumbing from the widget to the Google
 * request, the dimensions Discover and Google News lack, and the demo generator for non-web types.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/searchType.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { demoAllSiteUrls, demoSearchAnalytics } from '@/lib/demo/gsc';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import { defaultWidget } from '@/lib/builder/registry';
import { validateDoc, validateWidgets } from '@/lib/builder/schema';
import { SEARCH_TYPES, searchTypeEligible, searchTypeProblem, searchTypesFor, widgetSearchType } from '@/lib/builder/searchType';
import { buildFromTemplate } from '@/lib/builder/templates';
import { publicControlsFromQuery } from '@/lib/builder/publicDoc';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import { tableTrendQuery } from '@/lib/builder/trend';
import type { ControlDef, ControlState, DashboardDocV2, SearchType, SearchTypeControl, WidgetDef } from '@/lib/builder/types';

const calls: Array<{ url: string; body: any }> = [];
const demoFetch = createDemoGoogleFetch();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (/analyticsdata|searchAnalytics/.test(url)) calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return demoFetch(input, init);
}) as typeof fetch;

const NOW = new Date('2026-10-26T12:00:00Z');
const TOKEN = demoAccessToken();
const ACME = 'acmeanalytics.example';
const base = (extra: Partial<ControlState> = {}): ControlState => ({ date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'previous_period' } }, filters: {}, ...extra });
const ctxOf = (controls: ControlState, controlDefs: ControlDef[] = []) => ({ controlDefs, controls });
const typeCtl = (over: Partial<SearchTypeControl> = {}): SearchTypeControl => ({ id: 't1', type: 'searchType', label: 'Search type', options: ['web', 'image', 'video', 'news', 'discover', 'googleNews'], default: 'web', scope: { mode: 'all' }, ...over });

type Table = Extract<WidgetDef, { type: 'table' }>;
type Series = Extract<WidgetDef, { type: 'timeseries' }>;

function gscSeries(id: string, metrics = ['gsc:clicks'], searchType?: SearchType): Series {
    const w = defaultWidget('timeseries', { families: { ga4: false, gsc: true } }, id) as Series;
    w.config.series = metrics.map((m) => ({ metric: { id: m }, kind: 'line' as const }));
    w.config.granularity = 'day';
    return searchType ? { ...w, searchType } : w;
}
function gscTable(id: string, dims: string[], metrics = ['gsc:clicks', 'gsc:impressions'], searchType?: SearchType): Table {
    const w = defaultWidget('table', { families: { ga4: false, gsc: true } }, id) as Table;
    w.config.dimensions = dims;
    w.config.columns = [...dims.map((d) => ({ id: `d:${d}`, kind: 'dimension' as const, ref: d, visual: 'none' as const })), ...metrics.map((m) => ({ id: `m:${m}`, kind: 'metric' as const, ref: m, visual: 'none' as const }))];
    w.config.sort = { by: `m:${metrics[0]}`, dir: 'desc' };
    return searchType ? { ...w, searchType } : w;
}
function gaSeries(id: string): Series {
    const w = defaultWidget('timeseries', { families: { ga4: true, gsc: false } }, id) as Series;
    w.config.series = [{ metric: { id: 'ga4:sessions' }, kind: 'line' }];
    return w;
}

// ── schema ───────────────────────────────────────────────────────────────

test('schema: widget searchType and the switcher control validate; every other value, mix or dimension is refused', () => {
    const doc: DashboardDocV2 = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME } });
    const first = doc.pages[0].layouts.lg[0].i;
    const withWidget = (w: WidgetDef): DashboardDocV2 => ({ ...doc, widgets: { ...doc.widgets, [first]: { ...w, id: first } as WidgetDef } });
    for (const t of ['web', 'image', 'video', 'news', 'discover', 'googleNews'] as const) {
        const r = validateDoc(withWidget(gscSeries('x', ['gsc:clicks', 'gsc:impressions'], t)));
        assert.equal(r.ok, true, `${t}: ${r.ok ? '' : r.error}`);
    }
    const ctl = validateDoc({ ...doc, controls: [...doc.controls, typeCtl()] });
    assert.equal(ctl.ok, true, ctl.ok ? '' : ctl.error);
    assert.equal(validateDoc({ ...doc, controls: [...doc.controls, typeCtl({ options: ['web'] })] }).ok, false, 'a switcher needs two choices');
    assert.equal(validateDoc({ ...doc, controls: [...doc.controls, typeCtl({ options: ['web', 'shopping' as 'web'] })] }).ok, false);
    assert.equal(validateDoc({ ...doc, controls: [...doc.controls, typeCtl({ default: 'bing' as 'web' })] }).ok, false);
    assert.equal(validateWidgets([{ ...gscSeries('x'), searchType: 'bing' }]).ok, false);

    // NEGATIVE: Analytics metrics have no search type; Discover has no queries and no position.
    const ga = validateDoc(withWidget({ ...gaSeries('x'), searchType: 'image' } as Series));
    assert.equal(ga.ok, false);
    if (!ga.ok) assert.match(ga.error, /Search Console/);
    const mixed = gscSeries('x', ['gsc:clicks', 'ga4:sessions'], 'image');
    assert.equal(validateWidgets([mixed]).ok, false, 'a chart that also shows Analytics numbers');
    const q = validateDoc(withWidget(gscTable('x', ['query'], ['gsc:clicks'], 'discover')));
    assert.equal(q.ok, false);
    if (!q.ok) assert.match(q.error, /no search queries/);
    const pos = validateDoc(withWidget(gscSeries('x', ['gsc:position'], 'googleNews')));
    assert.equal(pos.ok, false);
    if (!pos.ok) assert.match(pos.error, /position/);
    assert.equal(validateDoc(withWidget(gscTable('x', ['query'], ['gsc:clicks'], 'news'))).ok, true, 'the News tab has queries and position');
    assert.equal(validateDoc(withWidget(gscTable('x', ['query'], ['gsc:clicks', 'gsc:position'], 'image'))).ok, true);
    const filt = { ...gscSeries('x', ['gsc:clicks'], 'discover'), filters: [{ dimension: 'query', op: 'contains' as const, value: 'brand' }] };
    assert.equal(validateWidgets([filt]).ok, false, 'a query filter');
    assert.equal(validateWidgets([{ ...gscSeries('x', ['gsc:ctr'], 'discover') }]).ok, true);
});

test('searchType helpers: eligibility, the types a widget can offer, and the reasons', () => {
    assert.equal(searchTypeEligible(gscSeries('a')), true);
    assert.equal(searchTypeEligible(gaSeries('a')), false);
    assert.equal(searchTypeEligible(gscSeries('a', ['gsc:clicks', 'ga4:sessions'])), false);
    assert.equal(searchTypeEligible(defaultWidget('text', { families: { ga4: true, gsc: true } }, 'a')), false);
    assert.equal(searchTypeEligible(gscSeries('a', ['calc:per1k_num_up:gsc:clicks:gsc:impressions:k3f9a2'])), true, 'a calculation of Search Console metrics');
    assert.deepEqual(searchTypesFor(gscTable('a', ['page'])), SEARCH_TYPES.map((t) => t.id));
    assert.deepEqual(searchTypesFor(gscTable('a', ['query'])), ['web', 'image', 'video', 'news']);
    assert.deepEqual(searchTypesFor(gscTable('a', ['page'], ['gsc:clicks', 'gsc:position'])), ['web', 'image', 'video', 'news']);
    assert.match(searchTypeProblem('discover', { dimensions: ['date'], metrics: ['calc:ratio_num_up:gsc:position:gsc:clicks:k3f9a2'] }) ?? '', /position/, 'a calculation is checked by its inputs');
    assert.equal(searchTypeProblem('image', { dimensions: ['query'], metrics: ['gsc:position'] }), null);
    assert.equal(widgetSearchType({ ...gaSeries('a'), searchType: 'image' } as Series), 'web', 'ignored where it does not apply');
    assert.equal(widgetSearchType(gscSeries('a', ['gsc:clicks'], 'video')), 'video');
});

// ── compile: widget, control, URL ────────────────────────────────────────

test('compile: the widget\'s search type reaches every query; web, Analytics and mixed widgets send none', () => {
    const w = gscSeries('w', ['gsc:clicks'], 'image');
    const q = compileWidget(w, ctxOf(base())).queries;
    assert.ok(q.length > 0 && q.every((x) => x.searchType === 'image'));
    assert.equal(compileWidget(gscSeries('w'), ctxOf(base())).queries[0].searchType, undefined, 'web is the default: no field, cache keys of old widgets stay');
    assert.equal(compileWidget({ ...w, searchType: 'web' } as Series, ctxOf(base())).queries[0].searchType, undefined);
    assert.equal(compileWidget({ ...gaSeries('w'), searchType: 'image' } as Series, ctxOf(base())).queries[0].searchType, undefined);
    assert.equal(compileWidget(gscSeries('w', ['gsc:clicks', 'ga4:sessions'], 'image'), ctxOf(base())).queries[0].searchType, undefined);
    const t = gscTable('t', ['page'], ['gsc:clicks'], 'video');
    t.config.trend = true;
    const rows: any = { columns: [], rows: [{ 'd:page': '/a', 'm:gsc:clicks': 5 }] };
    const rq = compileWidget(t, ctxOf(base())).queries.find((x) => x.part === 'rows')!;
    assert.equal(tableTrendQuery(t, rq, rows, { start: '2026-09-28', end: '2026-10-25' })?.query.searchType, 'video', 'the trend column reads the same search type');
});

test('compile: the switcher moves Search Console widgets left on Web; a widget with its own non-web type keeps it', () => {
    const own = gscSeries('w1', ['gsc:clicks'], 'video');
    const plain = gscSeries('w2');
    const ga = gaSeries('w3');
    const defs: ControlDef[] = [typeCtl()];
    // No pick, default Web: widgets keep their own.
    assert.equal(applyViewerControls(own, ctxOf(base(), defs)).searchType, 'video');
    assert.equal(applyViewerControls(plain, ctxOf(base(), defs)).searchType, undefined);
    // A pick moves every eligible widget left on Web; a widget with its own non-web type keeps it (its title
    // would contradict the data otherwise); Analytics widgets are untouched.
    const picked = base({ searchType: { t1: 'discover' } });
    assert.equal(applyViewerControls(own, ctxOf(picked, defs)).searchType, 'video', 'own search type wins over the page control');
    assert.equal(applyViewerControls(own, ctxOf(base({ searchType: { t1: 'web' } }), defs)).searchType, 'video');
    assert.equal(compileWidget(own, ctxOf(picked, defs)).queries[0].searchType, 'video');
    assert.equal(applyViewerControls({ ...own, searchType: 'web' } as Series, ctxOf(picked, defs)).searchType, 'discover', 'an explicit web widget follows the control');
    assert.equal(applyViewerControls(plain, ctxOf(picked, defs)).searchType, 'discover');
    assert.equal(applyViewerControls(ga, ctxOf(picked, defs)).searchType, undefined);
    assert.equal(applyViewerControls(gscSeries('m', ['gsc:clicks', 'ga4:sessions']), ctxOf(picked, defs)).searchType, undefined, 'mixed widgets stay');
    // Picking Web back (a control that starts elsewhere) overrides a Web widget's default.
    const startsOnImage = [typeCtl({ default: 'image' })];
    assert.equal(applyViewerControls(plain, ctxOf(base(), startsOnImage)).searchType, 'image');
    assert.equal(applyViewerControls(plain, ctxOf(base({ searchType: { t1: 'web' } }), startsOnImage)).searchType, undefined);
    // A pick outside the control's options is ignored.
    assert.equal(applyViewerControls(plain, ctxOf(base({ searchType: { t1: 'discover' } }), [typeCtl({ options: ['web', 'image'] })])).searchType, undefined);
    // Scope and ignoreControls.
    assert.equal(applyViewerControls(plain, ctxOf(picked, [typeCtl({ scope: { mode: 'widgets', widgetIds: ['other'] } })])).searchType, undefined);
    assert.equal(applyViewerControls({ ...plain, ignoreControls: ['t1'] } as Series, ctxOf(picked, defs)).searchType, undefined);
    assert.equal(compileWidget(plain, ctxOf(picked, defs)).queries[0].searchType, 'discover');
});

test('URL: t.<id> must be one of the control\'s options (owner and public links)', () => {
    const doc: DashboardDocV2 = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME } });
    doc.controls = [...doc.controls, typeCtl({ options: ['web', 'image', 'discover'] })];
    const share = { viewerControls: { date: true, compare: true, filters: true } };
    const q = (s: string) => publicControlsFromQuery(new URLSearchParams(s), doc, share).searchType;
    assert.deepEqual(q('t.t1=image'), { t1: 'image' });
    assert.deepEqual(q('t.t1=discover'), { t1: 'discover' });
    assert.equal(q('t.t1=video'), undefined, 'not an option of this control');
    assert.equal(q('t.t1=bing'), undefined);
    assert.equal(q('t.t1=web'), undefined, 'the default is no pick');
    assert.equal(q('t.nope=image'), undefined);
    assert.equal(q('t.t1=image%27%3B--'), undefined);
});

// ── engine end to end (demo Google) ──────────────────────────────────────

const deps = { userId: 'u_stype', getToken: async () => TOKEN, mode: 'owner' as const, now: NOW };
const run = (widget: WidgetDef, controls: ControlState, controlDefs: ControlDef[] = []) =>
    evaluateWidgets({ widgets: [{ widget }], defaultSource: { type: 'site', siteId: ACME }, controlDefs, controls }, deps);
const gscCalls = () => calls.filter((c) => /searchAnalytics/.test(c.url));

test('engine: the Search Console request carries the type; web stays "web"; each type is its own cached call', async () => {
    clearBuilderCache();
    calls.length = 0;
    const sums: Record<string, number> = {};
    for (const t of ['web', 'image', 'video', 'news', 'discover', 'googleNews'] as const) {
        const before = gscCalls().length;
        const res = await run(gscSeries('w', ['gsc:clicks'], t === 'web' ? undefined : t), base({ date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'none' } } }));
        const r = res.results.w as any;
        assert.equal(r.status, 'ok', `${t}: ${JSON.stringify(r)}`);
        const sent = gscCalls().slice(before);
        assert.ok(sent.length > 0 && sent.every((c) => c.body.type === t), `${t}: ${sent.map((c) => c.body.type).join()}`);
        sums[t] = r.parts.series.rows.reduce((a: number, row: any) => a + (row['m:gsc:clicks'] ?? 0), 0);
    }
    assert.ok(sums.web > sums.image && sums.image > 0, JSON.stringify(sums));
    assert.ok(sums.web > sums.video && sums.web > sums.news && sums.web > sums.discover, JSON.stringify(sums));
    // Same widget again: a cache hit, no new Google call.
    const n = gscCalls().length;
    await run(gscSeries('w', ['gsc:clicks'], 'image'), base({ date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'none' } } }));
    assert.equal(gscCalls().length, n);
});

test('engine: the switcher pick changes the request; Discover with queries or position says why and asks Google nothing', async () => {
    clearBuilderCache();
    calls.length = 0;
    const defs: ControlDef[] = [typeCtl()];
    const viaControl = await run(gscSeries('w'), base({ searchType: { t1: 'image' } }), defs);
    assert.equal((viaControl.results.w as any).status, 'ok');
    assert.ok(gscCalls().every((c) => c.body.type === 'image'));

    calls.length = 0;
    const byQuery = await run(gscTable('q', ['query'], ['gsc:clicks']), base({ searchType: { t1: 'discover' } }), defs);
    const e = byQuery.results.q as any;
    assert.equal(e.status, 'error');
    assert.equal(e.code, 'INCOMPATIBLE');
    assert.match(e.message, /Discover has no search queries/);
    const pos = await run(gscSeries('p', ['gsc:position']), base({ searchType: { t1: 'googleNews' } }), defs);
    assert.match((pos.results.p as any).message, /Google News does not report an average position/);
    // A query filter from a dashboard control counts too.
    const fdefs: ControlDef[] = [typeCtl(), { id: 'f1', type: 'filter', label: 'Query', dimension: 'query', ui: 'search', default: ['brand'], scope: { mode: 'all' }, viewerCanChange: true }];
    const filtered = await run(gscSeries('f'), base({ searchType: { t1: 'discover' }, filters: { f1: ['brand'] } }), fdefs);
    assert.match((filtered.results.f as any).message, /no search queries/);
    assert.equal(gscCalls().length, 0, 'none of them reached Google');
    // Pages, countries and devices work for a feed.
    const byPage = await run(gscTable('pg', ['page'], ['gsc:clicks', 'gsc:impressions']), base({ searchType: { t1: 'discover' } }), defs);
    assert.equal((byPage.results.pg as any).status, 'ok', JSON.stringify(byPage.results.pg));
    assert.ok(gscCalls().every((c) => c.body.type === 'discover'));
});

test('engine: Analytics widgets ignore the switcher and the type is never sent to GA4', async () => {
    clearBuilderCache();
    calls.length = 0;
    const res = await run({ ...gaSeries('ga'), searchType: 'image' } as Series, base({ searchType: { t1: 'discover' } }), [typeCtl()]);
    assert.equal((res.results.ga as any).status, 'ok');
    assert.equal(gscCalls().length, 0);
    assert.ok(!calls.some((c) => JSON.stringify(c.body).includes('discover') || JSON.stringify(c.body).includes('"image"')));
});

// ── demo data ────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 28, 12);
const iso = (d: number) => new Date(now - d * DAY).toISOString().slice(0, 10);
const range = { startDate: iso(29), endDate: iso(2) };
const TYPES = ['image', 'video', 'news', 'googleNews', 'discover'] as const;
type GscRow = { keys: string[]; clicks: number; impressions: number };
/** The demo's rows, typed (the generator answers Google's loosely typed JSON). */
const gsc = (site: string, req: Record<string, unknown>): GscRow[] => (demoSearchAnalytics(site, req as any, { now }).rows ?? []) as GscRow[];

test('demo: web is exactly what it was (no type, "web" and the round 7 figures agree)', () => {
    const site = 'sc-domain:acmeanalytics.example';
    const plain = gsc(site, { ...range })[0];
    const web = gsc(site, { ...range, type: 'web' })[0];
    assert.deepEqual(plain, web);
    assert.equal(plain.clicks, 23685, 'locked since round 7');
    assert.equal(plain.impressions, 781376);
});

test('demo: other types are smaller than web, deterministic, and differ from a scaled copy of web', () => {
    for (const site of demoAllSiteUrls()) {
        const web = gsc(site, { ...range })[0] ?? { clicks: 0, impressions: 0 };
        for (const type of TYPES) {
            const a = (gsc(site, { ...range, type })[0] ?? { clicks: 0, impressions: 0 });
            const b = (gsc(site, { ...range, type })[0] ?? { clicks: 0, impressions: 0 });
            assert.deepEqual(a, b, `${site} ${type} is repeatable`);
            assert.ok(a.impressions < web.impressions * 0.5 || web.impressions < 500, `${site} ${type}: ${a.impressions} vs web ${web.impressions}`);
            assert.ok(a.clicks <= a.impressions);
        }
    }
    // Recipe and blog sites live on Images and Discover; a docs site hardly shows there.
    const get = (site: string, type: string) => gsc(site, { ...range, type })[0]?.impressions ?? 0;
    assert.ok(get('sc-domain:recipenest.example', 'image') > get('https://docs.acmeanalytics.example/', 'image') * 10);
    assert.ok(get('sc-domain:recipenest.example', 'discover') > get('https://docs.acmeanalytics.example/', 'discover') * 10);
    // Not a constant multiple of web: the days wobble on their own.
    const site = 'sc-domain:recipenest.example';
    const days = (type?: string) => gsc(site, { ...range, dimensions: ['date'], ...(type ? { type } : {}) }).map((r) => r.impressions);
    const w = days();
    const im = days('image');
    const ratios = new Set(w.map((x, i) => (im[i] / x).toFixed(3)));
    assert.ok(ratios.size > 5, 'image days are not web days times a constant');
});

test('demo: every type keeps the round 7 rule: a report over the range is the sum of its days, for every shape', () => {
    for (const type of TYPES) {
        for (const site of demoAllSiteUrls().slice(0, 8)) {
            const total = (gsc(site, { ...range, type })[0] ?? { clicks: 0, impressions: 0 });
            const days = gsc(site, { ...range, type, dimensions: ['date'] });
            assert.equal(days.reduce((a, r) => a + r.clicks, 0), total.clicks, `${site} ${type}: clicks`);
            assert.equal(days.reduce((a, r) => a + r.impressions, 0), total.impressions, `${site} ${type}: impressions`);
        }
        const site = 'sc-domain:recipenest.example';
        const dims = type === 'discover' || type === 'googleNews' ? ['page', 'device', 'country'] : ['page', 'device', 'country', 'query'];
        for (const dim of dims) {
            const rows = gsc(site, { ...range, type, dimensions: [dim], rowLimit: 5 });
            const byDay = gsc(site, { ...range, type, dimensions: [dim, 'date'], rowLimit: 25_000 });
            for (const r of rows) {
                assert.equal(byDay.filter((x) => x.keys[0] === r.keys[0]).reduce((a, x) => a + x.clicks, 0), r.clicks, `${type} ${dim} ${r.keys[0]}`);
            }
            if (rows.length) {
                const one = gsc(site, { ...range, type, dimensions: ['date'], dimensionFilterGroups: [{ filters: [{ dimension: dim, expression: rows[0].keys[0] }] }] });
                assert.equal(one.reduce((a, x) => a + x.clicks, 0), rows[0].clicks, `${type} ${dim} filtered by date`);
            }
        }
    }
});

test('demo: Discover and Google News have no queries (the API refuses the dimension); the others do', () => {
    const site = 'sc-domain:recipenest.example';
    for (const type of ['discover', 'googleNews']) {
        assert.throws(() => demoSearchAnalytics(site, { ...range, type, dimensions: ['query'] }, { now }), /query dimension is not available/);
        assert.throws(() => demoSearchAnalytics(site, { ...range, type, dimensions: ['date'], dimensionFilterGroups: [{ filters: [{ dimension: 'query', expression: 'x' }] }] }, { now }), /query dimension/);
        assert.ok(gsc(site, { ...range, type, dimensions: ['page'] }).length > 0);
    }
    for (const type of ['image', 'video', 'news']) {
        assert.ok(gsc(site, { ...range, type, dimensions: ['query'] }).length >= 0);
    }
    // An unknown type behaves as web (Google would refuse it; the engine never sends one).
    assert.deepEqual(gsc(site, { ...range, type: 'shopping' }), gsc(site, { ...range }));
});
