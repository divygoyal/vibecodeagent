// Round 4 polish: wording and labels the blind judge flagged. Run: cd web && node --test tests/round4Polish.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { strikingTitle } = await import('../src/components/site/lib/rules.ts');
const { eventDisplayName } = await import('../src/lib/eventNames.ts');

test('strikingTitle: page-one queries move into the top 5, the rest reach the first page', () => {
    assert.equal(strikingTitle('funnel analysis', 9.4), 'Move "funnel analysis" up into the top 5');
    assert.equal(strikingTitle('x', 10.4), 'Move "x" up into the top 5');
    assert.equal(strikingTitle('x', 10.5), 'Push "x" onto the first page');
    assert.equal(strikingTitle('product analytics', 16.6, ['“', '”']), 'Push “product analytics” onto the first page');
});

test('eventDisplayName: common GA4 events read as words, unknown snake_case is spelled out, other names stay', () => {
    assert.equal(eventDisplayName('page_view'), 'Page view');
    assert.equal(eventDisplayName('generate_lead'), 'Lead');
    assert.equal(eventDisplayName('cta_click'), 'CTA click');
    assert.equal(eventDisplayName('copy_code'), 'Copy code');
    assert.equal(eventDisplayName('pdf_download_started'), 'PDF download started');
    assert.equal(eventDisplayName('Purchase'), 'Purchase');
    assert.equal(eventDisplayName('(not set)'), '(not set)');
});
