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
/** Every call that reached the global fetch during the builds: must stay empty (a row that failed and fell back to its
 * picture must not hide a real network call either). */
const calls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input instanceof Request ? input.url : input));
    throw new Error('network must not be used');
}) as typeof fetch;

test('every row builds from the app code on sample data, without the network', async () => {
    const home = buildHomeData(NOW);
    const live = await buildHomeLive(home.tour.slug, NOW);
    assert.ok(live.site && live.traffic && live.fixes && live.dashboards, 'all four rows');

    // Site row: the site page's own 28-day window, which is the hero card's and the dashboard's (round 7, one window
    // rule in lib/dateRange: GA4 through yesterday, Search Console through 2 days ago), so the numbers are the same.
    const card = home.byRange['28d'].sites.find((s) => s.slug === home.tour.slug)!;
    const windows = home.byRange['28d'].windows;
    assert.deepEqual(live.site.meta.window, {
        start: windows.traffic!.curStart, end: windows.traffic!.curEnd, searchStart: windows.search!.curStart, searchEnd: windows.search!.curEnd,
    });
    assert.deepEqual(live.site.meta.window, { start: '2026-09-30', end: '2026-10-27', searchStart: '2026-09-29', searchEnd: '2026-10-26' });
    assert.equal(live.site.traffic.totals.sessions, card.traffic!.cur.sessions);
    assert.equal(live.site.traffic.previous!.sessions, card.traffic!.prev!.sessions);
    assert.equal(live.site.traffic.totals.users, card.traffic!.cur.users);
    assert.equal(live.site.search.totals.clicks, card.search!.cur.clicks);
    assert.equal(live.site.search.previous!.clicks, card.search!.prev!.clicks);
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
    // The dashboard's 28 days are the site page's: same GA4 days, Search Console on its own days, same totals.
    const d28 = dash.byRange['28d'];
    assert.deepEqual(d28.resolved.range, { start: '2026-09-30', end: '2026-10-27' });
    assert.deepEqual(d28.resolved.search, { start: '2026-09-29', end: '2026-10-26' });
    const kpi = d28.results.w_kpis;
    assert.equal(kpi.status, 'ok');
    if (kpi.status === 'ok') {
        const row = kpi.parts.total.rows[0];
        assert.equal(row['m:ga4:sessions'], live.site.traffic.totals.sessions);
        assert.equal(row['m:ga4:activeUsers'], live.site.traffic.totals.users);
        // Search Console: the same days; the one-report total may differ from the sum of days by a click (rounding).
        assert.ok(Math.abs(Number(row['m:gsc:clicks']) - live.site.search.totals.clicks) <= 2);
    }

    assert.deepEqual(calls, [], 'no call left the sample scope');
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
    assert.deepEqual(calls, []);
});

test('the build yields to the event loop (review L1): a 1 ms timer keeps ticking during it', async () => {
    let ticks = 0;
    let worst = 0;
    let last = performance.now();
    const timer = setInterval(() => {
        const now = performance.now();
        worst = Math.max(worst, now - last);
        last = now;
        ticks++;
    }, 1);
    const t0 = performance.now();
    // A fresh day (cold caches), so the generator really runs.
    await buildHomeLive('acmeanalytics.example', NOW + 3 * 86_400_000);
    const ms = performance.now() - t0;
    clearInterval(timer);
    console.log(`build ${Math.round(ms)} ms, ${ticks} ticks, longest gap ${Math.round(worst)} ms`);
    // Without the yield the timer is starved for the whole build (one gap = the build); with it, gaps stay short.
    assert.ok(ticks >= 3, `timer ran ${ticks} times`);
    assert.ok(worst < 150, `longest gap ${Math.round(worst)} ms of ${Math.round(ms)} ms`);
});
