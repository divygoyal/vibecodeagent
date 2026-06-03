import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions, ensureAdminUserSynced } from "@/lib/adminUserSync"

// Admin API configuration
const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

type SetupBotRequest = {
  token?: string
  plan?: string
  bot_engine?: string
}

type SetupBotSessionUser = {
  id?: string
  username?: string
  email?: string | null
  accessToken?: string
  provider?: string
  refreshToken?: string
  githubAccessToken?: string
  googleAccessToken?: string
  githubAccountId?: string
  googleAccountId?: string
}

type AdminUserPayload = {
  email?: string | null
  plan: string
  telegram_bot_token: string
  bot_engine: string
  provider?: string
  provider_id: string
  access_token?: string
  refresh_token?: string
  github_id?: string
  github_username?: string
}

type AdminSetupResponse = {
  detail?: string
  error?: string
  container_status?: string
  container_port?: number
}

// Validate Telegram bot token format
function isValidTelegramToken(token: string): boolean {
  // Token format: numbers:alphanumeric string (typically 35+ chars after colon)
  return /^\d+:[A-Za-z0-9_-]{30,}$/.test(token)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { token, plan, bot_engine } = await req.json() as SetupBotRequest

    if (!token || !isValidTelegramToken(token)) {
      return NextResponse.json({
        error: "Invalid token format",
        hint: "Token should be from @BotFather"
      }, { status: 400 })
    }

    const sessionUser = session.user as SetupBotSessionUser
    const userId = sessionUser.id
    const username = sessionUser.username
    const accessToken = sessionUser.accessToken
    const provider = sessionUser.provider
    const refreshToken = sessionUser.refreshToken
    const email = sessionUser.email

    if (!userId) {
      return NextResponse.json({ error: "User ID not found in session" }, { status: 400 })
    }

    console.log(`[Setup-Bot] User ${userId} via ${provider}`)

    const syncTargets = new Set<'github' | 'google'>()
    if (provider === 'github' || provider === 'google') {
      syncTargets.add(provider)
    }
    if (sessionUser.googleAccountId && sessionUser.googleAccessToken) {
      syncTargets.add('google')
    }
    if (sessionUser.githubAccountId && sessionUser.githubAccessToken) {
      syncTargets.add('github')
    }

    for (const targetProvider of syncTargets) {
      const sync = await ensureAdminUserSynced(session, targetProvider)
      if (!sync.synced) {
        console.warn(`[Setup-Bot] ${targetProvider} provider sync degraded: ${sync.reason}`)
      }
    }

    // Call create_user (upsert) with the telegram token.
    // The backend will:
    // 1. Create/update user + OAuth connection in DB
    // 2. Create container ONLY because telegram_bot_token is now provided
    // 3. Write all connected provider tokens to OpenClaw memory (USER.md)
    // 4. Start the container with OpenClaw + Telegram
    const payload: AdminUserPayload = {
      email: email,
      plan: plan || "free",
      telegram_bot_token: token,
      bot_engine: bot_engine || "openclaw",
      provider: provider,
      provider_id: String(userId),
      access_token: accessToken,
      refresh_token: refreshToken,
    }

    if (provider === "github") {
      payload.github_id = String(userId)
      payload.github_username = username
    }

    const response = await fetch(`${ADMIN_API_URL}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ADMIN_API_KEY
      },
      body: JSON.stringify(payload)
    })

    // Safely parse response (handle non-JSON responses)
    let data: AdminSetupResponse
    const responseText = await response.text()
    try {
      data = JSON.parse(responseText)
    } catch {
      console.error("Admin API returned non-JSON:", responseText.substring(0, 200))
      data = { detail: responseText.substring(0, 200) }
    }

    if (!response.ok) {
      console.error("Admin API error:", response.status, data)
      return NextResponse.json({
        error: data.detail || "Failed to setup bot",
      }, { status: response.status })
    }

    return NextResponse.json({
      message: "Bot connected successfully",
      status: data.container_status || "running",
      port: data.container_port
    })

  } catch (error) {
    const err = error as Error
    console.error("Bot setup error:", err.message)

    let errorMessage = "Failed to connect bot"
    if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
      errorMessage = "Backend API is unreachable. Please try again later."
    } else if (err.message.includes('timeout')) {
      errorMessage = "Request timed out. Please try again."
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
