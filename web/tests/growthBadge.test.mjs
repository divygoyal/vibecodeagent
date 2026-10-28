// "Verified traffic · N visitors/mo" badge: eligibility, number rounding, privacy, snippets.
// Run: cd web && node --test tests/growthBadge.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { badgeEligible, trafficBadgeNumber, trafficBadgeText, trafficBadgeSvg } = await import('../src/lib/leaderboard/trafficBadge.ts');
const { badgeSnippets, badgeProfileUrl } = await import('../src/lib/leaderboard/badgeSnippets.ts');

const ver = (over = {}) => ({ level: 'owner', label: 'Verified owner (Search Console)', ga4_connected: true, ranked: true, checked_at: '2026-10-27T00:00:00Z', ...over });
const payload = (over = {}) => ({
    id: 7, slug: 'acme', name: 'Secret Startup Name', logo_url: 'https://x.example/l.png', website_url: 'https://acme.example', category: 'SaaS',
    verification: ver(), range: '28d', visitors: { mode: 'exact', value: 12345, delta_pct: 4 }, clicks: { mode: 'exact', value: 999, delta_pct: 1 },
    spark: null, rank_overall: 3, rank_category: 1, live_enabled: false, updated_at: '2026-10-27T00:00:00Z', ...over,
});

test('only verified, ranked profiles are eligible', () => {
    assert.equal(badgeEligible(payload()), true);
    assert.equal(badgeEligible(payload({ verification: ver({ ranked: false }) })), false);
    assert.equal(badgeEligible(payload({ verification: ver({ level: 'ga4' }) })), false);
    assert.equal(badgeEligible(payload({ verification: ver({ level: 'none', ranked: false }) })), false);
    assert.equal(badgeEligible(null), false);
});

test('the number is rounded like the profile (3 significant digits) and shows a band for ranges', () => {
    const n = (value) => trafficBadgeNumber({ visitors: { mode: 'exact', value, delta_pct: null } });
    assert.equal(n(12345), '12.3K');
    assert.equal(n(8420), '8,420');
    assert.equal(n(503118), '503K');
    assert.equal(n(999960), '1M');
    assert.equal(n(1_240_000), '1.24M');
    assert.equal(n(0), '0');
    assert.equal(trafficBadgeNumber({ visitors: { mode: 'range', label: '10K-50K', delta_pct: null } }), '10K-50K');
    assert.equal(trafficBadgeNumber({ visitors: null }), null);
});

test('text: number when shared, plain "Verified traffic" when not, nothing when ineligible', () => {
    const t = trafficBadgeText(payload(), 'TrafficClaw');
    assert.deepEqual([t.label, t.value, t.tail], ['Verified traffic', '12.3K', 'visitors/mo']);
    assert.match(t.title, /last 28 days/);
    const hidden = trafficBadgeText(payload({ visitors: null }), 'TrafficClaw');
    assert.deepEqual([hidden.label, hidden.value, hidden.tail], ['Verified traffic', '', 'on TrafficClaw']);
    assert.equal(trafficBadgeText(payload({ verification: ver({ ranked: false }) })), null);
    assert.equal(trafficBadgeText(null), null);
});

test('svg: both themes, valid, and no private data', () => {
    const light = trafficBadgeSvg({ data: payload(), theme: 'light' });
    const dark = trafficBadgeSvg({ data: payload(), theme: 'dark' });
    for (const svg of [light, dark]) {
        assert.match(svg, /^<\?xml/);
        assert.match(svg, /<svg [^>]*height="32"/);
        assert.match(svg, /Verified traffic/);
        assert.match(svg, /12\.3K/);
        assert.match(svg, /visitors\/mo/);
        // nothing about the site beyond the number: no name, host, clicks, rank, logo
        for (const secret of ['Secret Startup Name', 'acme.example', 'x.example', '999', 'SaaS', 'rank']) assert.equal(svg.includes(secret), false, secret);
        assert.equal((svg.match(/<svg/g) || []).length, 1);
    }
    assert.notEqual(light, dark);
    assert.match(light, /#ffffff/);
    assert.match(dark, /#15171c/);
});

test('svg: ineligible or unknown profile gets the neutral badge, not a number', () => {
    for (const data of [null, payload({ verification: ver({ ranked: false }) })]) {
        const svg = trafficBadgeSvg({ data, theme: 'light' });
        assert.match(svg, /Not listed on TrafficClaw/);
        assert.equal(/Verified traffic|12\.3K/.test(svg), false);
    }
});

test('svg: text is escaped (a band label cannot inject markup)', () => {
    const svg = trafficBadgeSvg({ data: payload({ visitors: { mode: 'range', label: '<b>&"1K', delta_pct: null } }), theme: 'light' });
    assert.equal(svg.includes('<b>'), false);
    assert.match(svg, /&lt;b&gt;&amp;&quot;1K/);
});

test('snippets link to the profile with ?ref=badge', () => {
    assert.equal(badgeProfileUrl('https://trafficclaw.com', 'acme'), 'https://trafficclaw.com/leaderboard/acme?ref=badge');
    const { html, md } = badgeSnippets({ origin: 'https://trafficclaw.com', slug: 'acme', imgUrl: 'https://trafficclaw.com/badge/acme.svg?theme=dark', alt: 'Verified traffic on TrafficClaw', height: 32 });
    assert.equal(html, '<a href="https://trafficclaw.com/leaderboard/acme?ref=badge" target="_blank" rel="noopener"><img src="https://trafficclaw.com/badge/acme.svg?theme=dark" alt="Verified traffic on TrafficClaw" height="32" /></a>');
    assert.equal(md, '[![Verified traffic on TrafficClaw](https://trafficclaw.com/badge/acme.svg?theme=dark)](https://trafficclaw.com/leaderboard/acme?ref=badge)');
});
