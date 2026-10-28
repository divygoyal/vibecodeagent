/**
 * Round 10 (fmt): number precision and delta wording, from the round 9 blind judge (defects-Y items 3, 4, 5, 10).
 * The catalog layer: a value and its comparison written together, one format per table column, the delta agreeing
 * with both, and the email digest and share cards using the same writers as the KPI tiles.
 *
 * Run: cd web && npx tsx --test tests/builder/format-r10.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { fmtMetricPair, fmtMetricValue, metricDeltaFor } from '@/lib/builder/catalog';

const KEY_RATE = 'ga4:sessionKeyEventRate';
const ENGAGEMENT = 'ga4:engagementRate';
const BOUNCE = 'ga4:bounceRate';
const POSITION = 'gsc:position';
const CTR = 'gsc:ctr';
const PER_USER = 'ga4:sessionsPerUser';
const TILE = { compact: true, tile: true } as const;

/** What the tile reads: value, "vs" figure and delta chip text, from the same catalog calls the Scorecard makes. */
function tile(id: string, cur: number, prev: number) {
    const p = fmtMetricPair(id, cur, prev, TILE);
    return `${p.value} ${metricDeltaFor(id, cur, prev).label} vs ${p.previous}`;
}

test('item 3: "Key event rate 2.6%  0 pt  vs 2.7%" now shows the decimals the delta needs', () => {
    assert.equal(tile(KEY_RATE, 0.0264, 0.0268), '2.64% ▼ 0.04 pt vs 2.68%');
    assert.equal(metricDeltaFor(KEY_RATE, 0.0264, 0.0268).tone, 'bad');
});

test('item 4: rates keep one decimal, so the equal-looking pairs of round 9 differ', () => {
    assert.equal(tile(ENGAGEMENT, 0.6522, 0.6551), '65.2% ▼ 0.3 pt vs 65.5%');
    assert.equal(tile(ENGAGEMENT, 0.3549, 0.35), '35.5% ▲ 0.5 pt vs 35.0%');
    assert.equal(tile(CTR, 0.0298, 0.0289), '3.0% ▲ 0.1 pt vs 2.9%');
    // "1.59 ▲0.2% vs 1.59": decimal ratios get a third decimal when the two would otherwise be equal.
    assert.equal(tile(PER_USER, 1.5902, 1.5871), '1.59 ▲ 0.2% vs 1.587');
    // A flat rate: equal values and no change.
    assert.equal(tile(ENGAGEMENT, 0.6522, 0.65221), '65.2% 0 pt vs 65.2%');
    // Equal at one decimal but 0.08 pt apart: two decimals.
    assert.equal(tile(ENGAGEMENT, 0.6516, 0.6524), '65.16% ▼ 0.08 pt vs 65.24%');
});

test('item 4 (counts): two compact values that would read the same fall back to full numbers', () => {
    const p = fmtMetricPair('ga4:sessions', 12_345, 12_320, TILE);
    assert.deepEqual(p, { value: '12,345', previous: '12,320' });
    assert.deepEqual(fmtMetricPair('ga4:sessions', 12_345, 20_320, TILE), { value: '12.3K', previous: '20.3K' });
});

test('a plain value is unchanged by the pair writer when nothing needs more digits', () => {
    assert.equal(fmtMetricValue(CTR, 0.0298, TILE), '3.0%');
    assert.equal(fmtMetricPair(CTR, 0.0298, null, TILE).value, '3.0%');
    assert.equal(fmtMetricPair('ga4:sessions', 1282, 1000, TILE).value, '1,282');
});

