// Round 4 stream B (site pages): compact task rows, one task order, anomaly alerts with windows,
// Winners & losers grouping. Run: cd web && node --test tests/siteRound4b.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { rankByImpact, shortImpact, per28 } = await import('../src/components/site/lib/actionText.ts');
const { siteAnomalies, unusualDay, fellOffPageOne, windowText } = await import('../src/components/site/lib/anomalies.ts');
const { moverGroups, emptyMoversLine } = await import('../src/components/site/lib/rules.ts');
const { computeDelta, deltaOptionsFor } = await import('../src/lib/format.ts');

const NOW = new Date('2026-10-28T12:00:00Z');

test('shortImpact: the monthly number of each expected-impact sentence, once', () => {
    assert.deepEqual(shortImpact('+7,681 clicks a month at position 5'), { value: '+7,681', unit: 'clicks/mo' });
    assert.deepEqual(shortImpact('+35 clicks a month at the usual CTR'), { value: '+35', unit: 'clicks/mo' });
    assert.deepEqual(shortImpact('Win back up to 410 clicks a month'), { value: 'up to 410', unit: 'clicks/mo' });
    assert.deepEqual(shortImpact('Recover up to 1,240 sessions a month'), { value: 'up to 1,240', unit: 'sessions/mo' });
    assert.deepEqual(shortImpact('Recover up to 96 views a month'), { value: 'up to 96', unit: 'views/mo' });
    assert.equal(shortImpact('Clearer ranking for this query'), null);
    assert.equal(shortImpact('Fixes a problem that can stop pages ranking'), null);
});

test('rankByImpact: tier, then the number each task shows (round 7 audit item 8); no number goes by score', () => {
    const list = [
        { id: 'a', impact: 'high', gain: 120, score: 120 }, { id: 'b', impact: 'medium', gain: 392, score: 392 },
        { id: 'c', impact: 'high', gain: 958, score: 958 }, { id: 'audit1', impact: 'high', gain: null, score: 40 },
        { id: 'd', impact: 'low', gain: 22, score: 22 }, { id: 'audit2', impact: 'medium', gain: null, score: 10 },
        { id: 'e', impact: 'medium', gain: 958, score: 1149.6 }, { id: 'f', impact: 'low', gain: 53, score: 53 },
    ];
    assert.deepEqual(rankByImpact(list).map((x) => x.id), ['c', 'a', 'audit1', 'e', 'b', 'audit2', 'f', 'd']);
    // Shown numbers read in order inside every tier.
    for (const tier of ['high', 'medium', 'low']) {
        const nums = rankByImpact(list).filter((x) => x.impact === tier && x.gain !== null).map((x) => x.gain);
        assert.deepEqual(nums, [...nums].sort((x, y) => y - x));
    }
    // Pure: the input is not reordered.
    assert.equal(list[1].id, 'b');
});

test('per28 turns a period gain into a month, as Actions does', () => {
    assert.equal(per28(7681, 28), 7681);
    assert.equal(per28(900, 90), 280);
});

const W = { start: '2026-09-29', end: '2026-10-26', prevStart: '2026-09-01', prevEnd: '2026-09-28' };
const GW = { start: '2026-10-01', end: '2026-10-28', prevStart: '2026-09-03', prevEnd: '2026-09-30' };
const days = (start, n, f) => Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    return { date: d, ...f(i, d) };
});
const gsc = (clicks, prevClicks, series) => ({
    totals: { clicks, impressions: 700_000, ctr: 0.03, position: 12 },
    previous: prevClicks === null ? null : { clicks: prevClicks, impressions: 700_000, ctr: 0.03, position: 12 },
    series: series ?? days(W.start, 28, () => ({ clicks: Math.round(clicks / 28), impressions: Math.round(clicks * 30 / 28), ctr: 0.03, position: 12 })),
    lastDate: W.end,
});

test('windowText names both periods', () => {
    assert.equal(windowText(W, NOW), 'Sep 29 – Oct 26 vs Sep 1 – Sep 28');
    assert.equal(windowText({ ...W, prevStart: null, prevEnd: null }, NOW), 'Sep 29 – Oct 26');
});

test('a +17.2% header change is not an alert; +21% is, with the header delta text and the window', () => {
    assert.deepEqual(siteAnomalies({ gsc: gsc(23_900, 20_393), gscWindow: W, ga4Window: GW, now: NOW }), []);
    const out = siteAnomalies({ gsc: gsc(24_200, 20_000), gscWindow: W, ga4Window: GW, now: NOW });
    assert.equal(out.length, 1);
    const header = computeDelta(24_200, 20_000, deltaOptionsFor('count')).text;
    assert.equal(out[0].title, `Clicks up ${header}`);
    assert.equal(out[0].title, 'Clicks up 21.0%');
    assert.match(out[0].detail, /24,200 clicks vs 20,000 · Sep 29 – Oct 26 vs Sep 1 – Sep 28$/);
    assert.equal(out[0].severity, 'success');
    assert.equal(out[0].task, undefined);
});

