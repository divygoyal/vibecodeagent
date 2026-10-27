import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { isEmailAllowed, parseAllowedEmails, PREVIEW_PRIVATE_PATH } from "@/lib/accessAllowlist";
import { sessionCallback } from "@/lib/authSession";
import { cookies } from "next/headers";
import {
    GOOGLE_CONSENT_COOKIE,
    GOOGLE_SIGNIN_PARAMS,
    consentRedirectUrl,
    nonEmptyToken,
    planGoogleSignIn,
    refreshTokenToKeep,
    type GoogleTokenDecision,
} from "@/lib/googleConsent";

export type { PublicSessionUser, ServerAuthUser } from "@/lib/authSession";

// Generic profile type
interface UserProfile {
    id: string;
    name?: string;
    email?: string;
    image?: string;
}

type GitHubProfile = UserProfile & {
    login?: string;
};

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

/** The first of these cookies on the NextAuth callback request (undefined outside a request). */
async function requestCookie(...names: string[]): Promise<string | undefined> {
    try {
        const jar = await cookies();
        for (const name of names) {
            const v = jar.get(name)?.value;
            if (v) return v;
        }
    } catch { /* not in a request */ }
    return undefined;
}

const consentAttempted = async () => Boolean(await requestCookie(GOOGLE_CONSENT_COOKIE));

// The Google sign-in decision made in signIn(), reused by jwt() for the same `account` object
// (NextAuth passes the same object to both), so the stored token is looked up once per sign-in.
const googlePlans = new WeakMap<object, GoogleTokenDecision>();

async function googlePlanFor(account: { providerAccountId?: string; refresh_token?: string | null; scope?: string | null }): Promise<GoogleTokenDecision> {
    const cached = googlePlans.get(account);
    if (cached) return cached;
    const plan = await planGoogleSignIn(account, await consentAttempted());
    googlePlans.set(account, plan);
    return plan;
}

