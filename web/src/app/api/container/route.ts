import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

// Admin API configuration  
const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

// Container actions: start, stop, restart
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { action } = await req.json()

    if (!["start", "stop", "restart"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    // @ts-expect-error - id added in callbacks
    const githubId = session.user.id

    const response = await fetch(`${ADMIN_API_URL}/api/users/${githubId}/container`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ADMIN_API_KEY
      },
      body: JSON.stringify({ action })
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json({
        error: data.detail || "Container action failed"
      }, { status: response.status })
    }

    return NextResponse.json(data)

  } catch (err: unknown) {
    const error = err as Error
    console.error('Container action error:', error.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

// Get container status
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
        return NextResponse.json({ status: "not_provisioned" })
      }
      throw new Error("Failed to get container status")
    }

    const data = await response.json()
    return NextResponse.json({
      status: data.container?.status || data.container_status || "unknown",
      health: data.container?.health || "unknown",
      memory_usage_mb: data.container?.memory_usage_mb,
      plan: data.plan,
      telegramStatus: data.container?.telegram_status || data.telegram_status || (data.container?.health === 'healthy' ? 'connected' : undefined),
      botUsername: data.container?.bot_username || data.bot_username || data.telegram_bot_username
    })

  } catch (err: unknown) {
    const error = err as Error
    console.error('Status check error:', error.message)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}
