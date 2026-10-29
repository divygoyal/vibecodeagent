// Portfolio subtitle: the "traffic to Oct 27, search to Oct 26" note needs sites. Run: cd web && node --test tests/portfolioSubtitle.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { windowsNote } = await import('../src/lib/portfolio/view.ts');
const windows = { traffic: { curEnd: '2026-10-27' }, search: { curEnd: '2026-10-26' } };

test('windows note is shown only when there are sites and the sources end on different days', () => {
    assert.equal(windowsNote({ sites: [{}], windows }), 'traffic to Oct 27, search to Oct 26');
    assert.equal(windowsNote({ sites: [], windows }), null);
    assert.equal(windowsNote(undefined), null);
    assert.equal(windowsNote({ sites: [{}], windows: { traffic: { curEnd: '2026-10-26' }, search: { curEnd: '2026-10-26' } } }), null);
    assert.equal(windowsNote({ sites: [{}], windows: { traffic: null, search: { curEnd: '2026-10-26' } } }), null);
});

const { splitSegments, subtitleSegments, endsWithDot } = await import('../src/lib/subtitleSegments.ts');

test('subtitle facts split at the dot and stay whole', () => {
    assert.deepEqual(splitSegments('19 open · about +16.5K clicks a month if you finish the top 5'), ['19 open', 'about +16.5K clicks a month if you finish the top 5']);
    assert.deepEqual(splitSegments('Traffic Sep 30 – Oct 27 · Search Sep 29 – Oct 26 · vs previous 28 days'), ['Traffic Sep 30 – Oct 27', 'Search Sep 29 – Oct 26', 'vs previous 28 days']);
    assert.deepEqual(splitSegments(''), []);
    assert.deepEqual(splitSegments('no dots here'), ['no dots here']);
});

test('segments from strings and nodes, empty facts dropped', () => {
    const node = { node: true };
    assert.deepEqual(subtitleSegments(['a · b', undefined, node, false, 'c']), ['a', 'b', node, 'c']);
});

test('only the last fact has no dot after it', () => {
    assert.deepEqual([0, 1, 2].map((i) => endsWithDot(i, 3)), [true, true, false]);
    assert.equal(endsWithDot(0, 1), false);
});
