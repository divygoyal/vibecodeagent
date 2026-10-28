/**
 * Round 7 integration: where the three builder streams meet. B1 viewer switchers (site, metric),
 * B2 chart notes and goal / reference lines, B3 calculated metrics.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/r7cross.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { calcId } from '@/lib/builder/calc';
import { getMetric, metricFamilies } from '@/lib/builder/catalog';
import { notesSourceOf, resolveRefLines } from '@/lib/builder/chartMarks';
import { applyViewerControls, compileWidget } from '@/lib/builder/compile';
import { publicControlsFromQuery } from '@/lib/builder/publicDoc';
import { defaultWidget } from '@/lib/builder/registry';
import { siteOptionKey, sitePicksFromKeys } from '@/lib/builder/server/access';
import { noteScopesFor, publicNoteTargets } from '@/lib/builder/server/notes';
import type { ResolvedSite, SiteDirectory } from '@/lib/builder/server/sources';
import { buildFromTemplate } from '@/lib/builder/templates';
import type { ControlState, DashboardDocV2, MetricControl, RefLine, SiteControl, TimeSeriesWidget, WidgetDef } from '@/lib/builder/types';

const SHARE = 'tok_abcdefghijklmnopqrstuvwxyz012345';
const ACME = 'acmeanalytics.example';
const DATAVIZ = 'datavizpro.example';
const RECIPE = 'recipenest.example';

const site = (id: string, n: number): ResolvedSite => ({ siteId: id, label: id, ga4: `properties/${n}`, gsc: `sc-domain:${id}` });
const ownerDir = (): SiteDirectory => {
    const sites = [site(ACME, 101), site(DATAVIZ, 202), site(RECIPE, 303)];
    return { sites, byId: new Map(sites.map((s) => [s.siteId, s])), ga4Set: new Set(sites.map((s) => s.ga4!)), gscSet: new Set(sites.map((s) => s.gsc!)), errors: {} as SiteDirectory['errors'] };
};
const base = (extra: Partial<ControlState> = {}): ControlState => ({ date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'previous_period' } }, filters: {}, ...extra });
const siteCtl = (over: Partial<SiteControl> = {}): SiteControl => ({ id: 's1', type: 'site', label: 'Client', options: [ACME, DATAVIZ], default: '', scope: { mode: 'all' }, viewerCanChange: true, ...over });
const metricCtl = (over: Partial<MetricControl> = {}): MetricControl => ({ id: 'm1', type: 'metric', label: 'Metric', options: ['gsc:clicks', 'gsc:impressions', 'gsc:ctr'], default: 'gsc:clicks', scope: { mode: 'all' }, ...over });

function ts(id: string, metrics: string[], refLines?: RefLine[]): TimeSeriesWidget {
    const w = defaultWidget('timeseries', { families: { ga4: true, gsc: true } }, id) as TimeSeriesWidget;
    w.config.series = metrics.map((m) => ({ metric: { id: m }, kind: 'line' as const }));
    w.config.granularity = 'day';
    if (refLines) w.config.refLines = refLines;
    return w;
}

/** A shared dashboard on Acme with a site switcher (Acme or DataViz), notes shown on share links. */
function sharedDoc(over: Partial<SiteControl> = {}): DashboardDocV2 {
    const doc = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: ACME } });
    doc.controls = [...doc.controls, siteCtl(over)];
    doc.settings.shareNotes = true;
    const chart = Object.values(doc.widgets).find((w): w is TimeSeriesWidget => w.type === 'timeseries');
    assert.ok(chart, 'the template has a time series');
    chart.config.annotations = 'all';
    return doc;
}
const SHARE_ALL = { viewerControls: { date: true, compare: true, filters: true } };
const targetsFor = (doc: DashboardDocV2, qs: string) => publicNoteTargets(doc, SHARE_ALL, new URLSearchParams(qs), ownerDir(), SHARE);
const siteIdsOf = (r: ReturnType<typeof targetsFor>) => [...new Set(r.targets.map((t) => (t.src.type === 'site' ? t.src.siteId : t.src.type)))];

// ── 1. chart notes follow the site switcher ──────────────────────────────

