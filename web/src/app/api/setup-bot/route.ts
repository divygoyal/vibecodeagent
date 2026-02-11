import { NextResponse } from 'next/server'
import { exec } from "child_process"
import util from "util"
import { getServerSession } from "next-auth/next"
// @ts-ignore
import { authOptions } from "../auth/[...nextauth]/route"

const execPromise = util.promisify(exec)
const SCRIPT_PATH = "/home/ubuntu/.openclaw/workspace/vibecodeagent_analysis/scripts/provision_user.py";

export async function POST(req: Request) {
  // @ts-ignore
  const session = await getServerSession(authOptions)
  
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { token } = await req.json()
  
  try {
    // @ts-ignore
    const userId = session.user.id // Get real user ID from session
    const cmd = `python3 "${SCRIPT_PATH}" "${userId}" "${token}"`
    await execPromise(cmd)
    
    return NextResponse.json({ message: "Bot connected" })
  } catch (error) {
    console.error("Bot setup error:", error)
    return NextResponse.json({ error: "Failed to connect bot" }, { status: 500 })
  }
}
