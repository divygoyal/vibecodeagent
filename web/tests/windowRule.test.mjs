// Round 7 audit item 2: one site, one "last 28 days", one window everywhere. Every surface resolves its days through
// lib/dateRange (GA4 through yesterday, Search Console through 2 days ago, complete days only); this pins that each
// resolver gives the same dates for a fixed "now": site pages (useDateRange), the site API fallback, the portfolio,
// dashboards (builder engine), the client share page, the leaderboard refresh, the home page and the legacy APIs.
// Run: cd web && node --test tests/windowRule.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const dr = await import('../src/lib/dateRange.ts');
const { windowRequests } = await import('../src/lib/portfolio/ranges.ts');
const { aggregateSnapshot } = await import('../src/lib/portfolio/snapshot.ts');
const builder = await import('../src/lib/builder/dates.ts');
const { parseRange } = await import('../src/app/api/site/_lib/params.ts');
const { resolveRange: legacyRange, resolvePrevRange: legacyPrev } = await import('../src/lib/googleApi.ts');
const { resolveOverviewRange } = await import('../src/lib/shareOverviewData.ts');
const { leaderboardWindows } = await import('../src/lib/leaderboard/refresh.ts');
const mcp = await import('../src/lib/mcp/dates.ts');

/** The audit's moment: Oct 28 2026, 15:00 UTC (today is partial). */
const NOW = new Date('2026-10-28T15:00:00Z');
const TODAY = '2026-10-28';

const EXPECTED = {
    '7d': { ga4: ['2026-10-21', '2026-10-27', '2026-10-14', '2026-10-20'], gsc: ['2026-10-20', '2026-10-26', '2026-10-13', '2026-10-19'] },
    '28d': { ga4: ['2026-09-30', '2026-10-27', '2026-09-02', '2026-09-29'], gsc: ['2026-09-29', '2026-10-26', '2026-09-01', '2026-09-28'] },
    '3m': { ga4: ['2026-07-30', '2026-10-27', '2026-05-01', '2026-07-29'], gsc: ['2026-07-29', '2026-10-26', '2026-04-30', '2026-07-28'] },
};
const tuple = (w) => [w.start, w.end, w.prevStart, w.prevEnd];

test('the rule: complete days, GA4 through yesterday, Search Console through 2 days ago, same-length previous', () => {
    assert.equal(dr.lastCompleteDay('ga4', NOW), '2026-10-27');
    assert.equal(dr.lastCompleteDay('gsc', NOW), '2026-10-26');
    for (const [preset, exp] of Object.entries(EXPECTED)) {
        assert.deepEqual(tuple(dr.resolveWindow({ preset, compare: 'prev' }, 'ga4', { now: NOW })), exp.ga4, `${preset} ga4`);
        assert.deepEqual(tuple(dr.resolveWindow({ preset, compare: 'prev' }, 'gsc', { now: NOW })), exp.gsc, `${preset} gsc`);
    }
    // 28 days are whole weeks: the comparison lines up by weekday.
    const w = dr.resolveWindow({ preset: '28d', compare: 'prev' }, 'ga4', { now: NOW });
    assert.equal(new Date(`${w.start}T00:00:00Z`).getUTCDay(), new Date(`${w.prevStart}T00:00:00Z`).getUTCDay());
    // Today only where it is explicitly partial.
    assert.equal(dr.resolveWindow({ preset: '24h', compare: 'none' }, 'ga4', { now: NOW }).end, TODAY);
    assert.equal(dr.endsToday('2026-10-27', NOW), false);
    assert.equal(dr.partialTailFrom(28, '2026-10-27', NOW), undefined);
    assert.equal(dr.partialTailFrom(2, TODAY, NOW), 1);
    // "This month" on the 1st has no complete day yet: today so far.
    assert.deepEqual(tuple(dr.resolveWindow({ preset: 'this_month', compare: 'none' }, 'ga4', { now: new Date('2026-11-01T09:00:00Z') })).slice(0, 2), ['2026-11-01', '2026-11-01']);
});

test('site pages: the range hook and the API fallback resolve the same days', () => {
    // useDateRange() = resolveWindow(value, 'ga4' | 'gsc'), checked above. The /api/site fallback uses the clock.
    const real = new Date();
    for (const source of ['ga4', 'gsc']) {
        const fallback = parseRange(new URLSearchParams(), source).cur;
        const rule = dr.resolveWindow({ preset: '28d', compare: 'none' }, source, { now: real });
        assert.deepEqual([fallback.start, fallback.end], [rule.start, rule.end], source);
    }
});

