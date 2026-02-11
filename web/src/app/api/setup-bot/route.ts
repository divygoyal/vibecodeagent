import { NextResponse } from 'next/server'
import { exec } from "child_process"
import util from "util"

const execPromise = util.promisify(exec)

export async function POST(req: Request) {
  const { token } = await req.json()
  
  try {
    // Assuming user context is available (would need session check here)
    const userId = "testuser123" // TODO: Get from session
    const cmd = `python3 ../scripts/provision_user.py "${userId}" "${token}"`
    await execPromise(cmd)
    
    return NextResponse.json({ message: "Bot connected" })
  } catch (error) {
    return NextResponse.json({ error: "Failed to connect bot" }, { status: 500 })
  }
}
