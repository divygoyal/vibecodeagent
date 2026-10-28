/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Google request fixtures */
/**
 * Round 9: comparison modes (previous period, weekday aligned, last year, custom), labels and the share permission.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/compare-r9.test.ts
 * Google is answered by the demo generator (lib/demo fetch shim); nothing touches the network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { compareFromParam, compareToParam, resolveCompare, resolveRange } from '@/lib/builder/dates';
import { COMPARE_OPTIONS, compareOptionId, compareTail, compareText, customCompare, viewerMayCompare } from '@/lib/builder/compare';
import { defaultWidget } from '@/lib/builder/registry';
import { buildFromTemplate } from '@/lib/builder/templates';
import { publicControlsFromQuery } from '@/lib/builder/publicDoc';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import type { CompareSpec, ControlState, DashboardDocV2, DateControl } from '@/lib/builder/types';

const calls: Array<{ url: string; body: any }> = [];
const demoFetch = createDemoGoogleFetch();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (/analyticsdata|searchAnalytics/.test(url)) calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return demoFetch(input, init);
}) as typeof fetch;

const NOW = new Date('2026-10-26T12:00:00Z');
const TODAY = '2026-10-26';
const TOKEN = demoAccessToken();
const deps = () => ({ userId: 'u1', getToken: async () => TOKEN, mode: 'owner' as const, now: NOW });
const ACME = { type: 'site' as const, siteId: 'acmeanalytics.example' };
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const days = (r: { start: string; end: string }) => (Date.parse(r.end) - Date.parse(r.start)) / 86_400_000 + 1;

// ── comparison ranges ────────────────────────────────────────────────────

test('compare: previous period is the same number of days right before', () => {
    const r = resolveRange({ kind: 'preset', id: '28d' }, TODAY);
    assert.deepEqual(r, { start: '2026-09-28', end: '2026-10-25' });
    assert.deepEqual(resolveCompare(r, { mode: 'previous_period' }, TODAY), { start: '2026-08-31', end: '2026-09-27' });
    // A 90-day range is not a whole number of weeks, so the plain previous period starts on another weekday.
    const q = resolveRange({ kind: 'preset', id: '3m' }, TODAY);
    const plain = resolveCompare(q, { mode: 'previous_period' }, TODAY)!;
    assert.equal(days(plain), 90);
    assert.notEqual(dow(plain.start), dow(q.start));
});

test('compare: weekday aligned previous period shifts by whole weeks', () => {
    const spec: CompareSpec = { mode: 'previous_period', align: 'weekday' };
    // 28 days are four whole weeks: same as the plain previous period.
    const r28 = resolveRange({ kind: 'preset', id: '28d' }, TODAY);
    assert.deepEqual(resolveCompare(r28, spec, TODAY), resolveCompare(r28, { mode: 'previous_period' }, TODAY));
    // 90 days: shifted back 91 days (13 weeks), same length, same first weekday, a 1-day gap.
    const r90 = resolveRange({ kind: 'preset', id: '3m' }, TODAY);
    const c90 = resolveCompare(r90, spec, TODAY)!;
    assert.equal(days(c90), 90);
    assert.equal(dow(c90.start), dow(r90.start));
    assert.equal(dow(c90.end), dow(r90.end));
    assert.equal((Date.parse(r90.start) - Date.parse(c90.start)) / 86_400_000, 91);
    // 30 days -> 35; the comparison never overlaps the range.
    const r30 = { start: '2026-09-26', end: '2026-10-25' };
    const c30 = resolveCompare(r30, spec, TODAY)!;
    assert.deepEqual(c30, { start: '2026-08-22', end: '2026-09-20' });
    assert.ok(c30.end < r30.start);
    // A single day compares with the same weekday a week earlier.
    assert.deepEqual(resolveCompare({ start: '2026-10-25', end: '2026-10-25' }, spec, TODAY), { start: '2026-10-18', end: '2026-10-18' });
});

test('compare: same period last year handles Feb 29 and the weekday variant', () => {
    // Feb 29 has no twin: it clamps to Feb 28 (the label shows the exact days).
    assert.deepEqual(resolveCompare({ start: '2028-02-29', end: '2028-03-06' }, { mode: 'previous_year' }, '2028-04-01'), { start: '2027-02-28', end: '2027-03-06' });
    assert.deepEqual(resolveCompare({ start: '2028-02-01', end: '2028-02-29' }, { mode: 'previous_year' }, '2028-04-01'), { start: '2027-02-01', end: '2027-02-28' });
    // The other way round: a range after a leap day keeps its calendar days.
    assert.deepEqual(resolveCompare({ start: '2029-02-01', end: '2029-02-28' }, { mode: 'previous_year' }, '2029-04-01'), { start: '2028-02-01', end: '2028-02-28' });
    assert.deepEqual(resolveCompare({ start: '2028-03-01', end: '2028-03-31' }, { mode: 'previous_year' }, '2028-04-01'), { start: '2027-03-01', end: '2027-03-31' });
    // Weekday aligned: 52 weeks back, every weekday faces the same weekday, length unchanged.
    const r = resolveRange({ kind: 'preset', id: '28d' }, TODAY);
    const c = resolveCompare(r, { mode: 'previous_year', align: 'weekday' }, TODAY)!;
    assert.deepEqual(c, { start: '2025-09-29', end: '2025-10-26' });
    assert.equal(dow(c.start), dow(r.start));
    assert.equal(days(c), days(r));
});

test('compare: custom ranges keep complete days (never today, never beyond history)', () => {
    assert.deepEqual(resolveCompare({ start: '2026-09-28', end: '2026-10-25' }, { mode: 'custom', start: '2026-08-01', end: '2026-08-31' }, TODAY), { start: '2026-08-01', end: '2026-08-31' });
    // Reversed days are put in order.
    assert.deepEqual(resolveCompare({ start: '2026-09-28', end: '2026-10-25' }, { mode: 'custom', start: '2026-08-31', end: '2026-08-01' }, TODAY), { start: '2026-08-01', end: '2026-08-31' });
    // Today is a partial day: the comparison stops at yesterday.
    assert.deepEqual(resolveCompare({ start: '2026-10-19', end: '2026-10-25' }, { mode: 'custom', start: '2026-10-01', end: TODAY }, TODAY), { start: '2026-10-01', end: '2026-10-25' });
    // A window that only lies in the future compares with nothing.
    assert.equal(resolveCompare({ start: '2026-10-19', end: '2026-10-25' }, { mode: 'custom', start: TODAY, end: '2026-11-30' }, TODAY), undefined);
    // Older than Google's 16 months of history: clamped.
    assert.equal(resolveCompare({ start: '2026-10-19', end: '2026-10-25' }, { mode: 'custom', start: '2020-01-01', end: '2020-02-01' }, TODAY), undefined);
    assert.deepEqual(resolveCompare({ start: '2026-10-19', end: '2026-10-25' }, { mode: 'custom', start: '2020-01-01', end: '2026-01-31' }, TODAY), { start: '2025-06-27', end: '2026-01-31' });
    assert.equal(resolveCompare({ start: '2026-10-19', end: '2026-10-25' }, { mode: 'none' }, TODAY), undefined);
    assert.equal(resolveCompare({ start: '2026-10-19', end: '2026-10-25' }, { mode: 'custom', start: 'nope', end: '2026-01-31' }, TODAY), undefined);
});

test('compare: every comparison is made of complete days when the range is (the complete-days rule)', () => {
    const yesterday = '2026-10-25';
    for (const id of ['7d', '28d', '3m', '12m', 'last_month', 'last_quarter'] as const) {
        const r = resolveRange({ kind: 'preset', id }, TODAY);
        for (const spec of [{ mode: 'previous_period' }, { mode: 'previous_period', align: 'weekday' }, { mode: 'previous_year' }, { mode: 'previous_year', align: 'weekday' }] as CompareSpec[]) {
            const c = resolveCompare(r, spec, TODAY)!;
            assert.ok(c.end <= yesterday, `${id} ${JSON.stringify(spec)} ends ${c.end}`);
            assert.ok(c.start <= c.end);
        }
    }
    // The first of the month: "this month" is today so far (explicitly partial); its comparison is still complete days.
    const first = resolveRange({ kind: 'preset', id: 'this_month' }, '2026-11-01');
    assert.deepEqual(first, { start: '2026-11-01', end: '2026-11-01' });
    assert.deepEqual(resolveCompare(first, { mode: 'previous_period' }, '2026-11-01'), { start: '2026-10-31', end: '2026-10-31' });
});

test('compare: URL values round-trip, bad values are ignored', () => {
    const specs: CompareSpec[] = [
        { mode: 'previous_period' }, { mode: 'previous_period', align: 'weekday' }, { mode: 'previous_year' }, { mode: 'previous_year', align: 'weekday' },
        { mode: 'none' }, { mode: 'custom', start: '2026-08-01', end: '2026-08-31' },
    ];
    for (const s of specs) {
        const p = compareToParam(s);
        const back = compareFromParam(p);
        assert.ok(back, p);
        assert.equal(compareToParam(back!), p);
        assert.equal(compareOptionId(s), compareOptionId(back!));
    }
    assert.deepEqual(['prev', 'prevw', 'yoy', 'yoyw', 'none'].map((v) => compareToParam(compareFromParam(v)!)), ['prev', 'prevw', 'yoy', 'yoyw', 'none']);
    assert.deepEqual(compareFromParam('2026-08-31_2026-08-01'), { mode: 'custom', start: '2026-08-01', end: '2026-08-31' });
    for (const bad of ['', null, undefined, 'last-year', '2026-02-30_2026-03-01', '2026-08-01', 'prev;drop', 'PREV']) assert.equal(compareFromParam(bad as string | null | undefined), null, String(bad));
    assert.deepEqual(customCompare('2026-08-31', '2026-08-01'), { mode: 'custom', start: '2026-08-01', end: '2026-08-31' });
    assert.equal(customCompare('', '2026-08-01'), null);
    assert.equal(COMPARE_OPTIONS.filter((o) => !o.spec).length, 1, 'only the custom row has no ready-made spec');
});

test('compare: labels name the days or the year', () => {
    const range = { start: '2026-08-31', end: '2026-09-27' };
    const prev = compareText({ mode: 'previous_period' }, range);
    assert.equal(prev.short, 'vs Aug 31 – Sep 27');
    assert.equal(compareTail(prev), '(Aug 31 – Sep 27)');
    assert.equal(prev.legend, 'Previous period');
    assert.match(prev.title, /Compared with Aug 31 – Sep 27 \(previous period\)/);
    const yoy = compareText({ mode: 'previous_year' }, { start: '2025-09-29', end: '2025-10-26' });
    assert.equal(yoy.short, 'vs last year');
    assert.equal(compareTail(yoy), 'last year');
    assert.equal(yoy.legend, 'Last year');
    assert.match(yoy.title, /Sep 29/);
    assert.match(compareText({ mode: 'previous_period', align: 'weekday' }, range).title, /same weekdays/);
    assert.equal(compareText({ mode: 'previous_period' }).short, 'vs previous period', 'no days known: the mode');
    assert.equal(compareText({ mode: 'none' }).short, '');
    assert.equal(compareText({ mode: 'custom', start: '2026-08-01', end: '2026-08-31' }, { start: '2026-08-01', end: '2026-08-31' }).short, 'vs Aug 1 – Aug 31');
});


test('widget dates: a custom comparison stays on its days for Search Console (only stops at its last complete day)', async () => {
    calls.length = 0;
    clearBuilderCache();
    const w = defaultWidget('scorecard', { families: { ga4: false, gsc: true } }, 'w_gsc');
    const controls: ControlState = { date: { range: { kind: 'preset', id: '7d' }, compare: { mode: 'custom', start: '2026-08-01', end: '2026-08-31' } }, filters: {} };
    const res = await evaluateWidgets({ widgets: [{ widget: w }], defaultSource: ACME, controlDefs: [], controls }, deps());
    assert.equal(res.results.w_gsc.status, 'ok');
    assert.deepEqual(res.resolved.compare, { start: '2026-08-01', end: '2026-08-31' });
    const bodies = calls.filter((c) => c.url.includes('searchAnalytics')).map((c) => c.body);
    assert.ok(bodies.some((b) => b.startDate === '2026-08-01' && b.endDate === '2026-08-31'), 'the comparison is not shifted with the 2-day Search Console lag');
    assert.ok(bodies.some((b) => b.startDate === '2026-10-18' && b.endDate === '2026-10-24'));
    // A custom comparison that reaches yesterday stops at Search Console's last complete day.
    calls.length = 0;
    clearBuilderCache();
    const late: ControlState = { date: { range: { kind: 'preset', id: '7d' }, compare: { mode: 'custom', start: '2026-10-01', end: TODAY } }, filters: {} };
    const r2 = await evaluateWidgets({ widgets: [{ widget: { ...w, id: 'w_gsc2' } }], defaultSource: ACME, controlDefs: [], controls: late }, deps());
    assert.deepEqual(r2.resolved.compare, { start: '2026-10-01', end: '2026-10-25' }, 'GA4 complete days: through yesterday');
    assert.ok(calls.filter((c) => c.url.includes('searchAnalytics')).some((c) => c.body.startDate === '2026-10-01' && c.body.endDate === '2026-10-24'));
});


const doc = (): DashboardDocV2 => buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: 'acmeanalytics.example', ga4: 'properties/412300101', gsc: 'sc-domain:acmeanalytics.example' } });

const dateCtl = (d: DashboardDocV2): DateControl => d.controls.find((c): c is DateControl => c.type === 'date')!;
const withDate = (d: DashboardDocV2, patch: Partial<DateControl>): DashboardDocV2 => ({ ...d, controls: d.controls.map((c) => (c.type === 'date' ? { ...c, ...patch } : c)) });


test('public link: viewers change the comparison only when the share lets them change dates too', () => {
    const d = doc();
    const q = new URLSearchParams('range=7d&compare=2026-08-01_2026-08-31');
    const allowed = publicControlsFromQuery(q, d, { viewerControls: { date: true, compare: true, filters: false } });
    assert.deepEqual(allowed.date.range, { kind: 'preset', id: '7d' });
    assert.deepEqual(allowed.date.compare, { mode: 'custom', start: '2026-08-01', end: '2026-08-31' });
    // Weekday aligned variants come through the same gate.
    assert.deepEqual(publicControlsFromQuery(new URLSearchParams('compare=prevw'), d, { viewerControls: { date: true, compare: true, filters: false } }).date.compare, { mode: 'previous_period', align: 'weekday' });
    const locked = (vc: { date: boolean; compare: boolean }, dd = d) => publicControlsFromQuery(q, dd, { viewerControls: { ...vc, filters: false } });
    const def = dateCtl(d).defaultCompare;
    assert.deepEqual(locked({ date: true, compare: false }).date.compare, def, 'comparison switched off in the share');
    assert.deepEqual(locked({ date: false, compare: true }).date.compare, def, 'comparison needs date changes');
    assert.deepEqual(locked({ date: false, compare: true }).date.range, dateCtl(d).default, 'and dates stay locked too');
    assert.deepEqual(locked({ date: true, compare: true }, withDate(d, { viewerCanCompare: false })).date.compare, def, 'the dashboard locks comparison');
    assert.deepEqual(locked({ date: true, compare: true }, withDate(d, { viewerCanChange: false })).date.compare, def, 'the dashboard locks dates');
    assert.equal(viewerMayCompare({ date: true, compare: true }, { viewerCanChange: true, viewerCanCompare: true }), true);
    assert.equal(viewerMayCompare({ date: false, compare: true }, { viewerCanChange: true, viewerCanCompare: true }), false);
    assert.equal(viewerMayCompare({ date: true, compare: true }, { viewerCanChange: true, viewerCanCompare: false }), false);
    // Garbage compare values are ignored, not trusted.
    assert.deepEqual(publicControlsFromQuery(new URLSearchParams('compare=custom&cfrom=x'), d, { viewerControls: { date: true, compare: true, filters: false } }).date.compare, def);
});

