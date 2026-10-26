// Unit tests for web/src/lib/accessAllowlist.ts (TC_ALLOWED_EMAILS).
// Run: cd web && node --test tests/accessAllowlist.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { isEmailAllowed, parseAllowedEmails } from '../src/lib/accessAllowlist.ts';

test('unset or empty allowlist lets everyone in', () => {
    assert.equal(parseAllowedEmails(undefined), null);
    assert.equal(parseAllowedEmails(''), null);
    assert.equal(parseAllowedEmails(' , ,'), null);
    assert.equal(isEmailAllowed('anyone@example.com', null), true);
    assert.equal(isEmailAllowed(null, null), true);
});

test('listed emails match case-insensitively, others are refused', () => {
    const list = parseAllowedEmails(' Owner@Example.com, second@example.com ');
    assert.deepEqual([...list], ['owner@example.com', 'second@example.com']);
    assert.equal(isEmailAllowed('owner@example.com', list), true);
    assert.equal(isEmailAllowed('OWNER@EXAMPLE.COM ', list), true);
    assert.equal(isEmailAllowed('other@example.com', list), false);
    assert.equal(isEmailAllowed(null, list), false);
    assert.equal(isEmailAllowed('', list), false);
});

test('an unverified email is refused when a list is set', () => {
    const list = parseAllowedEmails('owner@example.com');
    assert.equal(isEmailAllowed('owner@example.com', list, { verified: false }), false);
    assert.equal(isEmailAllowed('owner@example.com', list, { verified: true }), true);
});
