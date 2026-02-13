import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

// Admin API configuration  
const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { plan, geminiApiKey, githubToken } = await req.json()

    // @ts-expect-error - id added in callbacks
    const githubId = session.user.id
    // @ts-expect-error - username added in callbacks  
    const githubUsername = session.user.username
    const email = session.user.email

    if (!githubId) {
      return NextResponse.json({ error: 'GitHub ID not found' }, { status: 400 })
    }

    // Get current user status
    const statusResponse = await fetch(`${ADMIN_API_URL}/api/users/${githubId}`, {
      headers: { "X-API-Key": ADMIN_API_KEY }
    })

    if (statusResponse.ok) {
      // User exists - return their status
      const userData = await statusResponse.json()
      return NextResponse.json({
        exists: true,
        ...userData
      })
    }

    // User doesn't exist - they need to set up bot first
    return NextResponse.json({
      exists: false,
      message: "Please connect your Telegram bot first"
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error('Provisioning error:', error.message)
    return NextResponse.json({
      error: 'Internal Server Error',
      details: error.message?.substring(0, 100) || 'Unknown error'
    }, { status: 500 })
  }
}

// Get user status
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // @ts-expect-error - id added in callbacks
    const githubId = session.user.id

    const response = await fetch(`${ADMIN_API_URL}/api/users/${githubId}`, {
      headers: { "X-API-Key": ADMIN_API_KEY }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({
          provisioned: false,
          message: "Bot not yet configured"
        })
      }
      throw new Error("Failed to get user status")
    }

    const data = await response.json()
    return NextResponse.json({
      provisioned: true,
      ...data
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error('Status check error:', error.message)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}
