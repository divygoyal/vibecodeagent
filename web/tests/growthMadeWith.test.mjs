// "Made with TrafficClaw" footer: link per kind, and the owner's switches.
// Run: cd web && node --test tests/growthMadeWith.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const { madeWithUrl, madeWithVisible, shareMadeWithVisible } = await import('../src/lib/growth/madeWith.ts');

test('the link goes to the home page with ?ref=<kind> and utm tags', () => {
    for (const kind of ['share', 'embed', 'view']) {
        const u = new URL(madeWithUrl(kind));
        assert.equal(u.origin + u.pathname, 'https://trafficclaw.com/');
        assert.equal(u.searchParams.get('ref'), kind);
        assert.equal(u.searchParams.get('utm_source'), 'trafficclaw');
        assert.equal(u.searchParams.get('utm_medium'), 'made-with');
        assert.equal(u.searchParams.get('utm_campaign'), kind);
    }
    assert.equal(new URL(madeWithUrl('view', 'https://example.test/')).origin, 'https://example.test');
});

test('on by default; either of the owner switches hides it (dashboards)', () => {
    assert.equal(madeWithVisible(undefined, undefined), true);
    assert.equal(madeWithVisible(true, true), true);
    assert.equal(madeWithVisible(false, true), false);
    assert.equal(madeWithVisible(true, false), false);
    assert.equal(madeWithVisible(null, null), true);
});

test('/share pages follow branding.showWatermark, default on', () => {
    assert.equal(shareMadeWithVisible(undefined), true);
    assert.equal(shareMadeWithVisible({}), true);
    assert.equal(shareMadeWithVisible({ showWatermark: true }), true);
    assert.equal(shareMadeWithVisible({ showWatermark: false }), false);
});

test('every public surface uses the switch and the right kind', () => {
    const src = path.resolve(import.meta.dirname, '../src');
    const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');
    // /view and /embed/d: the API folds both switches into share.badge; the viewer picks view or embed.
    assert.match(read('app/api/dashboards/public/[token]/route.ts'), /madeWithVisible\(rec\.share\.badge, rec\.doc\.theme\.badge\.show\)/);
    assert.match(read('app/view/[token]/PublicDashboard.tsx'), /kind=\{embed \? 'embed' : 'view'\}/);
    // /share: all three layouts and the events report read the config switch.
    const page = read('app/share/[token]/page.tsx');
    assert.match(page, /shareMadeWithVisible\(share\.config\.branding\)/);
    assert.equal((page.match(/showMadeWith/g) || []).length >= 4, true);
    assert.match(read('components/share-overview/openpanel/SharedOverviewClient.tsx'), /shareMadeWithVisible\(branding\)/);
    assert.match(read('app/share/[token]/events/page.tsx'), /showMadeWith=\{shareMadeWithVisible/);
});
