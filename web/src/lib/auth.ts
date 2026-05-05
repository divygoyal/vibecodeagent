import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

// Generic profile type
interface UserProfile {
    id: string;
    name?: string;
    email?: string;
    image?: string;
}

// Extended session user type
interface ExtendedUser {
    id?: string;
    username?: string;
    accessToken?: string; // Legacy/General
    githubAccessToken?: string; // Specific
    googleAccessToken?: string; // Specific
    provider?: string;            // PRIMARY provider (the one that owns the displayed identity)
    primaryProvider?: string;     // Alias of provider — explicit naming
    githubAccountId?: string;     // GitHub user id (from OAuth) — for register-provider, NOT for display
    googleAccountId?: string;     // Google sub — for register-provider, NOT for display
    githubLogin?: string;         // GitHub username (e.g. "divygoyal")
    name?: string | null;
    email?: string | null;
    image?: string | null;
    refreshToken?: string;
    // Read by middleware to gate /dashboard/* before /dashboard/setup is done.
    // Refreshed via NextAuth's update() trigger after the setup PATCH.
    workspaceSetupCompleted?: boolean;
}

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

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
                    scope: "read:user user:email repo"
                }
            }
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly",
                    access_type: "offline",
                    prompt: "consent",
                }
            }
        }),
    ],

    callbacks: {
        async signIn({ account }) {
            // Minimal logging — don't log PII
            if (account?.provider) {
                console.log(`[Auth] Sign-in via ${account.provider}`);
            }
            return true;
        },

        async session({ session, token }) {
            if (token && session.user) {
                const user = session.user as ExtendedUser;

                // Display identity comes from the PRIMARY provider only.
                // Connecting a secondary provider (e.g. GitHub on a Google session)
                // must NOT change the displayed name/email/avatar.
                user.id = (token.primarySub as string) ?? (token.sub as string);
                if (token.primaryName !== undefined) user.name = token.primaryName as string | null;
                if (token.primaryEmail !== undefined) user.email = token.primaryEmail as string | null;
                if (token.primaryImage !== undefined) user.image = token.primaryImage as string | null;
                user.provider = (token.primaryProvider as string) ?? (token.provider as string);
                user.primaryProvider = user.provider;

                user.username = (token.githubLogin as string) || (token.name as string);
                user.accessToken = token.accessToken as string;
                user.refreshToken = token.refreshToken as string;

                // Per-provider tokens + ids — needed by chatbot tools and register-provider sync
                user.githubAccessToken = token.githubAccessToken as string;
                user.googleAccessToken = token.googleAccessToken as string;
                user.githubAccountId = token.githubAccountId as string;
                user.googleAccountId = token.googleAccountId as string;
                user.githubLogin = token.githubLogin as string;
                // Workspace setup gate — read by client-side guards. Middleware
                // reads the same value off the JWT directly.
                user.workspaceSetupCompleted = Boolean(token.workspaceSetupCompleted);
            }
            return session;
        },

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
                token.accessToken = account.access_token;
                if (account.refresh_token) {
                    token.refreshToken = account.refresh_token;
                }

                if (account.provider === "github") {
                    token.githubLogin = (profile as any)?.login;
                    token.githubAccountId = account.providerAccountId;
                    token.githubAccessToken = account.access_token;
                } else if (account.provider === "google") {
                    token.googleAccountId = account.providerAccountId;
                    token.googleAccessToken = account.access_token;
                    if (account.refresh_token) {
                        token.googleRefreshToken = account.refresh_token;
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
