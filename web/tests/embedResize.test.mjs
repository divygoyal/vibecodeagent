// Embed height reporting (src/lib/embedResize.ts): the tc:dimensions message and the observer wiring.
// Run: cd web && node --test tests/embedResize.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { dimensionsMessage, watchEmbedHeight, EMBED_RESIZE_TYPE } = await import('../src/lib/embedResize.ts');

function fakeWindow({ inFrame = true } = {}) {
    const posted = [];
    const observers = [];
    class RO { constructor(cb) { this.cb = cb; this.disconnected = false; observers.push(this); } observe(el) { this.el = el; } disconnect() { this.disconnected = true; } }
    const win = { parent: inFrame ? { postMessage: (m, t) => posted.push([m, t]) } : null, ResizeObserver: RO };
    if (!inFrame) win.parent = win;
    return { win, posted, observers };
}

test('message shape matches the host snippet (type tc:dimensions, whole pixels)', () => {
    assert.deepEqual(dimensionsMessage(2489.2), { type: 'tc:dimensions', height: 2490 });
    assert.equal(EMBED_RESIZE_TYPE, 'tc:dimensions');
    assert.equal(dimensionsMessage(-5).height, 0);
});

test('posts at once, then on every size change, skipping repeats', () => {
    const { win, posted, observers } = fakeWindow();
    let h = 300;
    const el = { getBoundingClientRect: () => ({ height: h }) };
    const stop = watchEmbedHeight(el, win);
    assert.deepEqual(posted, [[{ type: 'tc:dimensions', height: 300 }, '*']]);
    assert.equal(observers[0].el, el);
    observers[0].cb(); // same height: nothing new
    assert.equal(posted.length, 1);
    h = 2490.4;
    observers[0].cb();
    assert.equal(posted.length, 2);
    assert.equal(posted[1][0].height, 2491);
    stop();
    assert.equal(observers[0].disconnected, true);
});

test('does nothing when the page is not inside an iframe', () => {
    const { win, posted, observers } = fakeWindow({ inFrame: false });
    watchEmbedHeight({ getBoundingClientRect: () => ({ height: 100 }) }, win);
    assert.equal(posted.length, 0);
    assert.equal(observers.length, 0);
});
