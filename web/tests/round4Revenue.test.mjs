// Round 4 stream C: page titles, the GA4 revenue lens, money formatting, hostname aliases of GA4-only sites.
// Run: cd web && node --test tests/round4Revenue.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { titleBrand, cleanTitle, usableTitle, splitPagePath } = await import('../src/components/site/lib/pagePath.ts');
const { fmtCurrency, fmtValue } = await import('../src/lib/format.ts');
const { METRICS, fmtMetric } = await import('../src/lib/metrics.ts');
const { buildSiteDirectory, resolveSite } = await import('../src/lib/sites/siteDirectory.ts');
const { trendFinding } = await import('../src/components/site/lib/findings.ts');
const { publicDemoGoogleFetch } = await import('../src/lib/demo/fetchShim.ts');

test('page titles: the shared brand suffix (or prefix) is removed, the page name stays', () => {
    const titles = ['Pricing | Acme Analytics', 'How to measure product-market fit | Acme Analytics', 'Blog | Acme Analytics', 'Acme Analytics'];
    const brand = titleBrand(titles);
    assert.deepEqual(brand, { text: 'Acme Analytics', at: 'end' });
    assert.equal(cleanTitle('How to measure product-market fit | Acme Analytics', brand), 'How to measure product-market fit');
    // Only the brand: kept (usually the home page).
    assert.equal(cleanTitle('Acme Analytics', brand), 'Acme Analytics');
    // A dash inside the page name is not the separator before the brand.
    assert.equal(cleanTitle('Retro travel poster – Lisbon | Creative Prints', titleBrand(['Retro travel poster – Lisbon | Creative Prints', 'Cart | Creative Prints'])), 'Retro travel poster – Lisbon');
    // Brand first.
    const pre = titleBrand(['Acme · Pricing', 'Acme · Docs', 'Acme · Blog']);
    assert.deepEqual(pre, { text: 'Acme', at: 'start' });
    assert.equal(cleanTitle('Acme · Docs', pre), 'Docs');
    // Titles that share nothing keep their full text; GA4's "(not set)" is no title.
    assert.equal(titleBrand(['One - two', 'Three - four', 'Five']), null);
    assert.equal(cleanTitle('One - two', null), 'One - two');
    assert.equal(usableTitle('(not set)'), null);
    assert.equal(usableTitle('  Pricing \n plans '), 'Pricing plans');
    assert.equal(cleanTitle('', brand), null);
});

test('page paths still shorten in the middle', () => {
    assert.deepEqual(splitPagePath('/blog/how-to-measure-product-market-fit'), ['/blog', '/how-to-measure-product-market-fit']);
});

test('money: property currency, whole units in tables, compact on tiles, cents for per-session values', () => {
    assert.equal(fmtCurrency(27056.39, 'USD'), '$27,056');
    assert.equal(fmtCurrency(955.2, 'EUR'), '€955');
    assert.equal(fmtCurrency(61805.31, 'USD', { compact: true }), '$61.8K');
    assert.equal(fmtCurrency(1204, 'GBP', { compact: true }), '£1,204');
    assert.equal(fmtCurrency(1.1199, 'USD', { cents: true }), '$1.12');
    assert.equal(fmtCurrency(2500000, 'INR', { compact: true }), '₹2.5M');
    assert.equal(fmtCurrency(null, 'USD'), '–');
    assert.equal(fmtCurrency(12, 'XYZ1'), '12 XYZ1');
    assert.equal(fmtValue('currency', 61805, { compact: true, tile: true, currency: 'USD' }), '$61.8K');
    assert.equal(fmtMetric('revenue', 61805, { compact: true, currency: 'EUR' }), '€61.8K');
});

test('naming: GA4 key events are "Key events"; revenue is its own metric', () => {
    assert.equal(METRICS.conversions.label, 'Key events');
    assert.equal(METRICS.revenue.label, 'Revenue');
    assert.equal(METRICS.revenue.format, 'currency');
    assert.match(METRICS.revenue.color, /--color-m-revenue/);
});

test('revenue findings use money, not counts', () => {
    const fmt = (n) => fmtCurrency(n, 'USD', { compact: true });
    const up = trendFinding({ metric: 'Revenue', cur: 61805, prev: 50000, compareText: 'previous 28 days', drivers: [{ label: 'Paid Search', cur: 20000, prev: 10000 }, { label: 'Email', cur: 5000, prev: 4800 }], driverUnit: '', fmt });
    assert.equal(up.text, 'Revenue up 23.6% vs previous 28 days, led by Paid Search (+$10K).');
    const busy = trendFinding({ metric: 'Revenue', cur: 100, series: [{ date: '2026-10-01', value: 10 }, { date: '2026-10-02', value: 90 }, { date: '2026-10-03', value: 10 }, { date: '2026-10-04', value: 0 }], partialLast: true, fmt });
    assert.match(busy.text, /^Busiest day: .*Oct 2, \$90 in revenue/);
});

