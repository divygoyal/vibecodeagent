// Axis rules for every chart (components/charts/axis.ts, critique #2).
import assert from 'node:assert/strict';
import test from 'node:test';

import { dateTicks, niceAxis, niceStep } from '../src/components/charts/axis.ts';

function days(start, n, every = 1) {
    const t0 = Date.parse(`${start}T00:00:00Z`);
    return Array.from({ length: n }, (_, i) => new Date(t0 + i * every * 86_400_000).toISOString().slice(0, 10));
}

test('niceStep picks 1-2-5 steps', () => {
    assert.equal(niceStep(4500), 5000);
    assert.equal(niceStep(700), 1000);
    assert.equal(niceStep(300), 500);
    assert.equal(niceStep(0.1125), 0.2);
    assert.equal(niceStep(1), 1);
});

test('count axes land on round numbers', () => {
    assert.deepEqual(niceAxis(18_000), { domain: [0, 20_000], ticks: [0, 5000, 10_000, 15_000, 20_000] });
    assert.deepEqual(niceAxis(2800), { domain: [0, 3000], ticks: [0, 1000, 2000, 3000] });
    assert.deepEqual(niceAxis(1200).ticks, [0, 500, 1000, 1500]);
    assert.deepEqual(niceAxis(3).ticks, [0, 1, 2, 3]);
    assert.deepEqual(niceAxis(0).ticks, [0, 2, 4]);
    // Exactly on a step: no empty extra band.
    assert.deepEqual(niceAxis(20_000).domain, [0, 20_000]);
});

test('percent, duration and position axes', () => {
    assert.deepEqual(niceAxis(0.45, { format: 'percent' }).ticks, [0, 0.2, 0.4, 0.6]);
    assert.deepEqual(niceAxis(150, { format: 'duration' }).ticks, [0, 60, 120, 180]);
    const pos = niceAxis(18.4, { format: 'position' });
    assert.deepEqual(pos.ticks, [1, 5, 10, 15, 20]);
    assert.deepEqual(pos.domain, [1, 20]);
});

test('28 days: weekly ticks anchored on the last day', () => {
    const d = days('2026-09-29', 29); // Sep 29 .. Oct 27
    const t = dateTicks(d, { width: 1100 });
    assert.equal(t.at(-1), '2026-10-27');
    assert.deepEqual(t, ['2026-09-29', '2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']);
});

test('7 days: every day on desktop, every other day on a phone', () => {
    const d = days('2026-10-21', 7);
    assert.equal(dateTicks(d, { width: 1100 }).length, 7);
    const phone = dateTicks(d, { width: 300 });
    assert.deepEqual(phone, ['2026-10-21', '2026-10-23', '2026-10-25', '2026-10-27']);
});

test('3 months: every 14 days on desktop, fewer on a phone', () => {
    const d = days('2026-07-30', 90);
    const t = dateTicks(d, { width: 1100 });
    assert.equal(t.at(-1), d.at(-1));
    const gaps = t.slice(1).map((x, i) => (Date.parse(x) - Date.parse(t[i])) / 86_400_000);
    assert.ok(gaps.every((g) => g === 14), String(gaps));
    assert.ok(dateTicks(d, { width: 300 }).length <= 5);
});

test('12 months: month starts, thinned on narrow plots', () => {
    const d = days('2025-10-28', 365);
    const t = dateTicks(d, { width: 1100 });
    assert.ok(t.every((x) => x.endsWith('-01')), t.join());
    assert.equal(t.length, 12);
    const narrow = dateTicks(d, { width: 320 });
    assert.ok(narrow.length <= 5 && narrow.every((x) => x.endsWith('-01')), narrow.join());
});

test('weekly rows over 6 months: one tick per month start', () => {
    const d = days('2026-05-04', 26, 7);
    const t = dateTicks(d, { width: 1100 });
    const months = t.map((x) => x.slice(0, 7));
    assert.equal(new Set(months).size, t.length);
    assert.ok(t.length >= 5 && t.length <= 7, t.join());
    assert.ok(t.every((x) => Number(x.slice(8)) <= 7), t.join());
});
