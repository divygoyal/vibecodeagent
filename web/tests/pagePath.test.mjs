// Page paths in page lists (owner batch 3): "/ (home)" and middle shortening. Run: cd web && node --test tests/pagePath.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { pageLabel, splitPagePath } = await import('../src/components/site/lib/pagePath.ts');

test('the home page reads "/ (home)"', () => {
    assert.equal(pageLabel('/'), '/ (home)');
    assert.equal(pageLabel(''), '/ (home)');
    assert.equal(pageLabel('/pricing'), '/pricing');
    assert.equal(pageLabel('docs.acme.com'), 'docs.acme.com');
});

test('a path splits before its last segment, so the end stays visible', () => {
    assert.deepEqual(splitPagePath('/es/tools/ai-image/generator'), ['/es/tools/ai-image', '/generator']);
    assert.deepEqual(splitPagePath('docs.acme.com/start'), ['docs.acme.com', '/start']);
    assert.deepEqual(splitPagePath('/pricing'), ['/pricing', '']);
    assert.deepEqual(splitPagePath('/'), ['/ (home)', '']);
    assert.deepEqual(splitPagePath('/blog/'), ['/blog/', '']);
});

test('a page named in a sentence: "/" is the homepage, long paths are shortened', async () => {
    const { sentencePage } = await import('../src/components/site/lib/pagePath.ts');
    assert.equal(sentencePage('/'), 'the homepage');
    assert.equal(sentencePage(''), 'the homepage');
    assert.equal(sentencePage('/pricing'), '/pricing');
    assert.equal(sentencePage('/es/tools/ai/image/generator'), '/es/tools/ai/image/generator');
    assert.equal(sentencePage('/es/tools/ai/image/background/remover-for-products'), '/es/…/remover-for-products');
    assert.ok(sentencePage('/a/b/c/' + 'x'.repeat(60)).length <= 36);
});
