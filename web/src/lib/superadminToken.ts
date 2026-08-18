import crypto from 'crypto';

export const SUPERADMIN_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

function getSecret(): string {
  return process.env.NEXTAUTH_SECRET || '';
}

export function createSuperadminToken(): { token: string; expiresAt: number } {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const hmac = crypto.createHmac('sha256', getSecret()).update(`${timestamp}.${nonce}`).digest('hex');
  return {
    token: `${timestamp}.${nonce}.${hmac}`,
    expiresAt: Date.now() + SUPERADMIN_TOKEN_EXPIRY_MS,
  };
}

export function verifySuperadminToken(token: string): boolean {
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [timestamp, nonce, hmac] = parts;
  const expectedHmac = crypto.createHmac('sha256', getSecret()).update(`${timestamp}.${nonce}`).digest('hex');

  let hmacBuf: Buffer;
  let expectedBuf: Buffer;

  try {
    hmacBuf = Buffer.from(hmac, 'hex');
    expectedBuf = Buffer.from(expectedHmac, 'hex');
    if (hmacBuf.length !== expectedBuf.length) return false;
  } catch {
    return false;
  }

  if (!crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
    return false;
  }

  const tokenAge = Date.now() - parseInt(timestamp, 10);
  return !(tokenAge > SUPERADMIN_TOKEN_EXPIRY_MS || tokenAge < 0);
}
