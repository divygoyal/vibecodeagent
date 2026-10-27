// The server/client boundary checker (scripts/dev/check-rsc-props.mjs) against a fixture
// with known bad and good props. Run: cd web && node --test tests/check-rsc-props.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '../../scripts/dev/check-rsc-props.mjs');
const fixture = path.join(here, 'fixtures/rsc');

function run() {
    try {
        return { code: 0, out: execFileSync(process.execPath, [script, '--web', fixture, '--json'], { encoding: 'utf8' }) };
    } catch (err) {
        return { code: err.status, out: err.stdout };
    }
}

test('check-rsc-props flags every function / class-instance prop and nothing else', () => {
    const { code, out } = run();
    const res = JSON.parse(out);
    assert.equal(code, 1);
    const page = fs.readFileSync(path.join(fixture, 'src/app/page.tsx'), 'utf8').split('\n');
    const expected = page.map((l, i) => (l.includes('ERROR') ? i + 1 : null)).filter(Boolean);
    const got = [...new Set(res.errors.map((e) => e.line))].sort((a, b) => a - b);
    assert.deepEqual(got, expected);
    const byLine = Object.fromEntries(res.errors.map((e) => [e.line, e]));
    assert.match(byLine[expected[0]].what, /function/);
    assert.equal(byLine[expected.at(-1)].kind, 'host');
    assert.ok(res.notes.some((n) => /Date/.test(n.what)), 'Date is a note, not an error');
});
