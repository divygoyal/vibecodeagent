/**
 * Round 9 geo views: schema, query shape per level, the region and city row helpers, the bundled city lookup
 * (Natural Earth, public domain) and the engine end to end against the demo Google.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/geo.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { COUNTRIES } from '@/lib/demo/entities';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { compileWidget } from '@/lib/builder/compile';
import { countryName, allCountryCodes } from '@/lib/builder/countries';
import {
    bubbleRadius, bubbleView, countryTotals, geoLevelOf, geoRows, PlaceIndex, placeBubbles, placeKey, regionsOf, selectedCountry, type PlacesFile,
} from '@/lib/builder/geo';
import { defaultWidget, widgetTitle } from '@/lib/builder/registry';
import { validateWidgets } from '@/lib/builder/schema';
import { widgetDimensions } from '@/lib/builder/searchType';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import type { ControlState, DataFrame, GeoWidget, WidgetDef } from '@/lib/builder/types';

const demoFetch = createDemoGoogleFetch();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => demoFetch(input, init)) as typeof fetch;

const TOKEN = demoAccessToken();
const ACME = 'acmeanalytics.example';
const state = (): ControlState => ({ date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'previous_period' } }, filters: {} });
const geo = (level: GeoWidget['config']['level'], over: Partial<GeoWidget['config']> = {}, id = 'w_geo'): GeoWidget => {
    const w = defaultWidget('geo', { families: { ga4: true, gsc: true } }, id) as GeoWidget;
    return { ...w, title: undefined, config: { ...w.config, level, ...over } };
};

const placesFile = (): PlacesFile => JSON.parse(readFileSync(join(process.cwd(), 'public/geo/places-50k.json'), 'utf8')) as PlacesFile;

// ── schema and registry ──

test('geo: levels validate; a country code must be alpha-2 upper case; the default is still the country map', () => {
    const d = defaultWidget('geo', { families: { ga4: true, gsc: true } }, 'w') as GeoWidget;
    assert.equal(d.config.level, 'country');
    for (const level of ['country', 'region', 'city'] as const) assert.equal(validateWidgets([geo(level)]).ok, true, level);
    assert.equal(validateWidgets([geo('region', { country: 'US' })]).ok, true);
    assert.equal(validateWidgets([geo('region', { country: 'usa' })]).ok, false);
    assert.equal(validateWidgets([geo('region', { country: 'us' })]).ok, false);
    assert.equal(validateWidgets([{ ...geo('city'), config: { ...geo('city').config, level: 'county' } }]).ok, false);
    assert.equal(geoLevelOf(undefined), 'country');
    assert.equal(geoLevelOf({ level: 'region' }), 'region');
    assert.equal(widgetTitle(geo('region')), 'Users by region');
    assert.equal(widgetTitle(geo('city')), 'Users by city');
    assert.equal(widgetTitle(geo('country', { metric: { id: 'ga4:sessions' } })), 'Sessions by country');
});

test('geo: the query asks for country + region or city, widens the row limit and skips comparison', () => {
    const q = (w: WidgetDef) => compileWidget(w, { controlDefs: [], controls: state() }).queries[0];
    assert.deepEqual(q(geo('country')).dimensions, ['country']);
    assert.equal(q(geo('country')).limit, 300);
    assert.equal(q(geo('country')).compare, true, 'the country map keeps today\'s query');
    assert.deepEqual(q(geo('region')).dimensions, ['country', 'region']);
    assert.deepEqual(q(geo('city')).dimensions, ['country', 'city']);
    assert.equal(q(geo('city')).limit, 1000);
    assert.equal(q(geo('city')).compare, false);
    assert.deepEqual(widgetDimensions(geo('region')), ['country', 'region']);
    assert.deepEqual(widgetDimensions(geo('city')), ['country', 'city']);
    assert.deepEqual(widgetDimensions(geo('country')), ['country']);
});

// ── rows ──

const frame = (rows: Array<[string, string, number | null]>, level: 'region' | 'city'): DataFrame => ({
    columns: [{ id: 'd:country', kind: 'dimension', label: 'Country' }, { id: `d:${level}`, kind: 'dimension', label: level }, { id: 'm:ga4:activeUsers', kind: 'metric', label: 'Active users' }],
    rows: rows.map(([c, p, v]) => ({ 'd:country': c, [`d:${level}`]: p, 'm:ga4:activeUsers': v })),
});

test('geo rows: (not set) and empty rows are set aside, countries and regions rank by value', () => {
    const f = frame([['US', 'California', 50], ['US', 'Texas', 30], ['US', '(not set)', 9], ['IN', 'Karnataka', 40], ['IN', 'Delhi', 5], ['DE', 'Berlin', 0], ['DE', 'Bavaria', null], ['BR', '', 3]], 'region');
    const { rows, notSet } = geoRows(f, 'region', 'ga4:activeUsers');
    assert.equal(rows.length, 4);
    assert.equal(notSet, 12);
    const totals = countryTotals(rows);
    assert.deepEqual(totals.map((t) => [t.code, t.value]), [['US', 80], ['IN', 45]]);
    assert.equal(selectedCountry(undefined, totals), 'US', 'the top country');
    assert.equal(selectedCountry('IN', totals), 'IN', 'the owner\'s pick');
    assert.equal(selectedCountry('JP', totals), 'US', 'a pick with no data falls back to the top country');
    assert.equal(selectedCountry(undefined, []), null);
    assert.deepEqual(regionsOf(rows, 'US').map((r) => r.place), ['California', 'Texas']);
    assert.deepEqual(geoRows(undefined, 'city', 'ga4:activeUsers'), { rows: [], notSet: 0 });
});

// ── the city lookup (Natural Earth, public domain) ──

test('city lookup: the bundled file is the public-domain Natural Earth cut and its licence is shipped with it', () => {
    const dir = join(process.cwd(), 'public/geo');
    assert.ok(existsSync(join(dir, 'LICENSE-natural-earth.txt')));
    const lic = readFileSync(join(dir, 'LICENSE-natural-earth.txt'), 'utf8');
    assert.match(lic, /public domain/i);
    assert.match(lic, /naturalearthdata\.com/);
    const file = placesFile();
    assert.match(file.source, /Natural Earth/);
    assert.match(file.source, /public domain/i);
    assert.ok(file.places.length > 3000 && file.places.length < 6000);
    assert.ok(statSync(join(dir, 'places-50k.json')).size < 250_000, 'small enough to load only for a city map');
    for (const [name, iso, lat, lng, pop] of file.places) {
        assert.ok(name && /^[A-Z]{2}$/.test(iso), `${name} ${iso}`);
        assert.ok(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180, name);
        assert.ok(pop >= 50000, name);
    }
});

test('city lookup: names match without accents or case, by country, with the spellings Google uses', () => {
    const idx = new PlaceIndex(placesFile());
    assert.ok(idx.size > 4000);
    assert.equal(placeKey('São Paulo'), placeKey('sao  paulo'));
    for (const [country, city] of [['IN', 'Bangalore'], ['IN', 'Bengaluru'], ['IN', 'Mumbai'], ['IN', 'Delhi'], ['BR', 'São Paulo'], ['BR', 'Sao Paulo'], ['CH', 'Zurich'], ['CH', 'Zürich'], ['US', 'New York'], ['US', 'San Francisco'], ['MX', 'Mexico City'], ['GB', 'London'], ['DE', 'Munich'], ['DE', 'Berlin'], ['SG', 'Singapore'], ['CA', 'Montreal'], ['AU', 'Sydney']] as const) {
        const p = idx.find(country, city);
        assert.ok(p, `${city} ${country}`);
        assert.equal(p!.country, country);
    }
    const london = idx.find('GB', 'London')!;
    const londonOn = idx.find('CA', 'London')!;
    assert.ok(Math.abs(london.lat - 51.5) < 1 && Math.abs(london.lng + 0.1) < 1.5, 'London, England');
    assert.ok(Math.abs(londonOn.lat - 43) < 1 && londonOn.lng < -80, 'London, Ontario is a different place');
    assert.equal(idx.find('US', 'Atlantis'), null);
    assert.equal(idx.find('US', '(not set)'), null);
    assert.equal(idx.find('', 'London'), null);
    assert.equal(idx.find('FR', 'New York'), null, 'a city only matches inside its own country');
});

test('city lookup: every city the demo data reports is placed on the map', () => {
    const idx = new PlaceIndex(placesFile());
    const missing: string[] = [];
    for (const c of COUNTRIES) for (const [city] of c.cities) if (!idx.find(c.iso2, city)) missing.push(`${city} (${c.iso2})`);
    assert.deepEqual(missing, []);
});

test('city bubbles: placed cities become bubbles, unknown ones stay in the list; radius and view follow the data', () => {
    const idx = new PlaceIndex(placesFile());
    const { bubbles, missing } = placeBubbles([
        { country: 'US', place: 'New York', value: 10 }, { country: 'US', place: 'Tinyville', value: 2 }, { country: 'IN', place: 'Bangalore', value: 5 },
    ], idx);
    assert.deepEqual(bubbles.map((b) => b.city), ['New York', 'Bangalore']);
    assert.deepEqual(missing.map((m) => m.place), ['Tinyville']);
    assert.ok(bubbleRadius(100, 100) > bubbleRadius(25, 100) && bubbleRadius(25, 100) > bubbleRadius(1, 100));
    assert.equal(bubbleRadius(0, 100), 3);
    assert.equal(bubbleRadius(5, 0), 3);
    assert.equal(bubbleView(bubbles), null, 'New York and Bangalore: the world');
    const us = placeBubbles([{ country: 'US', place: 'New York', value: 1 }, { country: 'US', place: 'Chicago', value: 1 }, { country: 'US', place: 'Los Angeles', value: 1 }], idx).bubbles;
    const box = bubbleView(us)!;
    assert.ok(box && box.west < -118 && box.east > -74 && box.south < 34 && box.north > 41, 'a padded box around the US cities');
    assert.equal(bubbleView([]), null);
    assert.ok(allCountryCodes().includes('US') && countryName('US') === 'United States');
});

// ── the engine end to end (demo Google) ──

const run = (w: WidgetDef) => evaluateWidgets({ widgets: [{ widget: w }], defaultSource: { type: 'site', siteId: ACME }, controlDefs: [], controls: state() }, { userId: 'u1', getToken: async () => TOKEN, mode: 'owner' });

test('geo engine: the region view gets country + region rows, the city view country + city rows', async () => {
    clearBuilderCache();
    const rr = (await run(geo('region'))).results.w_geo;
    assert.equal(rr.status, 'ok');
    if (rr.status === 'ok') {
        const { rows, notSet } = geoRows(rr.parts.rows, 'region', 'ga4:activeUsers');
        assert.ok(rows.length > 5, 'regions');
        assert.ok(rows.every((r) => /^[A-Z]{2}$/.test(r.country)), 'country codes, not names');
        const top = countryTotals(rows)[0];
        assert.ok(regionsOf(rows, top.code).length >= 1);
        assert.ok(notSet >= 0);
    }
    const cr = (await run(geo('city', {}, 'w_city'))).results.w_city;
    assert.equal(cr.status, 'ok');
    if (cr.status === 'ok') {
        const { rows } = geoRows(cr.parts.rows, 'city', 'ga4:activeUsers');
        const idx = new PlaceIndex(placesFile());
        const { bubbles, missing } = placeBubbles(rows, idx);
        assert.ok(bubbles.length >= 10, 'bubbles');
        assert.equal(missing.length, 0, `unplaced: ${missing.map((m) => m.place).join(', ')}`);
    }
});

test('geo engine: Search Console has no regions or cities, so those views say so instead of showing nothing', async () => {
    clearBuilderCache();
    const w = geo('region', { metric: { id: 'gsc:clicks' } });
    const r = (await run(w)).results.w_geo;
    assert.equal(r.status, 'error');
    if (r.status === 'error') {
        assert.equal(r.code, 'INCOMPATIBLE');
        assert.match(r.message, /Region/);
    }
});

test('geo engine: the original country map is unchanged', async () => {
    clearBuilderCache();
    const r = (await run(geo('country', {}, 'w_c'))).results.w_c;
    assert.equal(r.status, 'ok');
    if (r.status === 'ok') {
        assert.deepEqual(r.parts.rows.columns.map((c) => c.id).filter((id) => id.startsWith('d:')), ['d:country']);
        assert.ok(r.parts.rows.rows.length > 5);
    }
});
