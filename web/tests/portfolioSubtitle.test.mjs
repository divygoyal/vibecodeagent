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
