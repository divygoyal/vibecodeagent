import { NextResponse } from 'next/server'
import { exec } from "child_process"
import util from "util"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]/route"

const execPromise = util.promisify(exec)

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { token } = await req.json()
  
  try {
    const userId = session.user.id // Get real user ID from session
    const cmd = `python3 ../scripts/provision_user.py "${userId}" "${token}"`
    await execPromise(cmd)
    
    return NextResponse.json({ message: "Bot connected" })
  } catch (error) {
    return NextResponse.json({ error: "Failed to connect bot" }, { status: 500 })
  }
}
