import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALLOWED_RETURN_TO,
  consumeAuthorizationCode,
  createBridgeToken,
  issueAuthorizationCode,
  validateBridgeSecret,
  verifyBridgeToken,
} from '../src/lib/aitraffic-bridge.mjs';

const SECRET = 'a'.repeat(48);
const CALLBACK = 'https://aitraffic.dev/api/auth/trafficclaw/callback';

test('accepts only explicit Cloud callback URLs', () => {
  assert.equal(ALLOWED_RETURN_TO(CALLBACK), true);
  assert.equal(ALLOWED_RETURN_TO('http://localhost:3000/api/auth/trafficclaw/callback'), true);
  assert.equal(ALLOWED_RETURN_TO('https://evil.example/api/auth/trafficclaw/callback'), false);
  assert.equal(ALLOWED_RETURN_TO(`${CALLBACK}?next=https://evil.example`), false);
});

test('issues a single-use five-minute authorization code', () => {
  const now = 1_700_000_000_000;
  const code = issueAuthorizationCode({ userId: 'user-42', returnTo: CALLBACK, state: 'state-42', now });
  assert.match(code, /^[A-Za-z0-9_-]{40,}$/);
  assert.deepEqual(consumeAuthorizationCode(code, now + 299_999), {
    userId: 'user-42', returnTo: CALLBACK, state: 'state-42',
  });
  assert.equal(consumeAuthorizationCode(code, now + 300_000), null);
});

test('does not consume expired authorization codes', () => {
  const now = 1_700_000_000_000;
  const code = issueAuthorizationCode({ userId: 'user-42', returnTo: CALLBACK, state: 'state-42', now });
  assert.equal(consumeAuthorizationCode(code, now + 300_001), null);
});

test('creates a signed bridge token without Google credentials', () => {
  const now = 1_700_000_000_000;
  const token = createBridgeToken({ userId: 'user-42', secret: SECRET, now });
  assert.equal(token.includes('google'), false);
  assert.deepEqual(verifyBridgeToken(token, SECRET, now + 60_000), { userId: 'user-42' });
  assert.equal(verifyBridgeToken(`${token}x`, SECRET, now + 60_000), null);
  assert.equal(verifyBridgeToken(token, SECRET, now + 600_001), null);
});

test('fails closed when bridge secret is absent or weak', () => {
  assert.equal(validateBridgeSecret(undefined), false);
  assert.equal(validateBridgeSecret('short'), false);
  assert.equal(validateBridgeSecret(SECRET), true);
});
