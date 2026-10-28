/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Google response fixtures */
/**
 * Round 9 polish: a comparison window that starts before Google has data is "no data", not zero: the previous
 * line breaks (null) and the widget says so. Google is answered by the demo generator with the oldest days cut off.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/compareGaps-r9.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { defaultWidget } from '@/lib/builder/registry';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import { flagNotes } from '@/components/dashboard-builder/widgets/WidgetFrame';
import type { CompareSpec, WidgetDef } from '@/lib/builder/types';

const demoFetch = createDemoGoogleFetch();
let firstDay = '00000000';
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await demoFetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!/analyticsdata/.test(url)) return res;
    const body: any = await res.clone().json();
    for (const r of body.reports ?? [body]) if (Array.isArray(r.rows)) r.rows = r.rows.filter((row: any) => String(row.dimensionValues?.[0]?.value ?? '99999999') >= firstDay || !/^\d{8}$/.test(String(row.dimensionValues?.[0]?.value)));
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const NOW = new Date('2026-10-26T12:00:00Z');
const run = async (compare: CompareSpec) => {
    clearBuilderCache();
    const w = defaultWidget('timeseries', { families: { ga4: true, gsc: true } }, 'w1') as WidgetDef;
    const res = await evaluateWidgets({ widgets: [{ widget: w }], defaultSource: { type: 'site', siteId: 'acmeanalytics.example' }, controlDefs: [], controls: { date: { range: { kind: 'preset', id: '28d' }, compare }, filters: {} } }, { userId: 'u1', getToken: async () => demoAccessToken(), mode: 'owner', now: NOW });
    const r: any = res.results.w1;
    assert.equal(r.status, 'ok');
    return { r, w, rows: r.parts.series.rows as Array<Record<string, any>> };
};

test('comparison days before Google has data are null (a gap), later days stay numbers, the widget says so', async () => {
    firstDay = '20251005';
    const { r, w, rows } = await run({ mode: 'previous_year' });
    const key = Object.keys(rows[0]).find((k) => k.endsWith(':prev') && k.startsWith('m:'))!;
    const gap = rows.filter((x) => x['d:date:prev'] < '2025-10-05');
    assert.ok(gap.length >= 5, 'the first days of last year have no data');
    assert.ok(gap.every((x) => x[key] === null), 'no data is null, not 0');
    assert.ok(rows.filter((x) => x['d:date:prev'] >= '2025-10-05').every((x) => typeof x[key] === 'number'));
    assert.equal(r.flags.compareFrom, '2025-10-05');
    assert.ok(flagNotes(r, w).includes('No comparison data before Oct 5, 2025'));
    // the current line is untouched
    assert.ok(rows.every((x) => typeof x['m:ga4:activeUsers'] === 'number'));
});

test('no data in the whole comparison window: every previous value is null and the note says so', async () => {
    firstDay = '20261001';
    const { r, w, rows } = await run({ mode: 'previous_period' });
    const key = Object.keys(rows[0]).find((k) => k.endsWith(':prev') && k.startsWith('m:'))!;
    assert.ok(rows.every((x) => x[key] === null));
    assert.equal(r.flags.compareNone, true);
    assert.ok(flagNotes(r, w).includes('No data in the comparison period'));
});

test('with data for the whole comparison window nothing changes', async () => {
    firstDay = '00000000';
    const { r, rows } = await run({ mode: 'previous_year' });
    const key = Object.keys(rows[0]).find((k) => k.endsWith(':prev') && k.startsWith('m:'))!;
    assert.ok(rows.every((x) => typeof x[key] === 'number'));
    assert.equal(r.flags.compareFrom, undefined);
    assert.equal(r.flags.compareNone, undefined);
});
