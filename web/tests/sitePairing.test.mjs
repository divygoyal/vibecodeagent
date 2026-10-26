// GA4 <-> Search Console pairing must be the same everywhere: the portfolio cards, the MCP
// list_sites records and the app's site directory (switcher, setup "Your sites", site pages).
// Run: cd web && node --test tests/sitePairing.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { buildSiteDirectory } = await import('../src/lib/sites/siteDirectory.ts');
const { storedPairs } = await import('../src/lib/sites/pairingStore.ts');
const { buildDemoPortfolio, demoInventory } = await import('../src/lib/portfolio/demo.ts');
const { buildSiteRecords } = await import('../src/lib/mcp/siteResolver.ts');

const SITES = [
    { siteUrl: 'sc-domain:acmeanalytics.example' },
    { siteUrl: 'https://www.healthinsights.example/' },
    { siteUrl: 'http://healthinsights.example/' },
];
const PROPS = [
    { property: 'properties/1', displayName: 'Acme Analytics – Web' },
    { property: 'properties/8', displayName: 'Creative Prints Shop' },
    { property: 'properties/2', displayName: 'Health Insights' },
];
const pairOf = (dir) => Object.fromEntries(dir.filter((e) => e.ga4PropertyId).map((e) => [e.ga4PropertyId, e.gscSiteUrl]));

test('the stored pairing decides; a GA4-only property never lands on another site (QA-08)', () => {
    const dir = buildSiteDirectory({
        sites: SITES, properties: PROPS,
        pairs: { 'properties/1': 'sc-domain:acmeanalytics.example', 'properties/8': null, 'properties/2': 'https://www.healthinsights.example/' },
    });
    assert.deepEqual(pairOf(dir), {
        'properties/1': 'sc-domain:acmeanalytics.example',
        'properties/8': null,
        'properties/2': 'https://www.healthinsights.example/',
    });
    const acme = dir.find((e) => e.host === 'acmeanalytics.example');
    assert.equal(acme.ga4Name, 'Acme Analytics – Web');
    assert.equal(dir.find((e) => e.ga4PropertyId === 'properties/8').host, 'ga4-8');
});

test('a manual "never pair" stays GA4-only even when the name matches a site', () => {
    const dir = buildSiteDirectory({ sites: SITES, properties: PROPS, pairs: { 'properties/1': null } });
    assert.equal(pairOf(dir)['properties/1'], null);
    assert.equal(dir.find((e) => e.host === 'acmeanalytics.example').ga4PropertyId, null);
});

test('before the first portfolio sync the name heuristic pairs, never with a stored site', () => {
    const fresh = buildSiteDirectory({ sites: SITES, properties: PROPS });
    assert.equal(pairOf(fresh)['properties/1'], 'sc-domain:acmeanalytics.example');
    assert.equal(pairOf(fresh)['properties/8'], null);
    // Stored: acme's site belongs to properties/1; an unseen property named "Acme" may not take it.
    const dir = buildSiteDirectory({
        sites: SITES,
        properties: [...PROPS, { property: 'properties/9', displayName: 'Acme Analytics – Staging' }],
        pairs: { 'properties/1': 'sc-domain:acmeanalytics.example' },
    });
    assert.equal(pairOf(dir)['properties/9'], null);
});

test('storedPairs: paired_with of live GA4 rows, null when GA4-only or the site is gone', () => {
    const a = (asset_kind, asset_id, paired_with = null, missing = false) => ({ asset_kind, asset_id, paired_with, missing });
    assert.deepEqual(storedPairs([
        a('ga4', 'properties/1', 'sc-domain:a.com'), a('gsc', 'sc-domain:a.com', 'properties/1'),
        a('ga4', 'properties/2'),
        a('ga4', 'properties/3', 'https://gone.com/'), a('gsc', 'https://gone.com/', 'properties/3', true),
        a('ga4', 'properties/4', null, true),
    ]), { 'properties/1': 'sc-domain:a.com', 'properties/2': null, 'properties/3': null });
});

test('portfolio cards, MCP list_sites and the site directory agree on the demo account', () => {
    const portfolio = buildDemoPortfolio({ range: '28d' });
    const fromPortfolio = {};
    for (const s of portfolio.sites) if (s.ga4) fromPortfolio[s.ga4.property] = s.gsc ? s.gsc.siteUrl : null;

    const inv = demoInventory();
    const fromMcp = {};
    for (const r of buildSiteRecords(inv, {})) if (r.ga4) fromMcp[r.ga4.property] = r.gsc ? r.gsc.siteUrl : null;
    assert.deepEqual(fromMcp, fromPortfolio);

    // The directory fed by what the portfolio stored (paired_with on each GA4 row).
    const dir = buildSiteDirectory({
        sites: inv.sites.map((s) => ({ siteUrl: s.siteUrl })),
        properties: inv.properties.map((p) => ({ property: p.property, displayName: p.displayName })),
        pairs: fromPortfolio,
    });
    assert.deepEqual(pairOf(dir), fromPortfolio);
    // The QA-08 case: Acme pairs with its own property, Creative Prints is GA4-only.
    assert.equal(fromPortfolio['properties/412300101'], 'sc-domain:acmeanalytics.example');
    assert.equal(fromPortfolio['properties/412300108'], null);
});

test('portfolio card slugs are the site directory route keys (QA-02: GA4-only cards resolve)', () => {
    const portfolio = buildDemoPortfolio({ range: '28d' });
    const inv = demoInventory();
    const pairs = {};
    for (const s of portfolio.sites) if (s.ga4) pairs[s.ga4.property] = s.gsc ? s.gsc.siteUrl : null;
    const dir = buildSiteDirectory({
        sites: inv.sites.map((s) => ({ siteUrl: s.siteUrl })),
        properties: inv.properties.map((p) => ({ property: p.property, displayName: p.displayName })),
        pairs,
    });
    const keyOf = (gscUrl, ga4) => dir.find((e) => (gscUrl ? e.gscSiteUrl === gscUrl : e.ga4PropertyId === ga4))?.host;
    for (const s of portfolio.sites) {
        assert.equal(keyOf(s.gsc?.siteUrl, s.ga4?.property), s.slug, `${s.label}: card slug ${s.slug}`);
    }
    assert.equal(portfolio.sites.find((s) => s.ga4?.property === 'properties/412300108').slug, 'ga4-412300108');
});

test('same-host order: the paired property keeps the plain key, then domain, then https', () => {
    const dir = buildSiteDirectory({
        sites: [{ siteUrl: 'http://a.com/' }, { siteUrl: 'sc-domain:a.com' }, { siteUrl: 'https://www.a.com/' }],
        properties: [{ property: 'properties/5', displayName: 'Something else' }],
        pairs: { 'properties/5': 'https://www.a.com/' },
    });
    const byUrl = Object.fromEntries(dir.filter((e) => e.gscSiteUrl).map((e) => [e.gscSiteUrl, e.host]));
    assert.deepEqual(byUrl, { 'https://www.a.com/': 'a.com', 'sc-domain:a.com': 'a.com--2', 'http://a.com/': 'a.com--3' });
});