test('portfolio: the snapshot windows are the rule\'s, per source', () => {
    for (const [preset, exp] of Object.entries(EXPECTED)) {
        const req = windowRequests(preset, NOW.getTime());
        const asset = (kind, id) => ({ asset_kind: kind, asset_id: id });
        const rows = [];
        for (let i = 0; i < 400; i++) {
            const date = dr.utcToday(new Date(NOW.getTime() - i * 86_400_000));
            if (date <= '2026-10-27') rows.push({ kind: 'ga4', asset_id: 'p1', date, users: 1, sessions: 1 });
            // Search Console's stored data stops 2 days back (final data), like Google's.
            if (date <= '2026-10-26') rows.push({ kind: 'gsc', asset_id: 's1', date, clicks: 1, impressions: 1 });
        }
        const snap = aggregateSnapshot([asset('ga4', 'p1'), asset('gsc', 's1')], rows, { windows: req, bucket_days: 1, recent_days: 7 });
        const w = (k) => [snap.windows[k].cur_start, snap.windows[k].cur_end, snap.windows[k].prev_start, snap.windows[k].prev_end];
        assert.deepEqual(w('ga4'), exp.ga4, `${preset} traffic`);
        assert.deepEqual(w('gsc'), exp.gsc, `${preset} search`);
    }
    // Fresh (preliminary) Search Console days stored up to yesterday do not move the window past the rule.
    const req = windowRequests('28d', NOW.getTime());
    const fresh = aggregateSnapshot([{ asset_kind: 'gsc', asset_id: 's1' }], [{ kind: 'gsc', asset_id: 's1', date: '2026-10-27', clicks: 1 }], { windows: req, bucket_days: 1, recent_days: 7 });
    assert.equal(fresh.windows.gsc.cur_end, '2026-10-26');
});

test('dashboards: builder presets resolve through the rule; Search Console leaves read the Search Console days', () => {
    for (const [preset, exp] of Object.entries(EXPECTED)) {
        const r = builder.resolveRange({ kind: 'preset', id: preset }, TODAY);
        assert.deepEqual([r.start, r.end], exp.ga4.slice(0, 2), `${preset} range`);
        const c = builder.resolveCompare(r, { mode: 'previous_period' });
        assert.deepEqual([c.start, c.end], exp.ga4.slice(2), `${preset} compare`);
        const s = dr.searchWindowOf(r, TODAY);
        assert.deepEqual([s.start, s.end], exp.gsc.slice(0, 2), `${preset} search`);
    }
    for (const preset of ['6m', '12m']) {
        const r = builder.resolveRange({ kind: 'preset', id: preset }, TODAY);
        const w = dr.resolveWindow({ preset, compare: 'none' }, 'ga4', { now: NOW });
        assert.deepEqual([r.start, r.end], [w.start, w.end], preset);
    }
    // A range that ends before Search Console's last complete day is complete for both sources.
    assert.deepEqual(dr.searchWindowOf({ start: '2026-09-01', end: '2026-09-30' }, TODAY), { start: '2026-09-01', end: '2026-09-30' });
});

test('leaderboard: 7d / 28d / 3m are the site page\'s days', () => {
    const w = leaderboardWindows(NOW);
    for (const [preset, exp] of Object.entries(EXPECTED)) assert.deepEqual(tuple(w.ranges[preset]), exp.ga4, preset);
    assert.equal(w.gaDaily.end, '2026-10-27');
    assert.equal(w.gscDaily.end, '2026-10-26');
});

test('client share page and legacy APIs: the same 28 days, previous aligned by weekday', () => {
    // These read the clock: compare with the rule at the same moment.
    const real = new Date();
    const ga = dr.resolveWindow({ preset: '28d', compare: 'prev' }, 'ga4', { now: real });
    const gsc = dr.resolveWindow({ preset: '28d', compare: 'prev' }, 'gsc', { now: real });
    assert.deepEqual(legacyRange('28d'), { startDate: ga.start, endDate: ga.end });
    assert.deepEqual(legacyPrev('28d'), { startDate: ga.prevStart, endDate: ga.prevEnd });
    assert.deepEqual(legacyRange('28d', 'gsc'), { startDate: gsc.start, endDate: gsc.end });
    const share = resolveOverviewRange('28d');
    assert.deepEqual(share.current, { startDate: ga.start, endDate: ga.end });
    assert.deepEqual(share.previous, { startDate: ga.prevStart, endDate: ga.prevEnd });
    assert.equal(share.shiftDays, 28);
    // 30 days are not whole weeks: the previous period moves back 35 days, so weekdays line up.
    const s30 = resolveOverviewRange('30d');
    assert.equal(s30.shiftDays, 35);
    assert.equal(new Date(`${s30.current.startDate}T00:00:00Z`).getUTCDay(), new Date(`${s30.previous.startDate}T00:00:00Z`).getUTCDay());
    assert.equal(s30.current.endDate, dr.lastCompleteDay('ga4', real), 'complete days, today is not counted');
    // Only the explicit partial ranges include today.
    assert.deepEqual(legacyRange('today'), { startDate: 'today', endDate: 'today' });
});

test('Connect AI (MCP) tools: last_28d is the same days', () => {
    const ga = mcp.resolvePeriod({ preset: 'last_28d' }, { source: 'ga4', now: NOW.getTime() }).period;
    const sc = mcp.resolvePeriod({ preset: 'last_28d' }, { source: 'gsc', now: NOW.getTime() }).period;
    assert.deepEqual([ga.start, ga.end], EXPECTED['28d'].ga4.slice(0, 2));
    assert.deepEqual([sc.start, sc.end], EXPECTED['28d'].gsc.slice(0, 2));
});
