// Unit tests for web/src/lib/format.ts: one block per row of DESIGN.md 6.4.
// Run: cd web && node --test tests/format.test.mjs   (Node 22.18+ strips TS types)
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    computeDelta,
    fmtAxis,
    fmtCompact,
    fmtDateRange,
    fmtDay,
    fmtDayLong,
    fmtDelta,
    fmtDeltaPoints,
    fmtDeltaPosition,
    fmtDuration,
    fmtFull,
    fmtPercent,
    fmtPosition,
    fmtValue,
    makeDateTickFormatter,
    toDate,
} from '../src/lib/format.ts';

test('fmtFull: Intl en-US', () => {
    assert.equal(fmtFull(1282), '1,282');
    assert.equal(fmtFull(503118), '503,118');
    assert.equal(fmtFull(0), '0');
    assert.equal(fmtFull(-4200), '-4,200');
    assert.equal(fmtFull(null), '–');
    assert.equal(fmtFull(undefined), '–');
    assert.equal(fmtFull(Number.NaN), '–');
});

test('fmtCompact: full under 10,000, else 3 significant digits + K/M/B', () => {
    assert.equal(fmtCompact(1282), '1,282');
    assert.equal(fmtCompact(9999), '9,999');
    assert.equal(fmtCompact(12345), '12.3K');
    assert.equal(fmtCompact(51800), '51.8K');
    assert.equal(fmtCompact(503118), '503K');
    assert.equal(fmtCompact(1240000), '1.24M');
    assert.equal(fmtCompact(10000), '10K'); // trailing .0 dropped
    assert.equal(fmtCompact(120000), '120K');
    assert.equal(fmtCompact(999950), '1M'); // rounds up into the next unit
    assert.equal(fmtCompact(2_500_000_000), '2.5B');
    assert.equal(fmtCompact(-51800), '-51.8K');
    assert.equal(fmtCompact(0), '0');
    assert.equal(fmtCompact(12.6), '13');
    assert.equal(fmtCompact(null), '–');
});

test('fmtAxis: compact, max 1 decimal', () => {
    assert.equal(fmtAxis(0), '0');
    assert.equal(fmtAxis(500), '500');
    assert.equal(fmtAxis(1000), '1K');
    assert.equal(fmtAxis(1500), '1.5K');
    assert.equal(fmtAxis(503000), '503K');
    assert.equal(fmtAxis(1500000), '1.5M');
    assert.equal(fmtAxis(1240000), '1.2M');
    assert.equal(fmtAxis(2.5), '2.5');
    assert.equal(fmtAxis(null), '–');
});

test('fmtPercent: CTR always 1 decimal, <0.1% for tiny, 0%, tiles round rates >= 10%', () => {
    assert.equal(fmtPercent(0.034), '3.4%');
    assert.equal(fmtPercent(0.0025), '0.3%');
    assert.equal(fmtPercent(0.0004), '<0.1%');
    assert.equal(fmtPercent(0), '0%');
    assert.equal(fmtPercent(0.05), '5.0%');
    assert.equal(fmtPercent(0.23), '23.0%');
    assert.equal(fmtPercent(0.05, { tile: true }), '5%');
    assert.equal(fmtPercent(0.4412), '44.1%');
    assert.equal(fmtPercent(0.4412, { tile: true }), '44%');
    assert.equal(fmtPercent(0.034, { tile: true }), '3.4%');
    assert.equal(fmtPercent(null), '–');
});

test('fmtPosition: 1 decimal', () => {
    assert.equal(fmtPosition(23.24), '23.2');
    assert.equal(fmtPosition(3), '3.0');
    assert.equal(fmtPosition(null), '–');
});

test('fmtDuration: 53s · 1m 56s · 2m 05s · 1h 04m', () => {
    assert.equal(fmtDuration(53), '53s');
    assert.equal(fmtDuration(116), '1m 56s');
    assert.equal(fmtDuration(125), '2m 05s');
    assert.equal(fmtDuration(3840), '1h 04m');
    assert.equal(fmtDuration(0), '0s');
    assert.equal(fmtDuration(59.6), '1m 00s');
    assert.equal(fmtDuration(null), '–');
});

