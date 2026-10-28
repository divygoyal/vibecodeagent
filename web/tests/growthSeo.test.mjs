// SEO / share-card odds and ends of round 8.
// Run: cd web && node --test tests/growthSeo.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const src = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('pricing: the discount box sits below the plan cards', () => {
    const page = src('app/(marketing)/pricing/page.tsx');
    assert.ok(page.indexOf('<PricingPlans />') > 0);
    assert.ok(page.indexOf('<DiscountBanner />') > page.indexOf('<PricingPlans />'));
});

test('llms.txt links the final advertise URL, not the old /sponsor redirect', () => {
    const llms = src('app/llms.txt/route.ts');
    assert.match(llms, /\/leaderboard\/advertise/);
    assert.doesNotMatch(llms, /\/sponsor\)/);
});

test('/demo has its own title and share card', () => {
    assert.match(src('app/(marketing)/demo/page.tsx'), /Live demo: 11 sample sites, no sign-in/);
    assert.match(src('app/(marketing)/demo/opengraph-image.tsx'), /Live demo: 11 sample sites, no sign-in/);
    // link-preview bots are served the static page (not the 307 into the app) by the middleware
    assert.match(src('middleware.ts'), /UNFURL_BOTS\.test\(ua\)/);
});

test('robots: /view and /share are crawlable for link previews but noindex; /embed stays blocked', () => {
    const robots = src('app/robots.ts');
    assert.doesNotMatch(robots, /'\/view\/'/);
    assert.doesNotMatch(robots, /'\/share\/'/);
    assert.match(robots, /'\/embed\/'/);
    assert.match(src('app/view/layout.tsx'), /index: false/);
    assert.match(src('app/share/layout.tsx'), /index: false/);
});

test('sitemap pages through the whole board', () => {
    const sm = src('app/sitemap.ts');
    assert.match(sm, /page <= 10/);
    assert.match(sm, /page_size: 100, page/);
});
