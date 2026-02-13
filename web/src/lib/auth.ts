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
    accessToken?: string;
    provider?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    refreshToken?: string;
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
            allowDangerousEmailAccountLinking: true,
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/analytics.readonly",
                    access_type: "offline",
                    prompt: "consent",
                }
            }
        }),
    ],

    callbacks: {
        async signIn({ account, profile }) {
            console.log(`User signed in via ${account?.provider}`);
            return true;
        },

        async session({ session, token }) {
            if (token && session.user) {
                const user = session.user as ExtendedUser;
                user.id = token.sub; // Standardize on 'sub' (subject) for ID
                user.username = (token.username as string) || (token.name as string);
                user.accessToken = token.accessToken as string;
                user.provider = token.provider as string;
                user.refreshToken = token.refreshToken as string;
            }
            return session;
        },

        async jwt({ token, profile, account }) {
            if (account) {
                // Initial sign in
                token.accessToken = account.access_token;
                token.provider = account.provider;

                // Capture refresh token if provided
                if (account.refresh_token) {
                    token.refreshToken = account.refresh_token;
                }

                if (profile && account.provider === "github") {
                    token.username = (profile as any).login;
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
