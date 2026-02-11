import NextAuth from "next-auth"
import GithubProvider from "next-auth/providers/github"
import { exec } from "child_process"
import util from "util"

const execPromise = util.promisify(exec)

export const authOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "github") {
        try {
          // Trigger provisioning script
          const cmd = `python3 ../scripts/provision_user.py "${profile.id}"`
          await execPromise(cmd)
          console.log(`Provisioning triggered for user ${profile.id}`)
        } catch (error) {
          console.error("Provisioning failed:", error)
        }
      }
    },
  },
  callbacks: {
    async session({ session, token }) {
      if (token && token.sub) {
        session.user = {
          ...session.user,
          id: token.sub,
        }
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
      }
      return token
    },
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
