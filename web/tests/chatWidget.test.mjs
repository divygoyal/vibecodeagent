// Where the Tawk.to bubble may show (components/ui/chatWidget.ts). Owner, round 2:
// marketing pages and Support only; never inside the app or on share/embed pages.
import assert from 'node:assert/strict';
import test from 'node:test';

import { chatBubbleAllowed } from '../src/components/ui/chatWidget.ts';

test('marketing pages allow the bubble', () => {
    for (const p of ['/', '/pricing', '/ai', '/leaderboard', '/leaderboard/nailartai.com', '/tools/meta-tags', '/demo', '/changelog']) {
        assert.equal(chatBubbleAllowed(p), true, p);
    }
});

test('Support is the one app page with the bubble', () => {
    assert.equal(chatBubbleAllowed('/dashboard/support'), true);
    assert.equal(chatBubbleAllowed('/dashboard/support/'), true);
});

test('app, share, embed and admin pages never show it', () => {
    for (const p of ['/dashboard', '/dashboard/', '/dashboard/s/acme.com/traffic', '/dashboard/settings', '/dashboard/supporter',
        '/share/abc', '/embed/x', '/view/y', '/admin', '/superadmin', '/oauth/consent', '/mcp']) {
        assert.equal(chatBubbleAllowed(p), false, p);
    }
});
