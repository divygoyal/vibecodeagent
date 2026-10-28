// First-touch attribution: what a landing carries, first touch wins, cookie round trip, sign_up parameters.
// Run: cd web && node --test tests/growthAttribution.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const A = await import('../src/lib/growth/attribution.ts');

test('ref and utm_source are captured; plain visits are not a touch', () => {
    assert.deepEqual(A.parseTouch('?ref=badge', { pathname: '/' }), { ref: 'badge', landing: '/' });
    assert.deepEqual(A.parseTouch('?ref=view&utm_source=trafficclaw&utm_medium=made-with&utm_campaign=view', { pathname: '/', referrer: 'https://www.client.example/report' }), {
        ref: 'view', utm_source: 'trafficclaw', utm_medium: 'made-with', utm_campaign: 'view', landing: '/', referrer: 'client.example',
    });
    assert.equal(A.parseTouch('', { pathname: '/' }), null);
    assert.equal(A.parseTouch('?page=2', { pathname: '/leaderboard' }), null);
    // utm_medium alone is not enough to say who sent them
    assert.equal(A.parseTouch('?utm_medium=email'), null);
    // our own host is not a referrer
    assert.equal(A.parseTouch('?ref=share', { referrer: 'https://trafficclaw.com/x', ownHost: 'trafficclaw.com' })?.referrer, undefined);
});

test('values are cleaned and capped', () => {
    const t = A.parseTouch('?ref=<script>alert(1)</script>&utm_source=' + 'x'.repeat(200));
    assert.equal(t.ref, 'scriptalert1script'.slice(0, 32));
    assert.equal(t.utm_source.length, 64);
    assert.equal(A.parseTouch('?ref=BADGE').ref, 'badge');
});

test('first touch wins', () => {
    const first = { ref: 'badge' };
    const later = { ref: 'embed' };
    assert.equal(A.mergeFirstTouch(first, later), first);
    assert.equal(A.mergeFirstTouch(null, later), later);
    assert.equal(A.mergeFirstTouch(undefined, null), null);
});

test('cookie round trip, also from a full cookie header', () => {
    const t = { ref: 'badge', utm_source: 'trafficclaw', landing: '/leaderboard/acme' };
    const cookie = A.touchCookieString(t, true);
    assert.match(cookie, /^tc_first_touch=/);
    assert.match(cookie, /Max-Age=7776000; Path=\/; SameSite=Lax; Secure$/);
    assert.doesNotMatch(A.touchCookieString(t, false), /Secure/);
    const header = `a=1; ${cookie.split(';')[0]}; b=2`;
    assert.deepEqual(A.touchFromCookies(header), t);
    assert.equal(A.touchFromCookies('a=1; b=2'), null);
    assert.equal(A.touchFromCookies(null), null);
});

test('a tampered cookie is cleaned or ignored', () => {
    assert.equal(A.parseStoredTouch('%7Bnot json'), null);
    assert.equal(A.parseStoredTouch(encodeURIComponent(JSON.stringify({ ref: 5 }))), null);
    const t = A.parseStoredTouch(encodeURIComponent(JSON.stringify({ ref: 'Share!!', landing: '/a b<c>', extra: 'x' })));
    assert.deepEqual(t, { ref: 'share', landing: '/abc' });
});

test('sign_up parameters always name the method and add the touch', () => {
    assert.deepEqual(A.signUpParams(null), { method: 'google' });
    assert.deepEqual(A.signUpParams({ ref: 'embed', utm_source: 'trafficclaw' }), { method: 'google', ref: 'embed', utm_source: 'trafficclaw' });
});
