// Stable ids and canonical slugs for leaderboard profiles (live-now poll, profile redirect).
// Run: cd web && node --test tests/leaderboardCanonical.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { canonicalSegment, canonicalRedirect } = await import('../src/lib/leaderboard/canonical.ts');

test('canonical segment is the slug, or the id when there is none', () => {
    assert.equal(canonicalSegment({ id: 7, slug: 'acme' }), 'acme');
    assert.equal(canonicalSegment({ id: 7, slug: null }), '7');
});

test('an id or another spelling redirects to the current slug; the canonical one does not', () => {
    assert.equal(canonicalRedirect('7', { id: 7, slug: 'acme' }), 'acme');
    assert.equal(canonicalRedirect('acme', { id: 7, slug: 'acme' }), null);
    assert.equal(canonicalRedirect('7', { id: 7, slug: null }), null);
});
