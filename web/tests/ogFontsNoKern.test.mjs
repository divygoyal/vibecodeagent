// The Open Graph fonts must have no GPOS kerning: next/og (Satori) measures a word without kerning but draws it with
// kerning, which leaves a wider gap after every word that has kerned pairs. See public/og-fonts/README.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function kernLookupCount(file) {
    const b = readFileSync(new URL(`../public/og-fonts/${file}`, import.meta.url));
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let gpos = 0;
    for (let i = 0; i < v.getUint16(4); i++) {
        const at = 12 + i * 16;
        if (b.toString('latin1', at, at + 4) === 'GPOS') gpos = v.getUint32(at + 8);
    }
    assert.ok(gpos, `${file} has a GPOS table`);
    const featureList = gpos + v.getUint16(gpos + 6);
    let n = 0;
    for (let i = 0; i < v.getUint16(featureList); i++) {
        const tag = b.toString('latin1', featureList + 2 + i * 6, featureList + 6 + i * 6);
        const feature = featureList + v.getUint16(featureList + 6 + i * 6);
        if (tag === 'kern') n += v.getUint16(feature + 2);
    }
    return n;
}

for (const f of ['Geist-Regular.ttf', 'Geist-Bold.ttf']) {
    test(`${f} has no kern lookups`, () => assert.equal(kernLookupCount(f), 0));
}