test('fmtDelta: percent change, 1 decimal < 100, 0 decimals 100-999, >999%', () => {
    assert.equal(fmtDelta(12400, 10473), '▲ 18.4%');
    assert.equal(fmtDelta(1282, 2548), '▼ 49.7%');
    assert.equal(fmtDelta(274, 100), '▲ 174%');
    assert.equal(fmtDelta(20000, 10), '▲ >999%');
    assert.equal(fmtDelta(100, 0), 'new');
    assert.equal(fmtDelta(0, 0), '–');
    assert.equal(fmtDelta(10000, 10001), '0%'); // |change| < 0.05%
    assert.equal(fmtDelta(null, 5), '–');
});

test('rate deltas: percentage points', () => {
    assert.equal(fmtDeltaPoints(0.024, 0.025), '▼ 0.1 pt');
    assert.equal(fmtDeltaPoints(0.45, 0.4), '▲ 5 pt');
    assert.equal(fmtDeltaPoints(0.4, 0.4), '0 pt');
    const d = computeDelta(0.024, 0.025, { mode: 'points' });
    assert.equal(d.tone, 'bad');
    assert.equal(d.srText, 'down 0.1 percentage points');
});

test('position delta: absolute, 1 decimal, arrow = improvement', () => {
    assert.equal(fmtDeltaPosition(8.4, 8.8), '▲ 0.4'); // rank improved
    assert.equal(fmtDeltaPosition(23.2, 17.1), '▼ 6.1'); // rank got worse
    const better = computeDelta(8.4, 8.8, { mode: 'absolute', better: 'down' });
    assert.equal(better.direction, 'up');
    assert.equal(better.tone, 'good');
    const worse = computeDelta(23.2, 17.1, { mode: 'absolute', better: 'down' });
    assert.equal(worse.tone, 'bad');
    const flat = computeDelta(16.21, 16.19, { mode: 'absolute', better: 'down' });
    assert.equal(flat.state, 'flat');
    assert.equal(flat.text, '–');
    assert.equal(flat.srText, 'no change');
});

test('computeDelta: polarity, noise floor and screen-reader text', () => {
    const up = computeDelta(12400, 10473);
    assert.equal(up.direction, 'up');
    assert.equal(up.tone, 'good');
    assert.equal(up.text, '18.4%');
    assert.equal(up.srText, 'up 18.4 percent');
    const costUp = computeDelta(120, 100, { better: 'down' });
    assert.equal(costUp.tone, 'bad');
    const noisy = computeDelta(12, 6, { noiseFloor: 20 });
    assert.equal(noisy.tone, 'neutral');
    assert.equal(noisy.direction, 'up');
});

test('fmtValue dispatches by metric format', () => {
    assert.equal(fmtValue('count', 503118), '503,118');
    assert.equal(fmtValue('count', 503118, { compact: true }), '503K');
    assert.equal(fmtValue('percent', 0.034), '3.4%');
    assert.equal(fmtValue('position', 23.24), '23.2');
    assert.equal(fmtValue('duration', 116), '1m 56s');
});

test('fmtDateRange: en dash, year when not current or crossing years', () => {
    const now = new Date(Date.UTC(2026, 9, 26));
    assert.equal(fmtDateRange('2026-07-13', '2026-10-10', now), 'Jul 13 – Oct 10');
    assert.equal(fmtDateRange('2025-12-03', '2026-01-02', now), 'Dec 3, 2025 – Jan 2, 2026');
    assert.equal(fmtDateRange('2025-07-13', '2025-10-10', now), 'Jul 13 – Oct 10, 2025');
    assert.equal(fmtDateRange('2026-10-10', '2026-10-10', now), 'Oct 10');
    assert.equal(fmtDateRange('20260713', '20261010', now), 'Jul 13 – Oct 10');
});

test('date helpers are timezone-safe', () => {
    assert.equal(toDate('2026-10-13').toISOString(), '2026-10-13T00:00:00.000Z');
    assert.equal(fmtDay('2026-10-13'), 'Oct 13');
    assert.equal(fmtDayLong('2026-10-13'), 'Tue, Oct 13, 2026');
});

test('date axis ticks: short ranges by day, long ranges by month with year on Jan + first', () => {
    const short = makeDateTickFormatter(['2026-07-28', '2026-10-24']);
    assert.equal(short('2026-08-13', 1), 'Aug 13');
    const cross = makeDateTickFormatter(['2025-12-20', '2026-01-20']);
    assert.equal(cross('2025-12-20', 0), 'Dec 20, 2025');
    const long = makeDateTickFormatter(['2025-10-01', '2026-10-01']);
    assert.equal(long('2025-10-01', 0), 'Oct 2025');
    assert.equal(long('2025-11-01', 1), 'Nov');
    assert.equal(long('2026-01-01', 3), 'Jan 2026');
});
