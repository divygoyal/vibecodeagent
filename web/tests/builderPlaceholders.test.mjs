// Template prompts (lib/builder/placeholders.ts, round 4): hidden from viewers until edited.
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { brandCompanyName, hiddenForViewers, isPlaceholderMarkdown, PLACEHOLDER_TEXTS } = await import('../src/lib/builder/placeholders.ts');
const { buildFromTemplate, TEMPLATES } = await import('../src/lib/builder/templates.ts');

const all = TEMPLATES.map((t) => buildFromTemplate(t.id, { name: t.name, defaultSource: { type: 'site', siteId: 'x' } }));
const texts = all.flatMap((d) => Object.values(d.widgets)).filter((w) => w.type === 'text').map((w) => w.config.markdown);

test('every listed prompt is still shipped by a template', () => {
    for (const p of PLACEHOLDER_TEXTS) assert.ok(texts.includes(p), `not in any template: ${p.split('\n')[0]}`);
});

test('prompts hide; edited prompts, explanations and real text show', () => {
    assert.equal(isPlaceholderMarkdown(PLACEHOLDER_TEXTS[0]), true);
    assert.equal(isPlaceholderMarkdown(`${PLACEHOLDER_TEXTS[0]}  \n`), true);
    assert.equal(isPlaceholderMarkdown(PLACEHOLDER_TEXTS[0].replace('What went well this month', 'Clicks rose 15%')), false);
    const text = (markdown) => ({ id: 't', type: 'text', source: { type: 'default' }, config: { markdown, role: 'body', align: 'left', variables: true } });
    assert.equal(hiddenForViewers(text(PLACEHOLDER_TEXTS[1])), true);
    assert.equal(hiddenForViewers(text('   ')), true);
    assert.equal(hiddenForViewers(text('## Monthly report for {{site}}')), false);
    // Explanatory template text is content, not a prompt.
    const explained = texts.filter((t) => t.startsWith('### How to read this page'));
    assert.ok(explained.length && explained.every((t) => !isPlaceholderMarkdown(t)));
    const img = (src) => ({ id: 'i', type: 'image', source: { type: 'default' }, config: { src, alt: '', fit: 'contain', radius: 'md' } });
    assert.equal(hiddenForViewers(img('')), true);
    assert.equal(hiddenForViewers(img('https://example.com/logo.png')), false);
});

test('the template company name is a prompt too', () => {
    const cr = all[TEMPLATES.findIndex((t) => t.id === 'client-report')];
    assert.equal(cr.theme.header.companyName, 'Your company');
    assert.equal(brandCompanyName(cr.theme), null);
    assert.equal(brandCompanyName({ header: { show: true, companyName: 'Acme Agency', logoPosition: 'left', showDates: true } }), 'Acme Agency');
});
