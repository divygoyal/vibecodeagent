// Table sort (components/ui/tableSort.ts, round 4 audit #1): empty values last in both directions.
import assert from 'node:assert/strict';
import test from 'node:test';

import { sortRows } from '../src/components/ui/tableSort.ts';

const rows = [
    { p: '/welcome', clicks: null },
    { p: '/', clicks: 6250 },
    { p: '/app/reports', clicks: undefined },
    { p: '/blog/a', clicks: 3299 },
    { p: '/app/dashboard', clicks: Number.NaN },
    { p: '/blog/b', clicks: 2265 },
    { p: '/zero', clicks: 0 },
];
const v = (r) => r.clicks;

test('descending: highest first, empty values last', () => {
    assert.deepEqual(sortRows(rows, v, 'desc').map((r) => r.p), ['/', '/blog/a', '/blog/b', '/zero', '/welcome', '/app/reports', '/app/dashboard']);
});

test('ascending: lowest first (0 is a value), empty values still last', () => {
    assert.deepEqual(sortRows(rows, v, 'asc').map((r) => r.p), ['/zero', '/blog/b', '/blog/a', '/', '/welcome', '/app/reports', '/app/dashboard']);
});

test('text sorts naturally; empty strings go last both ways', () => {
    const t = [{ n: 'Page 10' }, { n: '' }, { n: 'page 2' }, { n: 'Alpha' }, { n: null }];
    assert.deepEqual(sortRows(t, (r) => r.n, 'asc').map((r) => r.n), ['Alpha', 'page 2', 'Page 10', '', null]);
    assert.deepEqual(sortRows(t, (r) => r.n, 'desc').map((r) => r.n), ['Page 10', 'page 2', 'Alpha', '', null]);
});

test('stable for ties in both directions and does not mutate the input', () => {
    const t = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'c', v: 1 }, { k: 'd', v: 2 }];
    const copy = t.slice();
    assert.deepEqual(sortRows(t, (r) => r.v, 'desc').map((r) => r.k), ['b', 'd', 'a', 'c']);
    assert.deepEqual(sortRows(t, (r) => r.v, 'asc').map((r) => r.k), ['a', 'c', 'b', 'd']);
    assert.deepEqual(t, copy);
});
