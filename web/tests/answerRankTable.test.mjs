// Numbered-list tables in answers (# | Task | Page | ...): the "#" column is narrow and the page folds under the task on phones.
// Run: cd web && node --test tests/answerRankTable.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { isRankHeader, pageFoldColumn, analyzeTable } = await import('../src/lib/chat/answerFormat.ts');

test('rank headers', () => {
    for (const h of ['#', 'Rank', 'rank', 'No.', 'No']) assert.equal(isRankHeader(h), true, h);
    for (const h of ['Task', 'Site', '# of clicks', '']) assert.equal(isRankHeader(h), false, h);
});

test('the Ask task table folds its Page column under the task', () => {
    const header = ['#', 'Task', 'Page', 'Extra clicks a month'];
    const body = [
        ['1', 'Push "product analytics" onto the first page', '/blog/product-analytics-tools-compared', '+3,100'],
        ['2', 'Get /blog/cohort back into Google', '/blog/cohort-analysis', '+2,000'],
    ];
    const shape = analyzeTable(header, body);
    assert.equal(pageFoldColumn(header, shape.numeric), 2);
});

test('no fold without a rank column, without a page column, or with fewer than four columns', () => {
    assert.equal(pageFoldColumn(['Task', 'Page', 'Clicks', 'x'], [false, false, true, true]), -1);
    assert.equal(pageFoldColumn(['#', 'Task', 'Clicks', 'x'], [true, false, true, true]), -1);
    assert.equal(pageFoldColumn(['#', 'Task', 'Page'], [true, false, false]), -1);
});
