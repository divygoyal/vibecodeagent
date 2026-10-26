// Pure leaderboard logic: Search Console ownership rules, fix-it steps, text helpers, badge SVG.
// Run: cd web && node --test tests/leaderboard.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { gscCoverage, buildFix, decideLevel, ga4StreamIsOwned } = await import('../src/lib/leaderboard/ownership.ts');
const { metricText, metricExact, deltaText, engagementText } = await import('../src/lib/leaderboard/format.ts');
const { badgeSvg } = await import('../src/lib/leaderboard/badgeSvg.ts');

const owner = (siteUrl) => ({ siteUrl, permissionLevel: 'siteOwner' });

test('domain property covers the host and its subdomains', () => {
    const r = gscCoverage([owner('sc-domain:example.com')], 'docs.example.com');
    assert.equal(r.ok, true);
    assert.equal(r.site.siteUrl, 'sc-domain:example.com');
});

test('URL-prefix property needs the same host (www ignored)', () => {
    assert.equal(gscCoverage([owner('https://www.example.com/')], 'example.com').ok, true);
    assert.equal(gscCoverage([owner('https://example.com/')], 'www.example.com').ok, true);
    const sub = gscCoverage([owner('https://example.com/')], 'blog.example.com');
    assert.equal(sub.ok, false);
    assert.equal(sub.reason, 'not_in_search_console');
});

test('only owner and full user prove ownership', () => {
    for (const permissionLevel of ['siteRestrictedUser', 'siteUnverifiedUser']) {
        const r = gscCoverage([{ siteUrl: 'sc-domain:example.com', permissionLevel }], 'example.com');
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'restricted_access');
        assert.equal(r.site.permissionLevel, permissionLevel);
    }
    assert.equal(gscCoverage([{ siteUrl: 'sc-domain:example.com', permissionLevel: 'siteFullUser' }], 'example.com').ok, true);
});

test('a lower-permission property does not hide an owner one; domain property is preferred', () => {
    const r = gscCoverage(
        [{ siteUrl: 'http://example.com/', permissionLevel: 'siteRestrictedUser' }, owner('https://example.com/'), owner('sc-domain:example.com')],
        'example.com',
    );
    assert.equal(r.ok, true);
    assert.equal(r.site.siteUrl, 'sc-domain:example.com');
});

test('an unrelated site never counts, even with a similar name', () => {
    const r = gscCoverage([owner('sc-domain:notexample.com'), owner('https://example.com.evil.test/')], 'example.com');
    assert.equal(r.ok, false);
    assert.equal(r.site, null);
});

test('fix-it steps say what to do for each failure', () => {
    const missing = buildFix({ expected_host: 'acme.com', gsc: { ok: false, reason: 'not_in_search_console', site_url: null, permission: null } });
    assert.match(missing[0], /Add acme\.com to Google Search Console/);
    assert.equal(missing.at(-1), 'Then press Re-check.');
    const restricted = buildFix({ expected_host: 'acme.com', gsc: { ok: false, reason: 'restricted_access', site_url: 'sc-domain:acme.com', permission: 'siteRestrictedUser' } });
    assert.match(restricted[0], /restricted access to sc-domain:acme\.com/);
    const mismatch = buildFix({ expected_host: 'acme.com', ga4: { ok: false, reason: 'host_mismatch', hosts: ['other.com'] } });
    assert.match(mismatch[0], /tracks other\.com, not acme\.com/);
    assert.deepEqual(buildFix({ expected_host: 'acme.com', gsc: { ok: true, reason: 'ok', site_url: 'x', permission: 'siteOwner' } }), []);
});

test('level: Search Console ownership ranks, unless GA4 says the numbers belong to another site', () => {
    const gscOk = { ok: true, reason: 'ok', site_url: 'sc-domain:acme.com', permission: 'siteOwner' };
    const gscNo = { ok: false, reason: 'not_in_search_console', site_url: null, permission: null };
    const ga4Ok = { ok: true, reason: 'ok', hosts: ['acme.com'] };
    assert.equal(decideLevel({ gsc: gscOk, ga4: ga4Ok }), 'owner');
    assert.equal(decideLevel({ gsc: gscOk }), 'owner');
    assert.equal(decideLevel({ gsc: gscNo, ga4: ga4Ok }), 'ga4');
    assert.equal(decideLevel({ gsc: gscNo, ga4: { ok: false, reason: 'host_mismatch', hosts: ['x.com'] } }), 'none');
    assert.equal(decideLevel({ gsc: gscNo }), 'none');
    // owner of acme.com whose GA4 property tracks other.com: the visitors are not acme.com's
    assert.equal(decideLevel({ gsc: gscOk, ga4: { ok: false, reason: 'host_mismatch', hosts: ['other.com'] } }), 'none');
    assert.equal(decideLevel({ gsc: gscOk, ga4: { ok: false, reason: 'no_web_stream', hosts: [] } }), 'none');
    // a property we could not read is not evidence against the owner
    assert.equal(decideLevel({ gsc: gscOk, ga4: { ok: false, reason: 'api_error', hosts: [] } }), 'owner');
});

