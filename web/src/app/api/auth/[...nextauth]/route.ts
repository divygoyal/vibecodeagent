import NextAuth, { NextAuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"

// GitHub profile type
interface GitHubProfile {
  id: number
  login: string
  name?: string
  email?: string
  avatar_url?: string
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
  ],
  
  callbacks: {
    async signIn({ account, profile }) {
      // Allow sign in - container creation happens when user sets up bot
      if (account?.provider === "github" && profile) {
        const ghProfile = profile as GitHubProfile
        console.log(`GitHub user signed in: ${ghProfile.login} (ID: ${ghProfile.id})`)
      }
      return true
    },
    
    async session({ session, token }) {
      // Add GitHub ID and username to session
      if (token) {
        (session.user as { id?: string }).id = token.githubId as string || token.sub
        (session.user as { username?: string }).username = token.username as string
      }
      return session
    },
    
    async jwt({ token, profile, account }) {
      // Store GitHub info in JWT token
      if (account?.provider === "github" && profile) {
        const ghProfile = profile as GitHubProfile
        token.githubId = String(ghProfile.id)
        token.username = ghProfile.login
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
