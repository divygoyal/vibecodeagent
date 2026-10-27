// QA-01: a Server Component's `<ArrowRight />` passed to the client Button can arrive as a
// lazy node, which Button used to render as a component type (500 on `/` in next dev).
// Run: cd web && node --test tests/iconProp.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import test from 'node:test';

import './_register-alias.mjs';
import { ArrowRight } from 'lucide-react';
import { createElement } from 'react';

import { isIconComponent } from '../src/components/ui/iconProp.ts';

const require = createRequire(import.meta.url);

/** Decode a Flight payload with the client Next uses for SSR; row 1 arrives after row 0 references it. */
async function iconFromFlight() {
    const { createFromNodeStream } = require('next/dist/compiled/react-server-dom-turbopack/client.node');
    const stream = new Readable({ read() {} });
    const root = createFromNodeStream(stream, { moduleMap: null, serverModuleMap: null, moduleLoading: null });
    stream.push('0:{"trailingIcon":"$L1"}\n');
    await new Promise((r) => setTimeout(r, 10));
    stream.push('1:["$","svg",null,{"className":"lucide"}]\n');
    stream.push(null);
    return (await root).trailingIcon;
}

test('components (lucide forwardRef, functions, memo) are components', () => {
    assert.equal(isIconComponent(ArrowRight), true);
    assert.equal(isIconComponent(function Icon() { return null; }), true);
    assert.equal(isIconComponent({ $$typeof: Symbol.for('react.memo'), type: ArrowRight }), true);
});

test('elements and RSC lazy nodes are rendered as they are, not as component types', async () => {
    assert.equal(isIconComponent(createElement(ArrowRight)), false);
    const lazy = await iconFromFlight();
    assert.equal(lazy.$$typeof, Symbol.for('react.lazy'), 'the Flight client hands Button a lazy node');
    assert.equal(isIconComponent(lazy), false);
});
