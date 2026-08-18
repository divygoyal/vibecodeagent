import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

export const dynamic = 'force-dynamic';

// ============= Mock data for dev mode =============

function getMockContainerStatus() {
  // Dev-mode mock: Google is faked as connected so the dashboard renders;
  // GitHub starts disconnected so the Connect GitHub flow can be tested locally.
  return {
    status: 'running',
    health: 'healthy',
    memory_usage_mb: 128,
    plan: 'free',
    telegramStatus: 'connected',
    botUsername: 'TrafficClawDevBot',
    telegramBotToken: '',
    connectedProviders: [
      { provider: 'google', connected: true },
    ],
  };
}

// ============= Route handlers =============

export async function POST(req: Request) {
  // Always require auth
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!ADMIN_API_KEY) {
    // Dev mode: simulate container action
    return NextResponse.json({ status: "ok", message: "Action simulated in dev mode" })
  }

  try {
    const { action } = await req.json()
    if (!["start", "stop", "restart"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    // @ts-expect-error - id added in callbacks
    const githubId = session.user.id
    const response = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(String(githubId))}/container`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ADMIN_API_KEY },
      body: JSON.stringify({ action }),
      cache: 'no-store'
    })

    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json({ error: data.detail || "Container action failed" }, { status: response.status })
    }
    return NextResponse.json(data)

  } catch (err: unknown) {
    const error = err as Error
    console.error('Container action error:', error.message)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

export async function GET() {
  // Always require auth
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!ADMIN_API_KEY) {
    // Dev mode: return mock container status
    return NextResponse.json(getMockContainerStatus())
  }

  try {
    // @ts-expect-error - id added in callbacks
    const githubId = session.user.id
    const response = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(String(githubId))}`, {
      headers: { "X-API-Key": ADMIN_API_KEY },
      cache: 'no-store'
    })

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json({ status: "not_provisioned" })
        }
        throw new Error("Failed to get container status")
      }

      const data = await response.json()
      let status = data.container?.status || data.container_status || "unknown";
      if (status === "not_found") status = "not_provisioned";

      return NextResponse.json({
        status,
        health: data.container?.health || "unknown",
        memory_usage_mb: data.container?.memory_usage_mb,
        plan: data.plan,
        telegramStatus: data.container?.telegram_status || data.telegram_status || (data.container?.health === 'healthy' ? 'connected' : undefined),
        botUsername: data.container?.bot_username || data.bot_username || data.telegram_bot_username,
        telegramBotToken: data.telegram_bot_token,
        connectedProviders: data.connected_providers || [],
        error: data.container?.error,
      })

    } catch (err: unknown) {
      const error = err as Error
      console.error('Status check error:', error.message)
      return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
    }
}