test('a clicks drop points at the search_drop task instead of repeating it; no comparison, no totals alert', () => {
    const [a] = siteAnomalies({ gsc: gsc(15_000, 25_000), gscWindow: W, ga4Window: GW, now: NOW });
    assert.equal(a.title, 'Clicks down 40.0%');
    assert.equal(a.severity, 'critical');
    assert.equal(a.task, 'search_drop');
    assert.deepEqual(siteAnomalies({ gsc: gsc(15_000, null), gscWindow: { ...W, prevStart: null, prevEnd: null }, ga4Window: GW, now: NOW }), []);
});

test('alerts never carry opportunities (striking distance, quick wins)', () => {
    const rows = [{ key: 'product analytics', clicks: 934, impressions: 90_687, ctr: 0.01, position: 16.6, prev: { clicks: 725, impressions: 80_000, ctr: 0.009, position: 16.7 } }];
    const out = siteAnomalies({ gsc: gsc(23_900, 20_393), gscWindow: W, ga4Window: GW, queries: { rows, lost: [] }, now: NOW });
    assert.deepEqual(out, []);
});

test('unusualDay compares with the same weekday, so weekends are not dips', () => {
    // Weekdays ~1,000, weekends ~500: nothing unusual.
    const weekly = days('2026-09-29', 28, (i, d) => ({ value: [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) ? 500 : 1000 }));
    assert.equal(unusualDay(weekly, 50), null);
    // One Wednesday at 2,300.
    const spiked = weekly.map((p) => (p.date === '2026-10-14' ? { ...p, value: 2300 } : p));
    const d = unusualDay(spiked, 50);
    assert.equal(d.date, '2026-10-14');
    assert.equal(d.usual, 1000);
    assert.equal(d.sameWeekday, true);
    const [a] = siteAnomalies({ gsc: gsc(23_900, 20_393, days('2026-09-29', 28, (i, dd) => ({ clicks: dd === '2026-10-14' ? 2300 : [0, 6].includes(new Date(`${dd}T00:00:00Z`).getUTCDay()) ? 500 : 1000, impressions: 1, ctr: 0, position: 1 }))), gscWindow: W, ga4Window: GW, now: NOW });
    assert.equal(a.title, 'Clicks spike on Oct 14');
    assert.match(a.detail, /^2,300 clicks, 2\.3× a usual Wednesday \(1,000\) · Sep 29 – Oct 26$/);
});

test('fellOffPageOne: page-one queries with clicks that now rank below it (or vanished)', () => {
    const r = (key, pos, prevPos, prevClicks, impressions = 100) => ({ key, clicks: 0, impressions, ctr: 0, position: pos, prev: { clicks: prevClicks, impressions: 200, ctr: 0.05, position: prevPos } });
    const rows = [r('a', 14.2, 6.1, 40), r('b', 9.8, 7, 50), r('c', 12, 11, 30), r('d', 15, 8, 2), r('e', 0, 4, 80, 0)];
    assert.deepEqual(fellOffPageOne(rows).map((x) => x.key), ['e', 'a']);
    const [a] = siteAnomalies({ gscWindow: W, ga4Window: GW, queries: { rows, lost: [] }, now: NOW });
    assert.equal(a.title, '2 queries fell off page one');
    assert.match(a.detail, /^"e" 4\.0 → gone, "a" 6\.1 → 14\.2 · Sep 29 – Oct 26 vs Sep 1 – Sep 28$/);
});

test('GA4: 2 days at zero is critical and points at the traffic task; users drop uses the GA4 window', () => {
    const series = days('2026-10-01', 28, (i) => ({ users: i >= 25 ? 0 : 100, sessions: i >= 25 ? 0 : 120, pageviews: 0, conversions: 0, ai: 0, engagementRate: 0 }));
    const ga4 = { totals: { users: 600, sessions: 700 }, previous: { users: 1000, sessions: 1200 }, series };
    const out = siteAnomalies({ gscWindow: W, ga4, ga4Window: GW, now: NOW });
    assert.equal(out[0].id, 'ga-zero');
    assert.equal(out[0].severity, 'critical');
    const users = out.find((a) => a.id === 'ga-users');
    assert.equal(users.title, 'Users down 40.0%');
    assert.match(users.detail, /Oct 1 – Oct 28 vs Sep 3 – Sep 30$/);
});

test('Winners & losers: groups and the one quiet line for empty groups', () => {
    const rows = [
        { key: 'up', clicks: 50, impressions: 1, ctr: 0, position: 3, prev: { clicks: 20, impressions: 1, ctr: 0, position: 4 } },
        { key: 'up2', clicks: 90, impressions: 1, ctr: 0, position: 3, prev: { clicks: 20, impressions: 1, ctr: 0, position: 4 } },
        { key: 'flat', clicks: 21, impressions: 1, ctr: 0, position: 3, prev: { clicks: 20, impressions: 1, ctr: 0, position: 4 } },
    ];
    const g = moverGroups(rows);
    assert.deepEqual(g.winner.map((r) => r.key), ['up2', 'up']);
    assert.deepEqual([g.loser.length, g.new.length, g.lost.length], [0, 0, 0]);
    assert.equal(emptyMoversLine(['loser', 'new', 'lost'], 'queries'), 'No losers, new or lost queries in this period.');
    assert.equal(emptyMoversLine(['lost'], 'pages'), 'No lost pages in this period.');
    assert.equal(emptyMoversLine(['winner', 'loser'], 'queries'), 'No winners or losers among your queries in this period.');
    assert.equal(emptyMoversLine([], 'queries'), '');
});
