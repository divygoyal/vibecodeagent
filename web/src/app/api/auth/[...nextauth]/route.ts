import NextAuth, { NextAuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"
import { exec } from "child_process"
import util from "util"

const execPromise = util.promisify(exec)
const SCRIPT_PATH = "/home/ubuntu/.openclaw/workspace/vibecodeagent_analysis/scripts/provision_user.py";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
  ],
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "github" && profile) {
        try {
          // Trigger provisioning script
          // @ts-ignore - profile.id is known to exist on GitHub profile
          const cmd = `python3 "${SCRIPT_PATH}" "${profile.id}"`
          await execPromise(cmd)
          // @ts-ignore
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
          // @ts-ignore
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
