// Round 2 home page: social-proof thresholds and the "What to fix next" preview.
// Run: cd web && node --test tests/
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { PROOF_MIN, proofItems } = await import('../src/components/marketing/home/proof.ts');
const { buildMarketingDemoActions } = await import('../src/components/marketing/demo/data.ts');
const { RELEASES, HOME_HIGHLIGHTS } = await import('../src/components/marketing/changelog/entries.ts');

test('social proof is hidden below the thresholds and never invented', () => {
    assert.deepEqual(proofItems(null), []);
    assert.deepEqual(proofItems(undefined), []);
    // Live board on 2026-10-27: 6 listed, 0 owner-verified -> nothing.
    assert.deepEqual(proofItems({ listed: 6, verified: 0 }), []);
    assert.deepEqual(proofItems({ listed: PROOF_MIN.listed - 1, verified: PROOF_MIN.verified - 1 }), []);
});

test('each figure shows on its own once it clears its threshold', () => {
    const onlyListed = proofItems({ listed: PROOF_MIN.listed, verified: 3 });
    assert.deepEqual(onlyListed.map((p) => [p.key, p.value]), [['listed', PROOF_MIN.listed]]);
    const both = proofItems({ listed: 120, verified: 40 });
    assert.deepEqual(both.map((p) => [p.key, p.value]), [['listed', 120], ['verified', 40]]);
    assert.deepEqual(proofItems({ listed: Number.NaN, verified: 50 }).map((p) => p.key), ['verified']);
});

test('the Actions preview uses the app rules on sample data, ranked by gain', () => {
    const now = Date.UTC(2026, 9, 27, 12);
    const data = buildMarketingDemoActions('acme', 3, now);
    assert.ok(data, 'acme has Search Console data');
    assert.equal(data.site.slug, 'acme');
    assert.equal(data.actions.length, 3);
    for (const a of data.actions) {
        assert.ok(a.gain >= 3, 'tasks below 3 clicks a month are dropped, like the app');
        assert.ok(['striking', 'low_ctr'].includes(a.type));
        if (a.type === 'striking') {
            assert.match(a.title, /^Push “.+” onto the first page$/);
            assert.ok(a.position >= 8 && a.position <= 20, 'striking distance is position 8-20');
        }
    }
    const rank = { high: 3, medium: 2, low: 1 };
    for (let i = 1; i < data.actions.length; i++) {
        assert.ok(rank[data.actions[i - 1].impact] >= rank[data.actions[i].impact], 'impact first');
    }
    // Deterministic for the same day.
    assert.deepEqual(buildMarketingDemoActions('acme', 3, now), data);
});

test('a site without Search Console has no preview', () => {
    assert.equal(buildMarketingDemoActions('creativeprints', 3, Date.UTC(2026, 9, 27, 12)), null);
    assert.equal(buildMarketingDemoActions('no-such-site'), null);
});

test('changelog entries are dated, anchored and non-empty', () => {
    const ids = new Set();
    for (const r of RELEASES) {
        assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(!ids.has(r.id), `unique id ${r.id}`);
        ids.add(r.id);
        assert.ok(r.groups.length > 0 && r.groups.every((g) => g.items.length > 0));
    }
    assert.equal(HOME_HIGHLIGHTS.length, 3);
    for (const h of HOME_HIGHLIGHTS) assert.ok(ids.has(h.href.split('#')[1]), `${h.href} points at a release`);
});

// Round 3 home page: demo deep links, the theme rule, and the server data built from the demo generator.
const { demoHref } = await import('../src/components/marketing/home/demoLinks.ts');
const { resolveHomeTheme } = await import('../src/components/marketing/home/homeTheme.ts');
const { buildHomeData, HOME_RANGES } = await import('../src/components/marketing/home/homeData.ts');
const { getDemoSites } = await import('../src/lib/demo/catalog.ts');

test('demo deep links follow the /demo?to=<path> contract and stay readable', () => {
    assert.equal(demoHref(), '/demo?to=/dashboard');
    assert.equal(demoHref('/dashboard/s/acmeanalytics.example/actions'), '/demo?to=/dashboard/s/acmeanalytics.example/actions');
    // A query inside the target is encoded so it stays part of `to`.
    const href = demoHref('/dashboard/s/x/traffic?tab=realtime&r=1');
    assert.equal(new URL(href, 'https://t.example').searchParams.get('to'), '/dashboard/s/x/traffic?tab=realtime&r=1');
});

test('the home page theme: saved dark wins, saved light wins, otherwise the OS setting', () => {
    assert.equal(resolveHomeTheme('dark', false), 'dark');
    assert.equal(resolveHomeTheme('light', true), 'light');
    assert.equal(resolveHomeTheme(null, true), 'dark');
    assert.equal(resolveHomeTheme(null, false), 'light');
    assert.equal(resolveHomeTheme('system', true), 'dark');
    assert.equal(resolveHomeTheme('bogus', true), 'light');
});

test('home data: every range, a story with real numbers, tour links into the demo on catalogue hosts', () => {
    const now = Date.UTC(2026, 9, 27, 12);
    const { byRange, story, tour } = buildHomeData(now);
    assert.deepEqual(Object.keys(byRange).sort(), [...HOME_RANGES].sort());
    for (const r of HOME_RANGES) assert.ok(byRange[r].sites.length >= 8, `${r} has the sample sites`);

    assert.equal(story.sites.length, 4);
    for (let i = 1; i < story.sites.length; i++) assert.ok(story.sites[i - 1].clicks >= story.sites[i].clicks, 'sites by clicks');
    assert.ok(story.drop && story.drop.changePct < 0, 'a drop is flagged');
    assert.ok(story.fix && story.fix.gain > 0 && story.fix.title.length > 0, 'the drop comes with a fix');
    assert.match(story.fixHref, /^\/demo\?to=\/dashboard\/s\/[^/]+\/actions$/);

    const hosts = new Set(getDemoSites().map((s) => s.host.replace(/^www\./, '')));
    assert.ok(hosts.has(tour.host), 'tour host comes from the catalogue');
    assert.ok(byRange['28d'].sites.some((s) => s.slug === tour.slug), 'tour slug is a real app slug');
    for (const k of ['portfolio', 'site', 'fixes', 'traffic', 'dashboards', 'connectAi']) {
        assert.match(tour[k], /^\/demo\?to=\/dashboard(\/|$)/, `${k} deep-links into the demo`);
    }
    // Deterministic for the same day.
    assert.deepEqual(buildHomeData(now).story, story);
});
