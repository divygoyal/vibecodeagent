// Chart findings name the home page in words, not as a bare "/". Run: cd web && node --test tests/findingRules.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { searchFindingOf } = await import('../src/components/site/chart/findingRules.ts');

const ctx = { compareOn: true, compareText: 'previous 28 days', siteHost: 'acme.com', daily: false };
const mk = (pages) => ({
    summary: { totals: { clicks: 11600 }, previous: { clicks: 10000 }, series: [] },
    drivers: { rows: pages.map(([key, cur, prev]) => ({ key, clicks: cur, impressions: cur * 10, prev: { clicks: prev, impressions: prev * 10 } })), lost: [] },
});

test('a clicks finding led by the home page says "the homepage"', () => {
    const { summary, drivers } = mk([['https://acme.com/', 2800, 1423], ['/blog', 100, 90]]);
    const f = searchFindingOf('clicks', summary, drivers, ctx);
    assert.equal(f.text, 'Clicks up 16.0% vs previous 28 days, led by the homepage (+1,377 clicks).');
    assert.ok(!/ \/ \(|by \/ /.test(f.text));
});

test('a clicks finding led by another page keeps its path', () => {
    const { summary, drivers } = mk([['https://acme.com/pricing', 2000, 400], ['/', 100, 90]]);
    assert.match(searchFindingOf('clicks', summary, drivers, ctx).text, /led by \/pricing \(\+1,600 clicks\)/);
});
