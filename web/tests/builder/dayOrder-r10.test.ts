/**
 * Round 10: "When visitors arrive" reads Monday to Sunday, not by volume.
 * Run: cd web && npx --offline tsx --test tests/builder/dayOrder-r10.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { mondayFirst } from '@/lib/builder/dayOrder';
import { buildFromTemplate } from '@/lib/builder/templates';

const days = (rows: Array<Record<string, string | number>>) => rows.map((r) => r['d:dayOfWeek']);

test('mondayFirst: names, abbreviations and digits all sort Monday to Sunday', () => {
    const names = ['Friday', 'Thursday', 'Sunday', 'Tuesday', 'Wednesday', 'Monday', 'Saturday'].map((d, i) => ({ 'd:dayOfWeek': d, 'm:ga4:sessions': 100 - i }));
    assert.deepEqual(days(mondayFirst(names, 'dayOfWeek')), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    const digits = [0, 6, 1, 3].map((d) => ({ 'd:dayOfWeek': String(d) }));
    assert.deepEqual(days(mondayFirst(digits, 'dayOfWeek')), ['1', '3', '6', '0']);
});

test('mondayFirst: other dimensions and unknown days are left alone', () => {
    const rows = [{ 'd:country': 'US' }, { 'd:country': 'DE' }];
    assert.equal(mondayFirst(rows, 'country'), rows);
    const mixed = [{ 'd:dayOfWeek': '(not set)' }, { 'd:dayOfWeek': 'Tue' }];
    assert.deepEqual(days(mondayFirst(mixed, 'dayOfWeek')), ['Tue', '(not set)']);
});

test('audience-geography: the weekday chart is ordered by the calendar', () => {
    const doc = buildFromTemplate('audience-geography', { name: 't', defaultSource: { type: 'site', siteId: 'x' } as never });
    const dow = doc.widgets.w_dow;
    assert.ok(dow && dow.type === 'bar');
    assert.deepEqual((dow as { config: { sort: unknown } }).config.sort, { by: 'dimension', dir: 'asc' });
});
