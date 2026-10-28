/**
 * Two tokens for the shared demo user (claims: the fields of a Google sign-in, see lib/auth.ts, plus `demo: true`):
 *
 *   tc_demo cookie   encrypted with its OWN salt (DEMO_COOKIE_SALT), so NextAuth cannot decode it: whatever a visitor
 *                    does with the value (any cookie name, a Bearer header, any route), it is not a session.
 *   projected token  the same claims with NextAuth's default salt and a 5-minute life, minted by middleware for one
 *                    request and placed only in that request's Cookie header. It never reaches the browser, and
 *                    the server still refuses it without the demo marker (sessionGuard.ts).
 * Edge-safe (next-auth/jwt uses Web Crypto).
 */
import { decode, encode, type JWT } from 'next-auth/jwt';

import { DEMO_ACCESS_TOKEN, DEMO_MAX_AGE_S, DEMO_REFRESH_TOKEN, DEMO_USER_ID, DEMO_USER_NAME, isDemoToken } from './config';

/** The JWT claims of the demo session. */
export function demoJwtClaims(): JWT {
    const accessToken = DEMO_ACCESS_TOKEN;
    const refreshToken = DEMO_REFRESH_TOKEN;
    return {
        name: DEMO_USER_NAME,
        email: null,
        picture: null,
        sub: DEMO_USER_ID,
        primaryProvider: 'google',
        primarySub: DEMO_USER_ID,
        primaryName: DEMO_USER_NAME,
        primaryEmail: null,
        primaryImage: null,
        accessToken,
        refreshToken,
        googleAccountId: DEMO_USER_ID,
        googleAccessToken: accessToken,
        googleRefreshToken: refreshToken,
        provider: 'google',
        workspaceSetupCompleted: true,
        demo: true,
    };
}

/** Salt of the tc_demo cookie token. Anything but NextAuth's default ('') makes it useless as a session. */
export const DEMO_COOKIE_SALT = 'tc_demo';
/** Life of a projected (default-salt) token: one request's worth. */
export const PROJECTED_MAX_AGE_S = 5 * 60;

/** A fresh tc_demo cookie value (expires after DEMO_MAX_AGE_S). Not a session token. */
export async function mintDemoJwt(secret: string, maxAge: number = DEMO_MAX_AGE_S): Promise<string> {
    if (!secret) throw new Error('NEXTAUTH_SECRET is not set');
    return encode({ token: demoJwtClaims(), secret, maxAge, salt: DEMO_COOKIE_SALT });
}

/** The session-format token middleware puts into one demo request (never sent to the browser). */
export async function mintProjectedSessionJwt(claims: JWT, secret: string): Promise<string> {
    const { iat: _iat, exp: _exp, jti: _jti, ...rest } = claims as JWT & { iat?: number; exp?: number; jti?: string };
    void _iat; void _exp; void _jti;
    return encode({ token: rest, secret, maxAge: PROJECTED_MAX_AGE_S });
}

/** The decoded tc_demo cookie, or null when it is missing, expired, forged, default-salted or not a demo token. */
export async function readDemoJwt(value: string | null | undefined, secret: string | undefined): Promise<JWT | null> {
    if (!value || !secret || value.length > 8000) return null;
    try {
        const token = await decode({ token: value, secret, salt: DEMO_COOKIE_SALT });
        if (!token || token.demo !== true || token.sub !== DEMO_USER_ID) return null;
        return token;
    } catch {
        return null;
    }
}

/** Decodes any session JWT and says whether it is the demo identity (defence in depth for the guard). */
export async function sessionJwtIsDemo(value: string | null | undefined, secret: string | undefined): Promise<boolean> {
    if (!value || !secret || value.length > 8000) return false;
    try {
        return isDemoToken(await decode({ token: value, secret }));
    } catch {
        return false;
    }
}
