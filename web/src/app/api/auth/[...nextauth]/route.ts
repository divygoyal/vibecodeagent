import NextAuth, { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

// GitHub profile type
interface GitHubProfile {
  id: number;
  login: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

// Extended session user type
interface ExtendedUser {
  id?: string;
  username?: string;
  accessToken?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      authorization: {
        params: {
          // Added 'repo' scope for repository access
          scope: "read:user user:email repo"
        }
      }
    }),
  ],
  
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "github" && profile) {
        const ghProfile = profile as GitHubProfile;
        console.log(`GitHub user signed in: ${ghProfile.login} (ID: ${ghProfile.id})`);
      }
      return true;
    },
    
    async session({ session, token }) {
      if (token && session.user) {
        const user = session.user as ExtendedUser;
        user.id = (token.githubId as string) || token.sub;
        user.username = token.username as string;
        // Include access token in session for API calls
        user.accessToken = token.accessToken as string;
      }
      return session;
    },
    
    async jwt({ token, profile, account }) {
      if (account?.provider === "github" && profile) {
        const ghProfile = profile as GitHubProfile;
        token.githubId = String(ghProfile.id);
        token.username = ghProfile.login;
        // Capture GitHub access token
        token.accessToken = account.access_token;
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

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
