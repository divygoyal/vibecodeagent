/**
 * Builder editor fields: every Field label names its input (round 7 audit item 18, the Description textarea).
 *
 * Run: cd web && npx --offline tsx --test tests/builder/fieldLabel.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Field, NumberInput, TextInput } from '@/components/dashboard-builder/editor/Fields';

const noop = () => {};
const labelFor = (html: string) => /<label for="([^"]+)"/.exec(html)?.[1];

test('Field: the Description textarea and plain text inputs get a generated id the label points at', () => {
    for (const input of [
        h(TextInput, { multiline: true, rows: 2, value: '', onChange: noop }),
        h(TextInput, { value: 'x', onChange: noop }),
        h(NumberInput, { value: 3, min: 1, max: 5, onChange: noop }),
    ]) {
        const html = renderToStaticMarkup(h(Field, { label: 'Description', hint: 'Shown as an info tooltip', children: input }));
        const id = labelFor(html);
        assert.ok(id, html);
        assert.ok(html.includes(`id="${id}"`), `input carries ${id}: ${html}`);
        assert.equal(html.split(`id="${id}"`).length - 1, 1, 'one element with that id');
    }
});

test('Field: two fields get different ids; an explicit id or htmlFor is kept', () => {
    const html = renderToStaticMarkup(h('div', null,
        h(Field, { label: 'Name', children: h(TextInput, { value: '', onChange: noop }) }),
        h(Field, { label: 'Description', children: h(TextInput, { multiline: true, value: '', onChange: noop }) })));
    const ids = [...html.matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    const own = renderToStaticMarkup(h(Field, { label: 'Title', children: h(TextInput, { id: 'my-title', value: '', onChange: noop }) }));
    assert.equal(labelFor(own), 'my-title');
    const external = renderToStaticMarkup(h(Field, { label: 'Pick', htmlFor: 'ext', children: h('select', { id: 'ext' }) }));
    assert.equal(labelFor(external), 'ext');
});

test('Field: other children (pickers, selects) are left alone and the label points nowhere', () => {
    const html = renderToStaticMarkup(h(Field, { label: 'Metric', children: h('button', { type: 'button', 'aria-label': 'Metric' }, 'Sessions') }));
    assert.equal(labelFor(html), undefined);
    assert.ok(!/ id="/.test(html));
});
