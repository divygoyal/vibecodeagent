/**
 * Round 9 geo views: schema, query shape per level, the region and city row helpers, the bundled city lookup
 * (Natural Earth, public domain) and the engine end to end against the demo Google.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/geo.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { demoAccessToken } from '@/lib/demo';
import { COUNTRIES } from '@/lib/demo/entities';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { compileWidget } from '@/lib/builder/compile';
import { countryName, allCountryCodes } from '@/lib/builder/countries';
import {
    admin1Url, bubbleRadius, bubbleView, countryTotals, declutterBubbles, decodeAdmin1, geoLevelOf, geoRows, matchRegions, PlaceIndex, placeBubbles, placeKey,
    regionKey, regionsOf, scaleBin, scaleColor, scaleThresholds, selectedCountry, visibleRegions, type Admin1File, type PlacesFile,
} from '@/lib/builder/geo';
import { regionLayout } from '@/components/dashboard-builder/widgets/GeoRegions';
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

// ── region shapes (Natural Earth admin-1, public domain, one file per country) ──

const admin1Dir = join(process.cwd(), 'public/geo/admin1');
const admin1 = (cc: string) => JSON.parse(readFileSync(join(admin1Dir, `${cc}.json`), 'utf8')) as Admin1File;

test('region shapes: one small file per country, the licence next to them, the url is only built for a country code', () => {
    const lic = readFileSync(join(admin1Dir, 'LICENSE-natural-earth.txt'), 'utf8');
    assert.match(lic, /public domain/i);
    assert.match(lic, /naturalearthdata\.com/);
    const files = readdirSync(admin1Dir).filter((f) => f.endsWith('.json'));
    assert.ok(files.length > 200, `${files.length} countries`);
    for (const f of files) assert.ok(statSync(join(admin1Dir, f)).size <= 150_000, `${f} is at most 150 KB`);
    assert.equal(admin1Url('US'), '/geo/admin1/US.json');
    assert.equal(admin1Url('../etc'), null);
    assert.equal(admin1Url('us'), null);
    assert.equal(admin1Url(''), null);
});

test('region shapes: the US file has all 50 states and DC, Alaska and Hawaii included, with closed rings and d3 winding', () => {
    const shapes = decodeAdmin1(admin1('US'));
    assert.equal(shapes.length, 51);
    const names = new Set(shapes.map((s) => s.name));
    for (const n of ['California', 'Alaska', 'Hawaii', 'Texas', 'District of Columbia']) assert.ok(names.has(n), n);
    for (const s of shapes) {
        assert.ok(s.coordinates.length >= 1, s.name);
        for (const poly of s.coordinates) for (const [i, ring] of poly.entries()) {
            assert.ok(ring.length >= 4, `${s.name} ring has 3 points and the closing one`);
            assert.deepEqual(ring[0], ring[ring.length - 1], `${s.name} ring closed`);
            let a = 0;
            for (let k = 0; k < ring.length - 1; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
            assert.ok(i === 0 ? a < 0 : a > 0, `${s.name} ring ${i}: exterior clockwise, holes counter-clockwise`);
        }
    }
    const ca = shapes.find((s) => s.name === 'California')!.coordinates.flat().flat();
    assert.ok(ca.every(([x, y]) => x < -114 && x > -125 && y > 32 && y < 43), 'California sits where California is');
});

test('region shapes: the names Google Analytics reports find their shape (merged and renamed regions included)', () => {
    const sample: Record<string, string[]> = {
        US: ['California', 'New York', 'Washington', 'District of Columbia'],
        GB: ['England', 'Scotland', 'Wales', 'Northern Ireland'],
        FR: ['Ile-de-France', 'Brittany', "Provence-Alpes-Côte d'Azur", 'Auvergne-Rhône-Alpes'],
        ES: ['Catalonia', 'Community of Madrid', 'Andalusia', 'Valencian Community'],
        IT: ['Lombardy', 'Lazio', 'Tuscany', 'Piedmont'],
        DE: ['Bavaria', 'Berlin', 'North Rhine-Westphalia', 'Baden-Württemberg'],
        IN: ['Maharashtra', 'Karnataka', 'Delhi', 'Tamil Nadu'],
        CA: ['Ontario', 'Quebec', 'British Columbia'],
        AU: ['New South Wales', 'Victoria', 'Western Australia'],
        BR: ['State of São Paulo', 'State of Rio de Janeiro', 'Minas Gerais'],
        JP: ['Tokyo', 'Osaka Prefecture', 'Hokkaido'],
        MX: ['Mexico City', 'Jalisco', 'Nuevo León'],
        PL: ['Masovian Voivodeship', 'Silesian Voivodeship'],
        RU: ['Moscow', 'Saint Petersburg', 'Krasnodar Krai'],
        CN: ['Guangdong', 'Beijing'],
        NL: ['North Holland', 'South Holland'],
    };
    for (const [cc, names] of Object.entries(sample)) {
        const m = matchRegions(decodeAdmin1(admin1(cc)), names.map((place) => ({ country: cc, place, value: 1 })));
        assert.deepEqual(m.unmatched.map((u) => u.place), [], cc);
        assert.equal(m.values.size, names.length, `${cc}: each name is its own shape`);
    }
});

test('region shapes: every region the demo data reports is on the map of its country', () => {
    const missing: string[] = [];
    for (const c of COUNTRIES) {
        if (!existsSync(join(admin1Dir, `${c.iso2}.json`))) continue;
        const shapes = decodeAdmin1(admin1(c.iso2));
        const m = matchRegions(shapes, c.cities.map(([, region]) => ({ country: c.iso2, place: region, value: 1 })));
        for (const u of m.unmatched) missing.push(`${u.place} (${c.iso2})`);
    }
    // City states have one shape or none: Singapore, Dubai and the like may be missing; the big countries must not be.
    for (const big of ['US', 'IN', 'GB', 'CA', 'DE', 'AU', 'FR', 'BR', 'ES', 'JP', 'MX', 'IT', 'PL', 'NL']) assert.ok(!missing.some((m) => m.endsWith(`(${big})`)), `${big}: ${missing.filter((m) => m.endsWith(`(${big})`)).join(', ')}`);
});

test('region names: accents, case, "State of" and "Prefecture" words do not matter; an unknown name is left unmatched', () => {
    assert.equal(regionKey('State of São Paulo'), regionKey('Sao Paulo'));
    assert.equal(regionKey('Osaka Prefecture'), regionKey('Ōsaka'));
    assert.equal(regionKey("Provence-Alpes-Côte d'Azur"), regionKey("Provence-Alpes-Côte-d'Azur"));
    assert.equal(regionKey('Masovian Voivodeship'), regionKey('Masovian'));
    assert.equal(regionKey('Region'), 'region', 'a name made only of such words keeps them');
    assert.notEqual(regionKey('Georgia'), regionKey('Gironde'));
    const shapes = [{ name: 'Lombardia', aliases: ['Lombardy'] }, { name: 'Lazio', aliases: [] }];
    const m = matchRegions(shapes, [{ country: 'IT', place: 'Lombardy', value: 3 }, { country: 'IT', place: 'Lombardia', value: 4 }, { country: 'IT', place: 'Atlantis', value: 1 }]);
    assert.equal(m.values.get(0), 7, 'two spellings of one region add up');
    assert.deepEqual(m.unmatched.map((u) => u.place), ['Atlantis']);
    assert.equal(m.shapeOf.get('Lombardy'), 0);
    // A name wins over another unit's alias.
    const n = matchRegions([{ name: 'A', aliases: ['B'] }, { name: 'B', aliases: [] }], [{ country: 'X', place: 'B', value: 1 }]);
    assert.deepEqual([...n.values.keys()], [1]);
});

test('region shapes: decoding tolerates a broken file; the colour scale is the country map\'s', () => {
    assert.deepEqual(decodeAdmin1(null), []);
    assert.deepEqual(decodeAdmin1({ v: 1, country: 'XX', q: 0, units: [] }), []);
    const { thresholds, max } = scaleThresholds([0, 10, 20, 30, 40, 50, 60, 70, 80, 90], 5);
    assert.equal(max, 90);
    assert.equal(thresholds.length, 4);
    assert.equal(scaleBin(5, thresholds, 5), 0);
    assert.equal(scaleBin(90, thresholds, 5), 4);
    assert.match(scaleColor('var(--c)', 0, 5), /var\(--c\) 18%/);
    assert.match(scaleColor('var(--c)', 4, 5), /var\(--c\) 100%/);
    assert.deepEqual(scaleThresholds([], 5), { thresholds: [0, 0, 0, 0], max: 0 });
});

test('region list: "Show all" reveals every region; layout gives the map the room and the list the rest', () => {
    const rows = Array.from({ length: 9 }, (_, i) => i);
    assert.deepEqual(visibleRegions(rows, 5, false), { shown: rows.slice(0, 5), rest: 4 });
    assert.deepEqual(visibleRegions(rows, 5, true), { shown: rows, rest: 0 });
    assert.deepEqual(visibleRegions(rows.slice(0, 4), 5, false), { shown: rows.slice(0, 4), rest: 0 });
    const wide = regionLayout({ width: 700, height: 340, map: true, want: 5, count: 9 });
    assert.equal(wide.kind, 'side');
    assert.equal(wide.mapH, 340, 'the map fills the card height');
    assert.ok(wide.mapW >= 220 && wide.mapW <= 400 && wide.mapW + 16 + wide.listW === 700);
    assert.ok(wide.fit >= 2 && wide.fit <= 5);
    const narrow = regionLayout({ width: 320, height: 420, map: true, want: 5, count: 9 });
    assert.equal(narrow.kind, 'stacked');
    assert.ok(narrow.mapH > 100 && narrow.mapH + 12 + narrow.listH === 420);
    assert.equal(regionLayout({ width: 320, height: 240, map: true, want: 5, count: 9 }).kind, 'list');
    const none = regionLayout({ width: 700, height: 340, map: false, want: 5, count: 9 });
    assert.equal(none.kind, 'list', 'no shapes: the list takes the whole width');
    assert.equal(none.listW, 700);
    // Everything fits: no room kept for a control.
    assert.equal(regionLayout({ width: 700, height: 340, map: false, want: 5, count: 3 }).fit, 3);
});

// ── city bubbles that overlap ──

test('city bubbles: cities on top of each other fold into one bubble that names them; the size is capped', () => {
    const b = (key: string, value: number, x: number, y: number) => ({ key, city: key, country: 'FR', value, x, y });
    const out = declutterBubbles([b('Paris', 100, 50, 50), b('Versailles', 10, 52, 51), b('Lyon', 40, 200, 200), b('Tiny', 1, 51, 49)], { maxPx: 14 });
    assert.equal(out.length, 2);
    const paris = out.find((c) => c.city === 'Paris')!;
    assert.deepEqual(paris.members.map((m) => m.city), ['Versailles', 'Tiny']);
    assert.equal(paris.value, 111);
    assert.ok(paris.r <= 14 && out.every((c) => c.r <= 14 && c.r >= 3));
    assert.equal(out.find((c) => c.city === 'Lyon')!.members.length, 0, 'far cities stay apart');
    assert.deepEqual(declutterBubbles([], { maxPx: 14 }), []);
    // The same input in a different order gives the same result.
    const rev = declutterBubbles([b('Tiny', 1, 51, 49), b('Lyon', 40, 200, 200), b('Versailles', 10, 52, 51), b('Paris', 100, 50, 50)], { maxPx: 14 });
    assert.deepEqual(rev.map((c) => [c.city, c.members.length]).sort(), out.map((c) => [c.city, c.members.length]).sort());
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
