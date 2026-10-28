// Round 5 polish (blind judge defects): demo numbers that agree across reports and vary by page, Google coverage
// states in words, flow labels that never cut a word.
// Run: cd web && node --test tests/round5Polish.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { demoRunReport } = await import('../src/lib/demo/ga4.ts');
const { demoUrlInspection } = await import('../src/lib/demo/gsc.ts');
const { coverageText } = await import('../src/components/site/lib/coverage.ts');
const { clipLabel } = await import('../src/components/site/lib/clipLabel.ts');

const RANGE = [{ startDate: '28daysAgo', endDate: 'yesterday' }];
const SAAS = 'properties/412300101';
const SHOP = 'properties/412300108';
const rows = (prop, dims, mets) => demoRunReport(prop, { dateRanges: RANGE, dimensions: dims.map((name) => ({ name })), metrics: mets.map((name) => ({ name })), limit: 5000 }).rows ?? [];

test('demo: channel x landing page sums to the landing page report (Journeys flow = table)', () => {
    for (const prop of [SAAS, SHOP]) {
        const flow = new Map();
        for (const r of rows(prop, ['sessionDefaultChannelGroup', 'landingPage'], ['sessions'])) {
            const p = r.dimensionValues[1].value;
            flow.set(p, (flow.get(p) ?? 0) + Number(r.metricValues[0].value));
        }
        const table = rows(prop, ['landingPage'], ['sessions']);
        for (const r of table.slice(0, 10)) {
            const p = r.dimensionValues[0].value;
            const t = Number(r.metricValues[0].value);
            // Rows are rounded one by one: a few sessions at most.
            assert.ok(Math.abs((flow.get(p) ?? 0) - t) <= Math.max(3, t * 0.002), `${prop} ${p}: flow ${flow.get(p)} vs table ${t}`);
        }
        // And the landing pages add up to the site total.
        const total = Number(rows(prop, [], ['sessions'])[0].metricValues[0].value);
        const sum = table.reduce((a, r) => a + Number(r.metricValues[0].value), 0);
        assert.ok(Math.abs(sum - total) <= Math.max(5, total * 0.002), `${prop}: pages ${sum} vs site ${total}`);
    }
});

test('demo: each landing page has its own channel mix and engagement (not the site average everywhere)', () => {
    const mix = new Map();
    for (const r of rows(SAAS, ['sessionDefaultChannelGroup', 'landingPage'], ['sessions'])) {
        const [c, p] = r.dimensionValues.map((d) => d.value);
        if (!mix.has(p)) mix.set(p, new Map());
        mix.get(p).set(c, Number(r.metricValues[0].value));
    }
    const organicShare = (p) => {
        const m = mix.get(p);
        const all = [...m.values()].reduce((a, b) => a + b, 0);
        return (m.get('Organic Search') ?? 0) / all;
    };
    const blog = [...mix.keys()].find((p) => p.startsWith('/blog/'));
    assert.ok(organicShare(blog) - organicShare('/') > 0.15, `blog ${organicShare(blog)} vs home ${organicShare('/')}`);
    const landing = rows(SAAS, ['landingPage'], ['sessions', 'engagementRate', 'keyEvents']).slice(0, 20);
    const rates = landing.map((r) => Number(r.metricValues[1].value).toFixed(3));
    const site = Number(rows(SAAS, [], ['engagementRate'])[0].metricValues[0].value).toFixed(3);
    assert.ok(rates.filter((x) => x === site).length <= 1, `rates equal to the site average: ${rates.join(' ')}`);
    assert.ok(new Set(rates).size >= 15, `distinct rates ${new Set(rates).size}`);
});

test('demo: key events of sessions landing on checkout stay below its sessions', () => {
    const co = rows(SHOP, ['landingPage'], ['sessions', 'keyEvents']).find((r) => /checkout/.test(r.dimensionValues[0].value));
    assert.ok(co, 'a checkout landing row');
    assert.ok(Number(co.metricValues[1].value) <= Number(co.metricValues[0].value), co.metricValues.map((m) => m.value).join(' '));
});

test('demo: a crawled-but-not-indexed page has a crawl date; a discovered one does not', () => {
    let crawled = 0;
    for (let i = 0; i < 200; i++) {
        const r = demoUrlInspection({ siteUrl: 'sc-domain:acmeanalytics.example', inspectionUrl: `https://acmeanalytics.example/blog/p-${i}` }).inspectionResult.indexStatusResult;
        if (/^Crawled/.test(r.coverageState)) { crawled++; assert.ok(r.lastCrawlTime, 'crawl time'); }
        if (/^Discovered/.test(r.coverageState)) assert.equal(r.lastCrawlTime, undefined);
    }
    assert.ok(crawled > 0);
});

test('coverage states read as plain words; unknown ones keep Google\'s text', () => {
    assert.equal(coverageText('Crawled - currently not indexed').short, 'Crawled, left out of Google');
    assert.match(coverageText('Crawled - currently not indexed').long, /crawled the page but chose not to index/);
    assert.equal(coverageText('Discovered - currently not indexed').short, 'Found, not crawled yet');
    assert.equal(coverageText('Duplicate, Google chose different canonical than user').short, 'Duplicate: Google chose another URL');
    assert.equal(coverageText('Excluded by ‘noindex’ tag').short, 'Kept out by noindex');
    assert.equal(coverageText('Something new').short, 'Something new');
    assert.equal(coverageText(null), null);
});

test('flow labels: paths keep a whole-word tail, text ends on a whole word', () => {
    assert.equal(clipLabel('/blog/how-to-measure-product-market-fit', 25), '/blog/…market-fit');
    assert.equal(clipLabel('/pricing', 20), '/pricing');
    assert.equal(clipLabel('cohort analysis for saas a practical guide', 20), 'cohort analysis…');
    for (const [s, n] of [['/blog/cohort-analysis-for-saas-a-practical-guide', 30], ['/docs/guides/tracking-funnels', 18]]) {
        const out = clipLabel(s, n);
        assert.ok(out.length <= n, out);
        const tail = out.split('…')[1];
        assert.ok(s.endsWith(tail) && /[-_/.]$/.test(s.slice(0, s.length - tail.length)), `${out} cuts a word`);
    }
});
