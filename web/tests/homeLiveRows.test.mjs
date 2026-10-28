// Round 6 home page: the live product-tour rows. The sample transport (no network, no request context), the
// demo-bucket cache inside it, the Ask link through the demo, and the wiring (lazy chunks, static picture first).
// The full data builder (app report code + dashboard engine) is tested with tsx: tests/builder/homeLive.test.ts.
// Run: cd web && node --test tests/homeLiveRows.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { runWithSampleGoogle, scopedFetch, inSampleScope } = await import('../src/lib/demo/sampleScope.ts');
const { sampleGoogleFetch } = await import('../src/lib/demo/fetchShim.ts');
const { cachedFetch, apiCacheStats } = await import('../src/lib/apiCache.ts');
const { safeDemoTarget, DEMO_NOTES } = await import('../src/lib/publicDemo/config.ts');
const { demoHref } = await import('../src/components/marketing/home/demoLinks.ts');
const { searchFindingOf, trafficDriverReport, searchDriverReport } = await import('../src/components/site/chart/findingRules.ts');

const GA = 'https://analyticsdata.googleapis.com/v1beta/properties/412300101:runReport';
const REPORT = JSON.stringify({ dateRanges: [{ startDate: '2026-10-01', endDate: '2026-10-27' }], metrics: [{ name: 'sessions' }] });
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('outside the scope, scopedFetch is the global fetch; inside, the sample transport', async () => {
    assert.equal(inSampleScope(), false);
    assert.equal(scopedFetch(), globalThis.fetch);
    const marker = async () => new Response('{}');
    await runWithSampleGoogle(marker, async () => {
        assert.equal(inSampleScope(), true);
        assert.equal(scopedFetch(), marker);
        await new Promise((r) => setTimeout(r, 5));
        assert.equal(scopedFetch(), marker, 'kept across awaits');
    });
    assert.equal(scopedFetch(), globalThis.fetch);
});

test('the sample transport answers Google data from the generator and refuses everything else', async () => {
    const res = await sampleGoogleFetch(GA, { method: 'POST', headers: { authorization: 'Bearer demo-access:main' }, body: REPORT });
    assert.equal(res.status, 200);
    assert.ok((await res.json()).rows.length > 0);
    for (const url of ['https://example.com/', 'http://analyticsdata.googleapis.com/x', 'https://oauth2.googleapis.com/token', 'https://generativelanguage.googleapis.com/v1/models']) {
        await assert.rejects(() => sampleGoogleFetch(url, {}), /network disabled/, url);
    }
    // A real (non-demo) token is refused by the generator, never sent anywhere.
    const real = await sampleGoogleFetch(GA, { method: 'POST', headers: { authorization: 'Bearer ya29.real' }, body: REPORT });
    assert.ok(real.status >= 400);
});

test('inside the scope, lib/apiCache files entries in the demo bucket without reading request headers', async () => {
    const before = apiCacheStats('demo').entries;
    const mainBefore = apiCacheStats('main').entries;
    await runWithSampleGoogle(sampleGoogleFetch, () => cachedFetch(`home-sample-test:${Date.now()}`, 60_000, async () => ({ ok: 1 })));
    assert.equal(apiCacheStats('demo').entries, before + 1);
    assert.equal(apiCacheStats('main').entries, mainBefore);
});

test('the fix list Ask link opens Ask in the live demo with the question kept', () => {
    // askHref (components/site/SiteStates.tsx, JSX) builds exactly this URL.
    const prompt = '"product analytics software" ranks 17.2 on acmeanalytics.example with 52,113 impressions and 512 clicks. How do I get it onto page one?';
    const p = new URLSearchParams({ q: prompt, property: 'properties/412300101', site: 'sc-domain:acmeanalytics.example', __from: 'site:actions' });
    const inner = `/dashboard/ask?${p.toString()}`;
    const href = demoHref(inner);
    const to = new URL(href, 'http://x').searchParams.get('to');
    assert.equal(safeDemoTarget(to), inner, 'the demo lands on Ask with the question');
    assert.ok(to.length < 512);
});

test('the demo seed and the home Traffic row share one list of notes', () => {
    assert.equal(DEMO_NOTES.length, 3);
    assert.match(src('lib/publicDemo/seed.ts'), /for \(const n of DEMO_NOTES\)/);
    assert.match(src('components/marketing/home/homeLive.ts'), /DEMO_NOTES/);
});

test('finding rules are pure and match the hooks (driver reports, rate findings)', () => {
    assert.equal(trafficDriverReport('ai', true), 'referrers');
    assert.equal(trafficDriverReport('pageviews', true), 'pages');
    assert.equal(trafficDriverReport('users', false), null);
    assert.equal(searchDriverReport('clicks', true), 'pages');
    assert.equal(searchDriverReport('ctr', true), null);
    const f = searchFindingOf('position', { totals: { clicks: 1, impressions: 10, ctr: 0.1, position: 9 }, previous: { clicks: 1, impressions: 10, ctr: 0.1, position: 12 }, series: [], lastDate: null }, undefined, { compareOn: true, compareText: 'previous 28 days', siteHost: 'a.example' });
    assert.ok(f && /position/i.test(f.text));
    assert.match(src('components/site/chart/useFindings.ts'), /trafficFindingOf\(/);
});

test('live rows: static picture first, one lazy chunk per row, nothing from the app APIs', () => {
    const row = src('components/marketing/home/live/LiveRow.tsx');
    assert.match(row, /IntersectionObserver/);
    for (const k of ['SiteLive', 'TrafficLive', 'FixesLive', 'DashboardLive']) assert.match(row, new RegExp(`import\\('\\./${k}'\\)`));
    assert.match(row, /\{Live \? <Live data=\{data\} \/> : children\}/, 'children (the picture) until the chunk is in');
    const rows = src('components/marketing/home/FeatureRows.tsx');
    assert.match(rows, /<LiveRow kind="site" data=\{live\.site\} reserve=\{reserve\}>\{shot\}<\/LiveRow>/);
    assert.match(rows, /tourImages\.json/, 'the static pictures stay (placeholder, OG)');
    for (const f of ['SiteLive', 'TrafficLive', 'FixesLive', 'DashboardLive', 'parts']) {
        const s = src(`components/marketing/home/live/${f}.tsx`);
        assert.doesNotMatch(s, /fetch\(|useSWR|\/api\//, `${f} reads only its props`);
    }
    assert.match(src('components/marketing/home/live/FixesLive.tsx'), /nothing is saved/);
    assert.match(src('components/marketing/home/live/parts.tsx'), /Sample data/);
});
