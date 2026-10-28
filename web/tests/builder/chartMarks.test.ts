/**
 * Round 7 chart context: markers (your notes + Google updates) and goal / reference / average lines
 * on builder time series, the notes scope rules, and what a share link may receive.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/chartMarks.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    annotationMode,
    buildChartMarks,
    lineValuePerPoint,
    noteScopeOf,
    notesForScopes,
    resolveRefLines,
    seriesAverage,
    showsGoogle,
    showsNotes,
    snapToRow,
    toPublicNotes,
    widgetRange,
} from '@/lib/builder/chartMarks';
import { noteScopesFor } from '@/lib/builder/server/notes';
import type { SiteDirectory } from '@/lib/builder/server/sources';
import { publicDoc } from '@/lib/builder/publicDoc';
import { validateDoc } from '@/lib/builder/schema';
import { TEMPLATES, buildFromTemplate } from '@/lib/builder/templates';
import type { GoogleUpdate } from '@/lib/googleUpdates';
import type { DashboardDocV2, TimeSeriesWidget } from '@/lib/builder/types';

const days = (start: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

test('annotation mode: missing means notes and Google updates', () => {
    assert.equal(annotationMode(undefined), 'all');
    assert.equal(annotationMode('off'), 'off');
    assert.equal(showsNotes(undefined), true);
    assert.equal(showsGoogle('notes'), false);
    assert.equal(showsNotes('google'), false);
    assert.equal(showsGoogle('off'), false);
});

test('snapToRow: the bucket that holds a day, null outside the range', () => {
    const weeks = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
    const range = { start: '2026-10-01', end: '2026-10-24' };
    assert.equal(snapToRow('2026-10-01', weeks, range), '2026-09-28');
    assert.equal(snapToRow('2026-10-11', weeks, range), '2026-10-05');
    assert.equal(snapToRow('2026-10-19', weeks, range), '2026-10-19');
    assert.equal(snapToRow('2026-09-30', weeks, range), null);
    assert.equal(snapToRow('2026-10-25', weeks, range), null);
    assert.equal(snapToRow('2026-10-02', [], range), null);
});

const UPDATES: GoogleUpdate[] = [
    { name: 'Old core update', kind: 'core', start: '2026-05-21', end: '2026-06-02' },
    { name: 'September 2026 spam update', kind: 'spam', start: '2026-09-24', end: '2026-10-08' },
    { name: 'Short spam update', kind: 'spam', start: '2026-10-20', end: '2026-10-20' },
];

test('buildChartMarks: Google updates by rollout start (shaded to the end), notes by day, numbered by date', () => {
    const rowDates = days('2026-09-20', 35); // to 2026-10-24
    const range = { start: '2026-09-20', end: '2026-10-24' };
    const { marks, hidden } = buildChartMarks({
        rowDates, range, mode: 'all', google: UPDATES,
        notes: [{ id: 7, date: '2026-10-02', title: 'Launched pricing page' }, { id: 8, date: '2026-08-01', title: 'Outside' }],
    });
    assert.equal(hidden, 0);
    assert.deepEqual(marks.map((m) => [m.n, m.kind, m.at, m.label]), [
        [1, 'google', '2026-09-24', 'September 2026 spam update'],
        [2, 'note', '2026-10-02', 'Launched pricing page'],
        [3, 'google', '2026-10-20', 'Short spam update'],
    ]);
    assert.equal(marks[0].endAt, '2026-10-08');
    assert.equal(marks[2].endAt, undefined, 'one-day rollout: a line, no shading');
    assert.equal(marks[1].noteId, 7);
});

test('buildChartMarks: modes, weekly buckets, rollout end clipped to the range, the most recent kept', () => {
    const range = { start: '2026-09-25', end: '2026-10-24' };
    const weeks = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
    const notes = [{ id: 1, date: '2026-10-07', title: 'A' }];
    assert.equal(buildChartMarks({ rowDates: weeks, range, mode: 'off', google: UPDATES, notes }).marks.length, 0);
    assert.deepEqual(buildChartMarks({ rowDates: weeks, range, mode: 'notes', google: UPDATES, notes }).marks.map((m) => m.at), ['2026-10-05']);
    // The September update started before the range: not drawn (as on the site charts).
    assert.deepEqual(buildChartMarks({ rowDates: weeks, range, mode: 'google', google: UPDATES, notes }).marks.map((m) => m.label), ['Short spam update']);
    const daily = days('2026-09-24', 5);
    const clipped = buildChartMarks({ rowDates: daily, range: { start: '2026-09-24', end: '2026-09-28' }, mode: 'google', google: UPDATES });
    assert.equal(clipped.marks[0].endAt, '2026-09-28');
    const many = Array.from({ length: 15 }, (_, i) => ({ id: i, date: days('2026-10-01', 15)[i], title: `n${i}` }));
    const capped = buildChartMarks({ rowDates: days('2026-10-01', 24), range: { start: '2026-10-01', end: '2026-10-24' }, mode: 'notes', notes: many, max: 12 });
    assert.equal(capped.marks.length, 12);
    assert.equal(capped.hidden, 3);
    assert.equal(capped.marks[0].label, 'n3');
    assert.equal(capped.marks[11].n, 12);
});

test('buildChartMarks: the real Google list has dated, sourced rows', () => {
    const { marks } = buildChartMarks({ rowDates: days('2026-01-01', 300), range: { start: '2026-01-01', end: '2026-10-27' }, mode: 'google' });
    assert.ok(marks.length >= 5);
    assert.ok(marks.every((m) => m.kind === 'google' && /^\d{4}-\d{2}-\d{2}$/.test(m.date)));
});

test('lineValuePerPoint: rates and period totals scaled to the chart granularity (additive metrics only)', () => {
    assert.equal(lineValuePerPoint(500, 'point', 'day', 28, true), 500);
    assert.equal(lineValuePerPoint(2800, 'period', 'day', 28, true), 100);
    assert.equal(lineValuePerPoint(2800, 'period', 'week', 28, true), 700);
    assert.equal(lineValuePerPoint(70, 'week', 'day', 28, true), 10);
    assert.equal(Math.round(lineValuePerPoint(30_437.5, 'month', 'day', 90, true)), 1000);
    assert.equal(lineValuePerPoint(10, 'day', 'week', 90, true), 70);
    // A 5-day range on weekly buckets: a period total is not inflated past itself.
    assert.equal(lineValuePerPoint(500, 'period', 'week', 5, true), 500);
    // Rates (CTR) are drawn as entered.
    assert.equal(lineValuePerPoint(0.05, 'period', 'day', 28, false), 0.05);
});

test('seriesAverage: complete rows only, nulls skipped, stacked keys summed', () => {
    const rows = [{ 'm:a': 10, 'b:x': 1, 'b:y': 2 }, { 'm:a': null, 'b:x': 3, 'b:y': 4 }, { 'm:a': 30, 'b:x': 5, 'b:y': 6 }, { 'm:a': 2, 'b:x': 0, 'b:y': 0 }];
    assert.equal(seriesAverage(rows, ['m:a']), 14);
    assert.equal(seriesAverage(rows, ['m:a'], 3), 20);
    assert.equal(seriesAverage(rows, ['b:x', 'b:y'], 3), 7);
    assert.equal(seriesAverage([], ['m:a']), null);
});

test('resolveRefLines: goal, reference and average on the right axis, skipped when unusable', () => {
    const rows = days('2026-10-01', 4).map((d, i) => ({ 'd:date': d, 'm:gsc:clicks': [10, 20, 30, 40][i], 'm:gsc:ctr': 0.02 }));
    const fmt = (id: string, v: number) => `${id}=${Math.round(v * 100) / 100}`;
    const lines = resolveRefLines([
        { kind: 'goal', value: 120, per: 'period' },
        { kind: 'average', label: 'Avg' },
        { kind: 'reference', value: 0.03, metric: 'gsc:ctr', per: 'period' },
    ], { rows, metrics: ['gsc:clicks', 'gsc:ctr'], granularity: 'day', range: { start: '2026-10-01', end: '2026-10-04' }, fmt });
    assert.deepEqual(lines.map((l) => [l.kind, l.metric, l.y, l.label]), [
        ['goal', 'gsc:clicks', 30, 'Goal gsc:clicks=30/day'],
        ['average', 'gsc:clicks', 25, 'Avg gsc:clicks=25'],
        ['reference', 'gsc:ctr', 0.03, 'Reference gsc:ctr=0.03'],
    ]);
    const skipped = resolveRefLines([
        { kind: 'goal' },
        { kind: 'goal', value: Number.NaN },
        { kind: 'reference', value: 5, metric: 'ga4:sessions' },
    ], { rows, metrics: ['gsc:clicks'], granularity: 'day', range: { start: '2026-10-01', end: '2026-10-04' }, fmt });
    assert.equal(skipped.length, 0);
    const bd = resolveRefLines([{ kind: 'average' }, { kind: 'goal', value: 9 }], {
        rows: [{ 'b:x': 1, 'b:y': 2 }], metrics: ['gsc:clicks'], breakdown: { metric: 'gsc:clicks', keys: ['b:x', 'b:y'], stacked: false },
        granularity: 'day', range: { start: '2026-10-01', end: '2026-10-01' }, fmt,
    });
    assert.deepEqual(bd.map((l) => l.kind), ['goal'], 'no average of unstacked breakdown lines');
    assert.equal(resolveRefLines(undefined, { rows, metrics: ['gsc:clicks'], granularity: 'day', range: { start: '2026-10-01', end: '2026-10-04' }, fmt }).length, 0);
});

test('widgetRange: the widget override wins over the dashboard range', () => {
    const resolved = { range: { start: '2026-09-30', end: '2026-10-27' }, today: '2026-10-28' };
    assert.deepEqual(widgetRange({}, resolved), resolved.range);
    assert.deepEqual(widgetRange({ dateOverride: { range: { kind: 'custom', start: '2026-01-01', end: '2026-01-31' } } }, resolved), { start: '2026-01-01', end: '2026-01-31' });
});

test('notes scope: GA4 property, else Search Console; portfolio keeps global notes and its sites', () => {
    assert.equal(noteScopeOf({ ga4: 'properties/1', gsc: 'sc-domain:a.com' }), 'properties/1');
    assert.equal(noteScopeOf({ gsc: 'sc-domain:a.com' }), 'sc-domain:a.com');
    assert.equal(noteScopeOf(null), null);
    const notes = [{ property_id: null }, { property_id: 'properties/1' }, { property_id: 'properties/2' }];
    assert.equal(notesForScopes(notes, ['properties/1']).length, 2);
    assert.equal(notesForScopes(notes, []).length, 1);
    assert.equal(notesForScopes(notes, 'all').length, 3);

    const sites = [
        { siteId: 'a.com', label: 'a.com', ga4: 'properties/1', gsc: 'sc-domain:a.com' },
        { siteId: 'b.com', label: 'b.com', gsc: 'https://b.com/' },
    ];
    const dir: SiteDirectory = { sites, byId: new Map(sites.map((s) => [s.siteId, s])), ga4Set: new Set(['properties/1']), gscSet: new Set(['sc-domain:a.com', 'https://b.com/']), errors: {} as SiteDirectory['errors'] };
    assert.deepEqual(noteScopesFor({ type: 'site', siteId: 'a.com' }, dir), { scope: 'properties/1', scopes: ['properties/1'] });
    assert.deepEqual(noteScopesFor({ type: 'site', siteId: 'b.com' }, dir), { scope: 'https://b.com/', scopes: ['https://b.com/'] });
    assert.deepEqual(noteScopesFor({ type: 'portfolio', include: 'all' }, dir), { scope: null, scopes: ['properties/1', 'https://b.com/'] });
    assert.deepEqual(noteScopesFor({ type: 'site', siteId: 'gone.com' }, dir), { scope: null, scopes: [] });
    assert.deepEqual(noteScopesFor({ type: 'site', siteId: 'x', ga4: '123' }, null), { scope: 'properties/123', scopes: ['properties/123'] });
});

test('share links get the day and the text of a note only', () => {
    const pub = toPublicNotes([
        { id: 4, date: '2026-10-02T00:00:00', title: ' Launch ', description: 'secret detail', property_id: 'properties/1' } as never,
        { date: 'bad', title: 'x' },
        { date: '2026-10-03', title: '' },
    ]);
    assert.deepEqual(pub, [{ date: '2026-10-02', title: 'Launch' }]);
    assert.equal(JSON.stringify(pub).includes('properties'), false);
});

function docWithLines(): DashboardDocV2 {
    const make = (id: string) => buildFromTemplate(id, { name: 'T', defaultSource: { type: 'site', siteId: 'acme.com' } });
    const t = TEMPLATES.find((x) => Object.values(make(x.id).widgets).some((w) => w.type === 'timeseries'))!;
    const doc = make(t.id);
    const ts = Object.values(doc.widgets).find((w): w is TimeSeriesWidget => w.type === 'timeseries')!;
    ts.config.annotations = 'notes';
    ts.config.refLines = [{ kind: 'goal', value: 5000, per: 'month', label: 'Goal', metric: ts.config.series[0].metric.id }, { kind: 'average' }];
    doc.settings.shareNotes = true;
    return doc;
}

test('schema: lines, marker mode and the share setting are kept; bad lines are refused; old docs stay valid', () => {
    const doc = docWithLines();
    const r = validateDoc(JSON.parse(JSON.stringify(doc)));
    assert.ok(r.ok, r.ok ? '' : r.error);
    if (r.ok) {
        const ts = Object.values(r.value.widgets).find((w): w is TimeSeriesWidget => w.type === 'timeseries')!;
        assert.equal(ts.config.annotations, 'notes');
        assert.equal(ts.config.refLines?.length, 2);
        assert.equal(r.value.settings.shareNotes, true);
    }
    const bad = docWithLines();
    const ts = Object.values(bad.widgets).find((w): w is TimeSeriesWidget => w.type === 'timeseries')!;
    ts.config.refLines = [{ kind: 'goal' }, { kind: 'goal' }, { kind: 'goal' }, { kind: 'goal' }];
    assert.equal(validateDoc(bad).ok, false, 'four lines');
    ts.config.refLines = [{ kind: 'target' as never, value: 1 }];
    assert.equal(validateDoc(bad).ok, false, 'unknown kind');
    ts.config.refLines = [{ kind: 'goal', label: 'x'.repeat(41) }];
    assert.equal(validateDoc(bad).ok, false, 'long label');
    for (const t of TEMPLATES) assert.ok(validateDoc(buildFromTemplate(t.id, { name: t.name, defaultSource: t.portfolio ? { type: 'portfolio', include: 'all' } : { type: 'site', siteId: 'acme.com' } })).ok, t.id);
});

test('public doc: shareNotes only travels when on', () => {
    const doc = docWithLines();
    assert.equal(publicDoc(doc, () => 'acme.com').settings.shareNotes, true);
    doc.settings.shareNotes = false;
    assert.equal('shareNotes' in publicDoc(doc, () => 'acme.com').settings, false);
});
