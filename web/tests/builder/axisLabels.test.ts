/**
 * Round 8 judge fix: category axis width follows the longest label, long labels end in an ellipsis, the last
 * value tick has room.
 *
 * Run: cd web && npx --offline tsx --test tests/builder/axisLabels.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { AXIS_LABEL_GAP, AXIS_LAST_TICK_PAD, categoryAxisWidth, fitLabel, textWidth } from '@/lib/builder/axisLabels';

test('axis width fits the longest label (Washington is wider than 10 x 6.5 px) and is capped', () => {
    assert.ok(textWidth('Washington') >= 60, `${textWidth('Washington')}px for Washington`);
    const w = categoryAxisWidth(['Washington', 'Ohio', 'Texas']);
    assert.ok(w >= textWidth('Washington') + AXIS_LABEL_GAP);
    assert.equal(categoryAxisWidth(['x'.repeat(80)]), 150, 'capped');
    assert.equal(categoryAxisWidth([]), 56, 'a floor for empty axes');
    assert.ok(AXIS_LAST_TICK_PAD >= 20, 'half of "30K" (about 18px) fits right of the last tick');
});

test('fitLabel: unchanged when it fits, else an ellipsis within the width', () => {
    assert.equal(fitLabel('Ohio', 100), 'Ohio');
    const cut = fitLabel('Massachusetts Institute of Technology', 100);
    assert.ok(cut.endsWith('…') && textWidth(cut) <= 100, cut);
    assert.ok(cut.length > 3);
});
