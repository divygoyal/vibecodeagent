/**
 * Link-preview cards of shared dashboards and site shares, server side: the cache, the 2.5 s budget, the failure and
 * password cases, and which site shares get numbers.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/shareCardServer.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cachedCardNumbers, shareCardData } from '@/lib/builder/server/shareCard';
import { buildFromTemplate } from '@/lib/builder/templates';
import { shareShowsMetrics, shareSiteRangeLabel } from '@/lib/shareSiteCard';

const NUMBERS = { range: 'Last 28 days', kpis: [{ label: 'Users', value: '1K' }] };

test('cache: a slow load gives the title card now and the numbers on the next request; a failure is not retried for a minute', async () => {
    let calls = 0;
    const slow = () => { calls++; return new Promise<typeof NUMBERS>((r) => setTimeout(() => r(NUMBERS), 120)); };
    assert.equal(await cachedCardNumbers('t:slow', slow, 20), null, 'over budget: no numbers');
    assert.equal(await cachedCardNumbers('t:slow', slow, 20), null, 'still in flight: shares the same load');
    assert.equal(calls, 1);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(await cachedCardNumbers('t:slow', slow, 20), NUMBERS, 'the finished load was kept');
    assert.equal(calls, 1);

    let fails = 0;
    const bad = (): Promise<never> => { fails++; return Promise.reject(new Error('Google is down')); };
    const log = console.error; console.error = () => undefined;
    try {
        assert.equal(await cachedCardNumbers('t:bad', bad, 50), null);
        assert.equal(await cachedCardNumbers('t:bad', bad, 50), null);
    } finally { console.error = log; }
    assert.equal(fails, 1, 'the failure was kept');
});

test('a password-protected dashboard never reaches Google for the card', async () => {
    const d = buildFromTemplate('site-overview', { name: 'Acme', defaultSource: { type: 'site', siteId: 'acme.test' } });
    const rec: unknown = { id: 'dash1', rev: 1, doc: d, share: { hasPassword: true, viewerControls: { date: true, compare: true, filters: true } } };
    assert.equal(await shareCardData({ ownerIdentifier: 'u1' } as never, rec as never, 50), null);
});

test('site shares: numbers for a Google Analytics share (classic or overview layout) that shows its metrics', async () => {
    const base = { propertyId: 'properties/1', config: { layoutMode: 'legacy', shareProvider: 'legacy', traffic: true, sectionVisibility: { metrics: true } } } as never as Parameters<typeof shareShowsMetrics>[0];
    const cfg = (o: object) => ({ ...base, config: { ...base.config, ...o } });
    assert.equal(shareShowsMetrics(base), true);
    assert.equal(shareShowsMetrics(cfg({ traffic: false })), false);
    assert.equal(shareShowsMetrics(cfg({ sectionVisibility: { metrics: false } })), false);
    assert.equal(shareShowsMetrics(cfg({ layoutMode: 'openpanel_overview', shareProvider: 'openpanel_overview' })), true, 'the default overview layout leads with the same three figures');
    assert.equal(shareShowsMetrics(cfg({ layoutMode: 'umami_fork', shareProvider: 'umami_fork' })), false);
    assert.equal(shareShowsMetrics({ ...base, propertyId: '' }), false);
    assert.equal(shareSiteRangeLabel('28d', '2026-09-30', '2026-10-27'), 'Last 28 days · Sep 30 – Oct 27');
    assert.equal(shareSiteRangeLabel('today', 'today', 'today'), 'Today');
});

