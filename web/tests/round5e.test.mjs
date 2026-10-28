// Round 5 stream E: Journeys flow, Indexing status, cohort windows, browser / OS icons.
// Run: cd web && node --test tests/round5e.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { publicDemoGoogleFetch } = await import('../src/lib/demo/fetchShim.ts');
const { cohortWindows, cohortSpan } = await import('../src/components/site/lib/cohorts.ts');
const { browserIconHost, osIconHost, deviceKind } = await import('../src/components/site/lib/techIcons.ts');

const network = async () => { throw new Error('network must not be called'); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => (await publicDemoGoogleFetch(input, init, network, { isDemoRequest: async () => false })) ?? network();
const { ga4Journeys } = await import('../src/app/api/site/_lib/ga4Reports.ts');
const { gscIndexStatus } = await import('../src/app/api/site/_lib/gscReports.ts');
test.after(() => { globalThis.fetch = realFetch; });

const TOKEN = 'demo-access:main';
const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const RANGE = { cur: { start: day(28), end: day(1) }, cmp: { start: day(56), end: day(29) } };
const SAAS = 'properties/412300101';

test('journeys: channel x landing sessions with key-event sessions, and next pages from the page referrer', async () => {
    const j = await ga4Journeys('t-r5e', TOKEN, SAAS, RANGE);
    assert.ok(j.entries.length > 20, `entries ${j.entries.length}`);
    for (const e of j.entries) {
        assert.ok(e.sessions > 0 && e.keySessions >= 0 && e.keySessions <= e.sessions, JSON.stringify(e));
        assert.notEqual(e.landing, '(not set)');
    }
    assert.ok(new Set(j.entries.map((e) => e.channel)).has('Organic Search'));
    assert.ok(j.next.length > 20, `next ${j.next.length}`);
    // Only steps after the landing page: never the landing page itself, never an external referrer's row.
    for (const n of j.next) assert.notEqual(n.next, n.landing);
    const home = j.entries.filter((e) => e.landing === '/').reduce((a, e) => a + e.sessions, 0);
    const homeNext = j.next.filter((n) => n.landing === '/').reduce((a, n) => a + n.views, 0);
    assert.ok(homeNext > 0 && homeNext < home, `home ${home} next ${homeNext}`);
});

test('indexing: the top pages by clicks get one inspection each, cached for the day', async () => {
    const r = await gscIndexStatus('t-r5e', TOKEN, 'sc-domain:acmeanalytics.example', { cur: { start: day(30), end: day(3) }, cmp: null });
    assert.equal(r.limit, 20);
    assert.ok(r.pages.length > 5 && r.pages.length <= 20);
    assert.ok(r.pagesWithClicks >= r.pages.length);
    for (let i = 1; i < r.pages.length; i++) assert.ok(r.pages[i - 1].clicks >= r.pages[i].clicks);
    for (const p of r.pages) {
        assert.equal(p.status, 'ok');
        assert.ok(['PASS', 'NEUTRAL', 'FAIL', 'PARTIAL'].includes(p.verdict), p.verdict);
        assert.ok(p.checkedAt);
    }
    const again = await gscIndexStatus('t-r5e', TOKEN, 'sc-domain:acmeanalytics.example', { cur: { start: day(30), end: day(3) }, cmp: null });
    assert.deepEqual(again.pages.map((p) => p.checkedAt), r.pages.map((p) => p.checkedAt));
});

test('cohort windows: weekly = 8 complete Sunday-Saturday weeks, daily = 14 days up to yesterday', () => {
    const now = Date.parse('2026-10-28T12:00:00Z'); // a Wednesday
    const w = cohortWindows('weekly', now);
    assert.equal(w.length, 8);
    assert.equal(w[7].end, '2026-10-24');
    assert.equal(new Date(`${w[0].start}T00:00:00Z`).getUTCDay(), 0);
    assert.deepEqual(cohortSpan('daily', now), { start: '2026-10-14', end: '2026-10-27', count: 14 });
    assert.deepEqual(cohortSpan('monthly', now), { start: '2026-04-01', end: '2026-09-30', count: 6 });
});

test('browser and OS icons use product logos, not company ones', () => {
    assert.equal(browserIconHost('Chrome'), 'chrome.com');
    assert.equal(browserIconHost('Safari'), 'webkit.org');
    assert.equal(browserIconHost('Edge'), 'microsoftedge.com');
    assert.equal(browserIconHost('Samsung Internet'), 'samsung.com');
    assert.equal(browserIconHost('Some new browser'), null);
    assert.equal(osIconHost('Macintosh'), 'apple.com');
    assert.equal(osIconHost('Linux'), 'kernel.org');
    assert.equal(osIconHost('Chrome OS'), 'chromebook.com');
    assert.equal(deviceKind('mobile'), 'mobile');
    assert.equal(deviceKind('smart tv'), 'tv');
    assert.equal(deviceKind('desktop'), 'desktop');
});

test('journey flow: columns fold into Other, the third column accounts for every landing session', async () => {
    const { buildJourneyFlow, buildSearchFlow } = await import('../src/components/site/lib/journeys.ts');
    const data = {
        entries: [
            { channel: 'Organic Search', landing: '/', sessions: 100, keySessions: 10 },
            { channel: 'Direct', landing: '/', sessions: 50, keySessions: 5 },
            { channel: 'Direct', landing: '/pricing', sessions: 40, keySessions: 8 },
            { channel: 'Email', landing: '/blog/a', sessions: 10, keySessions: 0 },
        ],
        next: [{ landing: '/', next: '/pricing', views: 60 }, { landing: '/pricing', next: '/signup', views: 10 }],
        truncated: false,
    };
    const key = buildJourneyFlow(data, 'key', { channels: 1, landings: 1 });
    const col = (f, c) => f.nodes.filter((n) => n.col === c).reduce((a, n) => a + n.value, 0);
    assert.equal(key.total, 200);
    assert.equal(col(key, 0), 200);
    assert.equal(col(key, 2), 200);
    assert.equal(key.nodes.find((n) => n.kind === 'key').value, 23);
    assert.ok(key.nodes.some((n) => n.col === 0 && n.kind === 'other'));
    const next = buildJourneyFlow(data, 'next');
    // 150 sessions on "/", 60 opened /pricing next: 90 had no next page; /pricing 40 - 10; /blog/a 10.
    assert.equal(next.nodes.find((n) => n.kind === 'end').value, 90 + 30 + 10);
    assert.equal(col(next, 2), 200);
    const search = buildSearchFlow({ rows: [{ query: 'a', page: 'https://x/', clicks: 5 }, { query: 'b', page: 'https://x/p', clicks: 3 }], totalClicks: 8 });
    assert.equal(search.total, 8);
    assert.equal(search.links.length, 2);
});
