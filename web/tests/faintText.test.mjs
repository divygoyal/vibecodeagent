// Round 7 audit item 14: `fg-faint` (3.1:1) is for input placeholders and disabled states only. Everything people read
// uses `fg-muted` (4.75:1 or more on every surface in both themes). Run: cd web && node --test tests/faintText.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../src');

// Allowed variants: placeholders, disabled states, list markers (decoration).
const ALLOWED_PREFIX = /(placeholder|data-\[placeholder\]|disabled|data-\[disabled\]|aria-disabled|marker):$/;
// Files that may keep a content use for now (empty since round 7's streams merged; keep it that way).
const PENDING = new Set([]);

function* files(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* files(p);
        else if (/\.(tsx?|jsx?)$/.test(e.name)) yield p;
    }
}

test('text-fg-faint only on placeholders and disabled states', () => {
    const bad = [];
    for (const f of files(root)) {
        const rel = path.relative(root, f).split(path.sep).join('/');
        if (PENDING.has(rel)) continue;
        fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
            for (const m of line.matchAll(/(\S*?)text-fg-faint/g)) {
                if (ALLOWED_PREFIX.test(m[1]) || /faint-ok/.test(line)) continue;
                bad.push(`${rel}:${i + 1}`);
            }
        });
    }
    assert.deepEqual(bad, [], `fg-faint used for content (use text-fg-muted, or mark a disabled state with a "faint-ok" comment): ${bad.join(', ')}`);
});
