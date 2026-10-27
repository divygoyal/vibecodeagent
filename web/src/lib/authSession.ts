/**
 * The NextAuth session callback and the two views of the signed-in user.
 *
 * session.user is what the browser gets (/api/auth/session, useSession(),
 * getServerSession()). Any script on the page (an XSS, an extension, the chat
 * widget) can read it, so it never carries OAuth tokens. The tokens stay in the
 * encrypted session JWT cookie and in the admin DB; server code reads them
 * through lib/serverAuth.ts (serverAuthUser below).
 *
 * Pure module (no providers, no request access) so tests can import it.
 */
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

/** session.user as the browser sees it. Identity and non-secret flags only. */
export interface PublicSessionUser {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    provider?: string;            // PRIMARY provider (the one that owns the displayed identity)
    hasGoogle: boolean;           // the JWT holds a Google connection
    hasGithub: boolean;           // the JWT holds a GitHub connection
    // Read by client-side guards to gate /dashboard/* before /dashboard/setup is done.
    // Refreshed via NextAuth's update() trigger after the setup PATCH.
    workspaceSetupCompleted: boolean;
}

/**
 * Server-only view of the signed-in user: the public fields plus the OAuth
 * tokens and provider account ids from the JWT. Built by lib/serverAuth.ts;
 * never return it from a route or pass it to a client component.
 */
export interface ServerAuthUser extends PublicSessionUser {
    id: string;                   // primary provider sub ('' when the JWT has none)
    username?: string;            // GitHub login, else the display name
    githubLogin?: string;         // GitHub username (e.g. "divygoyal")
    githubAccountId?: string;     // GitHub user id (from OAuth) — for register-provider, NOT for display
    googleAccountId?: string;     // Google sub — for register-provider, NOT for display
    accessToken?: string;         // token of the latest sign-in (legacy/general)
    refreshToken?: string;        // refresh token of the latest sign-in that returned one
    githubAccessToken?: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * session.user for the browser, from the JWT. Display identity comes from the
 * PRIMARY provider only: connecting a secondary provider (e.g. GitHub on a
 * Google session) must NOT change the displayed name/email/avatar.
 */
export function publicSessionUser(
    token: JWT,
    defaults: { name?: string | null; email?: string | null; image?: string | null } = {},
): PublicSessionUser {
    return {
        id: str(token.primarySub) ?? str(token.sub),
        name: token.primaryName !== undefined ? (token.primaryName as string | null) : (defaults.name ?? null),
        email: token.primaryEmail !== undefined ? (token.primaryEmail as string | null) : (defaults.email ?? null),
        image: token.primaryImage !== undefined ? (token.primaryImage as string | null) : (defaults.image ?? null),
        provider: str(token.primaryProvider) ?? str(token.provider),
        hasGoogle: Boolean(token.googleAccessToken || token.googleRefreshToken),
        hasGithub: Boolean(token.githubAccessToken),
        workspaceSetupCompleted: Boolean(token.workspaceSetupCompleted),
    };
}

/** Server-only: the public fields plus the JWT's tokens and provider ids. */
export function serverAuthUser(token: JWT): ServerAuthUser {
    const pub = publicSessionUser(token, { name: token.name ?? null, email: token.email ?? null, image: token.picture ?? null });
    return {
        ...pub,
        id: pub.id ?? '',
        username: str(token.githubLogin) ?? str(token.name),
        githubLogin: str(token.githubLogin),
        githubAccountId: str(token.githubAccountId),
        googleAccountId: str(token.googleAccountId),
        accessToken: str(token.accessToken),
        refreshToken: str(token.refreshToken),
        githubAccessToken: str(token.githubAccessToken),
        googleAccessToken: str(token.googleAccessToken),
        googleRefreshToken: str(token.googleRefreshToken),
    };
}

/** NextAuth `callbacks.session`. Replaces (not extends) the default user, so nothing else from the JWT reaches the browser. */
export async function sessionCallback({ session, token }: { session: Session; token: JWT }): Promise<Session> {
    if (token && session.user) {
        session.user = publicSessionUser(token, session.user) as Session["user"];
    }
    return session;
}