test('owner notes: a chart on the default site reads the notes of the site the switcher shows', () => {
    const chart = ts('w_ts', ['gsc:clicks']);
    const def = { type: 'site' as const, siteId: ACME };
    const view = (picks?: Record<string, string>, ctl = siteCtl()) => ({ controlDefs: [ctl], controls: base(picks ? { site: picks } : {}) });
    assert.deepEqual(notesSourceOf(chart, def), def, 'no switcher: the dashboard default');
    assert.deepEqual(notesSourceOf(chart, def, view({ s1: DATAVIZ })), { type: 'site', siteId: DATAVIZ }, 'follows the pick');
    assert.deepEqual(notesSourceOf(chart, def, view(undefined, siteCtl({ default: DATAVIZ }))), { type: 'site', siteId: DATAVIZ }, 'follows the switcher default');
    assert.deepEqual(notesSourceOf(chart, def, view({ s1: RECIPE })), def, 'a pick outside the list is ignored, as by the engine');
    const own = { ...chart, source: { type: 'site' as const, siteId: RECIPE } } as WidgetDef;
    assert.deepEqual(notesSourceOf(own, def, view({ s1: DATAVIZ })), { type: 'site', siteId: RECIPE }, 'a widget with its own site keeps it');
    const ignoring = { ...chart, ignoreControls: ['s1'] } as WidgetDef;
    assert.deepEqual(notesSourceOf(ignoring, def, view({ s1: DATAVIZ })), def, 'a widget that ignores the switcher keeps the default');
    // Same site the engine plans the Google calls for.
    const ctx = view({ s1: DATAVIZ });
    assert.deepEqual(compileWidget(chart, ctx).queries[0].source, notesSourceOf(chart, def, ctx));
});

test('public notes: an allowed site key moves the notes to that site, exactly like the query route', () => {
    const doc = sharedDoc();
    const dir = ownerDir();
    const key = siteOptionKey(SHARE, 's1', DATAVIZ);
    const r = targetsFor(doc, `s.s1=${key}`);
    assert.ok(r.targets.length > 0);
    assert.deepEqual(siteIdsOf(r), [DATAVIZ]);
    assert.deepEqual(noteScopesFor(r.targets[0].src, dir).scopes, ['properties/202'], 'DataViz notes, not Acme notes');
    // The query route's state for the same URL draws the same site.
    const q = publicControlsFromQuery(new URLSearchParams(`s.s1=${key}`), doc, SHARE_ALL, (p) => sitePicksFromKeys(doc.controls, p, dir, SHARE));
    for (const t of r.targets) assert.deepEqual(applyViewerControls(t.widget, { controlDefs: doc.controls, controls: q }).source, t.src);
    // No pick: the dashboard's site.
    assert.deepEqual(siteIdsOf(targetsFor(doc, '')), [ACME]);
});

test('public notes NEGATIVE: never a site outside the share list, never without switching on, never when notes are off', () => {
    const doc = sharedDoc();
    // The owner's own site that the switcher does not offer.
    assert.deepEqual(siteIdsOf(targetsFor(doc, `s.s1=${siteOptionKey(SHARE, 's1', RECIPE)}`)), [ACME]);
    // A raw site id, a key of another share link, a malformed key.
    assert.deepEqual(siteIdsOf(targetsFor(doc, `s.s1=${DATAVIZ}`)), [ACME]);
    assert.deepEqual(siteIdsOf(targetsFor(doc, `s.s1=${siteOptionKey('tok_other_share_token_00000000000', 's1', DATAVIZ)}`)), [ACME]);
    assert.deepEqual(siteIdsOf(targetsFor(doc, 's.s1=%27%3B--')), [ACME]);
    // The owner did not let viewers switch: a valid key does nothing.
    assert.deepEqual(siteIdsOf(targetsFor(sharedDoc({ viewerCanChange: false }), `s.s1=${siteOptionKey(SHARE, 's1', DATAVIZ)}`)), [ACME]);
    // Notes are not shared: nothing at all.
    const off = sharedDoc();
    off.settings.shareNotes = false;
    assert.equal(targetsFor(off, `s.s1=${siteOptionKey(SHARE, 's1', DATAVIZ)}`).targets.length, 0);
    // Charts with markers off or Google updates only read no notes.
    const google = sharedDoc();
    for (const w of Object.values(google.widgets)) if (w.type === 'timeseries') w.config.annotations = 'google';
    assert.equal(targetsFor(google, '').targets.length, 0);
});

