/**
 * The /api/auth/session answer for a demo request. Middleware returns it directly, so NextAuth's
 * session route never runs for the demo and never re-issues (Set-Cookie) the demo JWT into the
 * visitor's real session cookie. Same shape as NextAuth's: { user, expires }, plus demoRealSession
 * (whether the visitor also has a real session, so the banner offers "Back to your sites").
 * Pure, edge-safe.
 */
import type { JWT } from 'next-auth/jwt';

import { publicSessionUser } from '@/lib/authSession';

export interface DemoSessionJson {
    user: ReturnType<typeof publicSessionUser> & { demo: true };
    expires: string;
    demoRealSession: boolean;
}

export function demoSessionJson(token: JWT, opts: { realSession: boolean; now?: number }): DemoSessionJson {
    const exp = typeof token.exp === 'number' ? token.exp * 1000 : (opts.now ?? Date.now()) + 60 * 60 * 1000;
    return {
        user: { ...publicSessionUser(token), demo: true },
        expires: new Date(exp).toISOString(),
        demoRealSession: opts.realSession,
    };
}
