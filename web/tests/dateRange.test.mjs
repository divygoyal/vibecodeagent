// Unit tests for web/src/lib/dateRange.ts. Run: cd web && node --test tests/
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    compareSuffix,
    fromLegacyRange,
    normalizeDateRange,
    resolveDateRange,
    toLegacyRange,
} from '../src/lib/dateRange.ts';

const now = new Date(Date.UTC(2026, 9, 26, 15)); // Oct 26 2026

test('rolling day presets end today (GA4) or after the lag (GSC)', () => {
    assert.deepEqual(resolveDateRange({ preset: '28d', compare: 'prev' }, { now }), {
        start: '2026-09-29', end: '2026-10-26', days: 28, prevStart: '2026-09-01', prevEnd: '2026-09-28',
    });
    const gsc = resolveDateRange({ preset: '7d', compare: 'none' }, { now, lagDays: 2 });
    assert.equal(gsc.start, '2026-10-18');
    assert.equal(gsc.end, '2026-10-24');
    assert.equal(gsc.prevStart, null);
});

test('month presets use calendar months', () => {
    const r = resolveDateRange({ preset: '3m', compare: 'yoy' }, { now, lagDays: 2 });
    assert.equal(r.start, '2026-07-25');
    assert.equal(r.end, '2026-10-24');
    assert.equal(r.prevStart, '2025-07-25');
    assert.equal(r.prevEnd, '2025-10-24');
    const lm = resolveDateRange({ preset: 'last_month', compare: 'prev' }, { now });
    assert.equal(lm.start, '2026-09-01');
    assert.equal(lm.end, '2026-09-30');
    assert.equal(lm.prevEnd, '2026-08-31');
});

test('custom ranges and normalisation', () => {
    const v = normalizeDateRange({ range: 'custom', from: '2026-09-01', to: '2026-09-10', compare: 'none' });
    assert.deepEqual(v, { preset: 'custom', compare: 'none', from: '2026-09-01', to: '2026-09-10' });
    assert.equal(resolveDateRange(v, { now }).days, 10);
    assert.deepEqual(normalizeDateRange({ range: 'custom', from: 'x' }), { preset: '3m', compare: 'prev' });
    assert.deepEqual(normalizeDateRange({ range: '30d' }), { preset: '28d', compare: 'prev' });
    assert.deepEqual(normalizeDateRange({ range: 'bogus', compare: 'yoy' }), { preset: '3m', compare: 'yoy' });
});

test('legacy mapping round trips the common keys', () => {
    assert.equal(toLegacyRange('28d'), '30d');
    assert.equal(toLegacyRange('3m'), '90d');
    assert.equal(toLegacyRange('16m'), '12m');
    assert.equal(fromLegacyRange('90d'), '3m');
    assert.equal(fromLegacyRange('nope'), null);
    for (const p of ['7d', '28d', '3m', '6m', '12m', 'this_month', 'last_month']) {
        assert.equal(fromLegacyRange(toLegacyRange(p)), p);
    }
});

test('compare suffix copy', () => {
    assert.equal(compareSuffix({ preset: '3m', compare: 'prev' }), 'vs previous 3 months');
    assert.equal(compareSuffix({ preset: '28d', compare: 'yoy' }), 'vs same period last year');
    assert.equal(compareSuffix({ preset: '28d', compare: 'none' }), '');
});