// ── 2. Search Console lag tail on calcs ──────────────────────────────────

test('a calc on a Search Console input counts as Search Console (dashed lag tail)', () => {
    const gscCalc = calcId({ op: 'ratio', a: 'gsc:clicks', b: 'ga4:sessions', format: 'num', better: 'up', token: 'aa11bb' });
    const ga4Calc = calcId({ op: 'ratio', a: 'ga4:keyEvents', b: 'ga4:sessions', format: 'num', better: 'up', token: 'cc22dd' });
    assert.ok(metricFamilies(gscCalc).includes('gsc'));
    assert.ok(!metricFamilies(ga4Calc).includes('gsc'));
});

// ── 3. additivity of calcs for goal lines ────────────────────────────────

test('calc additivity: a difference of additive metrics scales per day / period; ratios, per 1,000 and % of total do not', () => {
    const diff = calcId({ op: 'diff', a: 'ga4:sessions', b: 'ga4:engagedSessions', format: 'num', better: 'down', token: 'df0001' });
    const diffRate = calcId({ op: 'diff', a: 'ga4:sessions', b: 'ga4:activeUsers', format: 'num', better: 'up', token: 'df0002' });
    const ratio = calcId({ op: 'ratio', a: 'gsc:clicks', b: 'ga4:sessions', format: 'num', better: 'up', token: 'rt0001' });
    const per1k = calcId({ op: 'per1k', a: 'ga4:keyEvents', b: 'ga4:sessions', format: 'num', better: 'up', token: 'pk0001' });
    const share = calcId({ op: 'share', a: 'gsc:clicks', format: 'pct', better: 'up', token: 'sh0001' });
    assert.equal(getMetric(diff)?.additive, true);
    assert.equal(getMetric(diffRate)?.additive, false, 'users are not additive, so neither is the difference');
    assert.equal(getMetric(ratio)?.additive, false);
    assert.equal(getMetric(per1k)?.additive, false);
    assert.equal(getMetric(share)?.additive, false);

    const range = { start: '2026-10-01', end: '2026-10-30' };
    const rows = [{ 'd:date': '2026-10-01', [`m:${diff}`]: 10, [`m:${ratio}`]: 0.5 }];
    const fmt = (_: string, v: number) => String(Math.round(v * 100) / 100);
    const line = (metric: string): RefLine => ({ kind: 'goal', value: 300, per: 'period', metric });
    const [d] = resolveRefLines([line(diff)], { rows, metrics: [diff, ratio], granularity: 'day', range, fmt });
    assert.equal(d.y, 10, 'a period goal of 300 over 30 days is 10 a day');
    assert.match(d.label, /\/day$/);
    const [r] = resolveRefLines([line(ratio)], { rows, metrics: [diff, ratio], granularity: 'week', range, fmt });
    assert.equal(r.y, 300, 'a ratio goal is drawn as entered');
    assert.doesNotMatch(r.label, /\/(day|week)$/);
});

// ── 4. metric switcher x goal / reference lines ──────────────────────────

