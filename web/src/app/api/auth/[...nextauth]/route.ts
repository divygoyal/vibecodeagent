import NextAuth, { NextAuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"

// Admin API for user provisioning
const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      // Request additional scopes if needed
      authorization: {
        params: {
          scope: "read:user user:email"
        }
      }
    }),
  ],
  
  callbacks: {
    async signIn({ user, account, profile }) {
      // Allow sign in - container creation happens when user sets up bot
      if (account?.provider === "github") {
        console.log(`GitHub user signed in: ${profile?.login} (ID: ${profile?.id})`)
      }
      return true
    },
    
    async session({ session, token }) {
      // Add GitHub ID and username to session
      if (token) {
        // @ts-expect-error - extending session.user
        session.user.id = token.githubId || token.sub
        // @ts-expect-error - extending session.user
        session.user.username = token.username
      }
      return session
    },
    
    async jwt({ token, user, profile, account }) {
      // Store GitHub info in JWT token
      if (account?.provider === "github" && profile) {
        // @ts-expect-error - GitHub profile has id
        token.githubId = String(profile.id)
        // @ts-expect-error - GitHub profile has login
        token.username = profile.login
      }
      return token
    },
  },
  
  pages: {
    signIn: "/",
    error: "/",
  },
  
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
