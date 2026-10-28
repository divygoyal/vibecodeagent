/**
 * Round 10: friendly labels (new vs returning) and wrapped column labels.
 * Run: cd web && npx --offline tsx --test tests/builder/labels-r10.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { textWidth, wrapLabel } from '@/lib/builder/axisLabels';
import { friendlyDimValue } from '@/lib/builder/levelLabels';

test('newVsReturning: raw GA4 values become words', () => {
    assert.equal(friendlyDimValue('newVsReturning', 'new'), 'New visitors');
    assert.equal(friendlyDimValue('newVsReturning', 'returning'), 'Returning visitors');
    assert.equal(friendlyDimValue('newVsReturning', '(not set)'), 'Unknown');
    assert.equal(friendlyDimValue('country', '(not set)'), null);
});

test('wrapLabel: a short label stays on one line, a long one breaks at a space within the width', () => {
    assert.deepEqual(wrapLabel('Direct', 70), ['Direct']);
    const lines = wrapLabel('Organic Search', 60);
    assert.deepEqual(lines, ['Organic', 'Search']);
    for (const l of lines) assert.ok(textWidth(l) <= 60);
});

test('wrapLabel: never more than 2 lines, a last line that is still too long gets an ellipsis', () => {
    const lines = wrapLabel('Organic Social Media Marketing Channel', 60);
    assert.equal(lines.length, 2);
    assert.ok(lines[1].endsWith('…'));
    for (const l of lines) assert.ok(textWidth(l) <= 60, l);
    const one = wrapLabel('Supercalifragilisticexpialidocious', 60);
    assert.equal(one.length, 1);
    assert.ok(textWidth(one[0]) <= 60);
});