test('a GA4 stream on a subdomain the verified property covers counts as a match', () => {
    const site = { siteUrl: 'sc-domain:acme.com', permissionLevel: 'siteOwner' };
    assert.equal(ga4StreamIsOwned(['app.acme.com'], site), true);
    assert.equal(ga4StreamIsOwned(['acme.com.evil.test'], site), false);
    assert.equal(ga4StreamIsOwned(['other.com'], site), false);
    assert.equal(ga4StreamIsOwned(['app.acme.com'], null), false);
    assert.equal(ga4StreamIsOwned(['app.acme.com'], { siteUrl: 'https://acme.com/', permissionLevel: 'siteOwner' }), false);
});

test('shared metrics read as the number or the band, never both', () => {
    assert.equal(metricText({ mode: 'exact', value: 12345, delta_pct: 1 }), '12.3K');
    assert.equal(metricExact({ mode: 'exact', value: 12345, delta_pct: 1 }), '12,345');
    assert.equal(metricText({ mode: 'range', label: '10K–50K', delta_pct: 4 }), '10K–50K');
    assert.equal(metricExact({ mode: 'range', label: '10K–50K', delta_pct: 4 }), null);
    assert.equal(metricText(null), null);
    assert.equal(deltaText(null), null);
    assert.match(deltaText(18.4), /18\.4%/);
    assert.equal(engagementText({ mode: 'range', label: '60–70%' }), '60–70%');
    assert.equal(engagementText(null), null);
});

const base = {
    id: 7, slug: 'acme-abc123', name: 'Acme & <Co>', logo_url: null, website_url: 'https://acme.com', category: 'SaaS',
    verification: { level: 'owner', label: 'Verified owner (Search Console)', ga4_connected: true, ranked: true, checked_at: null },
    range: '28d', visitors: { mode: 'exact', value: 12345, delta_pct: 12.5 }, clicks: null,
    spark: { metric: 'visitors', mode: 'exact', values: [1, 3, 2, 5, 4] }, rank_overall: 3, rank_category: 2, live_enabled: true, updated_at: null,
};

test('badge SVG escapes names, follows privacy and themes', () => {
    const svg = badgeSvg({ data: base, variant: 'stats', theme: 'light', liveUsers: null });
    assert.match(svg, /^<\?xml/);
    assert.ok(svg.includes('Acme &amp; &lt;Co&gt;'));
    assert.ok(!svg.includes('<Co>'));
    assert.ok(svg.includes('12.3K'));
    assert.ok(svg.includes('#ffffff'));
    const dark = badgeSvg({ data: base, variant: 'minimal', theme: 'dark' });
    assert.ok(dark.includes('#15171c'));
    const banded = badgeSvg({ data: { ...base, visitors: { mode: 'range', label: '10K–50K', delta_pct: 3 } }, variant: 'stats', theme: 'light' });
    assert.ok(banded.includes('10K–50K'));
    assert.ok(!banded.includes('12345') && !banded.includes('12.3K'));
    const hidden = badgeSvg({ data: { ...base, visitors: null, spark: null }, variant: 'stats', theme: 'light' });
    assert.ok(!hidden.includes('visitors / 28d'));
    assert.ok(hidden.includes('Verified owner (Search Console)'));
});

test('live badge shows the count only when the owner opted in', () => {
    assert.ok(badgeSvg({ data: base, variant: 'live', theme: 'light', liveUsers: 41 }).includes('41 online now'));
    assert.ok(!badgeSvg({ data: { ...base, live_enabled: false }, variant: 'live', theme: 'light', liveUsers: 41 }).includes('online now'));
    assert.ok(badgeSvg({ data: null, variant: 'live', theme: 'light' }).includes('Not listed'));
});
