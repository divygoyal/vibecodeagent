// Demo data gate (src/lib/demo/gate.ts): never in production, except the localhost test machine.
// Run: cd web && node --test tests/demoGate.test.mjs
import './_register-alias.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const { demoDataAllowed } = await import('../src/lib/demo/gate.ts');

test('off unless TC_DEMO_DATA=1', () => {
    assert.equal(demoDataAllowed({}), false);
    assert.equal(demoDataAllowed({ NODE_ENV: 'development' }), false);
    assert.equal(demoDataAllowed({ TC_DEMO_DATA: '0' }), false);
});

test('on outside production', () => {
    assert.equal(demoDataAllowed({ TC_DEMO_DATA: '1' }), true);
    assert.equal(demoDataAllowed({ TC_DEMO_DATA: '1', NODE_ENV: 'development' }), true);
});

test('production refuses by default, with or without a localhost URL', () => {
    assert.equal(demoDataAllowed({ TC_DEMO_DATA: '1', NODE_ENV: 'production' }), false);
    assert.equal(demoDataAllowed({ TC_DEMO_DATA: '1', NODE_ENV: 'production', NEXTAUTH_URL: 'http://localhost:3201' }), false);
});

test('production + override only for a localhost NEXTAUTH_URL', () => {
    const base = { TC_DEMO_DATA: '1', NODE_ENV: 'production', TC_ALLOW_DEMO_IN_PROD_BUILD: '1' };
    assert.equal(demoDataAllowed({ ...base, NEXTAUTH_URL: 'http://localhost:3201' }), true);
    assert.equal(demoDataAllowed({ ...base, NEXTAUTH_URL: 'http://127.0.0.1:3201' }), true);
    assert.equal(demoDataAllowed({ ...base, NEXTAUTH_URL: 'https://trafficclaw.com' }), false);
    assert.equal(demoDataAllowed({ ...base, NEXTAUTH_URL: 'https://localhost.evil.com' }), false);
    assert.equal(demoDataAllowed({ ...base, NEXTAUTH_URL: 'http://evil.com/localhost' }), false);
    assert.equal(demoDataAllowed({ ...base, NEXTAUTH_URL: 'http://localhost@evil.com' }), false);
    assert.equal(demoDataAllowed({ ...base, NEXTAUTH_URL: '' }), false);
    assert.equal(demoDataAllowed({ ...base }), false);
    assert.equal(demoDataAllowed({ ...base, NEXTAUTH_URL: 'not a url' }), false);
    assert.equal(demoDataAllowed({ TC_ALLOW_DEMO_IN_PROD_BUILD: '1', NODE_ENV: 'production', NEXTAUTH_URL: 'http://localhost:1' }), false);
});
