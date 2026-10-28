/**
 * Round 6 home page: the live product-tour rows' data (components/marketing/home/homeLive.ts), built by the app's
 * own report code and dashboard engine over the demo generator. Deterministic per day, the same numbers as the hero,
 * links into the live demo, small props, and no network (fetch is made to throw).
 *
 * Run: cd web && npx --offline tsx --test tests/builder/homeLive.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHomeLive } from '@/components/marketing/home/homeLive';
import { buildHomeData } from '@/components/marketing/home/homeData';

const NOW = Date.UTC(2026, 9, 28, 12);
globalThis.fetch = (async () => { throw new Error('network must not be used'); }) as typeof fetch;

test('every row builds from the app code on sample data, without the network', async () => {
    const home = buildHomeData(NOW);
    const live = await buildHomeLive(home.tour.slug, NOW);
    assert.ok(live.site && live.traffic && live.fixes && live.dashboards, 'all four rows');

    // Site row: the site page's own 28-day window (GA4 up to today, so a little off the hero card's complete days),
    // with a finding per tile.
    const card = home.byRange['28d'].sites.find((s) => s.slug === home.tour.slug)!;
    const near = (a: number, b: number) => Math.abs(a - b) / b < 0.05;
    assert.ok(near(live.site.traffic.totals.sessions, card.traffic!.cur.sessions));
    assert.ok(near(live.site.search.totals.clicks, card.search!.cur.clicks));
    assert.ok(live.site.traffic.series.length >= 28 && live.site.traffic.series[0].prev_users !== undefined);
    for (const m of ['users', 'sessions', 'pageviews', 'conversions'] as const) assert.ok(live.site.trafficFindings[m]?.text, m);
    for (const m of ['clicks', 'impressions', 'ctr', 'position'] as const) assert.ok(live.site.searchFindings[m]?.text, m);
    assert.equal(live.site.meta.links.traffic, home.tour.traffic, 'Open Traffic = the row CTA');
    assert.match(live.site.meta.links.search, /^\/demo\?to=\/dashboard\/s\/.+\/search$/);

    // Traffic row: AI traffic with its finding and the demo's notes on the chart.
    assert.ok(live.traffic.traffic.totals.ai > 0);
    assert.match(live.traffic.findings.ai?.text ?? '', /AI traffic/);
    assert.equal(live.traffic.markers.filter((m) => m.kind === 'note').length, 3);

    // Fixes row: the Actions page order, every task with a why, a fix and an Ask prompt.
    assert.ok(live.fixes.total >= live.fixes.actions.length && live.fixes.actions.length >= 5);
    const rank = { high: 3, medium: 2, low: 1 };
    for (let i = 1; i < live.fixes.actions.length; i++) assert.ok(rank[live.fixes.actions[i - 1].impact] >= rank[live.fixes.actions[i].impact]);
    for (const a of live.fixes.actions) assert.ok(a.summary && a.fix.length && a.askPrompt);
    assert.equal(live.fixes.links.actions, home.tour.fixes);
    // The same list as the app's Actions page and Overview (useSiteActions includeAudit): the 2 homepage-audit tasks
    // are counted, so on this day the row says "of 18" like the live demo.
    assert.equal(live.fixes.total, 18);

    // Dashboard row: three quick ranges, every widget answered, ranges really differ.
    const dash = live.dashboards;
    for (const r of ['7d', '28d', '3m'] as const) {
        const results = dash.byRange[r].results;
        for (const w of dash.widgets) assert.equal(results[w.id]?.status, 'ok', `${r} ${w.id}`);
    }
    const days = (r: '7d' | '28d' | '3m') => {
        const res = dash.byRange[r].results.w_search;
        return res.status === 'ok' ? res.parts.series.rows.length : 0;
    };
    assert.ok(days('7d') === 7 && days('28d') === 28 && days('3m') > 80);

    // Deterministic for the same day.
    assert.deepEqual(JSON.parse(JSON.stringify((await buildHomeLive(home.tour.slug, NOW)).fixes)), JSON.parse(JSON.stringify(live.fixes)));
});

test('props stay small (they ride in the page HTML)', async () => {
    const home = buildHomeData(NOW);
    const live = await buildHomeLive(home.tour.slug, NOW);
    const kb = (o: unknown) => JSON.stringify(o).length / 1024;
    assert.ok(kb(live.site) < 24, `site ${kb(live.site)}`);
    assert.ok(kb(live.fixes) < 10, `fixes ${kb(live.fixes)}`);
    assert.ok(kb(live.dashboards) < 50, `dashboards ${kb(live.dashboards)}`);
    assert.ok(kb(live) < 90, `all ${kb(live)}`);
});