async function fetchWorkspaceSetupCompleted(userIdentifier: string): Promise<boolean> {
    if (!ADMIN_API_KEY || !userIdentifier) return false;
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userIdentifier)}/workspace`,
            {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
                signal: AbortSignal.timeout(4000),
            }
        );
        if (!res.ok) return false;
        const data = await res.json().catch(() => null);
        return Boolean(data?.workspace_setup_completed);
    } catch {
        return false;
    }
}

export const authOptions: NextAuthOptions = {
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_ID ?? "",
            clientSecret: process.env.GITHUB_SECRET ?? "",
            authorization: {
                params: {
                    scope: "read:user user:email"
                }
            }
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            // select_account, not consent: a consent sign-in makes Google issue a new refresh token
            // and revoke the oldest past ~100. Consent is asked only when needed (lib/googleConsent.ts);
            // Reconnect buttons pass prompt 'select_account consent' per call.
            authorization: {
                params: { ...GOOGLE_SIGNIN_PARAMS }
            }
        }),
    ],

    callbacks: {
        async signIn({ account, user, profile }) {
            // Minimal logging — don't log PII
            if (account?.provider) {
                console.log(`[Auth] Sign-in via ${account.provider}`);
            }
            // Private previews: only listed emails (TC_ALLOWED_EMAILS). Unset = everyone.
            const allowed = parseAllowedEmails(process.env.TC_ALLOWED_EMAILS);
            if (allowed) {
                const p = profile as { email?: string; email_verified?: boolean } | undefined;
                const email = p?.email ?? user?.email ?? null;
                const verified = account?.provider === 'google' ? p?.email_verified !== false : undefined;
                if (!isEmailAllowed(email, allowed, { verified })) {
                    console.log(`[Auth] Sign-in refused by TC_ALLOWED_EMAILS (${account?.provider ?? 'unknown'})`);
                    const base = (process.env.NEXTAUTH_URL ?? '').replace(/\/+$/, '');
                    return `${base}${PREVIEW_PRIVATE_PATH}`;
                }
            }
            // A select_account sign-in that brought no refresh token while none usable is stored
            // (or the grant lacks a data scope): redirect once to a consent sign-in.
            if (account?.provider === 'google') {
                const plan = await googlePlanFor(account);
                if (plan.action === 'ask_consent') {
                    console.log(`[Auth] Google sign-in needs consent (${plan.reason})`);
                    const base = (process.env.NEXTAUTH_URL ?? '').replace(/\/+$/, '');
                    const callbackUrl = await requestCookie('__Secure-next-auth.callback-url', 'next-auth.callback-url');
                    return consentRedirectUrl(base, callbackUrl, plan.reason);
                }
                if (plan.action === 'reconnect') {
                    console.log(`[Auth] Google sign-in without a refresh token after consent (${plan.reason}); Reconnect will be offered`);
                }
            }
            return true;
        },

        // Browser-visible session.user: identity + flags only, no OAuth tokens.
        // See lib/authSession.ts; server code reads tokens via lib/serverAuth.ts.
        session: sessionCallback,

        async jwt({ token, profile, account, user, trigger, session }) {
            if (account) {
                // Capture PRIMARY identity exactly once (the first provider this JWT signs in with).
                // Later sign-ins for a different provider are treated as "connect a data source"
                // and must NOT clobber the primary identity.
                if (!token.primaryProvider) {
                    token.primaryProvider = account.provider;
                    token.primarySub = account.providerAccountId;
                    token.primaryName = (user?.name as string) ?? (token.name as string | null) ?? null;
                    token.primaryEmail = (user?.email as string) ?? (token.email as string | null) ?? null;
                    token.primaryImage = (user?.image as string) ?? (token.picture as string | null) ?? null;
                }

                // Always store provider-specific tokens (so chatbot can use both).
                // Never store an empty refresh token: keep what is there (see googleRefresh below).
                token.accessToken = account.access_token;
                const returnedRefresh = nonEmptyToken(account.refresh_token);
                if (returnedRefresh) {
                    token.refreshToken = returnedRefresh;
                }

                if (account.provider === "github") {
                    token.githubLogin = (profile as GitHubProfile | undefined)?.login;
                    token.githubAccountId = account.providerAccountId;
                    token.githubAccessToken = account.access_token;
                } else if (account.provider === "google") {
                    token.googleAccountId = account.providerAccountId;
                    token.googleAccessToken = account.access_token;
                    // New token from a consent sign-in, else the stored one (admin DB) a select_account
                    // sign-in keeps. Nothing usable: leave it unset; the app's Reconnect state handles it.
                    const googleRefresh = refreshTokenToKeep(await googlePlanFor(account));
                    if (googleRefresh) {
                        token.googleRefreshToken = googleRefresh;
                        token.refreshToken = googleRefresh;
                    }
                }

                if (token.primaryProvider === account.provider) {
                    // Primary provider re-signed in — refresh the displayed identity from the latest profile.
                    token.primaryName = (user?.name as string) ?? (token.name as string | null) ?? token.primaryName;
                    token.primaryEmail = (user?.email as string) ?? (token.email as string | null) ?? token.primaryEmail;
                    token.primaryImage = (user?.image as string) ?? (token.picture as string | null) ?? token.primaryImage;
                    // token.sub already matches; nothing else to do.
                } else {
                    // Secondary "connect" — restore primary identity so NextAuth's default
                    // session->user mapping (which reads token.name/email/picture/sub) shows the primary.
                    token.sub = token.primarySub as string;
                    token.name = token.primaryName as string | null;
                    token.email = token.primaryEmail as string | null;
                    token.picture = token.primaryImage as string | null;
                }

                // Keep `token.provider` reflecting the PRIMARY provider, not the latest sign-in.
                token.provider = token.primaryProvider as string;

                // Hydrate the workspace-setup flag once on sign-in. Middleware
                // reads this to gate /dashboard/* — see web/src/middleware.ts.
                // We use the PRIMARY identity as user_identifier (matches the
                // admin's get_user_by_identifier resolution).
                const userIdentifier = (token.primarySub as string) || (token.sub as string) || '';
                if (userIdentifier) {
                    token.workspaceSetupCompleted = await fetchWorkspaceSetupCompleted(userIdentifier);
                }
            }

            // Client-triggered refresh: useSession().update({ workspaceSetupCompleted: true })
            // fires this branch with trigger === 'update' and the merge in `session`.
            // Used by /dashboard/setup after PATCH so middleware sees the new value
            // on the very next request, without waiting for a re-login.
            if (trigger === 'update' && session && typeof session === 'object') {
                const incoming = (session as { workspaceSetupCompleted?: boolean }).workspaceSetupCompleted;
                if (typeof incoming === 'boolean') {
                    token.workspaceSetupCompleted = incoming;
                }
            }
            return token;
        },
    },

    pages: {
        signIn: "/",
        error: "/",
    },

    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60,
    },
};