test('metric switcher: goal and reference lines of the old metric are dropped, never drawn on the new scale', () => {
    const lines: RefLine[] = [
        { kind: 'goal', value: 5000, per: 'period' },                      // no metric: the first series (clicks)
        { kind: 'reference', value: 4000, metric: 'gsc:clicks' },
        { kind: 'reference', value: 1200, metric: 'ga4:sessions', label: 'Sessions ref' },
        { kind: 'average' },
    ];
    const chart = ts('w_ts', ['gsc:clicks', 'ga4:sessions'], lines);
    const ctx = { controlDefs: [metricCtl()], controls: base({ metric: { m1: 'gsc:impressions' } }) };
    const out = applyViewerControls(chart, ctx) as TimeSeriesWidget;
    assert.deepEqual(out.config.series.map((s) => s.metric.id), ['gsc:impressions', 'ga4:sessions']);
    assert.deepEqual(out.config.refLines, [lines[2], lines[3]], 'the sessions line and the average stay');
    assert.deepEqual(chart.config.refLines, lines, 'the saved widget is untouched');

    const rows = [{ 'd:date': '2026-10-01', 'm:gsc:impressions': 900, 'm:ga4:sessions': 100 }, { 'd:date': '2026-10-02', 'm:gsc:impressions': 1100, 'm:ga4:sessions': 120 }];
    const drawn = resolveRefLines(out.config.refLines, { rows, metrics: out.config.series.map((s) => s.metric.id), granularity: 'day', range: { start: '2026-10-01', end: '2026-10-02' }, fmt: (_, v) => String(v) });
    assert.deepEqual(drawn.map((l) => [l.kind, l.metric, l.y]), [['reference', 'ga4:sessions', 1200], ['average', 'gsc:impressions', 1000]]);

    // An explicit average on the old metric moves to the new one; only lines left = none -> no key.
    const avg = applyViewerControls(ts('w2', ['gsc:clicks'], [{ kind: 'average', metric: 'gsc:clicks' }]), ctx) as TimeSeriesWidget;
    assert.deepEqual(avg.config.refLines, [{ kind: 'average', metric: 'gsc:impressions' }]);
    const goalOnly = applyViewerControls(ts('w3', ['gsc:clicks'], [{ kind: 'goal', value: 10 }]), ctx) as TimeSeriesWidget;
    assert.equal('refLines' in goalOnly.config, false);
    // Back on the default metric: every line is there.
    assert.deepEqual((applyViewerControls(chart, { controlDefs: [metricCtl()], controls: base() }) as TimeSeriesWidget).config.refLines, lines);
});

test('ref lines: a line set for a metric the chart does not plot is skipped, breakdown charts included', () => {
    const rows = [{ 'd:date': '2026-10-01', 'b:x': 1, 'b:y': 2 }];
    const out = resolveRefLines([{ kind: 'goal', value: 9, metric: 'ga4:sessions' }, { kind: 'goal', value: 7 }], {
        rows, metrics: ['gsc:clicks'], breakdown: { metric: 'gsc:clicks', keys: ['b:x', 'b:y'], stacked: true },
        granularity: 'day', range: { start: '2026-10-01', end: '2026-10-01' }, fmt: (_, v) => String(v),
    });
    assert.deepEqual(out.map((l) => [l.metric, l.y]), [['gsc:clicks', 7]]);
});

// ── 6. metric switcher x calcs ───────────────────────────────────────────

test('metric switcher: a % of total calc is not put on a scorecard or KPI strip (it would always read 100%)', () => {
    const share = calcId({ op: 'share', a: 'gsc:impressions', format: 'pct', better: 'up', token: 'sh0002' });
    const ratio = calcId({ op: 'ratio', a: 'gsc:clicks', b: 'ga4:sessions', format: 'num', better: 'up', token: 'rt0002' });
    const ctl = metricCtl({ options: ['gsc:clicks', share, ratio] });
    const card = defaultWidget('scorecard', { families: { ga4: true, gsc: true } }, 'w_sc') as Extract<WidgetDef, { type: 'scorecard' }>;
    card.config.metric = { id: 'gsc:clicks' };
    const kpi = defaultWidget('kpi-strip', { families: { ga4: true, gsc: true } }, 'w_kpi') as Extract<WidgetDef, { type: 'kpi-strip' }>;
    kpi.config.metrics = [{ id: 'gsc:clicks' }, { id: 'ga4:sessions' }];
    const chart = ts('w_ts', ['gsc:clicks']);
    const pick = (id: string) => ({ controlDefs: [ctl], controls: base({ metric: { m1: id } }) });
    assert.equal((applyViewerControls(card, pick(share)) as typeof card).config.metric.id, 'gsc:clicks');
    assert.deepEqual((applyViewerControls(kpi, pick(share)) as typeof kpi).config.metrics.map((m) => m.id), ['gsc:clicks', 'ga4:sessions']);
    assert.deepEqual((applyViewerControls(chart, pick(share)) as TimeSeriesWidget).config.series.map((s) => s.metric.id), [share], 'a chart takes it');
    assert.equal((applyViewerControls(card, pick(ratio)) as typeof card).config.metric.id, ratio, 'other calcs swap in');
});
