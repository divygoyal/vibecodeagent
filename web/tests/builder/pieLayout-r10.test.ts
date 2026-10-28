/**
 * Round 10: one donut grouping rule at every card height (top 4 before "Other" when there are 5+ categories).
 * Run: cd web && npx --offline tsx --test tests/builder/pieLayout-r10.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MIN_PIE_SLICES, pieLayout } from '@/lib/builder/pieLayout';

test('pieLayout: a short card with a bottom legend keeps 5 slices by shrinking the donut', () => {
    for (const h of [200, 256, 300, 344, 420]) {
        const { size, maxSlices } = pieLayout(h, 340, true, 8);
        assert.ok(maxSlices >= MIN_PIE_SLICES, `h=${h}: ${maxSlices} slices`);
        assert.ok(size >= 72 && size <= 160);
    }
});

test('pieLayout: fewer categories than the minimum just show them all', () => {
    assert.equal(pieLayout(256, 340, true, 3).maxSlices, 3);
    assert.equal(pieLayout(256, 340, true, 4).maxSlices, 4);
});

test('pieLayout: tall cards may show 6 and the right-hand legend is always 6', () => {
    assert.equal(pieLayout(600, 340, true, 9).maxSlices, 6);
    assert.equal(pieLayout(200, 500, false, 9).maxSlices, 6);
});

test('pieLayout: the same height gives the same slice count whatever the category count above the minimum', () => {
    const a = pieLayout(256, 340, true, 6).maxSlices;
    const b = pieLayout(256, 340, true, 12).maxSlices;
    assert.equal(a, b);
});
