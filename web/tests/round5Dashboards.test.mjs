// Round 5 stream D: portfolio naming, legend fit inputs, phone sizing. Run: cd web && node --test tests/round5Dashboards.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { buildDirectory, siteSubLabel, sourceLabel } = await import('../src/lib/builder/server/sources.ts');
const { buildFromTemplate } = await import('../src/lib/builder/templates.ts');
const { growsOnPhone } = await import('../src/lib/builder/registry.ts');

const inv = {
    properties: [
        { property: 'properties/1', displayName: 'Health Insights', streamUris: ['https://www.healthinsights.example'] },
        { property: 'properties/2', displayName: 'Creative Prints Shop', streamUris: ['https://creativeprints.example'] },
        { property: 'properties/3', displayName: 'Old app', streamUris: [] },
        { property: 'properties/4', displayName: 'Search Metrics – Marketing site', streamUris: ['https://searchmetrics.example'] },
    ],
    sites: [
        { siteUrl: 'https://www.healthinsights.example/' },
        { siteUrl: 'http://healthinsights.example/' },
        { siteUrl: 'sc-domain:searchmetrics.example' },
    ],
    errors: {},
};

test('builder sites are named by host: GA4-only by stream host, a second property by its variant, never its URL', () => {
    const dir = buildDirectory(inv);
    const label = (id) => dir.byId.get(id)?.label;
    assert.equal(label('healthinsights.example'), 'healthinsights.example');
    assert.equal(label('healthinsights.example--2'), 'healthinsights.example (http)');
    assert.equal(label('creativeprints.example'), 'creativeprints.example');
    assert.equal(dir.byId.get('creativeprints.example')?.ga4Name, 'Creative Prints Shop');
    // No stream host: the GA4 name is the only name there is.
    assert.equal(label('ga4-3'), 'Old app');
    assert.equal(sourceLabel({ type: 'site', siteId: 'creativeprints.example' }, dir), 'creativeprints.example');
    for (const s of dir.sites) assert.doesNotMatch(s.label, /https?:|sc-domain/);
});

test('siteSubLabel: the GA4 name only when it says more than the host', () => {
    assert.equal(siteSubLabel({ label: 'creativeprints.example', ga4Name: 'Creative Prints Shop' }), 'Creative Prints Shop');
    assert.equal(siteSubLabel({ label: 'searchmetrics.example', ga4Name: 'Search Metrics – Marketing site' }), 'Search Metrics – Marketing site');
    assert.equal(siteSubLabel({ label: 'puzzlehub.example', ga4Name: 'Puzzle Hub' }), undefined);
    assert.equal(siteSubLabel({ label: 'healthinsights.example (http)', ga4Name: 'Health Insights' }), undefined);
    assert.equal(siteSubLabel({ label: 'acme.com', ga4Name: 'Acme.com' }), undefined);
    assert.equal(siteSubLabel({ label: 'acme.com' }), undefined);
});

test('portfolio template: the site table lists every site by clicks, high to low; the cards show the biggest drops', () => {
    const doc = buildFromTemplate('portfolio', { name: 'P', defaultSource: { type: 'portfolio', include: 'all' } });
    const table = doc.widgets.w_sites;
    assert.equal(table.type, 'table');
    assert.deepEqual(table.config.sort, { by: 'm:gsc:clicks', dir: 'desc' });
    assert.ok(!table.config.sortByChange, 'a full list is not in change order');
    assert.equal(table.title, 'All sites');
    const grid = doc.widgets.w_grid;
    assert.equal(grid.config.limit, 6);
    assert.deepEqual(grid.config.sort, { by: 'change', dir: 'asc' });
    assert.notEqual(grid.title, table.title, 'two widgets, two names');
});

test('phones size list cards to their content, charts keep a fixed box', () => {
    const doc = buildFromTemplate('site-overview', { name: 'S', defaultSource: { type: 'site', siteId: 'acme.com' } });
    const byType = Object.values(doc.widgets).reduce((m, w) => ({ ...m, [w.title ?? w.type]: growsOnPhone(w) }), {});
    assert.equal(byType['Top pages'], true);
    assert.equal(byType.Devices, true);
    assert.equal(byType.Search, false);
    assert.equal(byType.Channels, false);
});
