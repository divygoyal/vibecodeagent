// Open Graph text fitting (src/lib/ogFit.ts): real Geist advance widths, size steps, wrapping, ellipsis, ligature breaks.
// Run: cd web && node --test tests/ogFit.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { fontMeasurer, fitText, fitSize, wrapLines, ellipsize } = await import('../src/lib/ogFit.ts');
const bold = fontMeasurer(readFileSync(new URL('../public/og-fonts/Geist-Bold.ttf', import.meta.url)));
const regular = fontMeasurer(readFileSync(new URL('../public/og-fonts/Geist-Regular.ttf', import.meta.url)));

test('measures with real glyph widths', () => {
    const w = bold('acmeanalytics.example', 76, -2.5);
    assert.ok(w > 600 && w < 1100, `width ${w}`);
    assert.ok(bold('iii', 100) < bold('WWW', 100));
    assert.ok(bold('Hello', 100) > regular('Hello', 100), 'bold is wider than regular');
    assert.equal(bold('', 50), 0);
    assert.ok(Math.abs(bold('ab', 50, -4) - (bold('ab', 50) - 8)) < 1e-9, 'letter spacing is per character');
});

test('a long host steps down in size and never exceeds the column', () => {
    const fit = fitText('acmeanalytics.example', bold, { maxWidth: 600, sizes: [76, 64, 54, 46], letterSpacing: -2.5 });
    assert.ok(fit.size < 76);
    assert.equal(fit.lines.length, 1);
    assert.ok(bold(fit.lines[0], fit.size, -2.5) <= 600);
});

test('a name that cannot fit ends in an ellipsis within the column', () => {
    const long = `${'verylongsubdomain'.repeat(6)}.example.com`;
    const fit = fitText(long, bold, { maxWidth: 600, sizes: [76, 64, 54, 46], letterSpacing: -2.5, maxLinesAt: (s) => (s <= 54 ? 2 : 1) });
    assert.equal(fit.truncated, true);
    assert.equal(fit.size, 46);
    assert.ok(fit.lines.length <= 2);
    assert.ok(fit.lines.at(-1).endsWith('…'));
    for (const l of fit.lines) assert.ok(bold(l, fit.size, -2.5) <= 600, l);
});

test('short names keep the largest size', () => {
    const fit = fitText('Acme', bold, { maxWidth: 600, sizes: [76, 64, 54, 46], letterSpacing: -2.5 });
    assert.deepEqual({ size: fit.size, lines: fit.lines, truncated: fit.truncated }, { size: 76, lines: ['Acme'], truncated: false });
});

test('words wrap onto a second line before the type shrinks past the two-line sizes', () => {
    const fit = fitText('Client monthly SEO report for Acme Analytics', bold, { maxWidth: 600, sizes: [76, 64, 54, 46], letterSpacing: -2.5, maxLinesAt: (s) => (s <= 54 ? 2 : 1) });
    assert.equal(fit.truncated, false);
    assert.equal(fit.lines.length, 2);
    assert.equal(fit.lines.join(' '), 'Client monthly SEO report for Acme Analytics');
});

test('range headline: 50K–100K steps down to fit a 460 px column, short numbers stay big', () => {
    const size = fitSize('50K–100K', bold, { maxWidth: 460, sizes: [104, 96, 88, 80, 72, 64], letterSpacing: -4 });
    assert.ok(size < 104 && size >= 64, `size ${size}`);
    assert.ok(bold('50K–100K', size, -4) <= 460);
    assert.equal(fitSize('12.3K', bold, { maxWidth: 460, sizes: [104, 96, 88, 80, 72, 64], letterSpacing: -4 }), 104);
});

test('wrapLines and ellipsize basics', () => {
    assert.deepEqual(wrapLines('', bold, 40, 100), ['']);
    assert.deepEqual(wrapLines('a b', bold, 40, 1000), ['a b']);
    assert.equal(ellipsize('short', bold, 40, 1000), 'short');
    assert.ok(ellipsize('x'.repeat(100), bold, 40, 200).endsWith('…'));
});
