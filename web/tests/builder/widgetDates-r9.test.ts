/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Google request fixtures */
/**
 * Round 9: per-widget dates: own range, time shift, own comparison, precedence, and what the engine asks Google for.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/widgetDates-r9.test.ts
 * Google is answered by the demo generator (lib/demo fetch shim); nothing touches the network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { resolveCompare, resolveRange } from '@/lib/builder/dates';
import { chipText, chipTitle, cleanOverride, hasOwnDates, overrideLabel, resolveWidgetDates, shiftRange } from '@/lib/builder/widgetDates';
import { widgetRange } from '@/lib/builder/chartMarks';
import { defaultWidget } from '@/lib/builder/registry';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import type { CompareSpec, ControlState, WidgetDef } from '@/lib/builder/types';

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

// ── per-widget dates ─────────────────────────────────────────────────────

const base = (spec: CompareSpec = { mode: 'previous_period' }) => {
    const range = resolveRange({ kind: 'preset', id: '28d' }, TODAY);
    return { range, compare: resolveCompare(range, spec, TODAY), compareSpec: spec, today: TODAY };
};

test('widget dates: no override follows the dashboard; an empty one too', () => {
    const b = base();
    for (const o of [undefined, {}]) {
        const d = resolveWidgetDates(o, b);
        assert.equal(d.own, false);
        assert.deepEqual(d.range, b.range);
        assert.deepEqual(d.compare, b.compare);
    }
    assert.equal(hasOwnDates({}), false);
    assert.equal(hasOwnDates({ shift: { unit: 'year', amount: 1 } }), true);
});

test('widget dates: precedence is own range, then time shift, then the dashboard', () => {
    const b = base();
    const own = resolveWidgetDates({ range: { kind: 'preset', id: '7d' } }, b);
    assert.deepEqual(own.range, { start: '2026-10-19', end: '2026-10-25' });
    assert.equal(own.own, true);
    // Its comparison is the dashboard's rule applied to its own days.
    assert.deepEqual(own.compare, { start: '2026-10-12', end: '2026-10-18' });

    const shifted = resolveWidgetDates({ shift: { unit: 'year', amount: 1 } }, b);
    assert.deepEqual(shifted.range, { start: '2025-09-28', end: '2025-10-25' });
    assert.deepEqual(shifted.compare, { start: '2025-08-31', end: '2025-09-27' });

    // Both set (the editor never does that): the range wins.
    const both = resolveWidgetDates({ range: { kind: 'preset', id: '7d' }, shift: { unit: 'year', amount: 1 } }, b);
    assert.deepEqual(both.range, own.range);

    // Own comparison beats the dashboard's, with or without own dates.
    const ownCmp = resolveWidgetDates({ compare: { mode: 'previous_year' } }, b);
    assert.deepEqual(ownCmp.range, b.range);
    assert.deepEqual(ownCmp.compare, { start: '2025-09-28', end: '2025-10-25' });
    const none = resolveWidgetDates({ range: { kind: 'preset', id: '28d' }, compare: { mode: 'none' } }, b);
    assert.equal(none.compare, undefined);
    assert.equal(none.compareSpec.mode, 'none');

    // The dashboard shows no comparison: a widget with own dates and no own comparison shows none either.
    const off = base({ mode: 'none' });
    assert.equal(resolveWidgetDates({ range: { kind: 'preset', id: '7d' } }, off).compare, undefined);
    assert.ok(resolveWidgetDates({ range: { kind: 'preset', id: '7d' }, compare: { mode: 'previous_period' } }, off).compare);

    // A custom dashboard comparison is a fixed set of days: the widget keeps it.
    const fixed = base({ mode: 'custom', start: '2026-08-01', end: '2026-08-31' });
    assert.deepEqual(resolveWidgetDates({ shift: { unit: 'week', amount: 2 } }, fixed).compare, { start: '2026-08-01', end: '2026-08-31' });
});

test('widget dates: time shifts (Feb 29, months, weeks, days) and the label', () => {
    assert.deepEqual(shiftRange({ start: '2028-02-29', end: '2028-03-06' }, { unit: 'year', amount: 1 }), { start: '2027-02-28', end: '2027-03-06' });
    assert.deepEqual(shiftRange({ start: '2026-03-31', end: '2026-03-31' }, { unit: 'month', amount: 1 }), { start: '2026-02-28', end: '2026-02-28' });
    assert.deepEqual(shiftRange({ start: '2026-10-19', end: '2026-10-25' }, { unit: 'week', amount: 2 }), { start: '2026-10-05', end: '2026-10-11' });
    assert.deepEqual(shiftRange({ start: '2026-10-19', end: '2026-10-25' }, { unit: 'day', amount: 3 }), { start: '2026-10-16', end: '2026-10-22' });
    assert.deepEqual(shiftRange({ start: '2026-10-19', end: '2026-10-25' }, { unit: 'year', amount: 0 }), { start: '2025-10-19', end: '2025-10-25' }, 'amount is at least 1');
    assert.equal(overrideLabel({ shift: { unit: 'year', amount: 1 } }), 'Previous year');
    assert.equal(overrideLabel({ shift: { unit: 'week', amount: 2 } }), '2 weeks earlier');
    assert.equal(overrideLabel({ shift: { unit: 'month', amount: 1 } }), '1 month earlier');
    assert.equal(overrideLabel({ range: { kind: 'preset', id: 'this_year' } }), 'This year');
    assert.equal(overrideLabel({ range: { kind: 'preset', id: '90d' } }), 'Last 90 days');
});

test('widget dates: cleanOverride keeps one of range / shift and clamps', () => {
    assert.equal(cleanOverride({}), undefined);
    assert.equal(cleanOverride({ shift: { unit: 'year', amount: 0 } }), undefined);
    assert.deepEqual(cleanOverride({ range: { kind: 'preset', id: '7d' }, shift: { unit: 'year', amount: 1 } }), { range: { kind: 'preset', id: '7d' } });
    assert.deepEqual(cleanOverride({ shift: { unit: 'week', amount: 999 }, compare: { mode: 'none' } }), { shift: { unit: 'week', amount: 60 }, compare: { mode: 'none' } });
});

test('widget dates: chart notes read the widget range, shift included', () => {
    const resolved = { range: { start: '2026-09-28', end: '2026-10-25' }, today: TODAY };
    assert.deepEqual(widgetRange({}, resolved), resolved.range);
    assert.deepEqual(widgetRange({ dateOverride: { shift: { unit: 'year', amount: 1 } } }, resolved), { start: '2025-09-28', end: '2025-10-25' });
    assert.deepEqual(widgetRange({ dateOverride: { range: { kind: 'preset', id: '7d' } } }, resolved), { start: '2026-10-19', end: '2026-10-25' });
});

test('widget dates: the engine asks Google for the widget\'s own days and comparison', async () => {
    calls.length = 0;
    clearBuilderCache();
    const ctx = { families: { ga4: true, gsc: true } };
    const plain = defaultWidget('scorecard', ctx, 'w_plain') as Extract<WidgetDef, { type: 'scorecard' }>;
    plain.config.metric = { id: 'ga4:sessions' };
    const own = { ...plain, id: 'w_own', dateOverride: { range: { kind: 'preset', id: '7d' } } } as WidgetDef;
    const yearAgo = { ...plain, id: 'w_year', dateOverride: { shift: { unit: 'year', amount: 1 } } } as WidgetDef;
    const noCmp = { ...plain, id: 'w_nocmp', dateOverride: { compare: { mode: 'none' } } } as WidgetDef;
    const controls: ControlState = { date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'previous_period' } }, filters: {} };
    const res = await evaluateWidgets({ widgets: [plain, own, yearAgo, noCmp].map((widget) => ({ widget })), defaultSource: ACME, controlDefs: [], controls }, deps());
    for (const id of ['w_plain', 'w_own', 'w_year', 'w_nocmp']) assert.equal(res.results[id].status, 'ok', id);
    // The response's dates stay the dashboard's.
    assert.deepEqual(res.resolved.range, { start: '2026-09-28', end: '2026-10-25' });
    const ranges = calls.filter((c) => c.url.includes('analyticsdata')).flatMap((c) => c.body.requests).flatMap((r: any) => r.dateRanges.map((d: any) => `${d.startDate}..${d.endDate}`));
    for (const want of ['2026-09-28..2026-10-25', '2026-08-31..2026-09-27', '2026-10-19..2026-10-25', '2026-10-12..2026-10-18', '2025-09-28..2025-10-25', '2025-08-31..2025-09-27']) {
        assert.ok(ranges.includes(want), `asked for ${want}; got ${[...new Set(ranges)].join(' ')}`);
    }
    const row = (id: string) => (res.results[id] as any).parts.total.rows[0];
    assert.equal(typeof row('w_plain')['m:ga4:sessions:prev'], 'number');
    assert.equal(typeof row('w_own')['m:ga4:sessions:prev'], 'number');
    assert.equal(typeof row('w_year')['m:ga4:sessions:prev'], 'number');
    assert.equal('m:ga4:sessions:prev' in row('w_nocmp'), false, 'own comparison "none" turns it off for this widget');
    assert.notEqual(row('w_own')['m:ga4:sessions'], row('w_plain')['m:ga4:sessions'], 'a 7 day widget differs from the 28 day one');
});


test('widget dates: the chip shows the real days, the title names the rule', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    const week = resolveWidgetDates({ range: { kind: 'preset', id: '7d' } }, base());
    assert.equal(chipText({ range: { kind: 'preset', id: '7d' } }, week, now), 'Oct 19–25');
    assert.equal(chipTitle({ range: { kind: 'preset', id: '7d' } }, week), 'Own dates: Last 7 days (Oct 19 – Oct 25). Compared with Oct 12 – Oct 18 (previous period)');
    // a time shift into last year reads like "Sep 30–Oct 27, 2025"
    const yoy = resolveWidgetDates({ shift: { unit: 'year', amount: 1 } }, base());
    assert.equal(chipText({ shift: { unit: 'year', amount: 1 } }, yoy, now), 'Sep 28–Oct 25, 2025');
    assert.match(chipTitle({ shift: { unit: 'year', amount: 1 } }, yoy), /^Own dates: Previous year \(Sep 28 – Oct 25, 2025\)/);
    // two weeks earlier, inside one month
    const two = resolveWidgetDates({ shift: { unit: 'week', amount: 2 } }, base());
    assert.equal(chipText({ shift: { unit: 'week', amount: 2 } }, two, now), 'Sep 14–Oct 11');
    // only an own comparison: the days are the dashboard's, so the chip says so
    const own = resolveWidgetDates({ compare: { mode: 'previous_year' } }, base());
    assert.equal(chipText({ compare: { mode: 'previous_year' } }, own, now), 'Own comparison');
    assert.equal(chipText({}, own, now), '');
});