test('a GA4-only site is found by its web stream host, and www. by the plain host', () => {
    const dir = buildSiteDirectory({
        sites: [{ siteUrl: 'sc-domain:acme.example' }],
        properties: [
            { property: 'properties/1', displayName: 'Acme – Web' },
            { property: 'properties/412300108', displayName: 'Creative Prints Shop', host: 'www.creativeprints.example' },
        ],
        pairs: { 'properties/1': 'sc-domain:acme.example', 'properties/412300108': null },
    });
    const shop = dir.find((e) => e.ga4PropertyId === 'properties/412300108');
    assert.equal(shop.host, 'ga4-412300108');
    assert.equal(shop.streamHost, 'creativeprints.example');
    assert.deepEqual(resolveSite(dir, 'ga4-412300108'), { site: shop, alias: false });
    assert.deepEqual(resolveSite(dir, 'creativeprints.example'), { site: shop, alias: true });
    assert.deepEqual(resolveSite(dir, 'www.creativeprints.example'), { site: shop, alias: true });
    assert.equal(resolveSite(dir, 'www.acme.example').site.host, 'acme.example');
    assert.equal(resolveSite(dir, 'acme.example').alias, false);
    assert.equal(resolveSite(dir, 'unknown.example'), null);
    assert.equal(resolveSite(dir, 'ga4-999'), null);
});

// ─── The site reports through the narrow production demo shim (the public live demo) ───

const network = async () => { throw new Error('network must not be called'); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => (await publicDemoGoogleFetch(input, init, network, { isDemoRequest: async () => false })) ?? network();
const { ga4Summary, ga4Breakdown, ga4PageTrends, ga4PageDetail } = await import('../src/app/api/site/_lib/ga4Reports.ts');
test.after(() => { globalThis.fetch = realFetch; });

const TOKEN = 'demo-access:main';
const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const RANGE = { cur: { start: day(28), end: day(1) }, cmp: { start: day(56), end: day(29) } };
const SHOP = 'properties/412300108';
const SAAS = 'properties/412300101';

test('demo shop: summary has revenue, transactions and the currency; a site without sales has 0', async () => {
    const s = await ga4Summary('t-r4c', TOKEN, SHOP, RANGE);
    assert.ok(s.totals.revenue > 1000, `revenue ${s.totals.revenue}`);
    assert.ok(s.totals.transactions > 10);
    assert.ok(s.previous.revenue > 0);
    assert.equal(s.currency, 'USD');
    assert.ok(s.series.some((p) => p.revenue > 0));
    assert.ok(s.series.every((p) => typeof p.prev_revenue === 'number' || p.prev_revenue === null));
    const saas = await ga4Summary('t-r4c', TOKEN, SAAS, RANGE);
    assert.equal(saas.totals.revenue, 0);
});

test('demo shop: sources, countries, pages and landing pages carry totalRevenue; page rows carry clean titles', async () => {
    for (const report of ['sources', 'referrers', 'channels', 'countries', 'pages', 'landing']) {
        const b = await ga4Breakdown('t-r4c', TOKEN, SHOP, report, RANGE);
        assert.ok(b.rows.some((r) => r.cur.totalRevenue > 0), `${report} has revenue`);
        assert.equal(b.currency, 'USD');
    }
    const pages = await ga4Breakdown('t-r4c', TOKEN, SHOP, 'pages', RANGE);
    const product = pages.rows.find((r) => r.dims.pagePath === '/products/mountain-sunrise-print');
    assert.equal(product.dims.pageTitle, 'Mountain sunrise print');
    assert.ok(pages.rows.every((r) => !r.dims.pageTitle || !r.dims.pageTitle.endsWith('| Creative Prints')));
    const landing = await ga4Breakdown('t-r4c', TOKEN, SHOP, 'landing', RANGE);
    assert.ok(landing.rows.filter((r) => r.dims.pageTitle).length > 3);
    const trends = await ga4PageTrends('t-r4c', TOKEN, SHOP, RANGE, null, 8);
    assert.ok(trends.rows.every((r) => !r.title || !r.title.includes('| Creative Prints')));
    const detail = await ga4PageDetail('t-r4c', TOKEN, SHOP, '/checkout/success', null, RANGE);
    assert.ok(detail.totals.revenue > 0);
    assert.equal(detail.currency, 'USD');
});
