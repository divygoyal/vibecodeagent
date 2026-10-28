// Round 7 audit fixes, stream C: Indexing never calls a page with clicks "not in Google" without saying it dropped
// (and the demo data agrees with itself), one severity rule for cannibalization, the demo Ask answer = Actions.
// Run: cd web && node --test tests/round7wc.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { demoSearchAnalytics, demoUrlInspection, demoAllSiteUrls } = await import('../src/lib/demo/gsc.ts');
const { cannibalizationGain, cannibalizationImpact, impactFor, rankByImpact, topClickGain, topClickTasks } = await import('../src/components/site/lib/actionText.ts');

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 28, 12);
const iso = (d) => new Date(now - d * DAY).toISOString().slice(0, 10);

test('demo: a top page Google does not index has no clicks from its last crawl on (it dropped), never "in Google" clicks after', () => {
    let dropped = 0;
    for (const site of demoAllSiteUrls()) {
        const rows = demoSearchAnalytics(site, { startDate: iso(29), endDate: iso(2), dimensions: ['page'], rowLimit: 500 }, { now }).rows ?? [];
        for (const r of rows.filter((x) => x.clicks > 0).slice(0, 20)) {
            const idx = demoUrlInspection({ siteUrl: site, inspectionUrl: r.keys[0] }, { now }).inspectionResult.indexStatusResult;
            if (idx.verdict === 'PASS') continue;
            dropped++;
            // Never "Discovered" (never crawled) for a page with clicks; the crawl date is when it fell out.
            assert.equal(idx.coverageState, 'Crawled - currently not indexed', r.keys[0]);
            const crawl = idx.lastCrawlTime.slice(0, 10);
            const after = demoSearchAnalytics(site, {
                startDate: crawl, endDate: iso(2), dimensions: ['date'],
                dimensionFilterGroups: [{ filters: [{ dimension: 'page', expression: r.keys[0] }] }],
            }, { now }).rows ?? [];
            assert.equal(after.reduce((a, x) => a + x.clicks, 0), 0, `${r.keys[0]} has clicks after it dropped on ${crawl}`);
        }
    }
    assert.ok(dropped > 0, 'the demo shows at least one dropped page');
});

test('demo: a dropped page moves clicks between pages, the site total stays the designed series (within 2%)', () => {
    const site = 'sc-domain:acmeanalytics.example';
    const byDate = demoSearchAnalytics(site, { startDate: iso(29), endDate: iso(2), dimensions: ['date'] }, { now }).rows ?? [];
    const byPage = demoSearchAnalytics(site, { startDate: iso(29), endDate: iso(2), dimensions: ['page'], rowLimit: 5000 }, { now }).rows ?? [];
    const a = byDate.reduce((s, r) => s + r.clicks, 0);
    const b = byPage.reduce((s, r) => s + r.clicks, 0);
    assert.ok(Math.abs(a - b) / a < 0.02, `${a} vs ${b}`);
});

test('cannibalization: one rule for the tab badge and the Actions tier', () => {
    const c = { totalImpressions: 20_000, totalClicks: 300, bestPosition: 6.2 };
    const gain = cannibalizationGain(c, 28);
    assert.ok(gain > 0);
    for (const scale of [500, 5_000, 25_000, 250_000]) {
        assert.equal(cannibalizationImpact('strong', gain, scale), impactFor(gain, scale));
        assert.equal(cannibalizationImpact('some', gain, scale), impactFor(gain, scale));
        assert.equal(cannibalizationImpact('weak', gain, scale), 'low');
    }
    // "+52 a month" on a site with 25K clicks a month is low, not medium or high (round 7 audit item 8).
    assert.equal(cannibalizationImpact('strong', 52, 25_000), 'low');
});

test('top 5 click tasks: the Actions header adds the numbers the rows show', () => {
    const list = rankByImpact([
        { id: 'a', impact: 'high', gain: 7681, score: 7681, expectedImpact: '+7,681 clicks a month at position 5' },
        { id: 'b', impact: 'high', gain: 2000, score: 2400, expectedImpact: 'Recover up to 2,000 clicks a month' },
        { id: 'c', impact: 'high', gain: 900, score: 900, expectedImpact: 'Recover up to 900 sessions a month' },
        { id: 'd', impact: 'medium', gain: null, score: 10, expectedImpact: 'Small ranking and click-through gain' },
    ]);
    assert.deepEqual(topClickTasks(list).map((x) => x.id), ['a', 'b']);
    assert.equal(topClickGain(list), 9681);
});

test('demo Ask "improve first" answer starts with the Actions list\'s first click task and its top-5 total', async () => {
    const { demoAskSamples } = await import('../src/lib/publicDemo/ask.ts');
    const { buildActions } = await import('../src/app/api/site/_lib/actions.ts');
    const { auditActions } = await import('../src/components/site/lib/auditActions.ts');
    const { getDemoAuditReport } = await import('../src/lib/demoWorkspaceData.ts');
    const { resolveDateRange } = await import('../src/lib/dateRange.ts');
    const { demoAccessToken } = await import('../src/lib/demo/catalog.ts');
    const { sampleGoogleFetch } = await import('../src/lib/demo/fetchShim.ts');
    const { runWithSampleGoogle } = await import('../src/lib/demo/sampleScope.ts');
    const { fmtCompact, fmtFull } = await import('../src/lib/format.ts');
    const t = Date.now();
    const answer = (await demoAskSamples(t)).find((s) => s.id === 'quick-wins').answer;
    const p = (r) => ({ cur: { start: r.start, end: r.end }, cmp: r.prevStart ? { start: r.prevStart, end: r.prevEnd } : null });
    const range = { preset: '28d', compare: 'prev' };
    const res = await runWithSampleGoogle(sampleGoogleFetch, () => buildActions({
        userId: 'test-r7wc', token: demoAccessToken('main'), label: 'acmeanalytics.example', siteUrl: 'sc-domain:acmeanalytics.example',
        property: 'properties/412300101', search: p(resolveDateRange(range, { now: new Date(t), lagDays: 2 })), traffic: p(resolveDateRange(range, { now: new Date(t) })),
    }));
    const open = rankByImpact([...res.actions, ...auditActions(getDemoAuditReport('https://acmeanalytics.example/'), 'acmeanalytics.example')]);
    const first = topClickTasks(open)[0];
    assert.ok(answer.startsWith(`Start with **${first.title}**: about +${fmtFull(first.gain)} clicks a month`), answer.slice(0, 200));
    assert.match(answer, new RegExp(`\\+${fmtCompact(topClickGain(open)).replace('.', '\\.')} clicks a month`));
});
