// Site pages' link pickers: every Search Console site / GA4 property, best match first. Run: cd web && node --test tests/linkCandidates.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { rankSearchConsoleSites, rankGa4Properties, scoreSearchConsoleSite, scoreGa4Property, GOOD_MATCH } = await import('../src/lib/sites/linkCandidates.ts');

const sites = [
    { siteUrl: 'sc-domain:zeta.example', permissionLevel: 'siteOwner' },
    { siteUrl: 'http://acme.example/', permissionLevel: 'siteOwner' },
    { siteUrl: 'sc-domain:acme.example', permissionLevel: 'siteOwner' },
    { siteUrl: 'https://www.acme.example/', permissionLevel: 'siteFullUser' },
    { siteUrl: 'https://acme.example/', permissionLevel: UNVERIFIED() },
    { siteUrl: 'https://docs.acme.example/', permissionLevel: 'siteOwner' },
    { siteUrl: 'https://puzzlehub.example/', permissionLevel: 'siteOwner' },
];
function UNVERIFIED() { return 'siteUnverifiedUser'; }

test('Search Console sites: host matches first (prefix, domain, http), both kinds listed, unverified last', () => {
    const r = rankSearchConsoleSites(sites, { host: 'www.acme.example', name: 'Acme' }).map((s) => s.siteUrl);
    assert.deepEqual(r.slice(0, 3), ['https://www.acme.example/', 'sc-domain:acme.example', 'http://acme.example/']);
    assert.equal(r.at(-1), 'https://acme.example/');
    assert.equal(r.length, sites.length);
});

test('Search Console sites: without a stream host the GA4 name decides', () => {
    const r = rankSearchConsoleSites(sites, { host: null, name: 'Puzzle Hub' });
    assert.equal(r[0].siteUrl, 'https://puzzlehub.example/');
    assert.ok(scoreSearchConsoleSite(r[0], { name: 'Puzzle Hub' }) < GOOD_MATCH);
    assert.equal(scoreSearchConsoleSite(sites[0], { name: 'Puzzle Hub' }), GOOD_MATCH);
});

test('GA4 properties: stream host covered by the site first, then the name, then A-Z', () => {
    const props = [
        { property: 'properties/3', displayName: 'Zebra' },
        { property: 'properties/2', displayName: 'Recipe Nest' },
        { property: 'properties/1', displayName: 'Main web', host: 'blog.recipenest.example' },
        { property: 'properties/4', displayName: 'Alpha' },
    ];
    assert.deepEqual(rankGa4Properties(props, 'sc-domain:recipenest.example').map((p) => p.property), ['properties/1', 'properties/2', 'properties/4', 'properties/3']);
    assert.equal(scoreGa4Property(props[0], 'sc-domain:recipenest.example'), GOOD_MATCH);
});
