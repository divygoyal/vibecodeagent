/**
 * The demo session token: a NextAuth-format JWT (same encryption, same secret, same fields as
 * a Google sign-in, see lib/auth.ts and scripts/dev/login.mjs) for the shared demo user, plus
 * the claim `demo: true`. It lives in its own httpOnly cookie (`tc_demo`); middleware projects
 * it into the request's session cookie. Edge-safe (next-auth/jwt uses Web Crypto).
 */
import { decode, encode, type JWT } from 'next-auth/jwt';

import { DEMO_ACCESS_TOKEN, DEMO_MAX_AGE_S, DEMO_REFRESH_TOKEN, DEMO_USER_EMAIL, DEMO_USER_ID, DEMO_USER_NAME, isDemoToken } from './config';

/** The JWT claims of the demo session. */
export function demoJwtClaims(): JWT {
    const accessToken = DEMO_ACCESS_TOKEN;
    const refreshToken = DEMO_REFRESH_TOKEN;
    return {
        name: DEMO_USER_NAME,
        email: DEMO_USER_EMAIL,
        picture: null,
        sub: DEMO_USER_ID,
        primaryProvider: 'google',
        primarySub: DEMO_USER_ID,
        primaryName: DEMO_USER_NAME,
        primaryEmail: DEMO_USER_EMAIL,
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

/** A fresh demo session JWT (expires after DEMO_MAX_AGE_S). */
export async function mintDemoJwt(secret: string, maxAge: number = DEMO_MAX_AGE_S): Promise<string> {
    if (!secret) throw new Error('NEXTAUTH_SECRET is not set');
    return encode({ token: demoJwtClaims(), secret, maxAge });
}

/** The decoded demo JWT, or null when it is missing, expired, forged or not a demo token. */
export async function readDemoJwt(value: string | null | undefined, secret: string | undefined): Promise<JWT | null> {
    if (!value || !secret || value.length > 8000) return null;
    try {
        const token = await decode({ token: value, secret });
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
