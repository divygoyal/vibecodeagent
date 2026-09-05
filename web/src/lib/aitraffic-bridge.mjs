import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const CODE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const authorizationCodes = new Map();

const ALLOWED_RETURN_TOS = new Set([
  'https://aitraffic.dev/api/auth/trafficclaw/callback',
  'http://localhost:3000/api/auth/trafficclaw/callback',
  'http://127.0.0.1:3000/api/auth/trafficclaw/callback',
]);

export function ALLOWED_RETURN_TO(value) {
  return typeof value === 'string' && ALLOWED_RETURN_TOS.has(value);
}

export function validateBridgeSecret(secret) {
  return typeof secret === 'string' && secret.length >= 32;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function cleanExpiredCodes(now) {
  for (const [code, record] of authorizationCodes) {
    if (record.expiresAt <= now) authorizationCodes.delete(code);
  }
}

export function issueAuthorizationCode({ userId, returnTo, state, now = Date.now() }) {
  if (!userId || !ALLOWED_RETURN_TO(returnTo) || typeof state !== 'string' || !state) {
    throw new Error('Invalid authorization request');
  }
  cleanExpiredCodes(now);
  const code = randomBytes(32).toString('base64url');
  authorizationCodes.set(code, { userId, returnTo, state, expiresAt: now + CODE_TTL_MS });
  return code;
}

export function consumeAuthorizationCode(code, now = Date.now()) {
  cleanExpiredCodes(now);
  const record = authorizationCodes.get(code);
  if (!record) return null;
  authorizationCodes.delete(code);
  if (record.expiresAt <= now) return null;
  return { userId: record.userId, returnTo: record.returnTo, state: record.state };
}

export function createBridgeToken({ userId, secret, now = Date.now() }) {
  if (!userId || !validateBridgeSecret(secret)) throw new Error('Bridge unavailable');
  const payload = base64url(JSON.stringify({ iss: 'trafficclaw', sub: userId, exp: now + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyBridgeToken(token, secret, now = Date.now()) {
  if (!validateBridgeSecret(secret) || typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = sign(payload, secret);
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded?.iss !== 'trafficclaw' || typeof decoded.sub !== 'string' || !decoded.sub || !Number.isFinite(decoded.exp) || decoded.exp <= now) return null;
    return { userId: decoded.sub };
  } catch {
    return null;
  }
}
