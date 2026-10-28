/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Google request fixtures */
/**
 * Round 8 drill down: schema validation, the drill state (URL form, never names a dimension), composition with
 * click to filter, the viewer switchers and calculated metrics, signed keys on public links (forged values are
 * ignored), and the engine end to end against the demo Google.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/drill.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import {
    applyDrill, drillChain, drillDown, drillFilters, drillFromParams, drillInfo, drillKeyLabel, drillOptionsFor, drillTo, drillToParam,
    keepDrillKey, resolveDrillValue, sanitizeDrill,
} from '@/lib/builder/drill';
import { clickableDims } from '@/lib/builder/interaction';
import { repairWidget, updateWidget } from '@/lib/builder/docOps';
import { defaultWidget } from '@/lib/builder/registry';
import { controlStateSchema, validateDoc, validateWidgets } from '@/lib/builder/schema';
import { buildFromTemplate } from '@/lib/builder/templates';
import { publicControlsFromQuery } from '@/lib/builder/publicDoc';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import { attachDrillKeys, drillKey, drillResolver, drillValueFromKey } from '@/lib/builder/server/access';
import type { ControlDef, ControlState, DashboardDocV2, DashboardQueryResponse, WidgetDef } from '@/lib/builder/types';

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

const base = (extra: Partial<ControlState> = {}): ControlState => ({ date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'none' } }, filters: {}, ...extra });
const ctxOf = (controls: ControlState, controlDefs: ControlDef[] = []) => ({ controlDefs, controls });

type Bar = Extract<WidgetDef, { type: 'bar' }>;
type Pie = Extract<WidgetDef, { type: 'pie' }>;
type Table = Extract<WidgetDef, { type: 'table' }>;

function bar(id: string, dimension: string, metric: string, drill?: string[], extra: Partial<Bar> = {}): Bar {
    const w = defaultWidget('bar', { families: { ga4: metric.startsWith('ga4'), gsc: metric.startsWith('gsc') } }, id) as Bar;
    w.config.dimension = dimension;
    w.config.metrics = [{ id: metric }];
    w.config.sort = { by: metric, dir: 'desc' };
    if (drill) w.interactions = { drill };
    return { ...w, ...extra };
}
function pie(id: string, dimension: string, metric: string, drill?: string[]): Pie {
    const w = defaultWidget('pie', { families: { ga4: metric.startsWith('ga4'), gsc: metric.startsWith('gsc') } }, id) as Pie;
    w.config.dimension = dimension;
    w.config.metric = { id: metric };
    if (drill) w.interactions = { drill };
    return w;
}
function table(id: string, dimensions: string[], metrics: string[], drill?: string[]): Table {
    const w = defaultWidget('table', { families: { ga4: metrics[0].startsWith('ga4'), gsc: metrics[0].startsWith('gsc') } }, id) as Table;
    w.config.dimensions = dimensions;
    w.config.columns = [
        ...dimensions.map((d, i) => ({ id: `d:${d}`, kind: 'dimension' as const, ref: d, visual: 'none' as const, pin: i === 0 ? ('left' as const) : undefined, label: i === 0 ? 'Custom name' : undefined })),
        ...metrics.map((m) => ({ id: `m:${m}`, kind: 'metric' as const, ref: m, visual: 'none' as const })),
    ];
    w.config.sort = { by: `m:${metrics[0]}`, dir: 'desc' };
    if (drill) w.interactions = { drill };
    return w;
}

const CH = ['sourceMedium', 'campaign'];

// ── schema ───────────────────────────────────────────────────────────────

test('schema: a drill list is valid on bar, pie and table; every misuse is refused with a reason', () => {
    const doc: DashboardDocV2 = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME } });
    const withWidget = (w: WidgetDef): DashboardDocV2 => {
        const first = doc.pages[0].layouts.lg[0].i;
        return { ...doc, widgets: { ...doc.widgets, [first]: { ...w, id: first } as WidgetDef } };
    };
    for (const w of [bar('a', 'channel', 'ga4:sessions', CH), pie('a', 'country', 'ga4:sessions', ['region', 'city']), table('a', ['page'], ['gsc:clicks'], ['query']), bar('a', 'device', 'ga4:sessions', ['browser'])]) {
        const r = validateDoc(withWidget(w));
        assert.equal(r.ok, true, r.ok ? '' : r.error);
    }
    assert.equal(validateDoc(withWidget(bar('a', 'channel', 'ga4:sessions', CH))).ok && validateDoc(doc).ok, true, 'old documents stay valid');

    const bad: Array<[string, WidgetDef, RegExp]> = [
        ['four levels', bar('a', 'channel', 'ga4:sessions', ['sourceMedium', 'campaign', 'country', 'city']), /./],
        ['the widget\'s own dimension again', bar('a', 'channel', 'ga4:sessions', ['channel']), /different dimension/],
        ['a repeated level', bar('a', 'channel', 'ga4:sessions', ['campaign', 'campaign']), /different dimension/],
        ['a time dimension', bar('a', 'channel', 'ga4:sessions', ['date']), /cannot be a drill level/],
        ['the site dimension', bar('a', 'channel', 'ga4:sessions', ['site']), /cannot be a drill level/],
        ['an unknown dimension', bar('a', 'channel', 'ga4:sessions', ['nope']), /cannot be a drill level/],
        ['queries under Analytics metrics', table('a', ['page'], ['ga4:sessions'], ['query']), /not available for Google Analytics/],
        ['Analytics dimensions under Search Console metrics', table('a', ['page'], ['gsc:clicks'], ['browser']), /not available for Search Console/],
        ['a scorecard', { ...(defaultWidget('scorecard', { families: { ga4: true, gsc: false } }, 'a') as WidgetDef), interactions: { drill: ['campaign'] } } as WidgetDef, /bar, pie and table/],
    ];
    for (const [name, w, re] of bad) {
        const r = validateDoc(withWidget(w));
        assert.equal(r.ok, false, name);
        if (!r.ok) assert.match(r.error, re, name);
        assert.equal(validateWidgets([w]).ok, false, `${name} (inline widgets)`);
    }
    // Structure: drill must be a list of dimension ids; runtime-only fields never save.
    assert.equal(validateWidgets([{ ...bar('a', 'channel', 'ga4:sessions'), interactions: { drill: 'campaign' } }]).ok, false);
    const saved = validateWidgets([{ ...bar('a', 'channel', 'ga4:sessions', CH), interactions: { drill: CH, drillChain: ['x'], drillDepth: 2 } }]);
    assert.equal(saved.ok, true);
    if (saved.ok) assert.deepEqual(saved.value[0].interactions, { drill: CH }, 'runtime fields are dropped on save');
});

test('schema: drill state in a request is bounded (3 values of 200 characters per widget)', () => {
    const cs = (drill: unknown) => controlStateSchema.safeParse({ date: base().date, filters: {}, drill });
    assert.equal(cs({ w1: ['Organic Search', 'google / organic'] }).success, true);
    assert.equal(cs({ w1: ['a', 'b', 'c', 'd'] }).success, false);
    assert.equal(cs({ w1: ['x'.repeat(201)] }).success, false);
    assert.equal(cs({ w1: [''] }).success, false);
    assert.equal(cs({ w1: 'Organic' }).success, false);
});

test('editor: an edit that makes the drill list impossible drops it (and a search type with it), never leaves a doc that cannot save', () => {
    const doc: DashboardDocV2 = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME } });
    const first = doc.pages[0].layouts.lg[0].i;
    const w = bar(first, 'channel', 'ga4:sessions', CH);
    const d1 = updateWidget({ ...doc, widgets: { ...doc.widgets, [first]: w } }, w);
    assert.deepEqual((d1.widgets[first] as Bar).interactions?.drill, CH);
    // Page > queries needs Search Console metrics: switching the table to Analytics drops the list; its search type goes too.
    const t = { ...table(first, ['page'], ['gsc:clicks'], ['query']), searchType: 'image' } as Table;
    const d2 = updateWidget({ ...doc, widgets: { ...doc.widgets, [first]: t } }, t);
    assert.deepEqual((d2.widgets[first] as Table).interactions?.drill, ['query']);
    assert.equal((d2.widgets[first] as Table).searchType, 'image');
    const ga = table(first, ['page'], ['ga4:sessions'], ['query']);
    const gaEdit = updateWidget(d2, { ...ga, searchType: 'image' } as Table).widgets[first] as Table;
    assert.equal(gaEdit.interactions, undefined, 'Analytics has no queries');
    assert.equal(gaEdit.searchType, undefined, 'an Analytics table has no search type');
    assert.equal(repairWidget({ ...w, interactions: { clickToFilter: true, drill: ['query'] } } as Bar).interactions?.clickToFilter, true, 'other interaction settings stay');
});

test('editor offers the hierarchies that fit the widget and its metrics', () => {
    const ids = (w: WidgetDef) => drillOptionsFor(w).map((o) => o.levels.join('>'));
    assert.deepEqual(ids(bar('a', 'channel', 'ga4:sessions')), ['sourceMedium>campaign']);
    assert.deepEqual(ids(bar('a', 'sourceMedium', 'ga4:sessions')), ['campaign'], 'a chart that starts mid-way keeps the rest');
    assert.deepEqual(ids(table('a', ['country'], ['ga4:sessions'])), ['region>city']);
    assert.deepEqual(ids(table('a', ['page'], ['gsc:clicks'])), ['query']);
    assert.deepEqual(ids(table('a', ['page'], ['ga4:sessions'])), [], 'Analytics has no queries: no offer');
    assert.deepEqual(ids(table('a', ['page'], ['gsc:clicks', 'ga4:sessions'])), [], 'mixed families: queries exist on one side only');
    assert.deepEqual(ids(bar('a', 'campaign', 'ga4:sessions')), [], 'the last level has nothing below');
    assert.deepEqual(ids(defaultWidget('scorecard', { families: { ga4: true, gsc: false } }, 'a')), []);
    assert.match(drillOptionsFor(bar('a', 'channel', 'ga4:sessions'))[0].label, /Channel › Source \/ medium › Campaign/);
});

// ── drill state: parse and serialise ─────────────────────────────────────

test('drill state: serialise and parse round-trip, including | % spaces and non-Latin text', () => {
    const widgets = { w1: bar('w1', 'channel', 'ga4:sessions', CH) } as Record<string, WidgetDef>;
    const path = ['Organic Search', 'google | "a%b" / organic'];
    const param = drillToParam(path)!;
    assert.ok(!param.slice(param.indexOf('|') + 1).includes('|'), 'a value cannot add a level');
    const q = new URLSearchParams();
    q.set('d.w1', param);
    assert.deepEqual(drillFromParams(q, widgets, resolveDrillValue), { w1: path });
    for (const v of ['日本語 / キャンペーン', 'a/b?c=d&e', '  spaced  ']) {
        const q2 = new URLSearchParams();
        q2.set('d.w1', drillToParam([v])!);
        assert.deepEqual(drillFromParams(q2, widgets, resolveDrillValue), { w1: [v] });
    }
    assert.equal(drillToParam([]), null);
    assert.deepEqual(drillDown(['a', 'b'], 1, 'c'), ['a', 'c'], 'a click replaces anything below the current level');
    assert.deepEqual(drillTo(['a', 'b'], 1), ['a']);
    assert.deepEqual(drillTo(['a', 'b'], 0), []);
});

test('drill state: only widgets with a drill list, never deeper than the list, only sane values', () => {
    const widgets = { w1: bar('w1', 'channel', 'ga4:sessions', CH), w2: bar('w2', 'channel', 'ga4:sessions'), w3: bar('w3', 'device', 'ga4:sessions', ['browser']) } as Record<string, WidgetDef>;
    const parse = (s: string) => drillFromParams(new URLSearchParams(s), widgets, resolveDrillValue);
    assert.equal(parse('d.w2=Organic'), undefined, 'no drill list: ignored');
    assert.equal(parse('d.nope=Organic'), undefined, 'unknown widget: ignored');
    assert.deepEqual(parse('d.w1=a|b|c|d'), { w1: ['a', 'b'] }, 'cut at the end of the list');
    assert.deepEqual(parse('d.w3=mobile|Chrome'), { w3: ['mobile'] });
    assert.deepEqual(parse(`d.w1=ok|${'x'.repeat(201)}`), { w1: ['ok'] }, 'a too long value ends the path');
    assert.equal(parse(`d.w1=${'x'.repeat(201)}`), undefined);
    assert.equal(parse('d.w1='), undefined);
    assert.deepEqual(parse('d.w1=a||b'), { w1: ['a'] }, 'an empty part ends the path');
    assert.deepEqual(parse('d.w1=%E0%A4%A'), undefined, 'bad percent-encoding is ignored, not thrown');
    assert.equal(parse('d.w1=(other)'), undefined, 'the "other" row is not a value');
    // The URL can carry values only: a dimension name in the URL changes nothing.
    assert.equal(parse('d.w1.dimension=country&dim.w1=country&d.w1=Organic')?.w1.length, 1);
    assert.deepEqual(sanitizeDrill(widgets, { w1: ['a', 'b', 'c'], w2: ['x'], nope: ['y'], w3: [] }), { w1: ['a', 'b'] });
    assert.equal(sanitizeDrill(widgets, undefined), undefined);
});

// ── compile: the dimension, the filters, composition ─────────────────────

test('compile: each level shows its own dimension and keeps the clicked values as filters', () => {
    const w = bar('w1', 'channel', 'ga4:sessions', CH);
    const q0 = compileWidget(w, ctxOf(base())).queries[0];
    assert.deepEqual(q0.dimensions, ['channel']);
    assert.deepEqual(q0.filters, []);

    const q1 = compileWidget(w, ctxOf(base({ drill: { w1: ['Organic Search'] } }))).queries[0];
    assert.deepEqual(q1.dimensions, ['sourceMedium']);
    assert.deepEqual(q1.filters, [{ dimension: 'channel', op: 'eq', value: 'Organic Search' }]);

    const q2 = compileWidget(w, ctxOf(base({ drill: { w1: ['Organic Search', 'google / organic'] } }))).queries[0];
    assert.deepEqual(q2.dimensions, ['campaign']);
    assert.deepEqual(q2.filters, [{ dimension: 'channel', op: 'eq', value: 'Organic Search' }, { dimension: 'sourceMedium', op: 'eq', value: 'google / organic' }]);

    // Deeper than the list: cut to the last level. Other widgets are untouched.
    const q3 = compileWidget(w, ctxOf(base({ drill: { w1: ['a', 'b', 'c', 'd'] } }))).queries[0];
    assert.deepEqual(q3.dimensions, ['campaign']);
    assert.equal(q3.filters.length, 2);
    const other = bar('w2', 'channel', 'ga4:sessions', CH);
    assert.deepEqual(compileWidget(other, ctxOf(base({ drill: { w1: ['Organic Search'] } }))).queries[0].dimensions, ['channel']);
    const noList = bar('w1', 'channel', 'ga4:sessions');
    assert.deepEqual(compileWidget(noList, ctxOf(base({ drill: { w1: ['Organic Search'] } }))).queries[0].dimensions, ['channel'], 'state cannot give a widget a drill list');
});

test('compile: a clicked value is data, never a {{var}} to fill in, and a state cannot name a dimension', () => {
    const w = bar('w1', 'channel', 'ga4:sessions', CH);
    const defs: ControlDef[] = [{ id: 'brand', type: 'variable', label: 'Brand', kind: 'text', default: 'SECRET', viewerCanChange: true }];
    const q = compileWidget(w, ctxOf(base({ drill: { w1: ['{{var:brand}}'] }, filters: { brand: ['SECRET'] } }), defs)).queries[0];
    assert.deepEqual(q.filters, [{ dimension: 'channel', op: 'eq', value: '{{var:brand}}' }]);
    // A forged state with extra keys: the dimension of every level still comes from the widget.
    const forged = { w1: ['Organic Search'], dimension: ['country'], dimensions: ['page'] } as unknown as ControlState['drill'];
    const q2 = compileWidget(w, ctxOf(base({ drill: forged }))).queries[0];
    assert.deepEqual(q2.dimensions, ['sourceMedium']);
});

test('applyDrill is idempotent and rewrites bar, pie and table consistently', () => {
    const drill = { w1: ['Organic Search'] };
    const b = bar('w1', 'channel', 'ga4:sessions', CH, { config: { ...bar('w1', 'channel', 'ga4:sessions').config, stackBy: 'sourceMedium' } } as Partial<Bar>);
    const bd = applyDrill(b, drill) as Bar;
    assert.equal(bd.config.dimension, 'sourceMedium');
    assert.equal(bd.config.stackBy, undefined, 'a chart cannot stack by its own dimension');
    assert.equal(applyDrill(bd, drill), bd, 'applying twice changes nothing');
    assert.deepEqual(drillChain(bd), ['channel', 'sourceMedium', 'campaign']);
    assert.deepEqual(drillInfo(bd, drill), { chain: ['channel', 'sourceMedium', 'campaign'], depth: 1, path: ['Organic Search'] });
    assert.deepEqual(drillFilters(bd, drill), [{ dimension: 'channel', op: 'eq', value: 'Organic Search' }]);
    assert.equal((b.config as Bar['config']).dimension, 'channel', 'the stored widget is never changed');

    const p = applyDrill(pie('w1', 'country', 'ga4:sessions', ['region', 'city']), { w1: ['US', 'California'] }) as Pie;
    assert.equal(p.config.dimension, 'city');

    const t = table('w1', ['page', 'device'], ['gsc:clicks'], ['query']);
    const td = applyDrill(t, { w1: ['/blog/post'] }) as Table;
    assert.deepEqual(td.config.dimensions, ['query', 'device']);
    assert.deepEqual(td.config.columns.filter((c) => c.kind === 'dimension').map((c) => c.ref), ['query', 'device']);
    assert.equal(td.config.columns.find((c) => c.ref === 'query')?.label, undefined, 'the custom name of the old first column is not carried to the new one');
    assert.equal(td.config.columns.some((c) => c.ref === 'page'), false);
    assert.equal(td.config.sort.by, 'm:gsc:clicks');
    const ts = table('w1', ['page'], ['gsc:clicks'], ['query']);
    ts.config.sort = { by: 'd:page', dir: 'asc' };
    assert.equal((applyDrill(ts, { w1: ['/a'] }) as Table).config.sort.by, 'd:query');
});

test('composes with click to filter: own dimension stays unfiltered, other widgets\' filters apply, last level clicks filter the page', () => {
    const w = bar('w1', 'channel', 'ga4:sessions', CH, { interactions: { drill: CH, clickToFilter: true } });
    // Another widget's click on Country filters this widget; a click on this widget's current level is ignored by it.
    const state = base({ drill: { w1: ['Organic Search'] }, interaction: [{ dimension: 'country', op: 'eq', value: 'US' }, { dimension: 'sourceMedium', op: 'eq', value: 'bing / organic' }] });
    const q = compileWidget(w, ctxOf(state)).queries[0];
    assert.deepEqual(q.dimensions, ['sourceMedium']);
    const f = q.filters.map((c) => `${c.dimension}=${c.value}`);
    assert.ok(f.includes('country=US'));
    assert.ok(f.includes('channel=Organic Search'));
    assert.ok(!f.includes('sourceMedium=bing / organic'), 'the widget keeps showing all values of its own level');
    // Click to filter on any drill level is a dimension the URL may set (x=); other dimensions are not.
    const allowed = clickableDims({ widgets: { w1: w } as DashboardDocV2['widgets'] });
    assert.deepEqual([...allowed].sort(), ['campaign', 'channel', 'sourceMedium']);
    assert.equal(clickableDims({ widgets: { w1: bar('w1', 'channel', 'ga4:sessions', CH) } as DashboardDocV2['widgets'] }).size, 0);
});

test('composes with the site, metric and Day / Week / Month switchers, and with calculated metrics', () => {
    const w = bar('w1', 'channel', 'gsc:clicks', undefined);
    const gsc = table('w1', ['page'], ['gsc:clicks'], ['query']);
    const defs: ControlDef[] = [
        { id: 's1', type: 'site', label: 'Site', options: ['a.example', 'b.example'], default: '', scope: { mode: 'all' }, viewerCanChange: true },
        { id: 'm1', type: 'metric', label: 'Metric', options: ['gsc:clicks', 'gsc:impressions'], default: 'gsc:clicks', scope: { mode: 'all' } },
    ];
    void w;
    const state = base({ drill: { w1: ['/blog/post'] }, site: { s1: 'b.example' }, metric: { m1: 'gsc:impressions' } });
    const out = applyViewerControls(gsc, ctxOf(state, defs)) as Table;
    assert.deepEqual(out.source, { type: 'site', siteId: 'b.example' });
    assert.equal(out.config.dimensions[0], 'query');
    assert.deepEqual(out.config.columns.filter((c) => c.kind === 'metric').map((c) => c.ref), ['gsc:impressions']);
    const q = compileWidget(gsc, ctxOf(state, defs)).queries[0];
    assert.deepEqual(q.metrics, ['gsc:impressions']);
    assert.deepEqual(q.dimensions, ['query']);
    assert.deepEqual(q.filters, [{ dimension: 'page', op: 'eq', value: '/blog/post' }]);

    // A calculated metric (clicks per 1,000 impressions) keeps working at every level.
    const calc = 'calc:per1k_num_up:gsc:clicks:gsc:impressions:k3f9a2';
    const cw = table('w1', ['page'], [calc], ['query']);
    const cq = compileWidget(cw, ctxOf(base({ drill: { w1: ['/a'] } }))).queries[0];
    assert.deepEqual(cq.metrics, [calc]);
    assert.deepEqual(cq.dimensions, ['query']);
});

// ── public links: signed keys ────────────────────────────────────────────

function pubDoc(): DashboardDocV2 {
    const doc: DashboardDocV2 = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME } });
    const [a, b] = doc.pages[0].layouts.lg.map((l) => l.i);
    return { ...doc, widgets: { ...doc.widgets, [a]: bar(a, 'channel', 'ga4:sessions', CH), [b]: bar(b, 'channel', 'ga4:sessions') } };
}

test('public: a key opens exactly the value it was signed for, on this link, widget, level and parents', () => {
    const k = drillKey(SHARE, 'w1', 0, [], 'Organic Search');
    assert.ok(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16}$/.test(k));
    assert.equal(drillKeyLabel(k), 'Organic Search');
    assert.equal(drillValueFromKey(SHARE, 'w1', 0, [], k), 'Organic Search');
    // NEGATIVE: another share link, widget, level or parent path; an edited value; an edited signature; raw text; junk.
    assert.equal(drillValueFromKey('tok_other_share_token_00000000000', 'w1', 0, [], k), null);
    assert.equal(drillValueFromKey(SHARE, 'w2', 0, [], k), null);
    assert.equal(drillValueFromKey(SHARE, 'w1', 1, ['Direct'], k), null);
    const k2 = drillKey(SHARE, 'w1', 1, ['Organic Search'], 'google / organic');
    assert.equal(drillValueFromKey(SHARE, 'w1', 1, ['Organic Search'], k2), 'google / organic');
    assert.equal(drillValueFromKey(SHARE, 'w1', 1, ['Direct'], k2), null, 'a key under another parent');
    assert.equal(drillValueFromKey(SHARE, 'w1', 0, [], k2), null, 'a level-1 key at level 0');
    const forgedValue = `${Buffer.from('Direct').toString('base64url')}.${k.split('.')[1]}`;
    assert.equal(drillValueFromKey(SHARE, 'w1', 0, [], forgedValue), null, 'value edited, signature kept');
    assert.equal(drillValueFromKey(SHARE, 'w1', 0, [], `${k.split('.')[0]}.AAAAAAAAAAAAAAAA`), null);
    for (const junk of ['Organic Search', 'Organic%20Search', '', '.', 'a.b', `${'x'.repeat(400)}.${k.split('.')[1]}`, '(other)']) assert.equal(drillValueFromKey(SHARE, 'w1', 0, [], junk), null, junk);
    assert.equal(drillValueFromKey(SHARE, 'w1', 0, [], drillKey(SHARE, 'w1', 0, [], '(other)')), null, 'the "other" row is never drillable');
    assert.equal(keepDrillKey('w1', 0, 'Organic Search', []), null, 'the browser keeps only key-shaped parts');
});

test('public query string: signed keys become values; raw values, forged keys and drill without the filter permission are ignored', () => {
    const doc = pubDoc();
    const [a, b] = Object.keys(doc.widgets);
    const share = { viewerControls: { date: true, compare: true, filters: true } };
    const resolve = drillResolver(SHARE);
    const k0 = drillKey(SHARE, a, 0, [], 'Organic Search');
    const k1 = drillKey(SHARE, a, 1, ['Organic Search'], 'google / organic');
    const ok = publicControlsFromQuery(new URLSearchParams(`d.${a}=${k0}|${k1}`), doc, share, undefined, resolve);
    assert.deepEqual(ok.drill, { [a]: ['Organic Search', 'google / organic'] });

    // NEGATIVE: raw value, edited key, key for another widget, no resolver, the share does not let viewers filter.
    assert.equal(publicControlsFromQuery(new URLSearchParams(`d.${a}=Organic%20Search`), doc, share, undefined, resolve).drill, undefined);
    assert.equal(publicControlsFromQuery(new URLSearchParams(`d.${a}=${Buffer.from('Direct').toString('base64url')}.${k0.split('.')[1]}`), doc, share, undefined, resolve).drill, undefined);
    assert.equal(publicControlsFromQuery(new URLSearchParams(`d.${b}=${drillKey(SHARE, a, 0, [], 'Organic Search')}`), doc, share, undefined, resolve).drill, undefined, 'widget b has no drill list');
    assert.equal(publicControlsFromQuery(new URLSearchParams(`d.${a}=${k0}`), doc, share).drill, undefined, 'no resolver, no drill');
    assert.equal(publicControlsFromQuery(new URLSearchParams(`d.${a}=${k0}`), doc, { viewerControls: { date: true, compare: true, filters: false } }, undefined, resolve).drill, undefined);
    // A valid first key with a forged second one: the path stops at the last good level.
    const half = publicControlsFromQuery(new URLSearchParams(`d.${a}=${k0}|${drillKey(SHARE, a, 1, ['Direct'], 'x / y')}`), doc, share, undefined, resolve);
    assert.deepEqual(half.drill, { [a]: ['Organic Search'] });
    // Forged names: nothing in the URL can name a dimension, metric or widget id outside the doc.
    const forged = publicControlsFromQuery(new URLSearchParams(`d.${a}=${k0}&dim=country&drill=country&d.zzz=${k0}`), doc, share, undefined, resolve);
    assert.deepEqual(Object.keys(forged.drill ?? {}), [a]);
});

test('public response: signed keys for the values shown, none for the last level, "other" or widgets without a list', () => {
    const doc = pubDoc();
    const [a, b] = Object.keys(doc.widgets);
    const ok = (rows: Array<Record<string, any>>): any => ({ status: 'ok', fetchedAt: '', cache: 'hit', flags: {}, parts: { rows: { columns: [], rows } } });
    const res = {
        results: {
            [a]: ok([{ 'd:channel': 'Organic Search' }, { 'd:channel': '(other)', __other: 1 }, { 'd:channel': '' }, { 'd:channel': 'Direct' }]),
            [b]: ok([{ 'd:channel': 'Direct' }]),
        },
    } as unknown as DashboardQueryResponse;
    attachDrillKeys(res, doc, base(), SHARE);
    const keys = (res.results[a] as any).parts.rows.drillKeys as Record<string, string>;
    assert.deepEqual(Object.keys(keys).sort(), ['Direct', 'Organic Search']);
    assert.equal(drillValueFromKey(SHARE, a, 0, [], keys['Organic Search']), 'Organic Search');
    assert.equal((res.results[b] as any).parts.rows.drillKeys, undefined);

    // Level 1 keys are bound to the parent; the last level gets none.
    const res1 = { results: { [a]: ok([{ 'd:sourceMedium': 'google / organic' }]) } } as unknown as DashboardQueryResponse;
    attachDrillKeys(res1, doc, base({ drill: { [a]: ['Organic Search'] } }), SHARE);
    const k1 = (res1.results[a] as any).parts.rows.drillKeys['google / organic'];
    assert.equal(drillValueFromKey(SHARE, a, 1, ['Organic Search'], k1), 'google / organic');
    assert.equal(drillValueFromKey(SHARE, a, 1, ['Direct'], k1), null);
    const res2 = { results: { [a]: ok([{ 'd:campaign': 'spring' }]) } } as unknown as DashboardQueryResponse;
    attachDrillKeys(res2, doc, base({ drill: { [a]: ['Organic Search', 'google / organic'] } }), SHARE);
    assert.equal((res2.results[a] as any).parts.rows.drillKeys, undefined, 'nothing below the last level');
});

// ── engine end to end (demo Google) ──────────────────────────────────────

const deps = { userId: 'u_drill', getToken: async () => TOKEN, mode: 'owner' as const, now: NOW };
const run = (widget: WidgetDef, controls: ControlState) =>
    evaluateWidgets({ widgets: [{ widget }], defaultSource: { type: 'site', siteId: ACME }, controlDefs: [], controls }, deps).then((r) => r.results[widget.id]);

test('engine: Channel > Source / medium > Campaign asks Google for the next dimension filtered to the clicked values', async () => {
    clearBuilderCache();
    const w = bar('w1', 'channel', 'ga4:sessions', CH);
    const top = (await run(w, base())) as any;
    assert.equal(top.status, 'ok', JSON.stringify(top));
    const channels = top.parts.rows.rows.map((r: any) => r['d:channel']);
    assert.ok(channels.includes('Organic Search'), channels.join(','));
    const organic = top.parts.rows.rows.find((r: any) => r['d:channel'] === 'Organic Search')['m:ga4:sessions'] as number;

    calls.length = 0;
    const lvl1 = (await run(w, base({ drill: { w1: ['Organic Search'] } }))) as any;
    assert.equal(lvl1.status, 'ok', JSON.stringify(lvl1));
    assert.ok(lvl1.parts.rows.columns.some((c: any) => c.id === 'd:sourceMedium'));
    const body = calls.find((c) => /analyticsdata/.test(c.url))!.body.requests?.[0] ?? calls[0].body;
    assert.ok(JSON.stringify(body).includes('sessionSourceMedium') && JSON.stringify(body).includes('Organic Search'), 'the report breaks down by source / medium, filtered to the channel');
    const sum = lvl1.parts.rows.rows.reduce((a: number, r: any) => a + (r['m:ga4:sessions'] ?? 0), 0);
    assert.ok(sum > 0 && sum <= organic * 1.001, `source / medium rows (${sum}) stay inside the channel (${organic})`);

    const lvl2 = (await run(w, base({ drill: { w1: ['Organic Search', lvl1.parts.rows.rows[0]['d:sourceMedium']] } }))) as any;
    assert.equal(lvl2.status, 'ok', JSON.stringify(lvl2));
    assert.ok(lvl2.parts.rows.columns.some((c: any) => c.id === 'd:campaign'));
});

test('engine: page > queries on Search Console (a path value, filtered by page), and the same widget at its own level is untouched', async () => {
    clearBuilderCache();
    const w = table('w1', ['page'], ['gsc:clicks', 'gsc:impressions'], ['query']);
    const pages = (await run(w, base())) as any;
    assert.equal(pages.status, 'ok', JSON.stringify(pages));
    const page = pages.parts.rows.rows[0]['d:page'] as string;
    calls.length = 0;
    const queries = (await run(w, base({ drill: { w1: [page] } }))) as any;
    assert.equal(queries.status, 'ok', JSON.stringify(queries));
    assert.ok(queries.parts.rows.columns.some((c: any) => c.id === 'd:query'));
    assert.ok(queries.parts.rows.rows.length > 0);
    const gsc = calls.find((c) => /searchAnalytics/.test(c.url))!.body;
    assert.deepEqual(gsc.dimensions, ['query']);
    assert.ok(JSON.stringify(gsc.dimensionFilterGroups).includes('"dimension":"page"'), 'filtered to the page');
    // The trend column follows the drilled dimension (a single-dimension table).
    const withTrend = { ...w, config: { ...w.config, trend: true } } as Table;
    const t = (await run(withTrend, base({ drill: { w1: [page] } }))) as any;
    assert.equal(t.status, 'ok');
    assert.ok(t.parts.trend, 'the trend query reads the drilled dimension');
});

test('engine: a forged state cannot reach a dimension or a widget it does not configure', async () => {
    clearBuilderCache();
    const noList = bar('w1', 'channel', 'ga4:sessions');
    calls.length = 0;
    const r = (await run(noList, base({ drill: { w1: ['Organic Search'] } }))) as any;
    assert.equal(r.status, 'ok');
    assert.ok(r.parts.rows.columns.some((c: any) => c.id === 'd:channel'), 'still channel');
    assert.ok(!JSON.stringify(calls.map((c) => c.body)).includes('Organic Search'), 'the value was never sent to Google');
});
