import { NextResponse } from 'next/server'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

// Admin API configuration
const ADMIN_API_URL = process.env.ADMIN_API_URL || "http://admin-api:8000"
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ""

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
    const { token, plan, bot_engine } = await req.json()

    if (!token || !isValidTelegramToken(token)) {
      return NextResponse.json({
        error: "Invalid token format",
        hint: "Token should be from @BotFather"
      }, { status: 400 })
    }

    // @ts-expect-error - id added in callbacks
    const userId = session.user.id
    // @ts-expect-error - username added in callbacks
    const username = session.user.username
    // @ts-expect-error - accessToken added in callbacks
    const accessToken = session.user.accessToken
    // @ts-expect-error - provider added in callbacks
    const provider = session.user.provider
    // @ts-expect-error - refreshToken added in callbacks
    const refreshToken = session.user.refreshToken

    const email = session.user.email

    if (!userId) {
      return NextResponse.json({ error: "User ID not found in session" }, { status: 400 })
    }

    console.log(`Setup bot for user ${username} (${userId}) via ${provider}`)
    console.log(`Access token present: ${accessToken ? 'YES' : 'NO'}`)
    console.log(`Refresh token present: ${refreshToken ? 'YES' : 'NO'}`)

    // Call create_user (upsert) with the telegram token.
    // The backend will:
    // 1. Create/update user + OAuth connection in DB
    // 2. Create container ONLY because telegram_bot_token is now provided
    // 3. Write all connected provider tokens to OpenClaw memory (USER.md)
    // 4. Start the container with OpenClaw + Telegram
    const payload: any = {
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
    let data: any
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
    console.error("Bot setup error:", err.message, err.stack)

    let errorMessage = "Failed to connect bot"
    if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
      errorMessage = "Backend API is unreachable. Please try again later."
    } else if (err.message.includes('timeout')) {
      errorMessage = "Request timed out. Please try again."
    } else if (err.message.includes('Invalid token')) {
      errorMessage = err.message
    }

    return NextResponse.json({ error: errorMessage, details: err.message }, { status: 500 })
  }
}
